"""Local probe exporter and opt-in alert delivery.

Local /metrics probes run in this process. Independent readiness, TLS, and
backup-age checks use the same labels and a separate path. Alert mode defaults
to off. This module does not embed a recipient, token, or private URL.
"""

import argparse
import json
import os
import re
import socket
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor
from contextlib import AbstractContextManager, ExitStack
from dataclasses import dataclass
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Protocol, TypedDict

# Local scrape targets only. They are not alert recipients.
LOCAL_TARGETS = (
    ("public", "http", "https://vivekpanchagnula.com/"),
    ("ready", "readiness", "http://personal-site:8000/health/ready"),
    ("finance", "http", "https://vivekpanchagnula.com/api/health"),
    ("travel", "http", "https://vivekpanchagnula.com/travel/api/health"),
    ("media", "http", "https://vivekpanchagnula.com/media/api/health"),
)
LOCAL_TLS_HOST = "vivekpanchagnula.com"

TLS_WARN_SECONDS = 14 * 24 * 60 * 60
BACKUP_STALE_SECONDS = 7500
PROBE_TIMEOUT_SECONDS = 5.0
ALERT_TIMEOUT_SECONDS = 5.0
ALERT_TIMEOUT_MAX_SECONDS = 10.0
ALERT_ATTEMPTS = 3
ALERT_BACKOFF_SECONDS = (0.25, 0.5)
FIXTURE_LIMIT = 4000
_HOST = re.compile(r"^[A-Za-z0-9.-]{1,253}$")
_BEARER = re.compile(r"Bearer\s+\S+")
_MODES = frozenset({"off", "dry-run", "webhook", "heartbeat", "both"})
_FAILURE_STATES = frozenset({"unhealthy", "unreachable", "expired", "expiring", "stale", "unknown"})
_OK_STATES = frozenset({"healthy", "fresh"})
_SEVERITY = {
    "healthy": "ok",
    "fresh": "ok",
    "recovered": "ok",
    "expiring": "warning",
    "unconfigured": "warning",
    "unknown": "warning",
    "unhealthy": "critical",
    "unreachable": "critical",
    "expired": "critical",
    "stale": "critical",
}
_SUMMARY = {
    "readiness": "readiness",
    "tls": "tls",
    "backup_age": "backup",
    "monitor": "monitor",
}

_PROCESS_CHECKS: dict[str, str] = {}
_PROCESS_NOTE: dict[str, str | None] = {"value": None}


class AlertTransport(Protocol):
    def request(self, url: str, body: bytes, headers: Mapping[str, str], timeout: float) -> int: ...


