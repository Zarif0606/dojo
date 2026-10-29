"""Neural voices from Azure Speech (free F0 tier: 500K characters a month). Used when AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are set.

Each character gets a voice that matches their accent, gender and age. A monthly character cap keeps the free allowance from
running out; when it is reached the app falls back to the browser voice. Never required: without the key nothing changes.
"""
import os
import re
import threading
from datetime import date
from xml.sax.saxutils import escape

import httpx

KEY = os.getenv("AZURE_SPEECH_KEY", "").strip()
REGION = os.getenv("AZURE_SPEECH_REGION", "").strip()
ENABLED = bool(KEY and REGION)
MONTHLY_CAP = int(os.getenv("AZURE_MONTHLY_CHAR_CAP", "450000"))  # the free tier is 500K; leave a margin

# (accent, gender) -> voices; one is chosen per character by hashing their id. Older characters get the deeper/calmer ones first.
VOICES = {
    ("us", "f"): ["en-US-AvaNeural", "en-US-JennyNeural", "en-US-EmmaNeural", "en-US-AriaNeural", "en-US-NancyNeural", "en-US-SaraNeural"],
    ("us", "m"): ["en-US-AndrewNeural", "en-US-BrianNeural", "en-US-GuyNeural", "en-US-DavisNeural", "en-US-TonyNeural", "en-US-JasonNeural"],
    ("gb", "f"): ["en-GB-SoniaNeural", "en-GB-LibbyNeural", "en-GB-MaisieNeural"],
    ("gb", "m"): ["en-GB-RyanNeural", "en-GB-ThomasNeural"],
    ("ca", "f"): ["en-CA-ClaraNeural"],
    ("ca", "m"): ["en-CA-LiamNeural"],
    ("au", "f"): ["en-AU-NatashaNeural"],
    ("au", "m"): ["en-AU-WilliamNeural"],
    ("ie", "f"): ["en-IE-EmilyNeural"],
    ("ie", "m"): ["en-IE-ConnorNeural"],
    ("in", "f"): ["en-IN-NeerjaNeural"],
    ("in", "m"): ["en-IN-PrabhatNeural"],
}
NEAREST = {"scotland": "gb", "nz": "au", "za": "gb"}  # accents Azure has no voice for map to the closest one

_lock = threading.Lock()
_month = ""
chars_used = 0


class AzureTTSError(RuntimeError):
    pass


def _h(s: str) -> int:
    h = 7
    for c in s:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return h


def voice_for(p: dict) -> str:
    code = (p.get("accent") or "en-US").split("-", 1)[-1].lower()
    code = NEAREST.get(code, code)
    pool = VOICES.get((code, "f" if p.get("gender") == "f" else "m")) or VOICES[("us", "f" if p.get("gender") == "f" else "m")]
    return pool[_h(p["id"]) % len(pool)]


def _rate(p: dict, mood: str) -> str:
    s = 0.92 if p["age"] >= 70 else 0.96 if p["age"] >= 60 else 1.0
    if any(w in p.get("personality", "") for w in ("rushed", "terse", "busy", "blunt")):
        s += 0.08
    s += {"annoyed": 0.04, "happy": 0.02, "thinking": -0.04, "confused": -0.03}.get(mood, 0)
    return f"{round((max(0.8, min(1.2, s)) - 1) * 100):+d}%"


def _count(n: int) -> None:
    """Add to this month's character count, or refuse when the monthly cap would be passed."""
    global _month, chars_used
    with _lock:
        m = date.today().strftime("%Y-%m")
        if m != _month:
            _month, chars_used = m, 0
        if chars_used + n > MONTHLY_CAP:
            raise AzureTTSError("The free voice allowance is used up for this month, so the browser voice is used.")
        chars_used += n


def speak(p: dict, text: str, mood: str = "neutral") -> bytes:
    text = re.sub(r"\s+", " ", text).strip()[:900]
    if not text:
        raise AzureTTSError("Nothing to say.")
    _count(len(text))
    voice = voice_for(p)
    ssml = (f"<speak version='1.0' xml:lang='en-US'><voice name='{voice}'><prosody rate='{_rate(p, mood)}'>"
            f"{escape(text)}</prosody></voice></speak>")
    try:
        r = httpx.post(f"https://{REGION}.tts.speech.microsoft.com/cognitiveservices/v1", content=ssml.encode(), timeout=20,
                       headers={"Ocp-Apim-Subscription-Key": KEY, "Content-Type": "application/ssml+xml",
                                "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "dojo"})
    except httpx.HTTPError as e:
        raise AzureTTSError(f"Azure voice unreachable: {e}")
    if r.status_code != 200:
        raise AzureTTSError(f"Azure voice error {r.status_code}")
    return r.content
