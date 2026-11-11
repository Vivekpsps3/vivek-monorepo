"""Small independent probe exporter. Contains no database or application credentials."""

import json
import os
import socket
import ssl
import subprocess
import sys
import threading
import time
import urllib.request
from collections.abc import Mapping
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

TARGETS = {
    "public": "https://vivekpanchagnula.com/",
    "ready": "http://personal-site:8000/health/ready",
    "finance": "https://vivekpanchagnula.com/api/health",
    "travel": "https://vivekpanchagnula.com/travel/api/health",
    "media": "https://vivekpanchagnula.com/media/api/health",
}


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


def backup_metric_lines(backup_dir: Path, env: Mapping[str, str] | None = None) -> str:
    source = os.environ if env is None else env
    manifests = list(backup_dir.glob("site-*.json")) if backup_dir.is_dir() else []
    newest = max((path.stat().st_mtime for path in manifests), default=0)
    success, failure = offhost_timestamps(backup_dir)
    return (
        f"site_backup_last_success_timestamp_seconds {newest}\n"
        f"site_backup_offhost_configured {offhost_configured(source)}\n"
        f"site_backup_offhost_last_success_timestamp_seconds {_format_offhost_time(success)}\n"
        f"site_backup_offhost_last_failure_timestamp_seconds {_format_offhost_time(failure)}\n"
    )


def probe(item):
    name, url = item
    start = time.monotonic()
    good = 0
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            good = int(response.status == 200)
    except Exception:
        pass
    return f'site_probe_success{{target="{name}"}} {good}\nsite_probe_duration_seconds{{target="{name}"}} {time.monotonic() - start}\n'


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/metrics":
            self.send_error(404)
            return
        with ThreadPoolExecutor(max_workers=5) as pool:
            body = "".join(pool.map(probe, TARGETS.items()))
        try:
            context = ssl.create_default_context()
            with socket.create_connection(("vivekpanchagnula.com", 443), timeout=5) as sock:
                with context.wrap_socket(sock, server_hostname="vivekpanchagnula.com") as tls:
                    expiry = ssl.cert_time_to_seconds(tls.getpeercert()["notAfter"])
            body += f"site_tls_expiry_timestamp_seconds {expiry}\n"
        except Exception:
            body += "site_tls_expiry_timestamp_seconds 0\n"
        body += backup_metric_lines(Path("/backups"))
        body += f"site_probe_timestamp_seconds {time.time()}\n"
        encoded = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, *args):
        pass


def backup_loop():
    interval = max(60, int(os.environ.get("SITE_BACKUP_INTERVAL_SECONDS", "3600")))
    while True:
        newest = max((p.stat().st_mtime for p in Path("/backups").glob("site-*.json")), default=0)
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
        time.sleep(60)


if __name__ == "__main__":
    threading.Thread(target=backup_loop, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", 9090), Handler).serve_forever()
