import os
from collections.abc import Sequence
from urllib.parse import urlsplit


DEFAULT_ALLOWED_ORIGINS = ("http://localhost:4200", "http://127.0.0.1:4200")


def configured_allowed_origins(value: str | Sequence[str] | None = None) -> tuple[str, ...]:
    """Read a site-specific allowlist of exact browser origins."""
    if value is None:
        value = os.environ.get("SITE_ALLOWED_ORIGINS")
    if value is None:
        origins = DEFAULT_ALLOWED_ORIGINS
    elif isinstance(value, str):
        origins = tuple(origin.strip() for origin in value.split(",") if origin.strip())
    else:
        origins = tuple(origin.strip() for origin in value if origin.strip())

    if not origins or "*" in origins:
        raise ValueError("Configure one or more explicit SITE_ALLOWED_ORIGINS values")
    for origin in origins:
        if origin != origin.strip() or any(character.isspace() for character in origin) or "?" in origin or "#" in origin:
            raise ValueError("Allowed origins must be exact http:// or https:// origins without paths")
        try:
            parsed = urlsplit(origin)
            valid_port = parsed.port is None or 1 <= parsed.port <= 65535
        except ValueError:
            valid_port = False
            parsed = None
        if (
            parsed is None
            or parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.query
            or parsed.fragment
            or "*" in parsed.netloc
            or not valid_port
        ):
            raise ValueError("Allowed origins must be exact http:// or https:// origins without paths")
    return origins
