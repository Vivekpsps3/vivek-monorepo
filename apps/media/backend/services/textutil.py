"""Plain-text helpers. Reviews are never treated as HTML."""


def blank(value: str | None, limit: int, *, label: str = "This text") -> str | None:
    if value is None:
        return None
    if len(value) > limit:
        raise ValueError(f"{label} must be {limit} characters or fewer.")
    text = value.strip()
    return text or None


def shorten(text: str | None, limit: int) -> str | None:
    if text is None:
        return None
    collapsed = " ".join(str(text).split())
    if not collapsed:
        return None
    if len(collapsed) <= limit:
        return collapsed
    cut = collapsed[:limit].rsplit(" ", 1)[0]
    if len(cut) < max(40, limit - 40):
        cut = collapsed[:limit].rstrip()
    return cut.rstrip(".,;:—- ") + "…"


def excerpt(text: str | None, limit: int = 140) -> str:
    return shorten(text, limit) or ""
