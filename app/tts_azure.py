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
# HD voices sound the most human, but Azure bills them as a separate, higher tier that may not be covered by the free 500K.
# So they have their own lower cap; past it, US characters use the regular Multilingual voices. AZURE_HD=off turns them off.
HD = os.getenv("AZURE_HD", "on").lower() != "off"
HD_CAP = int(os.getenv("AZURE_HD_CHAR_CAP", "120000"))
HD_VOICES = {
    ("us", "f"): ["en-US-Ava:DragonHDLatestNeural", "en-US-Emma:DragonHDLatestNeural"],
    ("us", "m"): ["en-US-Andrew:DragonHDLatestNeural", "en-US-Steffan:DragonHDLatestNeural"],
}

# (accent, gender) -> voices; one is chosen per character by hashing their id. Older characters get the deeper/calmer ones first.
VOICES = {
    ("us", "f"): ["en-US-AvaMultilingualNeural", "en-US-EmmaMultilingualNeural"],  # the Multilingual voices sound the most natural
    ("us", "m"): ["en-US-AndrewMultilingualNeural", "en-US-BrianMultilingualNeural"],
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
hd_used = 0


class AzureTTSError(RuntimeError):
    pass


def _h(s: str) -> int:
    h = 7
    for c in s:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return h


def _key(p: dict) -> tuple[str, str]:
    code = (p.get("accent") or "en-US").split("-", 1)[-1].lower()
    return NEAREST.get(code, code), "f" if p.get("gender") == "f" else "m"


def voice_for(p: dict, hd: bool = False) -> str:
    code, g = _key(p)
    pool = (HD_VOICES.get((code, g)) if hd else None) or VOICES.get((code, g)) or VOICES[("us", g)]
    return pool[_h(p["id"]) % len(pool)]


def _rate(p: dict, mood: str) -> str:
    s = 0.92 if p["age"] >= 70 else 0.96 if p["age"] >= 60 else 1.0
    if any(w in p.get("personality", "") for w in ("rushed", "terse", "busy", "blunt")):
        s += 0.08
    s += {"annoyed": 0.04, "happy": 0.02, "thinking": -0.04, "confused": -0.03}.get(mood, 0)
    return f"{round((max(0.8, min(1.2, s)) - 1) * 100):+d}%"


def _count(n: int, hd_wanted: bool) -> bool:
    """Add to this month's character counts, or refuse when the monthly cap would be passed. Returns whether HD can be used."""
    global _month, chars_used, hd_used
    with _lock:
        m = date.today().strftime("%Y-%m")
        if m != _month:
            _month, chars_used, hd_used = m, 0, 0
        if chars_used + n > MONTHLY_CAP:
            raise AzureTTSError("The free voice allowance is used up for this month, so the browser voice is used.")
        chars_used += n
        use_hd = hd_wanted and hd_used + n <= HD_CAP
        if use_hd:
            hd_used += n
        return use_hd


def speak(p: dict, text: str, mood: str = "neutral") -> bytes:
    text = re.sub(r"\s+", " ", text).strip()[:900]
    if not text:
        raise AzureTTSError("Nothing to say.")
    voice = voice_for(p, _count(len(text), HD and _key(p) in HD_VOICES))
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
