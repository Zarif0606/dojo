"""Makes the spoken guide: one audio file per step plus guide.json (captions and durations) in static/narration/.
Run once, after ./install_voice.sh:   .venv/bin/python scripts/make_narration.py
The files are committed, so the Help guide works on a server with no voice engine."""
import json
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app import tts_local  # noqa: E402

NARRATOR = {"id": "narrator", "gender": "f", "age": 34, "personality": "warm and clear", "accent": "en-US"}
STEPS = [  # title, caption (what is shown), say (what is spoken, with pronunciation help)
    ("Describe the situation", "Welcome to Dojo. Start by describing a job or a situation, like selling cars, or a nervous first-time buyer. Type it in and press Build my world.", None),
    ("Watch the world build", "Nemotron models get to work. One large model plans the situations, the objections you will really hear, and a scoring rubric for your field. Five smaller models cast the people you will meet, each with a personality, a voice and a face.", None),
    ("Meet the prospect", "Now you meet them. The scene sets itself: a door opens, a phone rings, or a customer walks up. You are the seller, and the AI plays your prospect, reacting like a real person.", None),
    ("Talk out loud", "Tap the mic, or turn on hands-free, and just speak. Use headphones, so the mic does not hear the other person. You can always type instead.", None),
    ("Read their reactions", "While you talk, a director model scores every line on the skills of your field, and the prospect responds to it. Do well and they soften. Ramble or push, and they cross their arms, close up, or walk away.", None),
    ("Get coached", "When you finish, a coach model scores you against your world's rubric, quotes your own words, and writes the line you should have said. Next time, that prospect remembers your weakest habit.", None),
    ("You are ready", "That is it. Pick a ready-made sales profession, or describe your own situation. The speaker button in the top bar turns the interface sounds on or off. Good luck, and have fun.", None),
]
out = ROOT / "static" / "narration"
out.mkdir(parents=True, exist_ok=True)
guide = []
for n, (title, caption, say) in enumerate(STEPS):
    wav = tts_local.speak(NARRATOR, say or caption, "neutral")
    f = out / f"step-{n + 1}.wav"
    f.write_bytes(wav)
    with wave.open(str(f)) as w:
        dur = w.getnframes() / w.getframerate()
    guide.append({"title": title, "text": caption, "file": f"/static/narration/{f.name}", "duration": round(dur, 2)})
    print(f"step {n + 1}: {dur:.1f}s  {title}")
(out / "guide.json").write_text(json.dumps(guide, indent=1, ensure_ascii=False))
tts_local._stop()
print("total %.0fs" % sum(g["duration"] for g in guide))
