"""Dojo backend. Run from the project folder:  uvicorn app.main:app --reload"""
import json
import re
import threading
import time
from collections import defaultdict, deque
from datetime import date, datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")  # must run before importing llm (it reads env vars)

import os  # noqa: E402

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.responses import JSONResponse, Response, StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from . import db, llm, research, tts_local, worlds  # noqa: E402
from .typo import clean, clean_list, smart  # noqa: E402
from .prompts import (LABELS, MOODS, coach_system, director_system, meters_of,  # noqa: E402
                      persona_system, transcript_text)

MOOD_RE = re.compile(r"\[\s*mood\s*:\s*([a-z]+)\s*\]", re.I)
END_TAGS = {"[AGREED]": "agreed", "[WALKS AWAY]": "walked_away", "[ENDS]": "ended"}

app = FastAPI(title="Dojo")
db.init()


def _seed_worlds():
    """Ready-made worlds that work with no AI at all: the general one, plus any JSON files in data/worlds/."""
    general = worlds.general_world(json.loads((ROOT / "data" / "personas.json").read_text()))
    db.save_world("general", general["line"], general, builtin=True)
    keep = {"general"}
    for f in sorted((ROOT / "data" / "worlds").glob("*.json")):
        try:
            w = json.loads(f.read_text())
            w["builtin"] = True
            db.save_world(w["id"], w.get("line") or w["title"], w, builtin=True)
            keep.add(w["id"])
        except (ValueError, KeyError):
            continue
    db.prune_builtin(keep)


_seed_worlds()


@app.get("/healthz")
def healthz():
    """Cheap uptime check (no model call, no cost) for a keep-alive monitor."""
    return {"ok": True}


threading.Thread(target=llm.warm_up, daemon=True).start()

# ---------- basic abuse protection for a public demo: N model-backed requests per hour per visitor ----------
_hits: dict[tuple, deque] = defaultdict(deque)
LIMITS = [  # (path test, env var, default per visitor per hour)
    (lambda p: p == "/api/worlds/build", "WORLD_RATE_PER_HOUR", 8),
    (lambda p: p == "/api/sessions", "RATE_LIMIT_PER_HOUR", 30),
    (lambda p: p.endswith("/turn-stream"), "TURN_RATE_PER_HOUR", 400),
    (lambda p: p.endswith("/end"), "END_RATE_PER_HOUR", 40),
    (lambda p: p.endswith("/replay"), "REPLAY_RATE_PER_HOUR", 60),
    (lambda p: p.endswith("/tts"), "TTS_RATE_PER_HOUR", 2500),
    (lambda p: p.endswith("/react"), "REACT_RATE_PER_HOUR", 900),
]


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if request.method == "POST":
        for test, env, default in LIMITS:
            if test(request.url.path):
                ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "?")
                now, q, limit = time.time(), _hits[(ip, env)], int(os.getenv(env, str(default)))
                while q and now - q[0] > 3600:
                    q.popleft()
                if len(q) >= limit:
                    return JSONResponse({"detail": "You've reached the hourly limit for this demo. Please try again later."}, status_code=429)
                q.append(now)
                break
    return await call_next(request)


# ---------- helpers ----------

def _split_tag(text: str):
    for tag, outcome in END_TAGS.items():
        if tag in text.upper():
            return re.sub(re.escape(tag), "", text, flags=re.I).strip(), outcome
    return text, None


def _split_mood(text: str):
    m = MOOD_RE.search(text)
    mood = m.group(1).lower() if m else "neutral"
    return MOOD_RE.sub("", text).strip(), mood if mood in MOODS else "neutral"


def _clean_reply(raw: str, p: dict):
    raw = raw.strip().strip('"')
    raw = re.sub(rf"^{re.escape(p['name'].split()[0])}[^:]*:\s*", "", raw)
    text, mood = _split_mood(raw)
    text, outcome = _split_tag(text)
    return smart(text), outcome, mood


