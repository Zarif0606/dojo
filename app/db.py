"""Tiny SQLite store: generated worlds, practice sessions and the coach's memory notes."""
import json
import os
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

DB_PATH = Path(os.getenv("DOJO_DB") or Path(__file__).resolve().parent.parent / "data" / "dojo.db")
JSON_COLS = ("transcript", "scores", "feedback", "director", "persona", "world")
_build_lock = threading.Lock()


def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, scenario TEXT, persona_id TEXT, persona_name TEXT,
          difficulty INTEGER, status TEXT DEFAULT 'active', outcome TEXT, research TEXT, overall REAL,
          transcript TEXT DEFAULT '[]', scores TEXT, feedback TEXT, director TEXT DEFAULT '[]');
        CREATE TABLE IF NOT EXISTS memory (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, scenario TEXT, note TEXT);
        CREATE TABLE IF NOT EXISTS worlds (id TEXT PRIMARY KEY, created_at TEXT, line TEXT, title TEXT, data TEXT, builtin INTEGER DEFAULT 0, plays INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS build_counter (day TEXT PRIMARY KEY, n INTEGER);
        """)
        cols = {r["name"] for r in c.execute("PRAGMA table_info(sessions)")}
        for col in ("world_id", "persona", "world"):  # added with the world generator
            if col not in cols:
                c.execute(f"ALTER TABLE sessions ADD COLUMN {col} TEXT")


def _row(r):
    if not r:
        return None
    d = dict(r)
    for k in JSON_COLS:
        d[k] = json.loads(d[k]) if d.get(k) else ([] if k in ("transcript", "director") else None)
    return d


# ---------- worlds ----------

def save_world(wid: str, line: str, data: dict, builtin: bool = False):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO worlds (id, created_at, line, title, data, builtin, plays) VALUES (?,?,?,?,?,?,COALESCE((SELECT plays FROM worlds WHERE id=?),0))",
                  (wid, datetime.now().isoformat(timespec="seconds"), line, data.get("title"), json.dumps(data), int(builtin), wid))


def get_world(wid: str):
    with conn() as c:
        r = c.execute("SELECT * FROM worlds WHERE id=?", (wid,)).fetchone()
    if not r:
        return None
    d = dict(r)
    d["data"] = json.loads(d["data"])
    return d


def list_worlds(limit: int = 24):
    with conn() as c:
        rows = c.execute("SELECT id, line, title, data, builtin, plays FROM worlds WHERE id != 'general' ORDER BY builtin DESC, created_at DESC").fetchall()
    out = []
    for r in sorted(rows, key=lambda r: (not r["builtin"], json.loads(r["data"]).get("order", 99) if r["builtin"] else 0, -r["plays"]))[:limit]:
        w = json.loads(r["data"])
        out.append({"id": r["id"], "line": r["line"], "title": r["title"], "tagline": w.get("tagline", ""), "builtin": bool(r["builtin"]),
                    "plays": r["plays"], "people": len(w.get("personas", [])), "other_side": w.get("other_side", "people"), "scenarios": len(w.get("scenarios", [])),
                    "faces": [p["appearance"] for p in w.get("personas", [])[:4]]})
    return out


def bump_plays(wid: str):
    with conn() as c:
        c.execute("UPDATE worlds SET plays = plays + 1 WHERE id=?", (wid,))


def claim_world_build(cap: int) -> bool:
    """Count one new world build for today. False once the daily cap is used (protects the Nebius credits)."""
    day = datetime.now().strftime("%Y-%m-%d")
    with _build_lock, conn() as c:
        n = (c.execute("SELECT n FROM build_counter WHERE day=?", (day,)).fetchone() or {"n": 0})["n"]
        if n >= cap:
            return False
        c.execute("INSERT OR REPLACE INTO build_counter (day, n) VALUES (?,?)", (day, n + 1))
    return True


# ---------- sessions ----------

def create(world: dict, scenario: str, persona: dict, difficulty: int, research=None, product=None):
    snap = {k: world.get(k) for k in ("id", "title", "you_are", "setting", "objections", "rubric", "live_meters", "pitfalls")}
    snap["product"] = product or world.get("product")
    snap["scenario"] = next((s for s in world["scenarios"] if s["id"] == scenario), world["scenarios"][0])
    with conn() as c:
        cur = c.execute("INSERT INTO sessions (created_at, scenario, persona_id, persona_name, difficulty, research, world_id, persona, world) VALUES (?,?,?,?,?,?,?,?,?)",
                        (datetime.now().isoformat(timespec="seconds"), scenario, persona["id"], persona["name"], difficulty, research, world["id"],
                         json.dumps(persona), json.dumps(snap)))
        return cur.lastrowid


def get(sid):
    with conn() as c:
        return _row(c.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone())


def update(sid, **fields):
    for k in JSON_COLS:
        if k in fields:
            fields[k] = json.dumps(fields[k])
    sets = ", ".join(f"{k}=?" for k in fields)
    with conn() as c:
        c.execute(f"UPDATE sessions SET {sets} WHERE id=?", (*fields.values(), sid))


def delete(sid):
    with conn() as c:
        c.execute("DELETE FROM sessions WHERE id=?", (sid,))


def finished(world_id: str | None = None):
    with conn() as c:
        if world_id:
            rows = c.execute("SELECT * FROM sessions WHERE status='done' AND world_id=? ORDER BY id DESC", (world_id,)).fetchall()
        else:
            rows = c.execute("SELECT * FROM sessions WHERE status='done' ORDER BY id DESC").fetchall()
    return [_row(r) for r in rows]


def add_memory(world_id, note):
    if note:
        with conn() as c:
            c.execute("INSERT INTO memory (created_at, scenario, note) VALUES (?,?,?)",
                      (datetime.now().isoformat(timespec="seconds"), world_id, note[:300]))


def latest_memory(world_id):
    with conn() as c:
        r = c.execute("SELECT note FROM memory WHERE scenario=? ORDER BY id DESC LIMIT 1", (world_id,)).fetchone()
    return r["note"] if r else None


def prune_builtin(keep: set):
    """Remove ready-made worlds that no longer exist as files. Sessions keep their own copy of the world, so history is safe."""
    with conn() as c:
        for (wid,) in c.execute("SELECT id FROM worlds WHERE builtin=1").fetchall():
            if wid not in keep:
                c.execute("DELETE FROM worlds WHERE id=?", (wid,))
