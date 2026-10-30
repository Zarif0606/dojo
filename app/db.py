"""Tiny SQLite store: generated worlds, practice sessions and the coach's memory notes."""
import json
import contextvars
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


# Who is making this request (a random id in a cookie, set by the middleware in main.py). None for internal / local use.
CURRENT_VID: contextvars.ContextVar = contextvars.ContextVar("dojo_vid", default=None)


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
        CREATE TABLE IF NOT EXISTS visitor_worlds (vid TEXT, world_id TEXT, PRIMARY KEY (vid, world_id));
        """)
        cols = {r["name"] for r in c.execute("PRAGMA table_info(sessions)")}
        for col in ("world_id", "persona", "world", "vid"):  # world_id/persona/world came with the world generator, vid with per-visitor history
            if col not in cols:
                c.execute(f"ALTER TABLE sessions ADD COLUMN {col} TEXT")
        if "vid" not in {r["name"] for r in c.execute("PRAGMA table_info(memory)")}:
            c.execute("ALTER TABLE memory ADD COLUMN vid TEXT")


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


def add_visitor_world(wid: str):
    """Remember that this visitor built or played this world, so it shows in their own list."""
    vid = CURRENT_VID.get()
    if vid:
        with conn() as c:
            c.execute("INSERT OR IGNORE INTO visitor_worlds (vid, world_id) VALUES (?,?)", (vid, wid))


def list_worlds(limit: int = 24):
    """Ready-made worlds for everyone, plus only the worlds this visitor built or played."""
    vid = CURRENT_VID.get()
    with conn() as c:
        if vid:
            rows = c.execute("SELECT id, line, title, data, builtin, plays FROM worlds WHERE id != 'general' AND (builtin=1 OR id IN (SELECT world_id FROM visitor_worlds WHERE vid=?)) "
                             "ORDER BY builtin DESC, created_at DESC", (vid,)).fetchall()
        else:
            rows = c.execute("SELECT id, line, title, data, builtin, plays FROM worlds WHERE id != 'general' ORDER BY builtin DESC, created_at DESC").fetchall()
    out = []
    for r in sorted(rows, key=lambda r: (not r["builtin"], json.loads(r["data"]).get("order", 99) if r["builtin"] else 0, -r["plays"]))[:limit]:
        w = json.loads(r["data"])
        out.append({"id": r["id"], "line": r["line"], "title": r["title"], "tagline": w.get("tagline", ""), "builtin": bool(r["builtin"]), "group": w.get("group", "sales"),
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
    snap = {k: world.get(k) for k in ("id", "title", "you_are", "setting", "objections", "rubric", "live_meters", "pitfalls", "skipped")}
    snap["product"] = product or world.get("product")
    snap["scenario"] = next((s for s in world["scenarios"] if s["id"] == scenario), world["scenarios"][0])
    with conn() as c:
        cur = c.execute("INSERT INTO sessions (created_at, scenario, persona_id, persona_name, difficulty, research, world_id, persona, world, vid) VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (datetime.now().isoformat(timespec="seconds"), scenario, persona["id"], persona["name"], difficulty, research, world["id"],
                         json.dumps(persona), json.dumps(snap), CURRENT_VID.get()))
        return cur.lastrowid


def get(sid):
    """A session, or None if it belongs to a different visitor."""
    with conn() as c:
        row = _row(c.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone())
    vid = CURRENT_VID.get()
    if row and vid and row.get("vid") and row["vid"] != vid:
        return None
    return row


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
    """Finished conversations, newest first: only this visitor's when a visitor is known."""
    vid = CURRENT_VID.get()
    sql, args = "SELECT * FROM sessions WHERE status='done'", []
    if world_id:
        sql += " AND world_id=?"; args.append(world_id)
    if vid:
        sql += " AND (vid=? OR vid IS NULL)"; args.append(vid)
    with conn() as c:
        rows = c.execute(sql + " ORDER BY id DESC", args).fetchall()
    return [_row(r) for r in rows]


def add_memory(world_id, note):
    if note:
        with conn() as c:
            c.execute("INSERT INTO memory (created_at, scenario, note, vid) VALUES (?,?,?,?)",
                      (datetime.now().isoformat(timespec="seconds"), world_id, note[:300], CURRENT_VID.get()))


def latest_memory(world_id):
    """The coach's note about this visitor's weakest habit in this world (never another visitor's)."""
    vid = CURRENT_VID.get()
    with conn() as c:
        r = c.execute("SELECT note FROM memory WHERE scenario=? AND vid IS ? ORDER BY id DESC LIMIT 1", (world_id, vid)).fetchone()
    return r["note"] if r else None


def prune_builtin(keep: set):
    """Remove ready-made worlds that no longer exist as files. Sessions keep their own copy of the world, so history is safe."""
    with conn() as c:
        for (wid,) in c.execute("SELECT id FROM worlds WHERE builtin=1").fetchall():
            if wid not in keep:
                c.execute("DELETE FROM worlds WHERE id=?", (wid,))
