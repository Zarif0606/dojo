"""Typography for everything a model writes that people read: clean spacing, real quotes and apostrophes, consistent
capitalisation and sentence endings. Models are inconsistent about all of this, and it shows.

kinds:
  title / label  sentence case, no final punctuation   ("Selling rooftop solar door to door")
  phrase         no final punctuation, case untouched   ("Head of operations")
  trait          like phrase, but starts lowercase       ("kind but wary")
  name           a person's name: every word capitalised
  quote          a spoken line: capital first letter, no final full stop, ? and ! kept
  sentence       full sentence(s) ending in . ! or ?
"""
import re

ENDERS = ".!?…"
CLOSERS = "”’)\"'"
ACRONYM = re.compile(r"^[A-Z0-9&/.-]{2,}s?$")


def _spacing(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    s = s.replace("...", "…")
    s = re.sub(r"\s*—\s*|\s+[–-]\s+|\s--\s", ", ", s)          # dashes used as commas read as noise
    s = re.sub(r"\s+([,.;:!?…])", r"\1", s)                    # no space before punctuation
    s = re.sub(r"(?<=[A-Za-z])([,;])(?=[A-Za-z“(])", r"\1 ", s)
    s = re.sub(r"(?<=[a-z0-9])([.!?])(?=[A-Z“(])", r"\1 ", s)  # missing space after a full stop (not in U.S.A)
    s = re.sub(r"…(?=[A-Za-z])", "… ", s)
    s = re.sub(r"([!?]){2,}", r"\1", s)
    s = re.sub(r"\.{2,}", ".", s)
    s = re.sub(r",{2,}", ",", s)
    s = re.sub(r"\(\s+", "(", s)
    s = re.sub(r"\s+\)", ")", s)
    return s


def _quotes(s: str) -> str:
    s = re.sub(r"(?<=\w)'(?=\w)", "’", s)                      # don't, it's, Frank's
    s = re.sub(r"(^|[\s(\[“—])'", r"\1‘", s)
    s = s.replace("'", "’")
    s = re.sub(r'(^|[\s(\[—])"', r"\1“", s)
    return s.replace('"', "”")


def _cap_first(s: str) -> str:
    for i, c in enumerate(s):
        if c.isalpha():
            return s[:i] + c.upper() + s[i + 1:]
        if c.isdigit():
            break
    return s


def _sentence_case(s: str) -> str:
    """Turn Title Case Into Sentence case, keeping acronyms (CFOs, B2B), 'I' and words with inner capitals."""
    words = s.split(" ")
    alpha = [w for w in words if w[:1].isalpha()]
    if len(alpha) >= 2 and sum(w[0].isupper() for w in alpha) >= 0.75 * len(alpha) and not all(w.isupper() for w in alpha):
        out = []
        for i, w in enumerate(words):
            bare = w.strip(",.;:!?”’)\"'(")
            keep = i == 0 or bare == "I" or ACRONYM.match(bare) or any(c.isupper() for c in bare[1:])
            out.append(w if keep or not w[:1].isalpha() else w[0].lower() + w[1:])
        s = " ".join(out)
    return s


def _end(s: str, want: str) -> str:
    core = s.rstrip(CLOSERS)
    tail = s[len(core):]
    if want == "none":
        return core.rstrip(".,;:") + tail if not core.endswith(("?", "!", "…")) else s
    if core.endswith(tuple(ENDERS)):
        return s
    return core.rstrip(",;:") + "." + tail


def clean(text, kind: str = "sentence", max_len: int = 400) -> str:
    s = _spacing(str(text or ""))[:max_len].strip()
    if not s:
        return ""
    s = _quotes(s)
    if kind in ("title", "label"):
        s = _cap_first(_sentence_case(s))
        return _end(s, "none").rstrip(".,;:")
    if kind == "phrase":
        return _end(s, "none").rstrip(".,;:")
    if kind == "trait":  # "Analytical, founder-friendly" -> "analytical, founder-friendly"
        first = s.split(" ")[0].strip(",.;:")
        if first[:1].isupper() and not ACRONYM.match(first) and not any(c.isupper() for c in first[1:]):
            s = s[0].lower() + s[1:]
        return _end(s, "none").rstrip(".,;:")
    if kind == "name":
        s = " ".join(w[:1].upper() + w[1:] if w == w.lower() and w not in ("de", "van", "von", "la", "di", "da", "del", "bin", "al") else w for w in s.split(" "))
        return re.sub(r"\b([OD])’([a-z])", lambda m: m.group(1) + "’" + m.group(2).upper(), s)  # O’Neil, D’Angelo
    if kind == "quote":
        s = _cap_first(s)
        return s[:-1] if s.endswith(".") and not s.endswith("..") else s
    s = _cap_first(s)
    s = re.sub(r"(?<=[a-z]{3}[.!?])\s([a-z])", lambda m: " " + m.group(1).upper(), s)  # a new sentence starts with a capital
    return _end(s, "stop")


def clean_list(items, kind: str, n: int, max_len: int = 160) -> list[str]:
    out = [clean(x, kind, max_len) for x in (items if isinstance(items, list) else [])]
    return [x for x in out if x][:n]


def smart(text: str) -> str:
    """Quotes and apostrophes only, for live replies: the same typography as the written parts, without touching wording."""
    return _quotes(str(text or ""))
