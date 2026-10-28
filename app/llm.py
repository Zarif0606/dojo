"""Model layer. Three jobs ("roles"), each with its own model:

  persona  - plays the person you are rehearsing with (fast, streamed every turn)
  director - reads your last line and decides how the persona should react (fast, tiny JSON)
  coach    - writes the final report (stronger reasoning, structured JSON)

LLM_PROVIDER picks where they run. Every provider speaks the OpenAI chat-completions format:
  nebius - Nebius Token Factory with NVIDIA Nemotron models (the real thing)
  ollama - a local model, to work offline
  mock   - canned replies, to test without any AI
"""
import json
import os
import random
import re
import time
from collections import defaultdict

import httpx

PROVIDER = os.getenv("LLM_PROVIDER", "nebius").lower()
TIMEOUT = float(os.getenv("LLM_TIMEOUT", "120"))
ROLES = ("persona", "director", "coach", "planner", "caster")
# A role without its own model uses a sensible neighbour, so .env only needs the models you want to tune.
FALLBACK = {"planner": "coach", "caster": "persona", "director": "persona"}


class LLMError(RuntimeError):
    pass


def _extra(role: str) -> dict:
    try:
        return json.loads(os.getenv(f"NEBIUS_EXTRA_{role.upper()}", "") or "{}")
    except ValueError:
        return {}


def endpoint(role: str) -> tuple[str, dict, str]:
    """(url, headers, model) for a role."""
    if PROVIDER == "ollama":
        base = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1/")
        return base.rstrip("/") + "/chat/completions", {}, os.getenv("OLLAMA_MODEL", "llama3.1:8b")
    key = os.getenv("NEBIUS_API_KEY", "")
    model = os.getenv(f"NEBIUS_MODEL_{role.upper()}", "") or os.getenv(f"NEBIUS_MODEL_{FALLBACK.get(role, role).upper()}", "")
    if not key:
        raise LLMError("NEBIUS_API_KEY is missing. Add it to .env (or set LLM_PROVIDER=mock to try the app without AI).")
    if not model:
        raise LLMError(f"NEBIUS_MODEL_{role.upper()} is missing in .env. Copy a model ID from the Token Factory model list.")
    base = os.getenv("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1/")
    return base.rstrip("/") + "/chat/completions", {"Authorization": f"Bearer {key}"}, model


# ---------- live numbers for the UI: speed and token use per role ----------
STATS: dict[str, dict] = defaultdict(lambda: {"calls": 0, "tokens_in": 0, "tokens_out": 0, "first_token_s": [], "tok_per_s": [], "model": ""})
calls_today = {"day": "", "n": 0}


def _count_call() -> None:
    day = time.strftime("%Y-%m-%d")
    if calls_today["day"] != day:
        calls_today.update(day=day, n=0)
    cap = int(os.getenv("DAILY_CALL_CAP", "2000"))
    if calls_today["n"] >= cap:
        raise LLMError("The demo has reached its daily limit. Please try again tomorrow.")
    calls_today["n"] += 1


def stats_snapshot() -> dict:
    out = {}
    for role, s in STATS.items():
        ft, tp = s["first_token_s"][-20:], s["tok_per_s"][-20:]
        out[role] = {"model": s["model"], "calls": s["calls"], "tokens_in": s["tokens_in"], "tokens_out": s["tokens_out"],
                     "first_token_s": round(sum(ft) / len(ft), 2) if ft else None, "tok_per_s": round(sum(tp) / len(tp)) if tp else None}
    return {"provider": PROVIDER, "roles": out, "calls_today": calls_today["n"]}


