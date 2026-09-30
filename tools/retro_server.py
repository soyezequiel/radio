"""Local radio server: YouTube metadata and an audio cache for real DSP.

No Google API key, browser cookies or account credentials are used.
Only public YouTube sources are accepted. Nothing is uploaded.
"""
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import argparse
import json
from importlib.metadata import version, PackageNotFoundError
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import uuid
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(os.environ.get("RADIO_CACHE_DIR", str(ROOT / "radio-cache")))
API_ONLY = os.environ.get("RADIO_API_ONLY") == "1"
ALLOWED_ORIGINS = frozenset(value.strip().rstrip("/") for value in os.environ.get("RADIO_ALLOWED_ORIGINS", "").split(",") if value.strip())
RATE_LOCK = threading.Lock()
POST_TIMES = {}
VIDEO = re.compile(r"^[\w-]{11}$", re.ASCII)
MAX_STATIONS = 180
JOBS = {}
AUDIO_JOBS = {}
STREAMS = {}
STREAM_LOCK = threading.Lock()
STREAM_LOCKS = {}
LOCK = threading.Lock()
POOL = ThreadPoolExecutor(max_workers=3)


class QueueBusy(ValueError):
    pass


class ProviderError(ValueError):
    def __init__(self, message, detail):
        super().__init__(message)
        self.detail = detail



def canonical_source(value):
    value = value.strip()
    if not value or len(value) > 2000:
        raise ValueError("Pegá un enlace o escribí un artista.")
    if re.fullmatch(r"@[\w.\-]+", value, re.ASCII):
        return "https://www.youtube.com/" + value + "/videos"
    if VIDEO.fullmatch(value):
        return "https://www.youtube.com/watch?v=" + value
    if not re.match(r"^(https?://|(?:www\.|music\.|m\.)?(?:youtube\.com|youtu\.be)/)", value, re.I):
        if "://" in value:
            raise ValueError("Solo se admiten enlaces de YouTube o YouTube Music.")
        return "ytsearch12:" + value
    url = urlparse(value if "://" in value else "https://" + value)
    if url.scheme not in ("https", "http") or url.hostname not in ("youtube.com", "www.youtube.com", "music.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"):
        raise ValueError("Solo se admiten enlaces de YouTube o YouTube Music.")
    params = parse_qs(url.query)
    playlist = params.get("list", [""])[0]
    if re.fullmatch(r"[\w-]{10,150}", playlist, re.ASCII):
        return "https://www.youtube.com/playlist?list=" + playlist
    video = url.path.strip("/").split("/")[0] if url.hostname.endswith("youtu.be") else params.get("v", [""])[0]
    if not video and re.match(r"^/(shorts|live|embed)/", url.path):
        video = url.path.split("/")[2]
    if VIDEO.fullmatch(video):
        return "https://www.youtube.com/watch?v=" + video
    match = re.match(r"^/(@[\w.\-]+|channel/UC[\w-]+|user/[\w.\-]+|c/[\w.\-]+)(?:/|$)", url.path, re.ASCII)
    if match:
        return "https://www.youtube.com/" + match.group(1) + "/videos"
    raise ValueError("No encontramos un video, canal o playlist en ese enlace.")


def run(args, timeout=95):
    try:
        result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
                                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    except subprocess.TimeoutExpired:
        raise ValueError("YouTube tardó demasiado. Volvé a intentar con una lista más pequeña.") from None
    if result.returncode:
        error = result.stderr
        lines = [line.strip() for line in error.splitlines() if line.strip().startswith(("ERROR:", "WARNING:"))]
        detail = re.sub(r"https?://[^\s]+", "[link]", " | ".join(lines[-4:]) if lines else "yt-dlp exited with an error")[:1400]
        print("YouTube provider: " + detail, file=sys.stderr, flush=True)
        if "No module named yt_dlp" in error:
            raise ValueError('Falta yt-dlp. Ejecutá Iniciar-radio.cmd para instalarlo automáticamente.')
        if "Sign in" in error or "403" in error or "429" in error or "not available" in error or "Private" in error:
            raise ProviderError("YouTube no permite preparar este contenido en este momento. Probá otra emisora o usá un archivo de audio local.", detail)
        raise ProviderError("No se pudo leer ese contenido de YouTube. Comprobá que sea público y que tengas conexión.", detail)
    return result.stdout


