"""Enforced per-app Content-Security-Policy and companion browser headers.

HTML shells are rewritten per request with a nonce. Travel and Media stay on
this origin, so the policies reduce how an XSS payload can execute; they do
not isolate the finance vault. See docs/SECURITY_MODEL.md.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import re
import secrets
import time
from urllib.parse import urlsplit

from prometheus_client import Counter
from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("site.csp")
CSP_REPORTS = Counter(
    "site_csp_reports_total",
    "CSP violation reports. Authoritative count; log lines are samples.",
    ["app", "directive"],
)

REPORT_PATH = "/csp-report"
REPORT_GROUP = "csp-endpoint"
REPORTING_ENDPOINTS = f'{REPORT_GROUP}="{REPORT_PATH}"'
REPORT_TO = json.dumps(
    {"group": REPORT_GROUP, "max_age": 10886400, "endpoints": [{"url": REPORT_PATH}]},
    separators=(",", ":"),
)
PERMISSIONS_POLICY = (
    "accelerometer=(), autoplay=(), camera=(), display-capture=(), "
    "encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), "
    "microphone=(), midi=(), payment=(), publickey-credentials-get=(), usb=(), "
    "browsing-topics=()"
)
# Shell routes opt in with this response header. The middleware strips it and
# only then rewrites script, style, and modulepreload tags. Other HTML keeps
# its body, so a reflected script cannot pick up the nonce.
SHELL_HEADER = "x-csp-shell"
_MAX_REPORT_BYTES = 16384
_DIRECTIVE_RE = re.compile(r"^[a-z0-9-]{1,64}$")
_KNOWN_DIRECTIVES = frozenset(
    {
        "base-uri",
        "connect-src",
        "default-src",
        "font-src",
        "form-action",
        "frame-ancestors",
        "frame-src",
        "img-src",
        "manifest-src",
        "object-src",
        "report-to",
        "report-uri",
        "require-trusted-types-for",
        "script-src",
        "script-src-attr",
        "script-src-elem",
        "style-src",
        "style-src-attr",
        "style-src-elem",
        "trusted-types",
        "worker-src",
    }
)
_SCRIPT_OPEN = re.compile(r"<script\b([^>]*)>", re.IGNORECASE)
_STYLE_OPEN = re.compile(r"<style\b([^>]*)>", re.IGNORECASE)
_LINK_OPEN = re.compile(r"<link\b([^>]*)>", re.IGNORECASE)
_APP_ROOT = re.compile(r"<app-root\b([^>]*)>", re.IGNORECASE)
_NONCE_ATTR = re.compile(r"\bnonce\s*=", re.IGNORECASE)
# site_csp_reports_total counts every parsed report and is authoritative.
# The log is a sample: 30 lines per key and 300 per process each minute, so
# a few keys can mute logs for up to 60 seconds without dropping the metric.
_LOG_LIMIT = 30
_LOG_GLOBAL_LIMIT = 300
_LOG_PER_REQUEST = 5
_LOG_WINDOW_SECONDS = 60.0
_LOG_MAX_IPS = 1024
_log_windows: dict[str, tuple[float, int]] = {}
_global_window_start: float | None = None
_global_count = 0

# One Angular runtime serves every route. Private app navigation shares this
# document policy; public entry uses a document navigation when policy differs.
# Leaflet's vendored DOM adaptation uses text and element nodes, with no bypass.
_MEDIA_IMG = (
    "'self' data: https://image.tmdb.org https://static.tvmaze.com "
    "https://coverartarchive.org https://covers.openlibrary.org "
    "https://archive.org https://*.archive.org "
    "https://*.mzstatic.com https://media.rawg.io "
    "https://upload.wikimedia.org https://lastfm.freetls.fastly.net "
    "https://shared.akamai.steamstatic.com"
)


def new_nonce() -> str:
    return secrets.token_urlsafe(18)


def classify(path: str) -> str:
    """Return finance, portfolio, travel, media, or api for a request path."""
    normalized = path or "/"
    if not normalized.startswith("/"):
        normalized = "/" + normalized
    if (
        normalized in {"/api", "/metrics", "/health", REPORT_PATH}
        or normalized.startswith("/api/")
        or normalized.startswith("/health/")
        or normalized.endswith("/api")
        or "/api/" in normalized
    ):
        return "api"
    if normalized == "/travel" or normalized.startswith("/travel/"):
        return "travel"
    if normalized == "/media" or normalized.startswith("/media/"):
        return "media"
    if (
        normalized == "/finance"
        or normalized.startswith("/finance/")
        or normalized == "/hub"
        or normalized.startswith("/hub/")
        or normalized == "/auth"
        or normalized.startswith("/auth/")
    ):
        return "finance"
    return "portfolio"


def expects_shell(path: str) -> bool:
    """True for the static SPA documents that opt into nonce injection."""
    normalized = (path or "/").split("?", 1)[0]
    if not normalized.startswith("/"):
        normalized = "/" + normalized
    if normalized in {
        "/",
        "/home",
        "/work",
        "/about",
        "/secrets",
        "/hub",
        "/hub/",
        "/hub/admin",
        "/auth/login",
        "/auth/signup",
        "/finance",
        "/finance/",
        "/finance/index.html",
        "/travel",
        "/travel/",
        "/media",
        "/media/",
    }:
        return True
    return any(
        normalized.startswith(prefix) for prefix in ("/finance/", "/travel/", "/media/")
    ) and not re.search(r"\.[a-z0-9]+$", normalized)


def content_security_policy(kind: str, nonce: str) -> str:
    if kind == "api":
        parts = [
            "default-src 'none'",
            "script-src 'none'",
            "script-src-attr 'none'",
            "style-src 'none'",
            "style-src-attr 'none'",
            "img-src 'none'",
            "font-src 'none'",
            "connect-src 'none'",
            "manifest-src 'none'",
            "worker-src 'none'",
            "frame-src 'none'",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
        ]
    else:
        images = (
            _MEDIA_IMG + " https://tile.openstreetmap.org"
            if kind in {"finance", "travel", "media"}
            else "'self' data:"
        )
        # 'self' is a fallback for browsers that ignore 'strict-dynamic'.
        # Browsers that honor 'strict-dynamic' ignore that host allowlist.
        parts = [
            "default-src 'self'",
            f"script-src 'nonce-{nonce}' 'strict-dynamic' 'self'",
            "script-src-attr 'none'",
            f"style-src 'self' 'nonce-{nonce}'",
            "style-src-attr 'unsafe-inline'",
            f"img-src {images}",
            "font-src 'self'",
            "connect-src 'self'",
            "manifest-src 'self'",
            "worker-src 'self'",
            "frame-src 'none'",
            # Nothing in this repo frames a finance document. /embed is a compact
            # route, and every document already sets frame-src 'none'.
            "frame-ancestors 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]
        parts.append("require-trusted-types-for 'script'")
        parts.append("trusted-types angular angular#bundler")
        parts.append("upgrade-insecure-requests")
    parts.append(f"report-uri {REPORT_PATH}")
    parts.append(f"report-to {REPORT_GROUP}")
    return "; ".join(parts)


def directives(policy: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for part in policy.split(";"):
        part = part.strip()
        if not part:
            continue
        name, _, value = part.partition(" ")
        found[name] = value.strip()
    return found


def inject_nonce(html: str, nonce: str) -> str:
    """Add the per-response nonce to parser-inserted scripts, styles, and Angular."""

    def script_tag(match: re.Match[str]) -> str:
        attrs = match.group(1)
        if _NONCE_ATTR.search(attrs):
            return match.group(0)
        return f'<script nonce="{nonce}"{attrs}>'

    def style_tag(match: re.Match[str]) -> str:
        attrs = match.group(1)
        if _NONCE_ATTR.search(attrs):
            return match.group(0)
        return f'<style nonce="{nonce}"{attrs}>'

    def link_tag(match: re.Match[str]) -> str:
        attrs = match.group(1)
        if _NONCE_ATTR.search(attrs):
            return match.group(0)
        modulepreload = re.search(r"\brel\s*=\s*([\"'])modulepreload\1", attrs, re.IGNORECASE)
        script_preload = re.search(r"\bas\s*=\s*([\"'])script\1", attrs, re.IGNORECASE)
        if not modulepreload and not script_preload:
            return match.group(0)
        return f'<link nonce="{nonce}"{attrs}>'

    def app_root(match: re.Match[str]) -> str:
        attrs = match.group(1)
        if re.search(r"\bngCspNonce\s*=", attrs, re.IGNORECASE):
            return match.group(0)
        return f'<app-root ngCspNonce="{nonce}"{attrs}>'

    html = _SCRIPT_OPEN.sub(script_tag, html)
    html = _STYLE_OPEN.sub(style_tag, html)
    html = _LINK_OPEN.sub(link_tag, html)
    return _APP_ROOT.sub(app_root, html)


def _header(headers, name: str) -> str:
    if headers is None:
        return ""
    getter = getattr(headers, "get", None)
    if getter is None:
        return ""
    value = getter(name)
    if value is None:
        value = getter(name.lower())
    return "" if value is None else str(value)


def validate_response_headers(headers, path: str, body: bytes | str = b"") -> None:
    """Release-check contract for one response. Raises AssertionError on drift."""
    policy = _header(headers, "content-security-policy")
    assert policy, path
    assert not _header(headers, "content-security-policy-report-only"), path
    assert "unsafe-eval" not in policy, policy
    kind = classify(path.split("?", 1)[0])
    if kind == "api":
        assert policy == content_security_policy("api", "")
        assert "nonce-" not in policy
        assert "unsafe-inline" not in policy
    else:
        match = re.search(r"'nonce-([A-Za-z0-9_-]+)'", policy)
        assert match, policy
        nonce = match.group(1)
        assert policy == content_security_policy(kind, nonce), policy
        parsed = directives(policy)
        script = parsed["script-src"]
        assert "unsafe-inline" not in script.split(), script
        assert "'strict-dynamic'" in script
        assert parsed["script-src-attr"] == "'none'"
        assert parsed["object-src"] == "'none'"
        assert parsed["base-uri"] == "'self'"
        assert parsed["form-action"] == "'self'"
        assert parsed["connect-src"] == "'self'"
        assert parsed["frame-src"] == "'none'"
        assert "https:" not in parsed["connect-src"]
        assert parsed["frame-ancestors"] == "'none'"
        assert parsed["require-trusted-types-for"] == "'script'"
        assert parsed["trusted-types"] == "angular angular#bundler"
        assert "angular#unsafe-bypass" not in policy
        if kind in {"finance", "travel", "media"}:
            assert parsed["img-src"] == _MEDIA_IMG + " https://tile.openstreetmap.org"
        else:
            assert parsed["img-src"] == "'self' data:"
        assert "https:" not in parsed["img-src"].split()
        for name, value in parsed.items():
            if "unsafe-inline" in value:
                assert name == "style-src-attr", (name, value)
        assert _header(headers, SHELL_HEADER) == "", path
        content_type = _header(headers, "content-type").lower()
        if "text/html" in content_type:
            text = body.decode("utf-8") if isinstance(body, bytes) else body
            assert "onload=" not in text.lower(), path
            opens = re.findall(r"<script\b[^>]*>", text, flags=re.IGNORECASE)
            if expects_shell(path):
                assert opens and all("nonce=" in tag for tag in opens), path
                assert f'nonce="{nonce}"' in text, path
                assert "no-store" in _header(headers, "cache-control").lower(), path
                if kind in {"finance", "portfolio", "travel", "media"}:
                    assert f'ngCspNonce="{nonce}"' in text, path
            else:
                assert f'nonce="{nonce}"' not in text, path
                assert all("nonce=" not in tag for tag in opens), path
    assert _header(headers, "referrer-policy") == "same-origin", path
    assert _header(headers, "x-content-type-options") == "nosniff", path
    assert _header(headers, "cross-origin-opener-policy") == "same-origin", path
    assert _header(headers, "cross-origin-resource-policy") == "same-origin", path
    assert _header(headers, "origin-agent-cluster") == "?1", path
    assert _header(headers, "reporting-endpoints") == REPORTING_ENDPOINTS, path
    assert json.loads(_header(headers, "report-to"))["group"] == REPORT_GROUP
    permissions = _header(headers, "permissions-policy")
    assert (
        "camera=()" in permissions
        and "geolocation=()" in permissions
        and "microphone=()" in permissions
    )
    frame = directives(policy)["frame-ancestors"]
    expected_frame = "SAMEORIGIN" if frame == "'self'" else "DENY"
    assert _header(headers, "x-frame-options") == expected_frame, path


def _is_html(content_type: str) -> bool:
    return content_type.split(";", 1)[0].strip().lower() == "text/html"


def _apply_headers(headers: MutableHeaders, policy: str) -> None:
    headers["Content-Security-Policy"] = policy
    if "content-security-policy-report-only" in headers:
        del headers["content-security-policy-report-only"]
    headers["Reporting-Endpoints"] = REPORTING_ENDPOINTS
    headers["Report-To"] = REPORT_TO
    headers["X-Content-Type-Options"] = "nosniff"
    headers["Referrer-Policy"] = "same-origin"
    headers["X-Frame-Options"] = "DENY"
    headers["Cross-Origin-Opener-Policy"] = "same-origin"
    headers["Cross-Origin-Resource-Policy"] = "same-origin"
    headers["Origin-Agent-Cluster"] = "?1"
    headers["Permissions-Policy"] = PERMISSIONS_POLICY
    headers["X-DNS-Prefetch-Control"] = "off"
    headers["X-Permitted-Cross-Domain-Policies"] = "none"


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        # Read the path before a mounted app replaces scope["path"] with the suffix.
        path = scope.get("path") or "/"
        nonce = new_nonce()
        kind = classify(path)
        policy = content_security_policy(kind, nonce)
        held: Message | None = None
        chunks: list[bytes] = []

        async def send_wrapper(message: Message) -> None:
            nonlocal held
            if message["type"] == "http.response.start":
                headers = MutableHeaders(raw=message["headers"])
                shell = headers.get(SHELL_HEADER) == "1"
                if SHELL_HEADER in headers:
                    del headers[SHELL_HEADER]
                _apply_headers(headers, policy)
                if (
                    shell
                    and _is_html(headers.get("content-type", ""))
                    and scope.get("method") != "HEAD"
                ):
                    held = message
                    return
                await send(message)
                return
            if message["type"] != "http.response.body" or held is None:
                await send(message)
                return
            chunks.append(message.get("body", b""))
            if message.get("more_body", False):
                return
            raw = b"".join(chunks)
            headers = MutableHeaders(raw=held["headers"])
            try:
                html = raw.decode("utf-8")
            except UnicodeDecodeError:
                logger.warning("csp_html_not_utf8 path=%s", path)
            else:
                raw = inject_nonce(html, nonce).encode("utf-8")
                if "no-store" not in headers.get("cache-control", "").lower():
                    headers["cache-control"] = "no-store"
                for stale in ("etag", "last-modified"):
                    if stale in headers:
                        del headers[stale]
            headers["content-length"] = str(len(raw))
            await send(held)
            await send({"type": "http.response.body", "body": raw, "more_body": False})

        await self.app(scope, receive, send_wrapper)


def reset_report_logs() -> None:
    global _global_window_start, _global_count
    _log_windows.clear()
    _global_window_start = None
    _global_count = 0


def report_log_key(ip: str) -> str:
    """Budget key.

    IPv6 addresses share a /64 so rotation inside one prefix cannot multiply
    the table. An IPv4-mapped address (``::ffff:a.b.c.d``) is keyed as that
    IPv4 address. A /64 of the mapped form is ``::/64`` for every IPv4.
    """
    text = (ip or "").strip().split("%", 1)[0]
    if not text:
        return "unknown"
    try:
        address = ipaddress.ip_address(text)
    except ValueError:
        return text[:80]
    if isinstance(address, ipaddress.IPv6Address):
        mapped = address.ipv4_mapped
        if mapped is not None:
            return str(mapped)
        network = ipaddress.IPv6Network((address, 64), strict=False)
        return f"{network.network_address}/64"
    return str(address)


def _drop_expired(now: float) -> None:
    expired = [
        key for key, (opened, _) in _log_windows.items() if now - opened >= _LOG_WINDOW_SECONDS
    ]
    for key in expired:
        del _log_windows[key]


def allow_report_log(ip: str) -> bool:
    """Per-key and global log budget.

    A full table drops expired keys and otherwise refuses the new key. It does
    not clear the table, so one address rotation cannot refresh every budget.
    """
    global _global_window_start, _global_count
    now = time.monotonic()
    if _global_window_start is None or now - _global_window_start >= _LOG_WINDOW_SECONDS:
        _global_window_start = now
        _global_count = 0
        _drop_expired(now)
    if _global_count >= _LOG_GLOBAL_LIMIT:
        return False
    key = report_log_key(ip)
    if key not in _log_windows and len(_log_windows) >= _LOG_MAX_IPS:
        _drop_expired(now)
        if key not in _log_windows and len(_log_windows) >= _LOG_MAX_IPS:
            return False
    start, count = _log_windows.get(key, (now, 0))
    if now - start >= _LOG_WINDOW_SECONDS:
        start, count = now, 0
    if count >= _LOG_LIMIT:
        return False
    _log_windows[key] = (start, count + 1)
    _global_count += 1
    return True


def client_address(request: Request) -> str:
    """Peer address uvicorn stored on the request.

    Production sets ``FORWARDED_ALLOW_IPS`` to the Docker gateway. Uvicorn
    rewrites ``request.client`` from the forwarded address only for that peer.
    nginx overwrites ``X-Forwarded-For`` before the request reaches uvicorn.
    This function does not read that header.
    """
    host = request.client.host if request.client and request.client.host else ""
    return host or "unknown"


def _clean(value: object, limit: int = 180) -> str:
    text = value if isinstance(value, str) else ""
    text = text.replace("\r", " ").replace("\n", " ")
    return text[:limit]


def _directive_label(value: str) -> str:
    name = value.split(" ", 1)[0].strip().lower()
    if name in _KNOWN_DIRECTIVES and _DIRECTIVE_RE.fullmatch(name):
        return name
    return "other"


def _app_label(document_uri: str) -> str:
    if not document_uri:
        return "unknown"
    path = urlsplit(document_uri).path or document_uri
    kind = classify(path.split("?", 1)[0])
    return kind if kind in {"finance", "portfolio", "travel", "media", "api"} else "unknown"


def _report_objects(payload: object) -> list[dict]:
    reports: list[dict] = []
    if isinstance(payload, dict) and isinstance(payload.get("csp-report"), dict):
        reports.append(payload["csp-report"])
    elif isinstance(payload, list):
        for item in payload[:20]:
            if not isinstance(item, dict):
                continue
            body = item.get("body")
            reports.append(body if isinstance(body, dict) else item)
    elif isinstance(payload, dict):
        reports.append(payload)
    return reports


def _field(report: dict, *names: str) -> str:
    for name in names:
        value = report.get(name)
        if isinstance(value, str) and value:
            return value
    return ""


def _log_report(ip: str, **fields: str) -> None:
    if not allow_report_log(ip):
        return
    logger.info(json.dumps({"event": "csp_report", "ip": ip, **fields}))


async def _read_report_body(request: Request) -> bytes | None:
    """Read at most _MAX_REPORT_BYTES. None means the body exceeded the cap."""
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > _MAX_REPORT_BYTES:
        return None
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > _MAX_REPORT_BYTES:
            return None
        body.extend(chunk)
    return bytes(body)


async def csp_report(request: Request) -> Response:
    """Accept browser CSP reports. The body is not stored or reflected."""
    body = await _read_report_body(request)
    if body is None:
        return Response(status_code=413)
    ip = client_address(request)
    reports: list[dict]
    try:
        reports = _report_objects(json.loads(body.decode("utf-8"))) if body else []
    except (UnicodeDecodeError, json.JSONDecodeError):
        reports = []
        CSP_REPORTS.labels("unknown", "unparsed").inc()
        _log_report(ip, app="unknown", directive="unparsed", blocked="", document="")
    for index, report in enumerate(reports):
        directive = _directive_label(
            _field(
                report,
                "effective-directive",
                "effectiveDirective",
                "violated-directive",
                "violatedDirective",
            )
        )
        app_name = _app_label(_field(report, "document-uri", "documentURL", "document-url"))
        CSP_REPORTS.labels(app_name, directive or "other").inc()
        if index >= _LOG_PER_REQUEST:
            continue
        blocked = _clean(_field(report, "blocked-uri", "blockedURL", "blocked-url")).split("?", 1)[
            0
        ]
        document = _clean(_field(report, "document-uri", "documentURL")).split("?", 1)[0]
        _log_report(
            ip, app=app_name, directive=directive or "other", blocked=blocked, document=document
        )
    return Response(status_code=204)
