"""Optional: look the other person up with Tavily search before the conversation starts, so the character knows real facts.
Off unless TAVILY_API_KEY is set. Any failure just means the session starts without research."""
import os

import httpx


def enabled() -> bool:
    return bool(os.getenv("TAVILY_API_KEY"))


def brief(about: str) -> str | None:
    about = (about or "").strip()[:200]
    key = os.getenv("TAVILY_API_KEY", "")
    if not about or not key:
        return None
    try:
        r = httpx.post("https://api.tavily.com/search", headers={"Authorization": f"Bearer {key}"}, timeout=12,
                       json={"query": f"{about} company overview recent news", "max_results": 3, "include_answer": True, "search_depth": "basic"})
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError):
        return None
    answer = (data.get("answer") or "").strip()
    snippets = " ".join((x.get("content") or "")[:220] for x in data.get("results", [])[:2])
    text = (answer or snippets).strip()
    return text[:600] or None


def field_brief(line: str) -> str | None:
    """Web research on a line of work, so the planner's objections and situations come from how the field really works."""
    line = (line or "").strip()[:200]
    key = os.getenv("TAVILY_API_KEY", "")
    if not line or not key:
        return None
    try:
        r = httpx.post("https://api.tavily.com/search", headers={"Authorization": f"Bearer {key}"}, timeout=15,
                       json={"query": f"{line}: common customer objections and how conversations go", "max_results": 3, "include_answer": True, "search_depth": "basic"})
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError):
        return None
    answer = (data.get("answer") or "").strip()
    snippets = " ".join((x.get("content") or "")[:240] for x in data.get("results", [])[:3])
    return (answer or snippets).strip()[:900] or None