def video_metadata(url):
    try:
        request = Request("https://www.youtube.com/oembed?" + urlencode({"url": url, "format": "json"}), headers={"User-Agent": "Frecuencia90/1.0"})
        with urlopen(request, timeout=15) as response:
            data = json.load(response)
        return {"id": parse_qs(urlparse(url).query)["v"][0], "title": data["title"], "artist": data.get("author_name", "YouTube"), "source": "youtube"}
    except (URLError, ValueError, KeyError):
        raise ValueError("No pudimos leer ese video. Puede ser privado, no estar disponible o faltar conexión.") from None


def resolve_sources(sources):
    tracks, seen, errors, names = [], set(), [], []
    for raw in sources:
        try:
            url = canonical_source(raw)
            if "/watch?v=" in url:
                entries = [video_metadata(url)]
                names.append(entries[0]["title"])
            else:
                info = json.loads(run([sys.executable, "-m", "yt_dlp", "--ignore-config", "--flat-playlist", "--dump-single-json", "--skip-download", "--no-warnings", "--socket-timeout", "12", "--retries", "1", "--extractor-retries", "1", "--playlist-end", str(MAX_STATIONS), "--", url]))
                names.append(info.get("title") or raw)
                entries = []
                for item in info.get("entries", []):
                    if not item or not VIDEO.fullmatch(item.get("id", "")) or item.get("availability") in ("private", "premium_only", "subscriber_only", "needs_auth"):
                        continue
                    if item.get("title") in ("[Private video]", "[Deleted video]"):
                        continue
                    # Endless livestreams cannot be prepared as finite audio files.
                    entries.append({"id": item["id"], "title": item.get("title") or "Video " + item["id"], "artist": item.get("uploader") or item.get("channel") or info.get("uploader") or "YouTube", "source": "youtube", "duration": item.get("duration"), "live": item.get("live_status") == "is_live"})
            for entry in entries:
                if entry["id"] not in seen and len(tracks) < MAX_STATIONS:
                    seen.add(entry["id"])
                    tracks.append(entry)
        except ValueError as error:
            errors.append(str(error))
    if not tracks:
        raise ValueError(errors[0] if errors else "La lista está vacía o no es pública. Compartí una playlist pública de YouTube Music.")
    return {"stations": tracks, "title": " · ".join(names)[:250], "warnings": errors, "limit": MAX_STATIONS, "limited": len(tracks) >= MAX_STATIONS}


def cached_audio(video_id):
    for suffix in (".mp3", ".source.webm", ".source.m4a", ".source.ogg"):
        target = CACHE / (video_id + suffix)
        if target.is_file() and target.stat().st_size and not Path(str(target) + ".part").exists():
            return target
    return None


