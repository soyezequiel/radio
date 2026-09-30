"""Offline checks for source normalization and cache boundaries."""
import unittest
from unittest.mock import patch
from tempfile import TemporaryDirectory
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import json
import threading
import time
import io
import subprocess
import retro_server as server


class Sources(unittest.TestCase):
    def test_music_playlist(self):
        self.assertEqual(server.canonical_source("https://music.youtube.com/playlist?list=PLabcdefghijk&si=x"), "https://www.youtube.com/playlist?list=PLabcdefghijk")

    def test_channel(self):
        self.assertEqual(server.canonical_source("@RadioTest"), "https://www.youtube.com/@RadioTest/videos")
        self.assertEqual(server.canonical_source("https://youtube.com/@RadioTest/videos"), "https://www.youtube.com/@RadioTest/videos")

    def test_video(self):
        self.assertEqual(server.canonical_source("https://youtu.be/5rAOyh7YmEc?t=12"), "https://www.youtube.com/watch?v=5rAOyh7YmEc")

    def test_search(self):
        self.assertEqual(server.canonical_source("rock argentino"), "ytsearch12:rock argentino")

    def test_no_other_hosts_or_protocols(self):
        for source in ("https://evil.example/", "http://127.0.0.1/private", "https://youtube.com.evil.example/watch?v=5rAOyh7YmEc", "file:///C:/private", "ftp://youtube.com/watch?v=5rAOyh7YmEc", "https://youtube.com/"):
            with self.assertRaises(ValueError):
                server.canonical_source(source)

    def test_audio_id_is_not_a_path(self):
        for value in ("../../secret", "abc\n", "C:/example", "--option"):
            self.assertIsNone(server.VIDEO.fullmatch(value))


class ProviderDiagnostics(unittest.TestCase):
    def test_preserves_network_failure_without_exposing_signed_links(self):
        result = subprocess.CompletedProcess([], 1, stderr="WARNING: Unable to download API page: HTTP Error 429 at https://audio.googlevideo.com/a?token=secret\nERROR: Failed to extract any player response\n")
        with patch.object(server.subprocess, "run", return_value=result), patch("sys.stderr", new=io.StringIO()):
            with self.assertRaises(server.ProviderError) as raised:
                server.run(["yt-dlp"])
        self.assertIn("HTTP Error 429", raised.exception.detail)
        self.assertIn("Failed to extract any player response", raised.exception.detail)
        self.assertNotIn("token=secret", raised.exception.detail)
        self.assertNotIn("googlevideo.com", raised.exception.detail)


