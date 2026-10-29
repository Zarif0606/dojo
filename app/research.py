"""Web research with Tavily, used twice: on the field when a new world is planned, and on a real prospect (company or person) before a conversation.
Off unless TAVILY_API_KEY is set. Any failure just means no research. Results are {"text", "sources": [{"title", "url"}]}."""
import os

import httpx


def enabled() -> bool:
    return bool(os.getenv("TAVILY_API_KEY"))


def _search(query: str, timeout: int) -> dict | None:
    key = os.getenv("TAVILY_API_KEY", "")
    if not key:
        return None
    try:
        r = httpx.post("https://api.tavily.com/search", headers={"Authorization": f"Bearer {key}"}, timeout=timeout,
                       json={"query": query, "max_results": 4, "include_answer": True, "search_depth": "basic"})
        r.raise_for_status()
        return r.json()
    except (httpx.HTTPError, ValueError):
        return None


def _pack(data: dict | None, limit: int) -> dict | None:
    if not data:
        return None
    results = data.get("results", [])[:4]
    answer = (data.get("answer") or "").strip()
    snippets = " ".join((x.get("content") or "")[:240] for x in results[:3])
    text = (answer or snippets).strip()[:limit]
    sources = [{"title": (x.get("title") or x["url"])[:90], "url": x["url"]} for x in results
               if isinstance(x.get("url"), str) and x["url"].startswith(("https://", "http://"))][:3]
    return {"text": text, "sources": sources} if text else None


def brief(about: str) -> dict | None:
    """Facts about a real company or person, so the character knows them."""
    about = (about or "").strip()[:200]
    return _pack(_search(f"{about} company overview recent news", 12), 600) if about else None


def field_brief(line: str) -> dict | None:
    """Web research on a line of work, so the planner's objections and situations come from how the field really works."""
    line = (line or "").strip()[:200]
    return _pack(_search(f"{line}: common customer objections and how conversations go", 15), 900) if line else None


def text_of(stored) -> str | None:
    """The research text from a stored value (a dict, a JSON string, or an older plain string)."""
    import json
    if not stored:
        return None
    if isinstance(stored, str):
        try:
            stored = json.loads(stored)
        except ValueError:
            return stored
    return stored.get("text") if isinstance(stored, dict) else None
