"""Local-only helper to preview and save the browser-rendered video."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/save-video":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        if not 0 < length < 100_000_000:
            self.send_error(413)
            return
        target = ROOT / "resonancia-radio.webm"
        with target.open("wb") as output:
            remaining = length
            while remaining:
                chunk = self.rfile.read(min(remaining, 1024 * 1024))
                if not chunk:
                    self.send_error(400)
                    return
                output.write(chunk)
                remaining -= len(chunk)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"saved")


if __name__ == "__main__":
    os.chdir(ROOT)
    ThreadingHTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