def stream_source(video_id, refresh=False):
    # Extraction only: the browser requests the portions it needs, without
    # waiting for a multi-hour download or a full-file MP3 conversion.
    with STREAM_LOCK:
        video_lock = STREAM_LOCKS.setdefault(video_id, threading.Lock())
    with video_lock:
        entry = STREAMS.get(video_id)
        if entry and not refresh and entry["expires"] > time.time() + 60:
            return entry
        args = [sys.executable, "-m", "yt_dlp", "--ignore-config", "--no-playlist", "--js-runtimes", "node", "--socket-timeout", "12", "--retries", "1", "--extractor-retries", "1", "--skip-download", "--dump-single-json", "-f", "bestaudio[ext=webm]/bestaudio[ext=m4a]"]
        if API_ONLY:
            args += ["--impersonate", "chrome"]
        args += ["--", "https://www.youtube.com/watch?v=" + video_id]
        info = json.loads(run(args, timeout=60))
        if info.get("is_live") or not 0 < (info.get("duration") or 0) < 14400:
            raise ValueError("Elegí un video grabado de menos de cuatro horas.")
        media_url = info.get("url", "")
        parsed = urlparse(media_url)
        if parsed.scheme != "https" or not (parsed.hostname or "").endswith(".googlevideo.com") or info.get("ext") not in ("webm", "m4a"):
            raise ValueError("YouTube no ofreció un formato de audio compatible. Probá otra emisora.")
        expires = int(parse_qs(parsed.query).get("expire", [int(time.time()) + 3600])[0])
        entry = {"url": media_url, "headers": info.get("http_headers", {}), "expires": min(expires, time.time() + 3600), "type": "audio/webm" if info["ext"] == "webm" else "audio/mp4"}
        with STREAM_LOCK:
            for old in list(STREAMS):
                if STREAMS[old]["expires"] <= time.time():
                    del STREAMS[old]
            STREAMS[video_id] = entry
        return entry


def prepare_audio(video_id):
    target = cached_audio(video_id)
    if target:
        return {"url": "/radio-cache/" + target.name}
    stream_source(video_id)
    return {"url": "/api/media/" + video_id}


def byte_range(value, size):
    if not value:
        return 0, size - 1
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
    if not match or not any(match.groups()):
        raise ValueError("Rango inválido")
    first, last = match.groups()
    if first:
        start, end = int(first), min(int(last), size - 1) if last else size - 1
    else:
        start, end = max(0, size - int(last)), size - 1
    if start > end or start >= size:
        raise ValueError("Rango fuera del archivo")
    return start, end


def job_result(key, function, *args):
    with LOCK:
        JOBS[key].update(state="loading", started=time.time())
    try:
        result = function(*args)
        with LOCK:
            JOBS[key].update(state="done", result=result, finished=time.time())
    except Exception as error:
        with LOCK:
            JOBS[key].update(state="error", error=str(error) if isinstance(error, ValueError) else "No se pudo completar la carga. Volvé a intentar.", finished=time.time())
            if isinstance(error, ProviderError):
                JOBS[key]["providerDetail"] = error.detail


def submit_job(function, *args, audio_id=None):
    with LOCK:
        for old in list(JOBS):
            if JOBS[old].get("finished", time.time()) < time.time() - 1800:
                del JOBS[old]
        for video_id, old in list(AUDIO_JOBS.items()):
            if old not in JOBS:
                del AUDIO_JOBS[video_id]
        if audio_id in AUDIO_JOBS and AUDIO_JOBS[audio_id] in JOBS:
            old = AUDIO_JOBS[audio_id]
            if JOBS[old]["state"] != "error":
                return old
        cached = cached_audio(audio_id) if audio_id else None
        if not cached and sum(j["state"] in ("queued", "loading") for j in JOBS.values()) >= 8:
            raise QueueBusy("Hay varias cargas en curso. La radio reintentará automáticamente.")
        key = uuid.uuid4().hex
        JOBS[key] = {"state": "queued", "created": time.time()}
        if audio_id:
            AUDIO_JOBS[audio_id] = key
        if cached:
            JOBS[key].update(state="done", result={"url": "/radio-cache/" + cached.name}, finished=time.time())
            return key
    POOL.submit(job_result, key, function, *args)
    return key