def _llm(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except llm.LLMError as e:
        raise HTTPException(502, str(e))


def _persona_prompt(session: dict, transcript: list[dict], stance: str | None):
    p, w = session["persona"], session["world"]
    system = persona_system(p, w["scenario"], w, session["difficulty"], stance, db.latest_memory(w["id"]), session.get("research"))
    msgs = [{"role": t["role"], "content": f"[mood:{t.get('mood', 'neutral')}] {t['content']}" if t["role"] == "assistant" else t["content"]}
            for t in transcript]
    return system, msgs or [{"role": "user", "content": "(The conversation begins. Say your opening line.)"}], p


ABBREV = {"mr", "mrs", "ms", "dr", "st", "vs", "no"}
SENT_RE = re.compile(r"(.+?[.!?…]+[\"')\]]*)\s+", re.S)


def _next_sentence(buf: str):
    """Pop one finished sentence off the front of buf. A sentence is finished once whitespace follows it."""
    end = 0
    while True:
        m = SENT_RE.match(buf, end)
        if not m:
            return None, buf
        sent = buf[:m.end(1)]
        words = re.findall(r"[A-Za-z]+", sent)
        if words and words[-1].lower() in ABBREV and sent.endswith("."):
            end = m.end()
            continue
        return sent, buf[m.end():]


def _flush(buf: str):
    buf = buf.strip() + " "
    while True:
        sent, rest = _next_sentence(buf)
        if sent is None:
            break
        buf = rest
        yield sent.strip()
    if buf.strip():
        yield buf.strip()


def _direct(session: dict, user_text: str) -> dict | None:
    """The director model scores the user's last line on this world's live meters and picks the character's stance.
    Failure just means no adjustment."""
    w = session["world"]
    ids = [m["id"] for m in meters_of(w)]
    convo = transcript_text(session["transcript"][-6:], session["persona"]["name"])
    prompt = f"Situation: {w['scenario']['label']}.\nRecent conversation:\n{convo}\n\nUSER'S LAST LINE: {user_text}"
    try:
        d = llm.parse_json(llm.chat("director", director_system(w), [{"role": "user", "content": prompt}], json_mode=True, temperature=0.2, max_tokens=140))
    except llm.LLMError:
        return None
    raw = d.get("meters") if isinstance(d.get("meters"), dict) else d
    meters = {}
    for k in ids:
        try:
            meters[k] = max(1, min(5, int(raw.get(k) or 3)))
        except (TypeError, ValueError):
            meters[k] = 3
    return {"meters": meters, "stance": d.get("stance") if d.get("stance") in ("soften", "hold", "harden") else "hold", "note": str(d.get("note") or "")[:80]}


# ---------- API ----------

class StartIn(BaseModel):
    world_id: str = "general"
    scenario: str
    persona_id: str
    difficulty: int = Field(3, ge=1, le=5)
    about: str | None = Field(None, max_length=200)  # optional: who/what you are about to talk to (Tavily research)
    product: str | None = Field(None, max_length=120)  # what the user is selling, so the prospect reacts to the real thing


class TurnIn(BaseModel):
    text: str = Field(max_length=2000)
    seconds: float = 0


class BuildIn(BaseModel):
    line: str = Field(min_length=3, max_length=200)
    product: str | None = Field(None, max_length=120)


class ReactIn(BaseModel):
    text: str = Field(max_length=600)


@app.get("/api/config")
def config():
    return {"provider": llm.PROVIDER, "research": research.enabled(), "examples": worlds.EXAMPLES, "voice": "kokoro" if tts_local.ENABLED else "browser"}


@app.get("/api/worlds")
def list_worlds():
    return db.list_worlds()


@app.get("/api/worlds/{wid}")
def get_world(wid: str):
    w = db.get_world(wid)
    if not w:
        raise HTTPException(404, "World not found")
    return w["data"]


@app.post("/api/worlds/build")
def build_world(body: BuildIn):
    """Streams the build as NDJSON: stage, world, persona (one at a time), done / error."""
    def gen():
        for ev in worlds.build_stream(body.line, body.product):
            yield json.dumps(ev) + "\n"
    return StreamingResponse(gen(), media_type="application/x-ndjson", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


class TtsIn(BaseModel):
    text: str = Field(max_length=900)
    mood: str = "neutral"


@app.post("/api/voice/warm")
def voice_warm():
    """Start the local neural voice in the background when a conversation begins (it shuts itself down when idle)."""
    if tts_local.ENABLED:
        threading.Thread(target=tts_local.warm_up, daemon=True).start()
    return {"ok": True}


def _speakable(text: str) -> str:
    """Written text to spoken text: dashes become pauses, symbols become words."""
    t = re.sub(r"\s*[—–]\s*", ", ", text.replace("*", ""))
    return re.sub(r"(\d)\s*%", r"\1 percent", t).replace("&", " and ").replace("’", "'")


@app.post("/api/sessions/{sid}/tts")
def session_tts(sid: int, body: TtsIn):
    """Audio for one line of the character in this conversation, in their own voice. 404 means the browser voice is used instead."""
    if not tts_local.ENABLED:
        raise HTTPException(404, "No neural voice is installed")
    session = db.get(sid)
    if not session:
        raise HTTPException(404, "Session not found")
    mood = body.mood if body.mood in MOODS else "neutral"
    try:
        audio = tts_local.speak(session["persona"], _speakable(body.text), mood)
    except tts_local.LocalTTSError as e:
        raise HTTPException(502, str(e))
    return Response(audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@app.get("/api/model-stats")
def model_stats():
    return llm.stats_snapshot()


@app.post("/api/sessions")
def start(body: StartIn):
    rec = db.get_world(body.world_id)
    if not rec:
        raise HTTPException(404, "Unknown world")
    world = rec["data"]
    if body.scenario not in {s["id"] for s in world["scenarios"]}:
        raise HTTPException(400, "Unknown situation")
    persona = next((p for p in world["personas"] if p["id"] == body.persona_id), None)
    if not persona:
        raise HTTPException(404, "Unknown person")
    brief = research.brief(body.about) if body.about else None
    sid = db.create(world, body.scenario, persona, body.difficulty, brief, clean(body.product, "phrase", 120) or None)
    db.bump_plays(world["id"])
    session = db.get(sid)
    system, msgs, p = _persona_prompt(session, [], None)
    raw = _llm(lambda: "".join(llm.chat_stream("persona", system, msgs)))
    reply, outcome, mood = _clean_reply(raw, p)
    db.update(sid, transcript=[{"role": "assistant", "content": reply, "mood": mood}], **({"outcome": outcome} if outcome else {}))
    return {"id": sid, "persona": persona, "scene": session["world"]["scenario"].get("scene", "office"), "meters": meters_of(session["world"]),
            "scenario": session["world"]["scenario"], "reply": reply, "outcome": outcome, "mood": mood, "memory": db.latest_memory(world["id"]), "research": brief}


def _stream_turn(session: dict, sid: int, user_entry: dict, seconds: float):
    """NDJSON events: director, mood, sentence..., done (or error)."""
    ev = lambda o: json.dumps(o) + "\n"  # noqa: E731
    p = session["persona"]
    director = _direct(session, user_entry["content"])
    if director:
        yield ev({"type": "director", **director})
    system, msgs, _ = _persona_prompt(session, session["transcript"] + [user_entry], director["stance"] if director else None)
    first_name = re.escape(p["name"].split()[0])
    buf = full = ""
    mood_sent, first = False, True

    def clean(sent: str):
        nonlocal first
        if first:
            sent = re.sub(rf"^{first_name}[^:]*:\s*", "", sent)
            first = False
        return smart(_split_tag(sent.strip().strip('"'))[0])

    try:
        for chunk in llm.chat_stream("persona", system, msgs):
            buf += chunk
            full += chunk
            if not mood_sent:
                m = MOOD_RE.search(buf)
                if not (m or len(buf) > 40 or ("[" not in buf and buf.strip())):
                    continue
                mood_sent = True
                mood = m.group(1).lower() if m else "neutral"
                buf = MOOD_RE.sub("", buf, 1).lstrip()
                yield ev({"type": "mood", "mood": mood if mood in MOODS else "neutral"})
            while True:
                sent, rest = _next_sentence(buf)
                if sent is None:
                    break
                buf = rest
                s = clean(sent)
                if s:
                    yield ev({"type": "sentence", "text": s})
    except llm.LLMError as e:
        yield ev({"type": "error", "message": str(e)})
        return
    text, outcome, mood = _clean_reply(full, p)
    if not text:
        yield ev({"type": "error", "message": "The model returned an empty reply. Try again."})
        return
    if not mood_sent:
        yield ev({"type": "mood", "mood": mood})
        buf = text
    else:
        buf = _split_tag(buf.strip().strip('"'))[0]
    for sent in _flush(buf):
        if sent:
            yield ev({"type": "sentence", "text": smart(sent)})
    session["transcript"].append(user_entry)
    session["transcript"].append({"role": "assistant", "content": text, "mood": mood})
    turns = (session.get("director") or []) + ([director] if director else [])
    db.update(sid, transcript=session["transcript"], director=turns, **({"outcome": outcome} if outcome else {}))
    yield ev({"type": "done", "reply": text, "outcome": outcome, "mood": mood})


REACT_SYSTEM = """You watch a prospect listen to a salesperson who is still talking. From the words so far, decide how the prospect reacts RIGHT NOW without speaking.
Return ONLY JSON: {"reaction": "nod|shake|brow|lean|impatient|none", "mood": "neutral|interested|happy|skeptical|annoyed|confused|thinking", "note": "under 8 words"}
nod = agreeing or following, shake = disagreeing or doubting, brow = surprised or curious, lean = drawn in, impatient = rambling, pushy or off-topic, none = nothing to react to yet."""


@app.post("/api/sessions/{sid}/react")
def react(sid: int, body: ReactIn):
    """A fast, silent reaction while the user is still speaking: the prospect nods, frowns, leans in or gets impatient."""
    session = db.get(sid)
    if not session or session["status"] != "active":
        raise HTTPException(404, "Session not found or already finished")
    p = session["persona"]
    prompt = f"Prospect: {p['name']}, {p['role']}, {p['personality']}. Difficulty {session['difficulty']}/5.\nSalesperson so far: {body.text[-400:]}"
    try:
        d = llm.parse_json(llm.chat("director", REACT_SYSTEM, [{"role": "user", "content": prompt}], json_mode=True, temperature=0.3, max_tokens=70))
    except llm.LLMError:
        return {"reaction": "none", "mood": None, "note": ""}
    return {"reaction": d.get("reaction") if d.get("reaction") in ("nod", "shake", "brow", "lean", "impatient") else "none",
            "mood": d.get("mood") if d.get("mood") in MOODS else None, "note": str(d.get("note") or "")[:60]}


@app.post("/api/sessions/{sid}/turn-stream")
def turn_stream(sid: int, body: TurnIn):
    session = db.get(sid)
    if not session or session["status"] != "active":
        raise HTTPException(404, "Session not found or already finished")
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Say something first")
    return StreamingResponse(_stream_turn(session, sid, {"role": "user", "content": text}, body.seconds), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


def _view(s: dict) -> dict:
    """A session as the UI needs it, with the labels of its own world's rubric."""
    w = s.get("world") or {}
    s["labels"] = {r["id"]: r["label"] for r in w.get("rubric", [])} or LABELS
    s["meter_labels"] = {m["id"]: m["label"] for m in meters_of(w)} if w else {}
    s["scenario_label"] = (w.get("scenario") or {}).get("label", s["scenario"])
    s["world_title"] = w.get("title", "Hard conversations")
    return s


@app.post("/api/sessions/{sid}/end")
def end(sid: int):
    session = db.get(sid)
    if not session:
        raise HTTPException(404, "Session not found")
    if session["status"] == "done":
        return _view(session)
    if not [t for t in session["transcript"] if t["role"] == "user"]:
        db.delete(sid)
        raise HTTPException(400, "You didn't say anything, so there's nothing to coach. Session discarded.")
    w, p = session["world"], session["persona"]
    ids = [r["id"] for r in w["rubric"]]
    turns = session.get("director") or []
    avg = {}
    for k in [m["id"] for m in meters_of(w)]:
        vals = [t["meters"][k] for t in turns if k in (t.get("meters") or {})]
        if vals:
            avg[k] = round(sum(vals) / len(vals), 1)
    prompt = (f"Situation: {w['scenario']['label']} ({w['scenario']['skills']}). Difficulty {session['difficulty']}/5.\n"
              f"The other person: {p['name']}, {p['role']}.\nOutcome: {session['outcome'] or 'the user ended the session'}.\n"
              f"Live director averages for the user's lines (1-5): {json.dumps(avg)}\n\nTRANSCRIPT\n{transcript_text(session['transcript'], p['name'])}")
    raw = _llm(llm.chat, "coach", coach_system(w), [{"role": "user", "content": prompt}], json_mode=True, temperature=0.3, max_tokens=6000)
    try:
        fb = llm.parse_json(raw)
    except llm.LLMError as e:
        import logging; logging.getLogger("uvicorn.error").warning("coach returned unparsable JSON: %r ... %r", raw[:200], raw[-200:])
        raise HTTPException(502, f"{e} Press End again to retry.")
    fb["summary"] = clean(fb.get("summary"), "sentence", 420)
    for k in ("strengths", "fixes", "practice_plan"):
        fb[k] = clean_list(fb.get(k), "sentence", 4, 320)
    fb["better_lines"] = [{"turn": int(b["turn"]) if str(b.get("turn") or "").isdigit() else None, "moment": clean(b.get("moment"), "sentence", 200), "instead": clean(b.get("instead"), "sentence", 300)}
                          for b in (fb.get("better_lines") or []) if isinstance(b, dict)][:3]
    fb["memory_note"] = clean(fb.get("memory_note"), "sentence", 240)
    got = fb.get("scores") if isinstance(fb.get("scores"), dict) else {}
    scores = {}
    for c in ids:
        try:
            scores[c] = max(1, min(10, int(got.get(c) or 5)))
        except (TypeError, ValueError):
            scores[c] = 5
    shown = [c for c in ids if c not in {str(x) for x in (fb.get("not_shown") or [])}]
    if len(shown) < 2:  # never let a coach answer remove (almost) every skill
        shown = list(ids)
    fb["not_shown"] = [c for c in ids if c not in shown]
    overall = round(sum(scores[c] for c in shown) / len(shown), 1)
    fb["director_averages"] = avg
    db.add_memory(w["id"], str(fb.get("memory_note") or ""))
    db.update(sid, status="done", feedback=fb, scores=scores, overall=overall)
    return _view(db.get(sid))


class ReplayIn(BaseModel):
    index: int = 0


@app.post("/api/sessions/{sid}/replay")
def replay(sid: int, body: ReplayIn):
    """What would have happened: the customer answers the coach's better line instead of what the user said."""
    session = db.get(sid)
    if not session or session["status"] != "done":
        raise HTTPException(404, "Finish and coach the session first")
    lines = (session.get("feedback") or {}).get("better_lines") or []
    if not 0 <= body.index < len(lines) or not lines[body.index].get("instead"):
        raise HTTPException(400, "No better line to replay")
    tr = session["transcript"]
    users = [i for i, t in enumerate(tr) if t["role"] == "user"]
    turn = lines[body.index].get("turn")
    at = users[turn - 1] if turn and 1 <= turn <= len(users) else users[-1]  # no valid turn number: the last thing the user said
    better = lines[body.index]["instead"]
    system, msgs, p = _persona_prompt(session, tr[:at] + [{"role": "user", "content": better}], None)
    raw = _llm(llm.chat, "persona", system, msgs, temperature=0.85, max_tokens=200)
    text, _, mood = _clean_reply(raw, p)
    was = tr[at + 1]["content"] if at + 1 < len(tr) and tr[at + 1]["role"] == "assistant" else ""
    return {"you_said": tr[at]["content"], "they_said": was, "better": better, "they_would_say": text, "mood": mood, "name": p["name"].split()[0]}


@app.post("/api/sessions/{sid}/undo")
def undo(sid: int):
    """Take back the user's last line and the reply to it, so they can say it again differently."""
    session = db.get(sid)
    if not session or session["status"] != "active":
        raise HTTPException(404, "Session not found")
    if session.get("outcome"):
        raise HTTPException(400, "The conversation already ended, so there is nothing to undo. Press End for coaching.")
    tr = session["transcript"]
    users = [i for i, t in enumerate(tr) if t["role"] == "user"]
    if not users:
        raise HTTPException(400, "There is nothing to undo yet.")
    at = users[-1]
    removed = tr[at]["content"]
    director = list(session.get("director") or [])
    if len(director) >= len(users):  # a line only has a director score if the director answered that turn
        director.pop()
    db.update(sid, transcript=tr[:at], director=director)
    prev = next((t for t in reversed(tr[:at]) if t["role"] == "assistant"), None)
    return {"text": removed, "director": director[-1] if director else None, "mood": (prev or {}).get("mood", "neutral"), "lines": len(users) - 1}


@app.get("/api/sessions")
def history():
    out = []
    for s in db.finished():
        s = _view(s)
        out.append({k: s[k] for k in ("id", "created_at", "scenario_label", "persona_name", "difficulty", "outcome", "overall", "world_title", "world_id")})
    return out


@app.get("/api/sessions/{sid}")
def one(sid: int):
    s = db.get(sid)
    if not s:
        raise HTTPException(404, "Session not found")
    return _view(s)


@app.get("/api/stats")
def stats():
    done = db.finished()
    days = {datetime.fromisoformat(s["created_at"]).date() for s in done}
    streak, d = 0, date.today()
    if d not in days:
        d -= timedelta(days=1)
    while d in days:
        streak += 1
        d -= timedelta(days=1)
    latest = (done[0].get("world_id") or "general") if done else None
    same = [s for s in done if (s.get("world_id") or "general") == latest][:10]
    ids = list(same[0]["scores"]) if same else []
    avgs = {c: round(sum(s["scores"].get(c, 0) for s in same) / len(same), 1) for c in ids}
    first, last = (same[-1]["overall"], same[0]["overall"]) if len(same) >= 2 else (None, None)
    head = _view(dict(same[0])) if same else {}
    return {"total_sessions": len(done), "streak_days": streak, "recent_averages": avgs, "labels": head.get("labels", {}), "world_title": head.get("world_title"),
            "weakest": min(avgs, key=avgs.get) if avgs else None, "first_score": first, "latest_score": last}


# ---------- frontend ----------

class FreshStatic(StaticFiles):
    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        resp.headers["Cache-Control"] = "no-cache"
        return resp


app.mount("/static", FreshStatic(directory=ROOT / "static"), name="static")


@app.get("/")
def index():
    html = (ROOT / "static" / "index.html").read_text()

    def version(m):
        f = ROOT / "static" / m.group(1)
        return f'{m.group(0)[:-1]}?v={int(f.stat().st_mtime)}"' if f.exists() else m.group(0)

    return Response(re.sub(r'/static/([\w.\-/]+\.(?:css|js))"', version, html), media_type="text/html", headers={"Cache-Control": "no-cache"})
