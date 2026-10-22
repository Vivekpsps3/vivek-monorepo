"""Small independent probe exporter. Contains no database or application credentials."""
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import ssl
import socket
import time
import urllib.request

TARGETS = {"public": "https://vivekpanchagnula.com/", "ready": "http://personal-site:8000/health/ready",
           "finance": "https://vivekpanchagnula.com/api/health", "travel": "https://vivekpanchagnula.com/travel/api/health",
           "media": "https://vivekpanchagnula.com/media/api/health"}


def probe(item):
    name, url = item
    start = time.monotonic()
    good = 0
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            good = int(response.status == 200)
    except Exception:
        pass
    return f'site_probe_success{{target="{name}"}} {good}\nsite_probe_duration_seconds{{target="{name}"}} {time.monotonic()-start}\n'


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
        status = Path("/status/backup.prom")
        body += status.read_text() if status.is_file() else "site_backup_last_success_timestamp_seconds 0\n"
        body += f"site_probe_timestamp_seconds {time.time()}\n"
        encoded = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 9090), Handler).serve_forever()