def _record(role, model, t0, t_first, usage, text) -> None:
    s = STATS[role]
    s["calls"] += 1
    s["model"] = model
    n_out = (usage or {}).get("completion_tokens") or max(1, len(text) // 4)
    s["tokens_in"] += (usage or {}).get("prompt_tokens", 0)
    s["tokens_out"] += n_out
    if t_first:
        s["first_token_s"].append(t_first - t0)
        dur = max(time.time() - t_first, 0.05)
        if n_out > 3:
            s["tok_per_s"].append(n_out / dur)


# ---------- reasoning models may wrap their thinking in <think> tags; never show or speak it ----------
THINK = re.compile(r"<think>.*?</think>", re.S)


def strip_think(text: str) -> str:
    text = THINK.sub("", text)
    return text.split("</think>")[-1].strip() if "</think>" in text else text.strip()


class ThinkFilter:
    """Removes <think>...</think> from a stream of chunks, even when a tag is split across chunks."""

    def __init__(self):
        self.buf, self.inside = "", False

    def feed(self, chunk: str) -> str:
        self.buf += chunk
        out = ""
        while True:
            if self.inside:
                i = self.buf.find("</think>")
                if i < 0:
                    self.buf = self.buf[-8:]
                    return out
                self.buf, self.inside = self.buf[i + 8:], False
            else:
                i = self.buf.find("<think>")
                if i < 0:
                    keep = 0
                    for k in range(1, 7):  # hold back a possible partial "<think>"
                        if self.buf.endswith("<think>"[:k]):
                            keep = k
                    out += self.buf[:len(self.buf) - keep]
                    self.buf = self.buf[len(self.buf) - keep:]
                    return out
                out += self.buf[:i]
                self.buf, self.inside = self.buf[i + 7:], True

    def flush(self) -> str:
        out = "" if self.inside else self.buf
        self.buf = ""
        return out


def _body(role, model, system, messages, temperature, stream, json_mode, max_tokens):
    body = {"model": model, "messages": [{"role": "system", "content": system}] + messages, "temperature": temperature,
            "stream": stream, **_extra(role)}
    if max_tokens:
        body["max_tokens"] = max_tokens
    if stream:
        body["stream_options"] = {"include_usage": True}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    return body


def chat(role: str, system: str, messages: list[dict], json_mode: bool = False, temperature: float = 0.7, max_tokens: int | None = None) -> str:
    if PROVIDER == "mock":
        return _mock(role, messages, json_mode, system)
    _count_call()
    url, headers, model = endpoint(role)
    t0 = time.time()
    try:
        r = httpx.post(url, headers=headers, json=_body(role, model, system, messages, temperature, False, json_mode, max_tokens), timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()
        text = strip_think(data["choices"][0]["message"].get("content") or "")
    except httpx.ConnectError:
        raise LLMError("Can't reach the model service. Check your internet connection (or that Ollama is running).")
    except httpx.HTTPStatusError as e:
        if json_mode and e.response.status_code in (400, 422):  # some models reject response_format: ask again, the prompt already says JSON
            return chat(role, system, messages, False, temperature, max_tokens)
        raise LLMError(_http_error(e))
    except (KeyError, IndexError, ValueError):
        raise LLMError("The model returned an unexpected answer. Try again.")
    _record(role, model, t0, t0 + 0.0, data.get("usage"), text)
    return text


def chat_stream(role: str, system: str, messages: list[dict], temperature: float = 0.85, max_tokens: int | None = 200):
    """Yield the reply in small chunks as the model writes it."""
    if PROVIDER == "mock":
        for w in _mock(role, messages, False, system).split(" "):
            time.sleep(0.02)
            yield w + " "
        return
    _count_call()
    url, headers, model = endpoint(role)
    t0, t_first, usage, text, filt = time.time(), None, None, "", ThinkFilter()
    try:
        with httpx.stream("POST", url, headers=headers, json=_body(role, model, system, messages, temperature, True, False, max_tokens), timeout=TIMEOUT) as r:
            if r.status_code >= 400:
                r.read()
                raise LLMError(_http_error_text(r.status_code, r.text))
            for line in r.iter_lines():
                if not line.startswith("data:") or line.strip() == "data: [DONE]":
                    continue
                try:
                    d = json.loads(line[5:])
                except ValueError:
                    continue
                usage = d.get("usage") or usage
                delta = (d.get("choices") or [{}])[0].get("delta", {}).get("content")
                if not delta:
                    continue
                piece = filt.feed(delta)
                if piece:
                    t_first = t_first or time.time()
                    text += piece
                    yield piece
            tail = filt.flush()
            if tail:
                text += tail
                yield tail
    except httpx.ConnectError:
        raise LLMError("Can't reach the model service. Check your internet connection (or that Ollama is running).")
    _record(role, model, t0, t_first, usage, text)


def _http_error(e: httpx.HTTPStatusError) -> str:
    return _http_error_text(e.response.status_code, e.response.text)


def _http_error_text(code: int, body: str) -> str:
    if code in (401, 403):
        return "The model service rejected the API key. Check NEBIUS_API_KEY in .env."
    if code == 404:
        return "The model service doesn't know that model ID. Copy the exact ID from the Token Factory model list into .env."
    if code == 402:
        return "The model account is out of credits."
    if code == 429:
        return "The model service is busy (rate limit). Wait a few seconds and try again."
    return f"Model service error {code}: {body[:200]}"


def parse_json(text: str) -> dict:
    """Pull a JSON object out of a model reply, tolerating ```json fences, <think> blocks or stray text."""
    t = strip_think(text).replace("```json", "").replace("```", "")
    start, end = t.find("{"), t.rfind("}")
    if start == -1 or end == -1:
        raise LLMError("The model didn't return valid JSON. Try again.")
    try:
        return json.loads(t[start:end + 1])
    except ValueError:
        raise LLMError("The model returned broken JSON. Try again.")


def warm_up() -> None:
    """Ollama only: load the model into memory so the first reply isn't slow."""
    if PROVIDER == "ollama":
        try:
            url, _, model = endpoint("persona")
            httpx.post(url, json={"model": model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1}, timeout=120)
        except (httpx.HTTPError, LLMError):
            pass


# ---------- mock: so the whole app can be tested with no AI ----------
def _mock(role: str, messages: list[dict], json_mode: bool, system: str = "") -> str:
    if role == "director" and "watch a prospect listen" in system:
        return json.dumps({"reaction": random.choice(["nod", "brow", "lean", "none"]), "mood": random.choice(["interested", "skeptical", "neutral"]), "note": "Mock reaction."})
    if role == "director":
        meters = re.findall(r"^- (\w+) \(", system, re.M)
        return json.dumps({"meters": {m: random.randint(2, 5) for m in (meters or ["empathy", "clarity", "assertiveness"])},
                           "stance": random.choice(["soften", "hold", "harden"]), "note": "Mock director note."})
    if json_mode:
        m = re.search(r"^CATEGORY_IDS: (.+)$", system, re.M)
        cats = [c.strip() for c in m.group(1).split(",")] if m else ["opening", "listening", "clarity", "empathy", "assertiveness", "handling_pushback", "composure", "closing"]
        return json.dumps({
            "scores": {c: random.randint(3, 9) for c in cats},
            "summary": "Mock report: a calm start, but you rushed the ask.",
            "strengths": ["Clear opening", "Stayed calm", "Asked a good question"],
            "fixes": ["Pause after pushback", "Name the feeling before answering", "Ask for a specific next step"],
            "better_lines": [{"moment": "When they pushed back", "instead": "That's fair. Can I share what's behind my request?"}],
            "practice_plan": ["Do the pushback drill twice", "Write your ask in one sentence"],
            "memory_note": "Tends to rush the ask after pushback.",
        })
    if not messages:
        return "[mood:neutral] Hi, come on in. What did you want to talk about?"
    return random.choice([
        "[mood:skeptical] Hm. I'm not sure that's realistic. What makes you say that?",
        "[mood:interested] Okay... go on. I'm listening.",
        "[mood:annoyed] Look, I've got ten minutes. Can you get to the point?",
        "[mood:confused] Sorry, I lost you there. Can you say that again, simpler?",
        "[mood:happy] Alright, that actually makes sense. Let's do it. [AGREED]",
    ])
