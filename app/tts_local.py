"""Free, local, neural voices (Kokoro). Used when no ElevenLabs key is set and the voice add-on is installed.

Setup lives in install_voice.sh: a Python 3.12 environment in .voice-venv plus the model files in data/kokoro/.
The model runs in a small background process that starts when a session begins and exits after KOKORO_IDLE_SECONDS unused.
Kokoro has American and British voices, so other accents map to the nearest of those.
"""
import os
import re
import struct
import subprocess
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = ROOT / ".voice-venv" / "bin" / "python"
MODEL = os.getenv("KOKORO_MODEL", "kokoro-v1.0.onnx")  # kokoro-v1.0.int8.onnx is smaller and faster, a little less natural
ENABLED = os.getenv("KOKORO", "on").lower() != "off" and PY.exists() and (ROOT / "data" / "kokoro" / MODEL).exists() \
    and (ROOT / "data" / "kokoro" / "voices-v1.0.bin").exists()

IDLE_SECONDS = int(os.getenv("KOKORO_IDLE_SECONDS", "300"))  # the voice model leaves memory after this long unused
_proc: subprocess.Popen | None = None
_timer: threading.Timer | None = None
_lock = threading.Lock()
chars_used = 0


class LocalTTSError(RuntimeError):
    pass


# Voice pools: (region, gender, age band). Weak or novelty voices (am_santa, af_alloy) are left out.
VOICES = {
    ("us", "f", "young"): ["af_bella", "af_heart", "af_jessica", "af_nova", "af_sky", "af_river"],
    ("us", "f", "old"): ["af_nicole", "af_sarah", "af_heart", "af_kore"],
    ("us", "m", "young"): ["am_adam", "am_liam", "am_echo", "am_eric"],
    ("us", "m", "old"): ["am_michael", "am_fenrir", "am_onyx", "am_puck"],
    ("gb", "f", "young"): ["bf_lily", "bf_isabella", "bf_emma"],
    ("gb", "f", "old"): ["bf_emma", "bf_alice", "bf_isabella"],
    ("gb", "m", "young"): ["bm_daniel", "bm_fable", "bm_lewis"],
    ("gb", "m", "old"): ["bm_george", "bm_lewis", "bm_fable"],
}
BRITISH = {"en-GB", "en-IE", "en-scotland", "en-AU", "en-NZ", "en-ZA", "en-IN"}  # nearest available accent


def _h(s: str) -> int:
    h = 7
    for c in s:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return h


def voice_for(p: dict) -> tuple[str, str]:
    region = "gb" if p.get("accent", "en-CA") in BRITISH else "us"
    pool = VOICES[(region, p["gender"], "old" if p["age"] >= 58 else "young")]
    return pool[_h(p["id"]) % len(pool)], "en-gb" if region == "gb" else "en-us"


def _start() -> subprocess.Popen:
    global _proc
    if _proc and _proc.poll() is None:
        return _proc
    _proc = subprocess.Popen([str(PY), str(ROOT / "app" / "kokoro_worker.py"), MODEL], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, cwd=ROOT)
    n = struct.unpack(">Q", _read(_proc, 8))[0]
    _read(_proc, n)  # ready byte
    return _proc


def _read(proc: subprocess.Popen, n: int) -> bytes:
    data = b""
    while len(data) < n:
        chunk = proc.stdout.read(n - len(data))
        if not chunk:
            raise LocalTTSError("The local voice stopped unexpectedly.")
        data += chunk
    return data


def _stop() -> None:
    """Shut the voice worker down to give its memory back. It restarts by itself on the next line."""
    global _proc
    with _lock:
        if _proc and _proc.poll() is None:
            _proc.terminate()
            try:
                _proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                _proc.kill()
        _proc = None


def _touch() -> None:
    global _timer
    if _timer:
        _timer.cancel()
    _timer = threading.Timer(IDLE_SECONDS, _stop)
    _timer.daemon = True
    _timer.start()


def warm_up() -> None:
    """Load the model in the background when the server starts."""
    if ENABLED:
        try:
            with _lock:
                _start()
            _touch()
        except (OSError, LocalTTSError):
            pass


def speak(p: dict, text: str, mood: str = "neutral") -> bytes:
    global chars_used
    text = re.sub(r"\s+", " ", text).strip()[:900]
    if not text:
        raise LocalTTSError("Nothing to say.")
    voice, lang = voice_for(p)
    speed = 0.92 if p["age"] >= 70 else 0.96 if p["age"] >= 60 else 1.0
    if any(w in p["personality"] for w in ("rushed", "terse", "busy", "blunt")):
        speed += 0.08
    speed += {"annoyed": 0.04, "happy": 0.02, "thinking": -0.04, "confused": -0.03}.get(mood, 0)
    req = (__import__("json").dumps({"text": text, "voice": voice, "speed": round(max(0.8, min(1.2, speed)), 2), "lang": lang}) + "\n").encode()
    try:
        with _lock:
            proc = _start()
            proc.stdin.write(req)
            proc.stdin.flush()
            n = struct.unpack(">Q", _read(proc, 8))[0]
            wav = _read(proc, n) if n else b""
    except (OSError, LocalTTSError) as e:
        raise LocalTTSError(f"Local voice failed: {e}")
    if not wav:
        raise LocalTTSError("The local voice couldn't say that line.")
    chars_used += len(text)
    _touch()
    return wav