class AlertTransportError(Exception):
    """Bounded reason. The message is never a URL, token, or payload."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason if reason in {"transport", "http_status"} else "transport")


class CheckView(TypedDict):
    check: str
    severity: str
    source: str
    state: str
    summary: str


class DeliveryView(TypedDict):
    attempts: int
    check: str
    kind: str
    reason: str
    sent: bool
    state: str


class DeliveryResult(TypedDict):
    attempts: int
    reason: str
    sent: bool


class AlertReport(TypedDict):
    activation: str
    checks: list[CheckView]
    deliveries: list[DeliveryView]
    observation: str
    planned: list[dict[str, str]]
    requests: int
    sent: int


@dataclass(frozen=True)
class Check:
    check: str
    state: str
    severity: str
    source: str
    summary: str

    def as_dict(self) -> CheckView:
        return {
            "check": self.check,
            "severity": self.severity,
            "source": self.source,
            "state": self.state,
            "summary": self.summary,
        }


@dataclass(frozen=True)
class AlertConfig:
    mode: str
    activation: str
    token: str
    timeout: float
    attempts: int
    channels: tuple[tuple[str, str], ...]

    def __repr__(self) -> str:
        return f"AlertConfig(mode={self.mode!r}, activation={self.activation!r})"


def _severity(name: str, state: str) -> str:
    if state == "unknown" and name in {"readiness", "backup_age"}:
        return "critical"
    return _SEVERITY[state]


def _check(name: str, state: str, source: str) -> Check:
    if source not in {"local", "independent"}:
        raise ValueError("source")
    return Check(name, state, _severity(name, state), source, f"{_SUMMARY[name]} {state}")


def classify_readiness(
    *, configured: bool, reachable: bool | None, http_status: int | None, source: str
) -> Check:
    """One readiness decision for local probes and independent checks."""
    if not configured:
        return _check("readiness", "unconfigured", source)
    if reachable is False:
        return _check("readiness", "unreachable", source)
    if http_status is None:
        return _check("readiness", "unknown", source)
    if http_status == 200:
        return _check("readiness", "healthy", source)
    return _check("readiness", "unhealthy", source)


def classify_tls(*, configured: bool, expiry: float | None, now: float, source: str) -> Check:
    """Expiry is a certificate date. A failed read is unknown, not a fake timestamp."""
    if not configured:
        return _check("tls", "unconfigured", source)
    if expiry is None:
        return _check("tls", "unknown", source)
    remaining = expiry - now
    if remaining <= 0:
        return _check("tls", "expired", source)
    if remaining < TLS_WARN_SECONDS:
        return _check("tls", "expiring", source)
    return _check("tls", "fresh", source)


def classify_backup(
    *, configured: bool, last_success: float | None, now: float, source: str
) -> Check:
    """Backup age uses the newest snapshot time. Missing data is unknown, not fresh."""
    if not configured:
        return _check("backup_age", "unconfigured", source)
    if last_success is None or last_success <= 0:
        return _check("backup_age", "unknown", source)
    if now - last_success > BACKUP_STALE_SECONDS:
        return _check("backup_age", "stale", source)
    return _check("backup_age", "fresh", source)


def offhost_configured(env: Mapping[str, str]) -> int:
    """1 only when this process was given a file destination and a key path.

    Dry-run and off are not a configured destination. The gauge does not mean
    a restore was performed.
    """
    mode = env.get("SITE_BACKUP_OFFHOST", "off").strip().lower()
    directory = env.get("SITE_BACKUP_OFFHOST_DIR", "").strip()
    key_file = env.get("SITE_BACKUP_OFFHOST_KEY_FILE", "").strip()
    if mode == "file" and directory and key_file:
        return 1
    return 0


def _offhost_epoch(value: object) -> float | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.timestamp()


def offhost_timestamps(backup_dir: Path) -> tuple[float, float]:
    """Last verified transfer and last failed transfer. Missing stays 0.

    Local snapshot mtimes are not off-host success. Dry-run does not count.
    """
    success = 0.0
    failure = 0.0
    if not backup_dir.is_dir():
        return success, failure
    for path in backup_dir.glob("site-*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            continue
        if not isinstance(payload, dict):
            continue
        offhost = payload.get("offhost")
        if not isinstance(offhost, dict):
            continue
        if offhost.get("status") == "verified" and offhost.get("transferred") is True:
            stamp = _offhost_epoch(offhost.get("verified_at"))
            if stamp is not None:
                success = max(success, stamp)
        elif offhost.get("status") == "failed":
            stamp = _offhost_epoch(offhost.get("failed_at"))
            if stamp is not None:
                failure = max(failure, stamp)
    return success, failure


def _format_offhost_time(value: float) -> str:
    if value <= 0:
        return "0"
    return f"{value:.3f}"


def newest_success_mtime(backup_dir: Path) -> float | None:
    """Newest local snapshot manifest time. File contents are not alert input."""
    if not backup_dir.is_dir():
        return None
    stamps = [path.stat().st_mtime for path in backup_dir.glob("site-*.json")]
    if not stamps:
        return None
    return max(stamps)


def backup_metric_lines(backup_dir: Path, env: Mapping[str, str] | None = None) -> str:
    source = os.environ if env is None else env
    newest_value = newest_success_mtime(backup_dir)
    newest = 0 if newest_value is None else newest_value
    success, failure = offhost_timestamps(backup_dir)
    return (
        f"site_backup_last_success_timestamp_seconds {newest}\n"
        f"site_backup_offhost_configured {offhost_configured(source)}\n"
        f"site_backup_offhost_last_success_timestamp_seconds {_format_offhost_time(success)}\n"
        f"site_backup_offhost_last_failure_timestamp_seconds {_format_offhost_time(failure)}\n"
    )


def _state_line(check: str, source: str, state: str, target: str | None = None) -> str:
    if target is None:
        return f'site_check_state{{check="{check}",source="{source}",state="{state}"}} 1\n'
    return (
        f'site_check_state{{check="{check}",source="{source}",state="{state}",'
        f'target="{target}"}} 1\n'
    )


def _safe_host(host: str) -> bool:
    return _HOST.fullmatch(host) is not None and ".." not in host


def probe_http(
    url: str, timeout: float, opener: Callable[..., AbstractContextManager[object]] | None = None
) -> tuple[bool, int | None]:
    """Return reachability and status. Response bodies are not retained."""
    open_url = urllib.request.urlopen if opener is None else opener
    try:
        with open_url(url, timeout=timeout) as response:
            status = getattr(response, "status", None)
            return True, int(status) if isinstance(status, int) else None
    except urllib.error.HTTPError as error:
        return True, int(error.code)
    except Exception:
        return False, None


def read_tls_expiry(
    host: str,
    timeout: float,
    connect: Callable[..., AbstractContextManager[object]] | None = None,
    wrap: Callable[..., AbstractContextManager[object]] | None = None,
) -> float | None:
    if not _safe_host(host):
        return None
    connector = socket.create_connection if connect is None else connect
    context = ssl.create_default_context()
    try:
        with ExitStack() as stack:
            raw = stack.enter_context(connector((host, 443), timeout))
            secured: object
            if wrap is None:
                if not isinstance(raw, socket.socket):
                    return None
                secured = stack.enter_context(context.wrap_socket(raw, server_hostname=host))
            else:
                secured = stack.enter_context(wrap(raw, server_hostname=host))
            peer = getattr(secured, "getpeercert", None)
            cert = peer() if callable(peer) else None
    except Exception:
        return None
    if not isinstance(cert, dict):
        return None
    not_after = cert.get("notAfter")
    if not isinstance(not_after, str):
        return None
    try:
        return float(ssl.cert_time_to_seconds(not_after))
    except (ValueError, OverflowError, OSError):
        return None


def _probe_target(
    item: tuple[str, str, str],
    opener: Callable[..., AbstractContextManager[object]] | None,
    timeout: float,
) -> tuple[str, str, bool, int | None, float]:
    name, check, url = item
    start = time.monotonic()
    reachable, status = probe_http(url, timeout, opener)
    return name, check, reachable, status, time.monotonic() - start


def live_probes(
    opener: Callable[..., AbstractContextManager[object]] | None = None,
    timeout: float = PROBE_TIMEOUT_SECONDS,
) -> list[tuple[str, str, bool, int | None, float]]:
    with ThreadPoolExecutor(max_workers=len(LOCAL_TARGETS)) as pool:
        return list(pool.map(lambda item: _probe_target(item, opener, timeout), LOCAL_TARGETS))


def collect_local_body(
    *,
    now: float | None = None,
    backup_dir: Path | None = None,
    env: Mapping[str, str] | None = None,
    probes: list[tuple[str, str, bool, int | None, float]] | None = None,
    tls_expiry: float | None = None,
    tls_supplied: bool = False,
) -> str:
    """Local metrics only. This path does not send notifications."""
    moment = time.time() if now is None else now
    directory = Path("/backups") if backup_dir is None else backup_dir
    samples = live_probes() if probes is None else probes
    expiry = (
        read_tls_expiry(LOCAL_TLS_HOST, PROBE_TIMEOUT_SECONDS) if not tls_supplied else tls_expiry
    )
    lines: list[str] = []
    for name, check_name, reachable, status, duration in samples:
        good = int(reachable and status == 200)
        lines.append(f'site_probe_success{{target="{name}"}} {good}\n')
        lines.append(f'site_probe_duration_seconds{{target="{name}"}} {duration}\n')
        decision = classify_readiness(
            configured=True, reachable=reachable, http_status=status, source="local"
        )
        # Domain health probes share readiness states but stay check=http.
        label = "readiness" if check_name == "readiness" else "http"
        lines.append(_state_line(label, "local", decision.state, name))
    tls_decision = classify_tls(configured=True, expiry=expiry, now=moment, source="local")
    if expiry is not None:
        lines.append(f"site_tls_expiry_timestamp_seconds {expiry}\n")
    lines.append(_state_line("tls", "local", tls_decision.state))
    lines.append(backup_metric_lines(directory, env))
    backup_decision = classify_backup(
        configured=True,
        last_success=newest_success_mtime(directory),
        now=moment,
        source="local",
    )
    lines.append(_state_line("backup_age", "local", backup_decision.state))
    lines.append(f"site_probe_timestamp_seconds {moment}\n")
    return "".join(lines)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path != "/metrics":
            self.send_error(404)
            return
        encoded = collect_local_body().encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, *args: object) -> None:
        pass


def _bounded_timeout(raw: str | None) -> float:
    if raw is None or raw.strip() == "":
        return ALERT_TIMEOUT_SECONDS
    try:
        value = float(raw)
    except ValueError:
        return ALERT_TIMEOUT_SECONDS
    if value <= 0:
        return ALERT_TIMEOUT_SECONDS
    return min(value, ALERT_TIMEOUT_MAX_SECONDS)


def _bounded_attempts(raw: str | None) -> int:
    if raw is None or raw.strip() == "":
        return ALERT_ATTEMPTS
    try:
        value = int(raw)
    except ValueError:
        return ALERT_ATTEMPTS
    return min(ALERT_ATTEMPTS, max(1, value))


def _valid_url(url: str) -> bool:
    if not url or len(url) > 2000 or any(char in url for char in "\r\n\t "):
        return False
    parsed = urllib.parse.urlparse(url)
    host_ok = not parsed.username and not parsed.password and "@" not in parsed.netloc
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc) and host_ok


def load_alert_config(env: Mapping[str, str]) -> AlertConfig:
    raw_mode = env.get("SITE_ALERT_MODE", "off").strip().lower()
    mode = raw_mode if raw_mode else "off"
    timeout = _bounded_timeout(env.get("SITE_ALERT_TIMEOUT_SECONDS"))
    attempts = _bounded_attempts(env.get("SITE_ALERT_MAX_ATTEMPTS"))
    token = env.get("SITE_ALERT_TOKEN", "").strip()
    webhook = env.get("SITE_ALERT_WEBHOOK_URL", "").strip()
    heartbeat = env.get("SITE_ALERT_HEARTBEAT_URL", "").strip()
    if mode not in _MODES:
        return AlertConfig("off", "invalid_mode", "", timeout, attempts, ())
    if any(char in token for char in "\r\n"):
        return AlertConfig(mode, "invalid_token", "", timeout, attempts, ())
    if mode == "off":
        return AlertConfig(mode, "not_configured", token, timeout, attempts, ())
    if mode == "dry-run":
        return AlertConfig(mode, "dry_run", token, timeout, attempts, ())
    selected: list[tuple[str, str]] = []
    if mode in {"webhook", "both"}:
        if webhook == "":
            if mode == "both" and heartbeat == "":
                activation = "missing_destination"
            else:
                activation = "missing_webhook"
            return AlertConfig(mode, activation, token, timeout, attempts, ())
        if not _valid_url(webhook):
            return AlertConfig(mode, "invalid_destination", token, timeout, attempts, ())
        selected.append(("webhook", webhook))
    if mode in {"heartbeat", "both"} and heartbeat == "":
        return AlertConfig(mode, "missing_heartbeat", token, timeout, attempts, ())
    if mode in {"heartbeat", "both"} and not _valid_url(heartbeat):
        return AlertConfig(mode, "invalid_destination", token, timeout, attempts, ())
    if mode in {"heartbeat", "both"}:
        selected.append(("heartbeat", heartbeat))
    return AlertConfig(mode, "configured", token, timeout, attempts, tuple(selected))


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _optional_bool(value: object) -> bool | None:
    if isinstance(value, bool):
        return value
    return None


def _status_from_mapping(name: str, payload: object, now: float) -> Check:
    if not isinstance(payload, dict):
        return _check(name, "unknown", "independent")
    configured = payload.get("configured", True)
    if configured is False:
        return _check(name, "unconfigured", "independent")
    if name == "readiness":
        reachable = _optional_bool(payload.get("reachable"))
        status = payload.get("http_status")
        http_status = (
            int(status) if isinstance(status, int) and not isinstance(status, bool) else None
        )
        if reachable is None and http_status is not None:
            reachable = True
        return classify_readiness(
            configured=True, reachable=reachable, http_status=http_status, source="independent"
        )
    if name == "tls":
        return classify_tls(
            configured=True, expiry=_number(payload.get("expiry")), now=now, source="independent"
        )
    return classify_backup(
        configured=True,
        last_success=_number(payload.get("last_success")),
        now=now,
        source="independent",
    )


def checks_from_fixture(raw: str, now: float) -> tuple[list[Check], str]:
    if len(raw) > FIXTURE_LIMIT:
        return _unknown_checks(), "bad_fixture"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return _unknown_checks(), "bad_fixture"
    if not isinstance(parsed, dict):
        return _unknown_checks(), "bad_fixture"
    moment = now
    if "now" in parsed:
        stamped = _number(parsed.get("now"))
        if stamped is None:
            return _unknown_checks(), "bad_fixture"
        moment = stamped
    checks = [
        _status_from_mapping(name, parsed.get(name), moment)
        if name in parsed
        else _check(name, "unconfigured", "independent")
        for name in ("readiness", "tls", "backup_age")
    ]
    return checks, "fixture"


def _unknown_checks() -> list[Check]:
    return [
        _check("readiness", "unknown", "independent"),
        _check("tls", "unknown", "independent"),
        _check("backup_age", "unknown", "independent"),
    ]


def _unconfigured_checks() -> list[Check]:
    return [
        _check("readiness", "unconfigured", "independent"),
        _check("tls", "unconfigured", "independent"),
        _check("backup_age", "unconfigured", "independent"),
    ]


def load_independent_checks(
    env: Mapping[str, str],
    now: float,
    *,
    probe: bool,
    opener: Callable[..., AbstractContextManager[object]] | None = None,
    connect: Callable[..., AbstractContextManager[object]] | None = None,
    wrap: Callable[..., AbstractContextManager[object]] | None = None,
) -> tuple[list[Check], str]:
    raw = env.get("SITE_ALERT_OBSERVATIONS", "").strip()
    if raw:
        return checks_from_fixture(raw, now)
    if not probe:
        return _unconfigured_checks(), "unconfigured"
    timeout = _bounded_timeout(env.get("SITE_ALERT_TIMEOUT_SECONDS"))
    readiness_url = env.get("SITE_ALERT_READINESS_URL", "").strip()
    tls_host = env.get("SITE_ALERT_TLS_HOST", "").strip()
    backup_dir = env.get("SITE_ALERT_BACKUP_DIR", "").strip()
    if readiness_url and _valid_url(readiness_url):
        reachable, status = probe_http(readiness_url, timeout, opener)
        readiness = classify_readiness(
            configured=True, reachable=reachable, http_status=status, source="independent"
        )
    elif readiness_url:
        readiness = _check("readiness", "unknown", "independent")
    else:
        readiness = _check("readiness", "unconfigured", "independent")
    if not tls_host:
        tls = _check("tls", "unconfigured", "independent")
    elif not _safe_host(tls_host):
        tls = _check("tls", "unknown", "independent")
    else:
        tls = classify_tls(
            configured=True,
            expiry=read_tls_expiry(tls_host, timeout, connect, wrap),
            now=now,
            source="independent",
        )
    if backup_dir:
        backup = classify_backup(
            configured=True,
            last_success=newest_success_mtime(Path(backup_dir)),
            now=now,
            source="independent",
        )
    else:
        backup = _check("backup_age", "unconfigured", "independent")
    return [readiness, tls, backup], "probe"


def plan_transitions(checks: Sequence[Check], memory: dict[str, str]) -> list[tuple[Check, str]]:
    """One failure per state and one recovery. Repeated states produce nothing."""
    planned: list[tuple[Check, str]] = []
    for item in checks:
        previous = memory.get(item.check)
        if item.state == "unconfigured":
            continue
        if item.state in _OK_STATES:
            if previous in _FAILURE_STATES:
                planned.append((_check(item.check, "recovered", item.source), "recovery"))
            memory[item.check] = item.state
            continue
        if item.state in _FAILURE_STATES and previous != item.state:
            planned.append((item, "failure"))
            memory[item.check] = item.state
    return planned


def _payload(check: Check, kind: str) -> dict[str, str]:
    return {
        "check": check.check,
        "kind": kind,
        "severity": check.severity,
        "source": check.source,
        "state": check.state,
        "summary": check.summary,
    }


def _headers(token: str) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


class HttpTransport:
    def __init__(self, opener: Callable[..., AbstractContextManager[object]] | None = None) -> None:
        self.opener = urllib.request.urlopen if opener is None else opener

    def request(self, url: str, body: bytes, headers: Mapping[str, str], timeout: float) -> int:
        request = urllib.request.Request(url, data=body, headers=dict(headers), method="POST")
        try:
            with self.opener(request, timeout=timeout) as response:
                status = getattr(response, "status", None)
                if not isinstance(status, int):
                    raise AlertTransportError("transport")
                return status
        except urllib.error.HTTPError as error:
            return int(error.code)
        except AlertTransportError:
            raise
        except Exception:
            raise AlertTransportError("transport") from None


def post_with_retry(
    transport: AlertTransport,
    url: str,
    body: bytes,
    headers: Mapping[str, str],
    timeout: float,
    attempts: int,
    sleep: Callable[[float], None],
) -> DeliveryResult:
    reason = "transport"
    for attempt in range(1, attempts + 1):
        try:
            code = transport.request(url, body, headers, timeout)
        except Exception:
            reason = "transport"
            code = 0
        else:
            if 200 <= code < 300:
                return {"sent": True, "attempts": attempt, "reason": "ok"}
            reason = "http_status"
        if attempt < attempts:
            sleep(ALERT_BACKOFF_SECONDS[min(attempt - 1, len(ALERT_BACKOFF_SECONDS) - 1)])
    return {"sent": False, "attempts": attempts, "reason": reason}


def _clear(checks: Sequence[Check]) -> bool:
    active = [item for item in checks if item.state != "unconfigured"]
    return bool(active) and all(item.state in _OK_STATES for item in active)


def _heartbeat(source: str = "independent") -> Check:
    return _check("monitor", "healthy", source)


def _secrets(env: Mapping[str, str]) -> list[str]:
    found: list[str] = []
    for key in ("SITE_ALERT_WEBHOOK_URL", "SITE_ALERT_HEARTBEAT_URL", "SITE_ALERT_TOKEN"):
        value = env.get(key, "").strip()
        if not value:
            continue
        found.extend(_secret_pieces(value))
    # Longest first so a path marker is removed even when the full URL is absent.
    unique = sorted({piece for piece in found if len(piece) >= 8}, key=len, reverse=True)
    return unique


def _secret_pieces(value: str) -> list[str]:
    pieces = [value]
    parsed = urllib.parse.urlsplit(value)
    for items in urllib.parse.parse_qs(parsed.query).values():
        pieces.extend(items)
    for segment in parsed.path.split("/"):
        if segment:
            pieces.append(segment)
    if parsed.password:
        pieces.append(parsed.password)
    return pieces


def _scrub(text: str, secrets: Sequence[str]) -> str:
    cleaned = _BEARER.sub("Bearer [redacted]", text)
    for secret in secrets:
        if secret and secret in cleaned:
            cleaned = cleaned.replace(secret, "[redacted]")
    return cleaned


def log_event(event: str, secrets: Sequence[str] = (), **fields: object) -> None:
    payload: dict[str, object] = {"event": event}
    for key in ("attempts", "check", "kind", "notification", "reason", "state"):
        if key not in fields:
            continue
        value = fields[key]
        if isinstance(value, (str, int)):
            payload[key] = value
    line = json.dumps(payload, sort_keys=True)
    sys.stderr.write(_scrub(line, secrets) + "\n")


def run_once(
    env: Mapping[str, str] | None = None,
    *,
    transport: AlertTransport | None = None,
    memory: dict[str, str] | None = None,
    sleep: Callable[[float], None] | None = None,
    now: float | None = None,
    opener: Callable[..., AbstractContextManager[object]] | None = None,
    connect: Callable[..., AbstractContextManager[object]] | None = None,
    wrap: Callable[..., AbstractContextManager[object]] | None = None,
) -> AlertReport:
    """Classify independent checks and maybe deliver one transition per state.

    off and dry-run do not open a socket. A missing webhook or heartbeat stays
    explicit and sends nothing. Unknown and unconfigured are not healthy.
    """
    source = os.environ if env is None else env
    config = load_alert_config(source)
    moment = time.time() if now is None else now
    remembered = _PROCESS_CHECKS if memory is None else memory
    probe = (
        config.activation == "configured" and not source.get("SITE_ALERT_OBSERVATIONS", "").strip()
    )
    checks, observation = load_independent_checks(
        source, moment, probe=probe, opener=opener, connect=connect, wrap=wrap
    )
    secrets = _secrets(source)
    planned: list[dict[str, str]] = []
    deliveries: list[DeliveryView] = []
    requests = 0
    sent = 0
    # A bad fixture is not a trustworthy failure. Report it and do not page.
    may_format = config.activation in {"configured", "dry_run"} and observation != "bad_fixture"
    events = plan_transitions(checks, remembered) if may_format else []
    pause = time.sleep if sleep is None else sleep
    sender = transport
    if config.activation == "configured" and sender is None:
        sender = HttpTransport(opener)
    for item, kind in events:
        body = _payload(item, kind)
        planned.append(body)
        if config.activation != "configured" or sender is None:
            continue
        encoded = json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
        for _channel, url in config.channels:
            result = post_with_retry(
                sender, url, encoded, _headers(config.token), config.timeout, config.attempts, pause
            )
            attempts = result["attempts"]
            requests += attempts
            delivered = result["sent"]
            sent += int(delivered)
            reason = result["reason"]
            deliveries.append(
                {
                    "attempts": attempts,
                    "check": item.check,
                    "kind": kind,
                    "reason": reason,
                    "sent": delivered,
                    "state": item.state,
                }
            )
            log_event(
                "alert_delivery",
                secrets,
                attempts=attempts,
                check=item.check,
                kind=kind,
                reason=reason,
                state=item.state,
            )
    if (
        config.activation == "configured"
        and any(channel == "heartbeat" for channel, _url in config.channels)
        and _clear(checks)
        and not events
        and sender is not None
    ):
        beat = _payload(_heartbeat(), "heartbeat")
        planned.append(beat)
        encoded = json.dumps(beat, separators=(",", ":"), sort_keys=True).encode("utf-8")
        for channel, url in config.channels:
            if channel != "heartbeat":
                continue
            result = post_with_retry(
                sender, url, encoded, _headers(config.token), config.timeout, config.attempts, pause
            )
            attempts = result["attempts"]
            requests += attempts
            delivered = result["sent"]
            sent += int(delivered)
            reason = result["reason"]
            deliveries.append(
                {
                    "attempts": attempts,
                    "check": "monitor",
                    "kind": "heartbeat",
                    "reason": reason,
                    "sent": delivered,
                    "state": "healthy",
                }
            )
            log_event(
                "alert_delivery",
                secrets,
                attempts=attempts,
                check="monitor",
                kind="heartbeat",
                reason=reason,
                state="healthy",
            )
    return {
        "activation": config.activation,
        "checks": [item.as_dict() for item in checks],
        "deliveries": deliveries,
        "observation": observation,
        "planned": planned,
        "requests": requests,
        "sent": sent,
    }


def render_report(report: object, env: Mapping[str, str]) -> str:
    return _scrub(json.dumps(report, sort_keys=True), _secrets(env))


def tick_alerts(
    env: Mapping[str, str] | None = None,
    *,
    transport: AlertTransport | None = None,
    memory: dict[str, str] | None = None,
    note: dict[str, str | None] | None = None,
    sleep: Callable[[float], None] | None = None,
    now: float | None = None,
    opener: Callable[..., AbstractContextManager[object]] | None = None,
) -> AlertReport:
    source = os.environ if env is None else env
    remembered = _PROCESS_CHECKS if memory is None else memory
    notes = _PROCESS_NOTE if note is None else note
    report = run_once(
        source, transport=transport, memory=remembered, sleep=sleep, now=now, opener=opener
    )
    activation = str(report["activation"])
    if notes.get("value") != activation:
        log_event("alert_status", _secrets(source), notification=activation)
        notes["value"] = activation
    return report


def backup_loop() -> None:
    interval = max(60, int(os.environ.get("SITE_BACKUP_INTERVAL_SECONDS", "3600")))
    while True:
        newest = max(
            (path.stat().st_mtime for path in Path("/backups").glob("site-*.json")), default=0
        )
        if time.time() - newest >= interval:
            try:
                subprocess.run(
                    [
                        sys.executable,
                        "/app/backup-site.py",
                        "--source",
                        "/data/site.db",
                        "--directory",
                        "/backups",
                    ],
                    check=True,
                    timeout=180,
                )
            except Exception as error:
                print(
                    json.dumps({"event": "backup_failed", "error": type(error).__name__}),
                    flush=True,
                )
        try:
            tick_alerts()
        except Exception:
            log_event("alert_failed", reason="internal")
        time.sleep(60)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--once",
        action="store_true",
        help="Classify once, print activation status, and exit without serving metrics.",
    )
    args = parser.parse_args(argv)
    if args.once:
        report = run_once(os.environ, sleep=lambda _delay: None)
        sys.stdout.write(render_report(report, os.environ) + "\n")
        return 0
    threading.Thread(target=backup_loop, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", 9090), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
