"""Offline two-origin fixture for the deployed frontend/backend contract."""
import json
import shutil
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
import retro_server as radio

with TemporaryDirectory() as directory:
    radio.API_ONLY = True
    radio.CACHE = Path(directory)
    video = "5rAOyh7YmEc"
    shutil.copyfile(radio.ROOT / "radio-assets/emisora-2.mp3", radio.CACHE / (video + ".mp3"))
    radio.resolve_sources = lambda sources: {"stations": [{"id": video, "title": "Backend test station", "artist": "Fixture", "source": "youtube"}]}
    backend = radio.RadioServer(("127.0.0.1", 0), radio.Handler)
    frontend = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(radio.ROOT / "dist")))
    frontend_url = f"http://127.0.0.1:{frontend.server_port}"
    radio.ALLOWED_ORIGINS = frozenset({frontend_url})
    workers = [threading.Thread(target=service.serve_forever, daemon=True) for service in (backend, frontend)]
    for worker in workers:
        worker.start()
    print(json.dumps({"frontend": frontend_url, "backend": f"http://127.0.0.1:{backend.server_port}"}), flush=True)
    try:
        sys.stdin.read()
    finally:
        for service in (backend, frontend):
            service.shutdown()
            service.server_close()
        for worker in workers:
            worker.join()