class RadioServer(ThreadingHTTPServer):
    allow_reuse_address = False

    def server_bind(self):
        # Windows otherwise permits two HTTPServer instances to share a port,
        # which makes background-job polling reach the wrong process.
        if sys.platform == "win32":
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def allowed_origin(self):
        origin = self.headers.get("Origin")
        if not origin:
            return False
        if API_ONLY:
            own = os.environ.get("RENDER_EXTERNAL_URL", "").rstrip("/")
            return origin in ALLOWED_ORIGINS or bool(own and origin == own)
        host = self.headers.get("Host", "")
        return host in (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}") and origin == "http://" + host

    def allow_cloud_request(self, path):
        if not API_ONLY:
            return True
        if path == "/api/health" and not self.headers.get("Origin"):
            return True
        if not self.allowed_origin():
            self.json_response({"error": "Origen no permitido"}, 403)
            return False
        return True

    def do_OPTIONS(self):
        requested = {value.strip().lower() for value in self.headers.get("Access-Control-Request-Headers", "").split(",") if value.strip()}
        if not self.allowed_origin() or not requested <= {"content-type", "range"}:
            self.json_response({"error": "Origen o encabezados no permitidos"}, 403)
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def end_headers(self):
        self.send_header("Vary", "Origin")
        if self.allowed_origin():
            self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
            self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Retry-After")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def serve_cached_audio(self, path, head=False):
        name = path.rsplit("/", 1)[-1]
        if not re.fullmatch(r"[\w-]{11}(?:\.source)?\.(?:mp3|webm|m4a|ogg)", name, re.ASCII):
            self.send_error(404)
            return
        target = CACHE / name
        if not target.is_file():
            self.send_error(404)
            return
        size = target.stat().st_size
        try:
            start, end = byte_range(self.headers.get("Range"), size)
        except ValueError:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(206 if self.headers.get("Range") else 200)
        self.send_header("Content-Type", self.guess_type(str(target)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if self.headers.get("Range"):
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if not head:
            with target.open("rb") as source:
                source.seek(start)
                remaining = end - start + 1
                try:
                    while remaining:
                        chunk = source.read(min(65536, remaining))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass

    def serve_stream(self, video_id, head=False):
        if not VIDEO.fullmatch(video_id):
            self.send_error(404)
            return
        sent = False
        try:
            source = stream_source(video_id)
            headers = dict(source["headers"])
            value = self.headers.get("Range")
            if value:
                if not re.fullmatch(r"bytes=\d*-\d*", value):
                    self.send_error(416)
                    return
                headers["Range"] = value
            for attempt in range(2):
                try:
                    upstream = urlopen(Request(source["url"], headers=headers, method="HEAD" if head else "GET"), timeout=20)
                    break
                except HTTPError as error:
                    error.close()
                    if error.code not in (401, 403) or attempt:
                        raise
                    source = stream_source(video_id, refresh=True)
                    headers = dict(source["headers"])
                    if value:
                        headers["Range"] = value
            with upstream:
                self.send_response(upstream.status)
                self.send_header("Content-Type", source["type"])
                self.send_header("Cache-Control", "no-store")
                self.send_header("Accept-Ranges", upstream.headers.get("Accept-Ranges", "bytes"))
                for name in ("Content-Length", "Content-Range"):
                    if upstream.headers.get(name):
                        self.send_header(name, upstream.headers[name])
                self.end_headers()
                sent = True
                if not head:
                    while chunk := upstream.read1(65536):
                        self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # Changing stations closes the previous audio request.
        except (URLError, OSError, ValueError):
            if not sent:
                self.json_response({"error": "No se pudo recibir el audio. Reintentá la emisora."}, 502)

    def do_HEAD(self):
        path = urlparse(self.path).path
        if not self.allow_cloud_request(path):
            return
        if path.startswith("/radio-cache/"):
            self.serve_cached_audio(path, head=True)
        elif path.startswith("/api/media/"):
            self.serve_stream(path.rsplit("/", 1)[-1], head=True)
        elif API_ONLY:
            self.send_error(404)
        else:
            super().do_HEAD()

    def do_GET(self):
        path = urlparse(self.path).path
        if not self.allow_cloud_request(path):
            return
        if path == "/api/health":
            try:
                extractor_version = version("yt-dlp")
            except PackageNotFoundError:
                extractor_version = None
            self.json_response({"ok": True, "ffmpeg": bool(shutil.which("ffmpeg")), "maxStations": MAX_STATIONS, "ytDlp": extractor_version, "node": bool(shutil.which("node")), "revision": os.environ.get("RENDER_GIT_COMMIT", "local")})
        elif path.startswith("/api/media/"):
            self.serve_stream(path.rsplit("/", 1)[-1])
        elif path.startswith("/radio-cache/"):
            self.serve_cached_audio(path)
        elif path.startswith("/api/jobs/"):
            with LOCK:
                result = JOBS.get(path.rsplit("/", 1)[-1], {"state": "error", "error": "La carga expiró. Volvé a intentar."}).copy()
            self.json_response(result)
        elif API_ONLY:
            self.json_response({"error": "Ruta desconocida"}, 404)
        elif path == "/":
            self.send_response(302)
            self.send_header("Location", "/retro.html")
            self.end_headers()
        elif path.startswith("/api/"):
            self.json_response({"error": "Ruta desconocida"}, 404)
        else:
            super().do_GET()

    def do_POST(self):
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        if (API_ONLY and not self.allowed_origin()) or (not API_ONLY and (host not in ("127.0.0.1:" + str(self.server.server_port), "localhost:" + str(self.server.server_port)) or (origin and origin != "http://" + host))):
            self.json_response({"error": "Origen no permitido"}, 403)
            return
        if API_ONLY:
            # One bounded global budget protects the free extraction worker pool.
            now = time.monotonic()
            with RATE_LOCK:
                recent = [stamp for stamp in POST_TIMES.get("global", []) if stamp > now - 60]
                full = len(recent) >= 30
                POST_TIMES["global"] = recent if full else recent + [now]
            if full:
                self.json_response({"error": "El servidor está ocupado. Esperá antes de volver a cargar.", "code": "queue_busy", "retryAfter": 5}, 429)
                return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 50000:
                raise ValueError("La solicitud es demasiado grande.")
            data = json.loads(self.rfile.read(length))
            if self.path == "/api/resolve":
                sources = data.get("sources")
                if not isinstance(sources, list) or not 0 < len(sources) <= 20 or not all(isinstance(s, str) for s in sources):
                    raise ValueError("Pegá hasta 20 enlaces por carga, o una playlist completa.")
                for source in sources:
                    canonical_source(source)
                key = submit_job(resolve_sources, sources)
            elif self.path == "/api/audio":
                video_id = data.get("id", "")
                if not isinstance(video_id, str) or not VIDEO.fullmatch(video_id):
                    raise ValueError("El identificador de video no es válido.")
                key = submit_job(prepare_audio, video_id, audio_id=video_id)
            else:
                self.json_response({"error": "Ruta desconocida"}, 404)
                return
            self.json_response({"job": key}, 202)
        except QueueBusy as error:
            self.json_response({"error": str(error), "code": "queue_busy", "retryAfter": 2}, 429)
        except (ValueError, TypeError, AttributeError) as error:
            self.json_response({"error": str(error)}, 400)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8877")))
    parser.add_argument("--host", default=os.environ.get("RADIO_HOST", "127.0.0.1"))
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    if API_ONLY and not ALLOWED_ORIGINS:
        parser.error("Configurá RADIO_ALLOWED_ORIGINS con el origen HTTPS de tu frontend.")
    CACHE.mkdir(parents=True, exist_ok=True)
    try:
        server = RadioServer((args.host, args.port), Handler)
    except OSError:
        try:
            with urlopen(f"http://127.0.0.1:{args.port}/api/health", timeout=2) as response:
                health = json.load(response)
            if health.get("ok") and health.get("maxStations") == MAX_STATIONS:
                if args.open:
                    webbrowser.open(f"http://127.0.0.1:{args.port}/retro.html")
                print("La radio ya está abierta.", flush=True)
                return
        except (URLError, ValueError):
            pass
        print(f"El puerto {args.port} está ocupado. Podés usar --port 8878.", file=sys.stderr)
        raise SystemExit(1) from None
    print(f"Frecuencia 90: http://127.0.0.1:{args.port}/retro.html", flush=True)
    if args.open:
        webbrowser.open(f"http://127.0.0.1:{args.port}/retro.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