class Jobs(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.cache = patch.object(server, "CACHE", Path(self.directory.name))
        self.pool = patch.object(server.POOL, "submit")
        self.cache.start()
        self.submit = self.pool.start()
        server.JOBS.clear()
        server.AUDIO_JOBS.clear()

    def tearDown(self):
        self.pool.stop()
        self.cache.stop()
        self.directory.cleanup()
        server.JOBS.clear()
        server.AUDIO_JOBS.clear()

    def fill_queue(self):
        return [server.submit_job(lambda: None) for _ in range(8)]

    def test_queue_capacity_and_duplicate(self):
        video = "5rAOyh7YmEc"
        key = server.submit_job(server.prepare_audio, video, audio_id=video)
        self.assertEqual(server.JOBS[key]["state"], "queued")
        for _ in range(7):
            server.submit_job(lambda: None)
        self.assertEqual(server.submit_job(server.prepare_audio, video, audio_id=video), key)
        with self.assertRaises(server.QueueBusy):
            server.submit_job(lambda: None)
        self.assertEqual(self.submit.call_count, 8)

    def test_cached_audio_bypasses_full_queue(self):
        self.fill_queue()
        video = "5rAOyh7YmEc"
        (server.CACHE / (video + ".mp3")).write_bytes(b"cached audio")
        key = server.submit_job(server.prepare_audio, video, audio_id=video)
        self.assertEqual(server.JOBS[key]["state"], "done")
        self.assertEqual(server.JOBS[key]["result"]["url"], "/radio-cache/" + video + ".mp3")
        self.assertEqual(self.submit.call_count, 8)

    def test_original_download_bypasses_conversion_and_queue(self):
        self.fill_queue()
        target = server.CACHE / "K4cLY9DEpYI.source.webm"
        target.write_bytes(b"original audio")
        with patch.object(server, "run") as run:
            self.assertEqual(server.prepare_audio("K4cLY9DEpYI"), {"url": "/radio-cache/" + target.name})
            key = server.submit_job(server.prepare_audio, "K4cLY9DEpYI", audio_id="K4cLY9DEpYI")
        self.assertEqual(server.JOBS[key]["state"], "done")
        run.assert_not_called()

    def test_partial_download_is_not_cached(self):
        target = server.CACHE / "K4cLY9DEpYI.source.webm"
        target.write_bytes(b"incomplete")
        Path(str(target) + ".part").write_bytes(b"part")
        self.assertIsNone(server.cached_audio("K4cLY9DEpYI"))

    def test_worker_transitions_and_retry(self):
        video = "5rAOyh7YmEc"
        key = server.submit_job(lambda: None, audio_id=video)
        def fail():
            self.assertEqual(server.JOBS[key]["state"], "loading")
            raise ValueError("falló el contenido")
        server.job_result(key, fail)
        self.assertEqual(server.JOBS[key]["state"], "error")
        new = server.submit_job(lambda: None, audio_id=video)
        self.assertNotEqual(key, new)
        server.job_result(new, lambda: {"url": "test.mp3"})
        self.assertEqual(server.JOBS[new]["state"], "done")
        self.assertEqual(server.submit_job(lambda: None, audio_id=video), new)

    def test_expired_job_cleans_audio_index(self):
        key = server.submit_job(lambda: None, audio_id="5rAOyh7YmEc")
        server.JOBS[key].update(state="done", finished=time.time() - 1801)
        server.submit_job(lambda: None)
        self.assertNotIn(key, server.JOBS)
        self.assertNotIn("5rAOyh7YmEc", server.AUDIO_JOBS)

    def test_http_busy_response_and_cached_audio(self):
        self.fill_queue()
        http = server.RadioServer(("127.0.0.1", 0), server.Handler)
        worker = threading.Thread(target=http.serve_forever, daemon=True)
        worker.start()
        url = f"http://127.0.0.1:{http.server_port}/api/audio"
        request = Request(url, data=b'{"id":"5rAOyh7YmEc"}', headers={"Content-Type": "application/json"})
        try:
            with self.assertRaises(HTTPError) as raised:
                urlopen(request)
            self.assertEqual(raised.exception.code, 429)
            with raised.exception as response:
                data = json.load(response)
            self.assertEqual(data["code"], "queue_busy")
            self.assertGreater(data["retryAfter"], 0)
            (server.CACHE / "5rAOyh7YmEc.mp3").write_bytes(b"cached audio")
            with urlopen(request) as response:
                self.assertEqual(response.status, 202)
                key = json.load(response)["job"]
            with urlopen(f"http://127.0.0.1:{http.server_port}/api/jobs/{key}") as response:
                self.assertEqual(json.load(response)["state"], "done")
        finally:
            http.shutdown()
            http.server_close()
            worker.join()

    def test_local_audio_ranges_and_head(self):
        target = server.CACHE / "K4cLY9DEpYI.source.webm"
        target.write_bytes(b"0123456789")
        http = server.RadioServer(("127.0.0.1", 0), server.Handler)
        worker = threading.Thread(target=http.serve_forever, daemon=True)
        worker.start()
        url = f"http://127.0.0.1:{http.server_port}/radio-cache/{target.name}"
        try:
            for value, expected in (("bytes=2-5", b"2345"), ("bytes=-3", b"789"), ("bytes=7-", b"789")):
                with urlopen(Request(url, headers={"Range": value})) as response:
                    self.assertEqual(response.status, 206)
                    self.assertEqual(response.headers["Accept-Ranges"], "bytes")
                    self.assertEqual(response.read(), expected)
            with urlopen(Request(url, method="HEAD")) as response:
                self.assertEqual(response.headers["Content-Length"], "10")
                self.assertEqual(response.read(), b"")
            with self.assertRaises(HTTPError) as raised:
                urlopen(Request(url, headers={"Range": "bytes=100-"}))
            self.assertEqual(raised.exception.code, 416)
            raised.exception.close()
        finally:
            http.shutdown()
            http.server_close()
            worker.join()


class Streaming(unittest.TestCase):
    def setUp(self):
        server.STREAMS.clear()

    def tearDown(self):
        server.STREAMS.clear()

    def info(self, **changes):
        return {"url": "https://audio.googlevideo.com/videoplayback", "duration": 8385, "ext": "webm", "http_headers": {"User-Agent": "test"}, **changes}

    def test_only_extracts_metadata_and_reuses_source(self):
        with patch.object(server, "run", return_value=json.dumps(self.info())) as run:
            first = server.stream_source("K4cLY9DEpYI")
            self.assertIs(server.stream_source("K4cLY9DEpYI"), first)
            args = run.call_args.args[0]
            self.assertIn("--skip-download", args)
            self.assertNotIn("-o", args)
            self.assertEqual(run.call_count, 1)
            first["expires"] = time.time() - 1
            server.stream_source("K4cLY9DEpYI")
            self.assertEqual(run.call_count, 2)

    def test_rejects_live_long_and_non_media_urls(self):
        for changes in ({"is_live": True}, {"duration": 15000}, {"url": "http://audio.googlevideo.com/a"}, {"url": "https://evil.example/a"}, {"ext": "exe"}):
            with patch.object(server, "run", return_value=json.dumps(self.info(**changes))):
                with self.assertRaises(ValueError):
                    server.stream_source("K4cLY9DEpYI")

    def test_proxy_forwards_range_without_buffering_whole_audio(self):
        class Upstream(io.BytesIO):
            status = 206
            headers = {"Content-Length": "4", "Content-Range": "bytes 2-5/10", "Accept-Ranges": "bytes"}
        http = server.RadioServer(("127.0.0.1", 0), server.Handler)
        worker = threading.Thread(target=http.serve_forever, daemon=True)
        worker.start()
        source = {"url": "https://audio.googlevideo.com/a", "headers": {"User-Agent": "test"}, "type": "audio/webm"}
        try:
            with patch.object(server, "stream_source", return_value=source), patch.object(server, "urlopen", return_value=Upstream(b"2345")) as upstream:
                url = f"http://127.0.0.1:{http.server_port}/api/media/K4cLY9DEpYI"
                with urlopen(Request(url, headers={"Range": "bytes=2-5"})) as response:
                    self.assertEqual(response.status, 206)
                    self.assertEqual(response.headers["Content-Range"], "bytes 2-5/10")
                    self.assertEqual(response.read(), b"2345")
                self.assertEqual(upstream.call_args.args[0].get_header("Range"), "bytes=2-5")
        finally:
            http.shutdown()
            http.server_close()
            worker.join()


class Cloud(unittest.TestCase):
    def setUp(self):
        self.flags = patch.object(server, "API_ONLY", True)
        self.origins = patch.object(server, "ALLOWED_ORIGINS", frozenset({"https://radio.vercel.app"}))
        self.flags.start()
        self.origins.start()
        server.POST_TIMES.clear()
        self.http = server.RadioServer(("127.0.0.1", 0), server.Handler)
        self.worker = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.worker.start()
        self.base = f"http://127.0.0.1:{self.http.server_port}"

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.worker.join()
        self.origins.stop()
        self.flags.stop()
        server.POST_TIMES.clear()

    def test_health_without_origin_for_render(self):
        with urlopen(self.base + "/api/health") as response:
            self.assertTrue(json.load(response)["ok"])
            self.assertIsNone(response.headers.get("Access-Control-Allow-Origin"))

    def test_allowed_browser_preflight(self):
        request = Request(self.base + "/api/audio", method="OPTIONS", headers={"Origin": "https://radio.vercel.app", "Access-Control-Request-Headers": "content-type"})
        with urlopen(request) as response:
            self.assertEqual(response.status, 204)
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], "https://radio.vercel.app")
            self.assertIn("Content-Range", response.headers["Access-Control-Expose-Headers"])

    def test_untrusted_origin_and_no_origin_cannot_submit(self):
        for origin in (None, "https://evil.example", "https://radio.vercel.app.evil.example"):
            headers = {"Content-Type": "application/json"}
            if origin:
                headers["Origin"] = origin
            with self.assertRaises(HTTPError) as raised:
                urlopen(Request(self.base + "/api/audio", data=b'{"id":"5rAOyh7YmEc"}', headers=headers))
            self.assertEqual(raised.exception.code, 403)
            raised.exception.close()

    def test_cloud_never_serves_source_or_directory(self):
        for path in ("/", "/tools/retro_server.py", "/requirements.txt"):
            with self.assertRaises(HTTPError) as raised:
                urlopen(Request(self.base + path, headers={"Origin": "https://radio.vercel.app"}))
            self.assertEqual(raised.exception.code, 404)
            raised.exception.close()

    def test_cloud_audio_supports_cors_ranges(self):
        with TemporaryDirectory() as directory, patch.object(server, "CACHE", Path(directory)):
            target = server.CACHE / "5rAOyh7YmEc.mp3"
            target.write_bytes(b"0123456789")
            with urlopen(Request(self.base + "/radio-cache/" + target.name, headers={"Origin": "https://radio.vercel.app", "Range": "bytes=2-5"})) as response:
                self.assertEqual(response.status, 206)
                self.assertEqual(response.read(), b"2345")
                self.assertEqual(response.headers["Access-Control-Allow-Origin"], "https://radio.vercel.app")
                self.assertEqual(response.headers["Content-Range"], "bytes 2-5/10")

    def test_rate_limit_before_worker_submission(self):
        server.POST_TIMES["global"] = [time.monotonic()] * 30
        with patch.object(server, "submit_job") as submit:
            with self.assertRaises(HTTPError) as raised:
                urlopen(Request(self.base + "/api/audio", data=b'{"id":"5rAOyh7YmEc"}', headers={"Content-Type": "application/json", "Origin": "https://radio.vercel.app"}))
            self.assertEqual(raised.exception.code, 429)
            raised.exception.close()
            submit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
