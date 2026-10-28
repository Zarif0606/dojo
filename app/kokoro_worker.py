"""Runs inside .voice-venv (Python 3.12, kokoro-onnx). Started by app/tts_local.py; never run by hand.

Protocol: one JSON object per line on stdin: {"text", "voice", "speed", "lang"}.
Reply on stdout: an 8-byte big-endian length, then that many bytes of WAV (length 0 means failure).
"""
import io
import json
import struct
import sys
from pathlib import Path

out = sys.stdout.buffer
sys.stdout = sys.stderr  # libraries may print; keep stdout clean for the binary replies

import soundfile as sf  # noqa: E402
from kokoro_onnx import Kokoro  # noqa: E402

DIR = Path(__file__).resolve().parent.parent / "data" / "kokoro"
kokoro = Kokoro(str(DIR / sys.argv[1]), str(DIR / "voices-v1.0.bin"))
out.write(struct.pack(">Q", 1)); out.write(b"R"); out.flush()  # ready signal

for line in sys.stdin:
    try:
        req = json.loads(line)
        audio, rate = kokoro.create(req["text"], voice=req["voice"], speed=float(req.get("speed", 1.0)), lang=req.get("lang", "en-us"))
        buf = io.BytesIO()
        sf.write(buf, audio, rate, format="WAV", subtype="PCM_16")
        data = buf.getvalue()
    except Exception as e:  # report and keep serving
        print("kokoro error:", e, file=sys.stderr)
        data = b""
    out.write(struct.pack(">Q", len(data)))
    out.write(data)
    out.flush()
