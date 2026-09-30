"""Trim boundary silence and package user-provided audio for an offline radio lab."""
from pathlib import Path
import subprocess
import re
import json
import base64

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "radio-assets"
TRACKS = [
    ("Mercedes Sosa - Todo Cambia (Videoclip).mp3", "Todo Cambia", "Mercedes Sosa", 900000, "#c76a38"),
    ("Maroon 5 - This Love.mp3", "This Love", "Maroon 5", 1000000, "#168478"),
    ("i'm upping my p(doom).mp3", "i'm upping my p(doom)", "Audio proporcionado", 1100000, "#7764bf"),
]


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, encoding="utf-8", errors="replace")


def main():
    ASSETS.mkdir(exist_ok=True)
    entries = []
    for index, (filename, title, artist, frequency, color) in enumerate(TRACKS):
        source = Path("C:/Users/soyal/Downloads") / filename
        if not source.is_file():
            raise FileNotFoundError(source)
        duration = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(source)]).stdout.strip())
        result = run(["ffmpeg", "-hide_banner", "-i", str(source), "-af", "silencedetect=noise=-45dB:d=0.35", "-f", "null", "-"])
        events = [(kind, float(value)) for kind, value in re.findall(r"silence_(start|end):\s*([0-9.]+)", result.stderr)]
        start, end = 0.0, duration
        if len(events) >= 2 and events[0][0] == "start" and events[0][1] < .08 and events[1][0] == "end":
            start = max(0.0, events[1][1] - .05)
        if events:
            if events[-1][0] == "start":
                end = min(duration, events[-1][1] + .05)
            elif len(events) > 1 and events[-1][0] == "end" and duration - events[-1][1] < .2 and events[-2][0] == "start":
                end = min(duration, events[-2][1] + .05)
        if end - start < 1:
            raise ValueError(f"No usable audio detected: {source}")
        target = ASSETS / f"emisora-{index + 1}.mp3"
        filters = f"highpass=f=30,lowpass=f=3000:p=2,lowpass=f=3000:p=2,loudnorm=I=-19:TP=-2:LRA=11,afade=t=in:d=0.015,afade=t=out:st={end-start-.015}:d=0.015"
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", str(start), "-i", str(source), "-t", str(end - start), "-vn", "-ac", "1", "-af", filters, "-ar", "48000", "-c:a", "libmp3lame", "-b:a", "96k", "-map_metadata", "-1", str(target)])
        meta = dict(id=index, title=title, artist=artist, frequency=frequency, color=color, source=filename,
                    originalDuration=duration, trimStart=start, trimEnd=end, duration=end-start,
                    file=f"radio-assets/{target.name}")
        entries.append({**meta, "base64": base64.b64encode(target.read_bytes()).decode("ascii")})
        print(json.dumps(meta, ensure_ascii=True), flush=True)
    (ROOT / "radio-audio.js").write_text("window.RadioAudioAssets = " + json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    (ASSETS / "recortes.json").write_text(json.dumps([{k:v for k,v in entry.items() if k != "base64"} for entry in entries], indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
