"""Synthetic readiness, TLS, and backup-age alerts. No real recipient is contacted."""

import contextlib
import email.message
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from collections.abc import Callable, Mapping
from contextlib import AbstractContextManager
from pathlib import Path
from typing import TypedDict
from unittest import mock

from apps.server import monitor

ROOT = Path(__file__).resolve().parents[3]
NOW = 1_700_000_000
NOTE = "PRIVATE_NOTE_MARKER_ops05"
TOKEN = "TOKEN_MARKER_ops05"
SECRET = "SECRET_MARKER_ops05"
PRIVATE_URL = "PRIVATE_URL_MARKER_ops05"
WEBHOOK = f"https://alerts.example.test/{PRIVATE_URL}?token={TOKEN}"
HEARTBEAT = f"https://heartbeat.example.test/{PRIVATE_URL}?token={TOKEN}"
ALERT_KEYS = {
    "SITE_ALERT_BACKUP_DIR",
    "SITE_ALERT_HEARTBEAT_URL",
    "SITE_ALERT_MAX_ATTEMPTS",
    "SITE_ALERT_MODE",
    "SITE_ALERT_OBSERVATIONS",
    "SITE_ALERT_READINESS_URL",
    "SITE_ALERT_TIMEOUT_SECONDS",
    "SITE_ALERT_TLS_HOST",
    "SITE_ALERT_TOKEN",
    "SITE_ALERT_WEBHOOK_URL",
}


def clean_env(**overrides: str) -> dict[str, str]:
    env = {key: value for key, value in os.environ.items() if key not in ALERT_KEYS}
    env.update(overrides)
    return env


def observations(**parts: object) -> str:
    payload: dict[str, object] = {"now": NOW}
    payload.update(parts)
    return json.dumps(payload)


class Response:
    def __init__(self, status: int, body: str = "") -> None:
        self.status = status
        self.body = body

    def __enter__(self) -> "Response":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self, _size: int = -1) -> bytes:
        raise AssertionError("alert probes must not read a response body")


class Context:
    def __init__(self, value: object) -> None:
        self.value = value

    def __enter__(self) -> object:
        return self.value

    def __exit__(self, *_args: object) -> None:
        return None


class RecordedCall(TypedDict):
    body: bytes
    headers: dict[str, str]
    timeout: float
    url: str


class FakeTransport:
    def __init__(self, script: list[object] | None = None) -> None:
        self.script = list(script or [204])
        self.calls: list[RecordedCall] = []

    def request(self, url: str, body: bytes, headers: Mapping[str, str], timeout: float) -> int:
        self.calls.append({"body": body, "headers": dict(headers), "timeout": timeout, "url": url})
        step: object = self.script.pop(0) if self.script else 204
        if isinstance(step, Exception):
            raise step
        if not isinstance(step, int):
            raise AssertionError("script")
        return step


@contextlib.contextmanager
def assert_no_network():
    def banned(*_args: object, **_kwargs: object) -> object:
        raise AssertionError("network")

    with (
        mock.patch("urllib.request.urlopen", banned),
        mock.patch("socket.create_connection", banned),
    ):
        yield


class MonitorAlertTests(unittest.TestCase):
    def setUp(self) -> None:
        monitor._PROCESS_CHECKS.clear()
        monitor._PROCESS_NOTE["value"] = None
        self.sleeps: list[float] = []

    def deliver(
        self,
        mode: str,
        payload: str,
        transport: FakeTransport,
        memory: dict[str, str] | None = None,
        **env: str,
    ) -> tuple[monitor.AlertReport, str]:
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            report = monitor.run_once(
                clean_env(
                    SITE_ALERT_MODE=mode,
                    SITE_ALERT_OBSERVATIONS=payload,
                    SITE_ALERT_WEBHOOK_URL=env.pop("SITE_ALERT_WEBHOOK_URL", WEBHOOK),
                    SITE_ALERT_TOKEN=env.pop("SITE_ALERT_TOKEN", SECRET),
                    **env,
                ),
                transport=transport,
                memory={} if memory is None else memory,
                sleep=self.sleeps.append,
                now=NOW,
            )
        return report, stderr.getvalue()

    def assert_clean(self, text: str) -> None:
        for marker in (NOTE, TOKEN, SECRET, PRIVATE_URL, WEBHOOK, HEARTBEAT):
            self.assertNotIn(marker, text)

    def test_status_labels_are_shared_and_unknown_is_not_healthy(self) -> None:
        pairs = (
            (False, None, "unconfigured", "warning"),
            (False, 200, "unreachable", "critical"),
            (True, None, "unknown", "critical"),
            (True, 503, "unhealthy", "critical"),
            (True, 200, "healthy", "ok"),
        )
        for reachable, status, state, severity in pairs:
            with self.subTest(state=state):
                configured = state != "unconfigured"
                local = monitor.classify_readiness(
                    configured=configured,
                    reachable=reachable if configured else None,
                    http_status=status,
                    source="local",
                )
                remote = monitor.classify_readiness(
                    configured=configured,
                    reachable=reachable if configured else None,
                    http_status=status,
                    source="independent",
                )
                self.assertEqual(local.state, state)
                self.assertEqual(remote.state, state)
                self.assertEqual(local.severity, severity)
                self.assertNotEqual(local.source, remote.source)
        hidden = monitor.classify_readiness(
            configured=False, reachable=True, http_status=200, source="independent"
        )
        self.assertEqual(hidden.state, "unconfigured")
        self.assertNotEqual(hidden.severity, "ok")
        unknown_tls = monitor.classify_tls(
            configured=True, expiry=None, now=NOW, source="independent"
        )
        self.assertEqual(unknown_tls.state, "unknown")
        self.assertNotEqual(unknown_tls.state, "fresh")
        self.assertEqual(
            monitor.classify_tls(
                configured=True, expiry=NOW + monitor.TLS_WARN_SECONDS, now=NOW, source="local"
            ).state,
            "fresh",
        )
        self.assertEqual(
            monitor.classify_tls(
                configured=True,
                expiry=NOW + monitor.TLS_WARN_SECONDS - 1,
                now=NOW,
                source="local",
            ).state,
            "expiring",
        )
        self.assertEqual(
            monitor.classify_backup(
                configured=True,
                last_success=NOW - monitor.BACKUP_STALE_SECONDS,
                now=NOW,
                source="local",
            ).state,
            "fresh",
        )
        self.assertEqual(
            monitor.classify_backup(
                configured=True, last_success=None, now=NOW, source="independent"
            ).state,
            "unknown",
        )
        self.assertNotEqual(
            monitor.classify_backup(
                configured=True, last_success=None, now=NOW, source="independent"
            ).severity,
            "ok",
        )

    def test_a01_webhook_failures_reach_transport_once(self) -> None:
        cases = (
            ("readiness", {"reachable": True, "http_status": 503, "body": NOTE}, "unhealthy"),
            ("readiness", {"reachable": False, "body": NOTE}, "unreachable"),
            ("tls", {"expiry": NOW - 1, "certificate": NOTE}, "expired"),
            ("backup_age", {"last_success": NOW - 7501, "manifest": NOTE}, "stale"),
        )
        for check, raw, state in cases:
            with self.subTest(check=check, state=state):
                transport = FakeTransport()
                memory: dict[str, str] = {}
                self.sleeps.clear()
                report, logs = self.deliver(
                    "webhook", observations(**{check: raw}), transport, memory
                )
                self.assertEqual(report["sent"], 1)
                self.assertEqual(report["requests"], 1)
                self.assertEqual(len(transport.calls), 1)
                body = json.loads(transport.calls[0]["body"])
                self.assertEqual(body["check"], check)
                self.assertEqual(body["state"], state)
                self.assertEqual(body["kind"], "failure")
                self.assertEqual(body["source"], "independent")
                self.assertEqual(transport.calls[0]["url"], WEBHOOK)
                self.assertEqual(transport.calls[0]["headers"]["Authorization"], f"Bearer {SECRET}")
                self.assertNotIn(SECRET, body.values())
                self.assert_clean(json.dumps(report))
                self.assert_clean(logs)
                self.assertNotIn(NOTE, json.dumps(body))
                again, _logs = self.deliver(
                    "webhook", observations(**{check: raw}), transport, memory
                )
                self.assertEqual(again["requests"], 0)
                self.assertEqual(again["planned"], [])
                self.assertEqual(len(transport.calls), 1)
                self.assertEqual(self.sleeps, [])

    def test_a01_recovery_does_not_keep_the_failure(self) -> None:
        cases = (
            (
                "readiness",
                {"reachable": True, "http_status": 503},
                {"reachable": True, "http_status": 200},
                "unhealthy",
            ),
            ("tls", {"expiry": NOW - 1}, {"expiry": NOW + monitor.TLS_WARN_SECONDS}, "expired"),
            ("backup_age", {"last_success": NOW - 7501}, {"last_success": NOW - 10}, "stale"),
        )
        for check, failed, fresh, failure in cases:
            with self.subTest(check=check):
                transport = FakeTransport([204, 204, 204])
                memory: dict[str, str] = {}
                self.deliver("webhook", observations(**{check: failed}), transport, memory)
                report, logs = self.deliver(
                    "webhook", observations(**{check: fresh}), transport, memory
                )
                self.assertEqual(report["requests"], 1)
                delivery = report["deliveries"][0]
                self.assertEqual(delivery["state"], "recovered")
                self.assertEqual(delivery["kind"], "recovery")
                self.assertNotIn(failure, json.dumps(delivery))
                self.assertNotIn(failure, json.dumps(report["planned"]))
                current = next(item for item in report["checks"] if item["check"] == check)
                self.assertIn(current["state"], {"healthy", "fresh"})
                self.assert_clean(logs)
                quiet, _logs = self.deliver(
                    "webhook", observations(**{check: fresh}), transport, memory
                )
                self.assertEqual(quiet["requests"], 0)
                self.assertEqual(len(transport.calls), 2)

    def test_a01_heartbeat_failure_recovery_and_liveness(self) -> None:
        transport = FakeTransport([204, 204, 204, 204])
        memory: dict[str, str] = {}
        failed = observations(
            readiness={"reachable": True, "http_status": 200},
            tls={"expiry": NOW + monitor.TLS_WARN_SECONDS},
            backup_age={"last_success": NOW - 7501},
        )
        fresh = observations(
            readiness={"reachable": True, "http_status": 200},
            tls={"expiry": NOW + monitor.TLS_WARN_SECONDS},
            backup_age={"last_success": NOW - 10},
        )
        first, _logs = self.deliver(
            "heartbeat",
            failed,
            transport,
            memory,
            SITE_ALERT_HEARTBEAT_URL=HEARTBEAT,
        )
        self.assertEqual(first["sent"], 1)
        self.assertEqual(json.loads(transport.calls[0]["body"])["state"], "stale")
        self.assertEqual(transport.calls[0]["url"], HEARTBEAT)
        repeat, _logs = self.deliver(
            "heartbeat",
            failed,
            transport,
            memory,
            SITE_ALERT_HEARTBEAT_URL=HEARTBEAT,
        )
        self.assertEqual(repeat["requests"], 0)
        _recovered, _logs = self.deliver(
            "heartbeat",
            fresh,
            transport,
            memory,
            SITE_ALERT_HEARTBEAT_URL=HEARTBEAT,
        )
        self.assertEqual(json.loads(transport.calls[1]["body"])["state"], "recovered")
        self.assertNotIn("stale", transport.calls[1]["body"].decode())
        alive, _logs = self.deliver(
            "heartbeat",
            fresh,
            transport,
            memory,
            SITE_ALERT_HEARTBEAT_URL=HEARTBEAT,
        )
        beat = json.loads(transport.calls[2]["body"])
        self.assertEqual(beat["kind"], "heartbeat")
        self.assertEqual(beat["state"], "healthy")
        self.assertEqual(alive["requests"], 1)
        again, _logs = self.deliver(
            "heartbeat",
            fresh,
            transport,
            memory,
            SITE_ALERT_HEARTBEAT_URL=HEARTBEAT,
        )
        self.assertEqual(again["requests"], 1)
        self.assertEqual(json.loads(transport.calls[-1]["body"])["kind"], "heartbeat")
        self.assertNotIn(WEBHOOK, [call["url"] for call in transport.calls])

    def test_a01_fresh_webhook_sends_nothing(self) -> None:
        transport = FakeTransport()
        report, logs = self.deliver(
            "webhook",
            observations(
                readiness={"reachable": True, "http_status": 200, "body": NOTE},
                tls={"expiry": NOW + monitor.TLS_WARN_SECONDS},
                backup_age={"last_success": NOW - 10, "manifest": NOTE},
            ),
            transport,
        )
        self.assertEqual(report["requests"], 0)
        self.assertEqual(report["sent"], 0)
        self.assertEqual(transport.calls, [])
        states = {item["check"]: item["state"] for item in report["checks"]}
        self.assertEqual(states, {"readiness": "healthy", "tls": "fresh", "backup_age": "fresh"})
        self.assert_clean(json.dumps(report))
        self.assert_clean(logs)

    def test_a01_fake_https_probe_ignores_the_body(self) -> None:
        seen: list[str] = []

        def opener(url: str, timeout: float) -> Response:
            seen.append(url)
            self.assertEqual(timeout, 5.0)
            return Response(503, NOTE)

        transport = FakeTransport()
        stderr = io.StringIO()
        with assert_no_network(), contextlib.redirect_stderr(stderr):
            report = monitor.run_once(
                clean_env(
                    SITE_ALERT_MODE="webhook",
                    SITE_ALERT_WEBHOOK_URL=WEBHOOK,
                    SITE_ALERT_TOKEN=SECRET,
                    SITE_ALERT_READINESS_URL="https://probe.example.test/ready",
                ),
                transport=transport,
                memory={},
                sleep=self.sleeps.append,
                now=NOW,
                opener=opener,
            )
        self.assertEqual(seen, ["https://probe.example.test/ready"])
        self.assertEqual(report["observation"], "probe")
        self.assertEqual(report["sent"], 1)
        body = json.loads(transport.calls[0]["body"])
        self.assertEqual(body["state"], "unhealthy")
        self.assertNotIn(NOTE, json.dumps(body))
        self.assert_clean(json.dumps(report))
        self.assert_clean(stderr.getvalue())

    def test_a02_off_and_dry_run_do_not_touch_the_network(self) -> None:
        transport = FakeTransport()
        payload = observations(readiness={"reachable": True, "http_status": 503, "body": NOTE})
        with assert_no_network():
            off, off_logs = self.deliver("off", payload, transport)
            dry, dry_logs = self.deliver("dry-run", payload, transport)
            missing, _logs = self.deliver("webhook", payload, transport, SITE_ALERT_WEBHOOK_URL="")
        self.assertEqual(transport.calls, [])
        self.assertEqual(off["activation"], "not_configured")
        self.assertEqual(off["sent"], 0)
        self.assertEqual(off["requests"], 0)
        self.assertEqual(off["planned"], [])
        self.assertEqual(off["checks"][0]["state"], "unhealthy")
        self.assertEqual(dry["activation"], "dry_run")
        self.assertEqual(dry["requests"], 0)
        self.assertEqual(dry["planned"][0]["state"], "unhealthy")
        self.assertEqual(missing["activation"], "missing_webhook")
        self.assertEqual(missing["requests"], 0)
        self.assert_clean(json.dumps(off) + json.dumps(dry) + off_logs + dry_logs)
        self.assertNotIn("ok", {item["severity"] for item in missing["checks"][:1]})

    def test_a02_unconfigured_checks_are_not_a_healthy_heartbeat(self) -> None:
        transport = FakeTransport()
        with assert_no_network():
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                report = monitor.run_once(
                    clean_env(
                        SITE_ALERT_MODE="heartbeat",
                        SITE_ALERT_HEARTBEAT_URL=HEARTBEAT,
                        SITE_ALERT_TOKEN=SECRET,
                    ),
                    transport=transport,
                    memory={},
                    sleep=self.sleeps.append,
                    now=NOW,
                )
        self.assertEqual(transport.calls, [])
        self.assertEqual(report["sent"], 0)
        self.assertEqual({item["state"] for item in report["checks"]}, {"unconfigured"})
        self.assertNotIn("healthy", {item["state"] for item in report["checks"]})
        self.assert_clean(json.dumps(report) + stderr.getvalue())

    def test_a02_command_prints_explicit_offline_status(self) -> None:
        env = clean_env(SITE_ALERT_MODE="off")
        result = subprocess.run(
            [sys.executable, "-m", "apps.server.monitor", "--once"],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["activation"], "not_configured")
        self.assertEqual(payload["sent"], 0)
        self.assertEqual(payload["requests"], 0)
        self.assertEqual({item["state"] for item in payload["checks"]}, {"unconfigured"})
        dry_env = clean_env(
            SITE_ALERT_MODE="dry-run",
            SITE_ALERT_WEBHOOK_URL=WEBHOOK,
            SITE_ALERT_TOKEN=SECRET,
            SITE_ALERT_OBSERVATIONS=observations(
                readiness={"reachable": False, "body": NOTE},
                tls={"expiry": NOW - 1, "certificate": NOTE},
                backup_age={"last_success": NOW - 7501, "manifest": NOTE},
            ),
        )
        dry = subprocess.run(
            [sys.executable, "-m", "apps.server.monitor", "--once"],
            cwd=ROOT,
            env=dry_env,
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )
        self.assertEqual(dry.returncode, 0, dry.stderr)
        dry_payload = json.loads(dry.stdout)
        self.assertEqual(dry_payload["activation"], "dry_run")
        self.assertEqual(dry_payload["sent"], 0)
        self.assertEqual(dry_payload["requests"], 0)
        states = {item["state"] for item in dry_payload["planned"]}
        self.assertEqual(states, {"unreachable", "expired", "stale"})
        self.assert_clean(result.stdout + result.stderr + dry.stdout + dry.stderr)

    def test_a03_failure_logs_are_redacted_and_retries_are_bounded(self) -> None:
        leak = RuntimeError(f"{WEBHOOK} {SECRET} {NOTE} {TOKEN} {PRIVATE_URL}")
        transport = FakeTransport([leak, leak, leak, leak])
        memory: dict[str, str] = {}
        report, logs = self.deliver(
            "webhook",
            observations(readiness={"reachable": True, "http_status": 503, "body": NOTE}),
            transport,
            memory,
            SITE_ALERT_TIMEOUT_SECONDS="2.5",
        )
        self.assertEqual(len(transport.calls), 3)
        self.assertEqual([call["timeout"] for call in transport.calls], [2.5, 2.5, 2.5])
        self.assertEqual(self.sleeps, [0.25, 0.5])
        self.assertEqual(report["sent"], 0)
        self.assertEqual(report["requests"], 3)
        self.assertEqual(report["deliveries"][0]["attempts"], 3)
        self.assertEqual(report["deliveries"][0]["reason"], "transport")
        self.assertFalse(report["deliveries"][0]["sent"])
        self.assert_clean(json.dumps(report))
        self.assert_clean(logs)
        self.assertNotIn("RuntimeError", logs)
        again, again_logs = self.deliver(
            "webhook",
            observations(readiness={"reachable": True, "http_status": 503}),
            transport,
            memory,
        )
        self.assertEqual(again["requests"], 0)
        self.assertEqual(len(transport.calls), 3)
        self.assert_clean(again_logs)
        rendered = monitor.render_report(
            {"activation": "configured", "leaked": WEBHOOK + SECRET},
            clean_env(SITE_ALERT_WEBHOOK_URL=WEBHOOK, SITE_ALERT_TOKEN=SECRET),
        )
        self.assert_clean(rendered)
        self.assertIn("[redacted]", rendered)

    def test_a03_timeout_attempts_and_http_status_stay_bounded(self) -> None:
        transport = FakeTransport([500, 204])
        report, logs = self.deliver(
            "webhook",
            observations(tls={"expiry": NOW - 5}),
            transport,
            {},
            SITE_ALERT_MAX_ATTEMPTS="99",
            SITE_ALERT_TIMEOUT_SECONDS="99",
        )
        self.assertEqual(len(transport.calls), 2)
        self.assertEqual([call["timeout"] for call in transport.calls], [10.0, 10.0])
        self.assertEqual(report["sent"], 1)
        self.assertEqual(report["deliveries"][0]["attempts"], 2)
        self.assertEqual(report["deliveries"][0]["reason"], "ok")
        self.assert_clean(logs)
        failing = FakeTransport([503, 503, 503, 503])
        limited, _logs = self.deliver(
            "webhook",
            observations(backup_age={"last_success": NOW - 8000}),
            failing,
            {},
            SITE_ALERT_MAX_ATTEMPTS="1",
        )
        self.assertEqual(len(failing.calls), 1)
        self.assertEqual(limited["deliveries"][0]["reason"], "http_status")
        self.assertEqual(limited["requests"], 1)
        config = monitor.load_alert_config(
            clean_env(
                SITE_ALERT_MODE="webhook", SITE_ALERT_TOKEN=SECRET, SITE_ALERT_WEBHOOK_URL=WEBHOOK
            )
        )
        self.assertNotIn(SECRET, repr(config))
        self.assertNotIn(WEBHOOK, repr(config))

    def test_missing_heartbeat_invalid_token_and_bad_fixture_send_nothing(self) -> None:
        transport = FakeTransport()
        with assert_no_network():
            missing, _logs = self.deliver(
                "heartbeat",
                observations(readiness={"reachable": False}),
                transport,
                SITE_ALERT_HEARTBEAT_URL="",
            )
            invalid, _logs = self.deliver(
                "webhook",
                observations(readiness={"reachable": False}),
                transport,
                SITE_ALERT_TOKEN="bad\ntoken",
            )
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                bad = monitor.run_once(
                    clean_env(
                        SITE_ALERT_MODE="webhook",
                        SITE_ALERT_WEBHOOK_URL=WEBHOOK,
                        SITE_ALERT_OBSERVATIONS=NOTE,
                    ),
                    transport=transport,
                    memory={},
                    sleep=self.sleeps.append,
                    now=NOW,
                )
        self.assertEqual(transport.calls, [])
        self.assertEqual(missing["activation"], "missing_heartbeat")
        self.assertEqual(invalid["activation"], "invalid_token")
        self.assertEqual(bad["observation"], "bad_fixture")
        self.assertEqual({item["state"] for item in bad["checks"]}, {"unknown"})
        self.assertEqual(bad["sent"], 0)
        self.assert_clean(json.dumps(bad) + stderr.getvalue())

    def test_backup_probe_uses_mtime_not_manifest_text(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            manifest = directory / "site-synthetic.json"
            manifest.write_text(
                json.dumps({"note": NOTE, "offhost": {"status": "off"}}), encoding="utf-8"
            )
            os.utime(manifest, (NOW - 8000, NOW - 8000))
            transport = FakeTransport()
            stderr = io.StringIO()
            with assert_no_network(), contextlib.redirect_stderr(stderr):
                report = monitor.run_once(
                    clean_env(
                        SITE_ALERT_MODE="webhook",
                        SITE_ALERT_WEBHOOK_URL=WEBHOOK,
                        SITE_ALERT_BACKUP_DIR=str(directory),
                    ),
                    transport=transport,
                    memory={},
                    sleep=self.sleeps.append,
                    now=NOW,
                )
            self.assertEqual(report["observation"], "probe")
            backup = next(item for item in report["checks"] if item["check"] == "backup_age")
            self.assertEqual(backup["state"], "stale")
            self.assertEqual(json.loads(transport.calls[0]["body"])["state"], "stale")
            self.assert_clean(
                json.dumps(report) + stderr.getvalue() + transport.calls[0]["body"].decode()
            )

    def test_local_metrics_do_not_invent_a_certificate_date_or_dump_payloads(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            manifest = directory / "site-synthetic.json"
            manifest.write_text(json.dumps({"note": NOTE}), encoding="utf-8")
            os.utime(manifest, (NOW - 10, NOW - 10))
            body = monitor.collect_local_body(
                now=NOW,
                backup_dir=directory,
                env={},
                probes=[
                    ("ready", "readiness", True, 503, 0.01),
                    ("public", "http", False, None, 0.02),
                ],
                tls_expiry=None,
                tls_supplied=True,
            )
        self.assertIn(
            'site_check_state{check="readiness",source="local",state="unhealthy",target="ready"} 1\n',
            body,
        )
        self.assertIn(
            'site_check_state{check="http",source="local",state="unreachable",target="public"} 1\n',
            body,
        )
        self.assertIn('site_check_state{check="tls",source="local",state="unknown"} 1\n', body)
        self.assertIn('site_check_state{check="backup_age",source="local",state="fresh"} 1\n', body)
        self.assertNotIn("site_tls_expiry_timestamp_seconds", body)
        self.assertNotIn('source="independent"', body)
        self.assertNotIn(NOTE, body)
        expired = monitor.collect_local_body(
            now=NOW,
            backup_dir=directory,
            env={},
            probes=[],
            tls_expiry=float(NOW - 5),
            tls_supplied=True,
        )
        self.assertIn(f"site_tls_expiry_timestamp_seconds {float(NOW - 5)}\n", expired)
        self.assertIn('state="expired"', expired)
        self.assertNotIn("site_tls_expiry_timestamp_seconds 0\n", expired)

    def test_http_transport_and_tls_reader_hide_addresses(self) -> None:
        def opener(*_args: object, **_kwargs: object) -> AbstractContextManager[object]:
            raise urllib.error.URLError(f"failed {WEBHOOK} {SECRET}")

        transport = monitor.HttpTransport(opener)
        with self.assertRaises(monitor.AlertTransportError) as caught:
            transport.request(WEBHOOK, b"{}", {}, 5)
        self.assertEqual(str(caught.exception), "transport")
        self.assert_clean(str(caught.exception))
        error = urllib.error.HTTPError(WEBHOOK, 503, NOTE, email.message.Message(), None)
        called = {"count": 0}

        def http_opener(*_args: object, **_kwargs: object) -> AbstractContextManager[object]:
            called["count"] += 1
            if called["count"] == 1:
                raise error
            return Response(204)

        retry = monitor.post_with_retry(
            monitor.HttpTransport(http_opener),
            WEBHOOK,
            b"{}",
            {},
            5,
            3,
            self.sleeps.append,
        )
        self.assertEqual(retry["sent"], True)
        self.assertEqual(retry["attempts"], 2)
        self.assertNotIn(WEBHOOK, json.dumps(retry))

        def refuse_connect(*_args: object, **_kwargs: object) -> AbstractContextManager[object]:
            raise AssertionError("connect")

        self.assertIsNone(monitor.read_tls_expiry("bad host", 1, connect=refuse_connect))
        seen: list[tuple[str, int]] = []

        class Cert:
            def getpeercert(self) -> dict[str, str]:
                return {"notAfter": "Jan  1 00:00:00 2030 GMT"}

        def connect(address: tuple[str, int], timeout: float) -> Context:
            seen.append(address)
            self.assertEqual(timeout, 1.5)
            return Context(object())

        def wrap(_sock: object, server_hostname: str) -> Context:
            self.assertEqual(server_hostname, "cert.example.test")
            return Context(Cert())

        expiry = monitor.read_tls_expiry("cert.example.test", 1.5, connect, wrap)
        self.assertIsInstance(expiry, float)
        self.assertEqual(seen, [("cert.example.test", 443)])

        def failing_connect(*_args: object, **_kwargs: object) -> AbstractContextManager[object]:
            raise OSError(NOTE)

        self.assertIsNone(monitor.read_tls_expiry("cert.example.test", 1, failing_connect))

    def test_live_probes_use_only_local_targets(self) -> None:
        seen: list[str] = []

        def opener(url: str, timeout: float) -> Response:
            seen.append(url)
            self.assertLessEqual(timeout, monitor.PROBE_TIMEOUT_SECONDS)
            return Response(200)

        samples = monitor.live_probes(opener)
        self.assertEqual([item[0] for item in samples], [item[0] for item in monitor.LOCAL_TARGETS])
        self.assertEqual(seen, [item[2] for item in monitor.LOCAL_TARGETS])
        self.assertNotIn(WEBHOOK, seen)

    def test_metrics_handler_and_backup_loop_stay_one_process(self) -> None:
        class QuietHandler(monitor.Handler):
            def __init__(self) -> None:
                self.path = "/metrics"
                self.buffer = io.BytesIO()
                self.wfile = self.buffer
                self.code = 0

            def send_response(self, code: int, message: str | None = None) -> None:
                self.code = code

            def send_header(self, keyword: str, value: str) -> None:
                return None

            def end_headers(self) -> None:
                return None

            def send_error(
                self, code: int, message: str | None = None, explain: str | None = None
            ) -> None:
                self.code = code

        with mock.patch.object(
            monitor, "collect_local_body", lambda **_kwargs: "site_probe_success 1\n"
        ):
            handler = QuietHandler()
            handler.do_GET()
            self.assertEqual(handler.code, 200)
            self.assertIn(b"site_probe_success", handler.buffer.getvalue())
            handler.path = "/private"
            handler.do_GET()
            self.assertEqual(handler.code, 404)
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                handler.log_message(NOTE)
            self.assertEqual(stderr.getvalue(), "")

        calls: list[str] = []

        class Stop(Exception):
            pass

        def fake_tick() -> None:
            calls.append("tick")

        def fake_sleep(seconds: float) -> None:
            self.assertEqual(seconds, 60)
            raise Stop()

        class Stat:
            st_mtime = NOW

        class BackupFile:
            def stat(self) -> Stat:
                return Stat()

        class FakePath:
            def __init__(self, *_args: object) -> None:
                pass

            def glob(self, _pattern: str) -> list[BackupFile]:
                return [BackupFile()]

        with (
            mock.patch.object(monitor, "Path", FakePath),
            mock.patch.object(monitor, "tick_alerts", fake_tick),
            mock.patch.object(monitor.time, "sleep", fake_sleep),
            mock.patch.object(monitor.time, "time", lambda: NOW),
            self.assertRaises(Stop),
        ):
            monitor.backup_loop()
        self.assertEqual(calls, ["tick"])

        def exploding_tick() -> None:
            raise RuntimeError(NOTE)

        stderr = io.StringIO()
        with (
            mock.patch.object(monitor, "Path", FakePath),
            mock.patch.object(monitor, "tick_alerts", exploding_tick),
            mock.patch.object(monitor.time, "sleep", fake_sleep),
            mock.patch.object(monitor.time, "time", lambda: NOW),
            contextlib.redirect_stderr(stderr),
            self.assertRaises(Stop),
        ):
            monitor.backup_loop()
        self.assertIn("alert_failed", stderr.getvalue())
        self.assertIn("internal", stderr.getvalue())
        self.assertNotIn(NOTE, stderr.getvalue())

    def test_main_uses_the_existing_server(self) -> None:
        calls: dict[str, object] = {}

        class FakeThread:
            def __init__(self, *, target: object, daemon: bool) -> None:
                calls["target"] = target
                calls["daemon"] = daemon

            def start(self) -> None:
                calls["started"] = True

        class FakeServer:
            def __init__(self, address: tuple[str, int], handler: object) -> None:
                calls["address"] = address
                calls["handler"] = handler

            def serve_forever(self) -> None:
                calls["served"] = True

        with (
            mock.patch.object(monitor.threading, "Thread", FakeThread),
            mock.patch.object(monitor, "ThreadingHTTPServer", FakeServer),
        ):
            self.assertEqual(monitor.main([]), 0)
        self.assertTrue(calls["daemon"])
        self.assertIs(calls["target"], monitor.backup_loop)
        self.assertEqual(calls["address"], ("0.0.0.0", 9090))
        self.assertTrue(calls["served"])
        self.assertTrue(calls["started"])

    def test_tick_logs_missing_configuration_once(self) -> None:
        note: dict[str, str | None] = {"value": None}
        stderr = io.StringIO()
        with assert_no_network(), contextlib.redirect_stderr(stderr):
            first = monitor.tick_alerts(
                clean_env(SITE_ALERT_MODE="off"), memory={}, note=note, sleep=self.sleeps.append
            )
            second = monitor.tick_alerts(
                clean_env(SITE_ALERT_MODE="off"), memory={}, note=note, sleep=self.sleeps.append
            )
        self.assertEqual(first["activation"], "not_configured")
        self.assertEqual(second["activation"], "not_configured")
        self.assertEqual(stderr.getvalue().count("alert_status"), 1)
        self.assertIn("not_configured", stderr.getvalue())

    def test_both_channels_reject_partial_configuration(self) -> None:
        transport = FakeTransport()
        memory: dict[str, str] = {}
        expiring = observations(tls={"expiry": NOW + 60})
        fresh = observations(tls={"expiry": NOW + monitor.TLS_WARN_SECONDS})
        with assert_no_network():
            first, logs = self.deliver(
                "both",
                expiring,
                transport,
                memory,
                SITE_ALERT_HEARTBEAT_URL=HEARTBEAT,
            )
            repeat, _logs = self.deliver(
                "both", expiring, transport, memory, SITE_ALERT_HEARTBEAT_URL=HEARTBEAT
            )
            recovered, _logs = self.deliver(
                "both", fresh, transport, memory, SITE_ALERT_HEARTBEAT_URL=HEARTBEAT
            )
            alive, _logs = self.deliver(
                "both", fresh, transport, memory, SITE_ALERT_HEARTBEAT_URL=HEARTBEAT
            )
            empty, _logs = self.deliver(
                "both",
                expiring,
                transport,
                SITE_ALERT_WEBHOOK_URL="",
                SITE_ALERT_HEARTBEAT_URL="",
            )
            partial, _logs = self.deliver("both", expiring, transport, SITE_ALERT_HEARTBEAT_URL="")
            invalid, _logs = self.deliver(
                "webhook",
                expiring,
                transport,
                SITE_ALERT_WEBHOOK_URL="https://user:pass@alerts.example.test/hook",
            )
        self.assertEqual(first["requests"], 2)
        self.assertEqual([call["url"] for call in transport.calls[:2]], [WEBHOOK, HEARTBEAT])
        self.assertEqual(json.loads(transport.calls[0]["body"])["state"], "expiring")
        self.assertEqual(json.loads(transport.calls[0]["body"])["severity"], "warning")
        self.assertEqual(repeat["requests"], 0)
        self.assertEqual(recovered["requests"], 2)
        self.assertEqual(json.loads(transport.calls[2]["body"])["state"], "recovered")
        self.assertEqual(alive["requests"], 1)
        self.assertEqual(transport.calls[-1]["url"], HEARTBEAT)
        self.assertEqual(json.loads(transport.calls[-1]["body"])["kind"], "heartbeat")
        self.assertEqual(empty["activation"], "missing_destination")
        self.assertEqual(partial["activation"], "missing_heartbeat")
        self.assertEqual(invalid["activation"], "invalid_destination")
        self.assertEqual(empty["sent"], 0)
        self.assertEqual(partial["requests"], 0)
        self.assertEqual(invalid["requests"], 0)
        self.assertEqual(len(transport.calls), 5)
        self.assert_clean(logs + json.dumps(first))
        blank = monitor.load_alert_config(clean_env(SITE_ALERT_MODE="   "))
        self.assertEqual(blank.activation, "not_configured")
        self.assertEqual(blank.mode, "off")
        invalid_mode = monitor.load_alert_config(clean_env(SITE_ALERT_MODE="page"))
        self.assertEqual(invalid_mode.activation, "invalid_mode")
        self.assertEqual(
            monitor.load_alert_config(
                clean_env(SITE_ALERT_MODE="off", SITE_ALERT_TIMEOUT_SECONDS="nope")
            ).timeout,
            5,
        )
        self.assertEqual(
            monitor.load_alert_config(
                clean_env(SITE_ALERT_MODE="off", SITE_ALERT_TIMEOUT_SECONDS="0")
            ).timeout,
            5,
        )
        self.assertEqual(
            monitor.load_alert_config(
                clean_env(SITE_ALERT_MODE="off", SITE_ALERT_MAX_ATTEMPTS="nope")
            ).attempts,
            3,
        )
        spaced = monitor.load_alert_config(
            clean_env(
                SITE_ALERT_MODE="webhook",
                SITE_ALERT_WEBHOOK_URL="https://alerts.example.test/has space",
            )
        )
        self.assertEqual(spaced.activation, "invalid_destination")
        password_url = f"https://user:{SECRET}@alerts.example.test/{PRIVATE_URL}"
        rendered = monitor.render_report(
            {"leaked": password_url},
            clean_env(SITE_ALERT_WEBHOOK_URL=password_url, SITE_ALERT_TOKEN=SECRET),
        )
        self.assert_clean(rendered)
        self.assertIn("[redacted]", rendered)

    def test_bad_fixtures_and_unsafe_probes_do_not_look_healthy(self) -> None:
        transport = FakeTransport()
        cases = (
            "[]",
            json.dumps({"now": True, "readiness": {"reachable": False}}),
            "x" * (monitor.FIXTURE_LIMIT + 1),
        )
        with assert_no_network():
            for raw in cases:
                report, _logs = self.deliver("webhook", raw, transport, {})
                self.assertEqual(report["observation"], "bad_fixture")
                self.assertEqual(report["sent"], 0)
                self.assertEqual({item["state"] for item in report["checks"]}, {"unknown"})
            shaped, _logs = self.deliver(
                "webhook",
                json.dumps(
                    {
                        "now": NOW,
                        "readiness": {"configured": False},
                        "tls": "not-an-object",
                        "backup_age": {"reachable": "yes", "last_success": True},
                    }
                ),
                transport,
                {},
            )
            states = {item["check"]: item["state"] for item in shaped["checks"]}
            self.assertEqual(states["readiness"], "unconfigured")
            self.assertEqual(states["tls"], "unknown")
            self.assertEqual(states["backup_age"], "unknown")
            self.assertEqual(shaped["requests"], 2)
            self.assertNotIn("healthy", states.values())
            inferred, _logs = self.deliver(
                "webhook",
                json.dumps({"now": NOW, "readiness": {"http_status": 503}}),
                transport,
                {},
            )
            self.assertEqual(inferred["checks"][0]["state"], "unhealthy")
            self.assertEqual(inferred["requests"], 1)
        self.assertEqual(len(transport.calls), 3)
        with self.assertRaises(ValueError):
            monitor.classify_readiness(
                configured=False, reachable=True, http_status=200, source="remote"
            )
        self.assertEqual(
            monitor.classify_tls(
                configured=False, expiry=float(NOW), now=NOW, source="local"
            ).state,
            "unconfigured",
        )
        self.assertEqual(
            monitor.classify_backup(
                configured=False, last_success=float(NOW), now=NOW, source="local"
            ).state,
            "unconfigured",
        )

    def test_independent_probes_reject_unsafe_targets_without_a_socket(self) -> None:
        transport = FakeTransport()

        def refuse(*_args: object, **_kwargs: object) -> AbstractContextManager[object]:
            raise AssertionError("socket")

        with tempfile.TemporaryDirectory() as temporary:
            empty = Path(temporary) / "empty"
            empty.mkdir()
            with assert_no_network():
                report = monitor.run_once(
                    clean_env(
                        SITE_ALERT_MODE="webhook",
                        SITE_ALERT_WEBHOOK_URL=WEBHOOK,
                        SITE_ALERT_TOKEN=SECRET,
                        SITE_ALERT_READINESS_URL="ftp://probe.example.test/ready",
                        SITE_ALERT_TLS_HOST="bad host",
                        SITE_ALERT_BACKUP_DIR=str(empty),
                    ),
                    transport=transport,
                    memory={},
                    sleep=self.sleeps.append,
                    now=NOW,
                    connect=refuse,
                    wrap=refuse,
                )
        self.assertEqual(report["observation"], "probe")
        self.assertEqual({item["state"] for item in report["checks"]}, {"unknown"})
        self.assertEqual(report["requests"], 3)
        self.assert_clean(json.dumps(report))

        def http_error(*_args: object, **_kwargs: object) -> AbstractContextManager[object]:
            raise urllib.error.HTTPError(
                "https://probe.example.test/ready", 503, "down", email.message.Message(), None
            )

        self.assertEqual(
            monitor.probe_http("https://probe.example.test/ready", 1, http_error), (True, 503)
        )
        with assert_no_network():
            self.assertEqual(
                monitor.probe_http("https://probe.example.test/ready", 1), (False, None)
            )

        def connect_object(*_args: object, **_kwargs: object) -> AbstractContextManager[object]:
            return Context(object())

        self.assertIsNone(monitor.read_tls_expiry("cert.example.test", 1, connect_object))

        class TextCert:
            def getpeercert(self) -> str:
                return "not-a-cert"

        class NumberDate:
            def getpeercert(self) -> dict[str, int]:
                return {"notAfter": 5}

        class BadDate:
            def getpeercert(self) -> dict[str, str]:
                return {"notAfter": "not-a-date"}

        def wrap_of(value: object) -> Callable[..., AbstractContextManager[object]]:
            def wrap(_sock: object, server_hostname: str) -> AbstractContextManager[object]:
                self.assertEqual(server_hostname, "cert.example.test")
                return Context(value)

            return wrap

        for value in (TextCert(), NumberDate(), BadDate()):
            self.assertIsNone(
                monitor.read_tls_expiry("cert.example.test", 1, connect_object, wrap_of(value))
            )

        class Blank:
            def __enter__(self) -> "Blank":
                return self

            def __exit__(self, *_args: object) -> None:
                return None

        def blank_opener(*_args: object, **_kwargs: object) -> AbstractContextManager[object]:
            return Blank()

        with self.assertRaises(monitor.AlertTransportError) as caught:
            monitor.HttpTransport(blank_opener).request(WEBHOOK, b"{}", {}, 1)
        self.assertEqual(str(caught.exception), "transport")
        self.assert_clean(str(caught.exception))

        def posting_opener(*_args: object, **_kwargs: object) -> AbstractContextManager[object]:
            return Response(204)

        built = monitor.run_once(
            clean_env(
                SITE_ALERT_MODE="webhook",
                SITE_ALERT_WEBHOOK_URL=WEBHOOK,
                SITE_ALERT_TOKEN=SECRET,
                SITE_ALERT_OBSERVATIONS=observations(readiness={"reachable": False}),
            ),
            memory={},
            sleep=self.sleeps.append,
            now=NOW,
            opener=posting_opener,
        )
        self.assertEqual(built["sent"], 1)
        self.assertEqual(built["requests"], 1)
        self.assert_clean(json.dumps(built))

    def test_offhost_metrics_and_backup_command_stay_in_this_process(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "site-good.json").write_text(
                json.dumps(
                    {
                        "note": NOTE,
                        "offhost": {
                            "status": "verified",
                            "transferred": True,
                            "verified_at": "2026-01-01T00:00:00+00:00",
                        },
                    }
                ),
                encoding="utf-8",
            )
            (directory / "site-failed.json").write_text(
                json.dumps(
                    {"offhost": {"status": "failed", "failed_at": "2026-01-02T00:00:00+00:00"}}
                ),
                encoding="utf-8",
            )
            (directory / "site-junk.json").write_text("{", encoding="utf-8")
            (directory / "site-list.json").write_text("[]", encoding="utf-8")
            (directory / "site-naive.json").write_text(
                json.dumps(
                    {
                        "offhost": {
                            "status": "verified",
                            "transferred": True,
                            "verified_at": "2026-01-03T00:00:00",
                        }
                    }
                ),
                encoding="utf-8",
            )
            (directory / "site-shape.json").write_text(
                json.dumps({"offhost": "off"}), encoding="utf-8"
            )
            (directory / "site-bad-time.json").write_text(
                json.dumps(
                    {
                        "offhost": {
                            "status": "failed",
                            "failed_at": "not-a-time",
                        }
                    }
                ),
                encoding="utf-8",
            )
            lines = monitor.backup_metric_lines(directory, {})
            self.assertIn("site_backup_offhost_configured 0\n", lines)
            self.assertNotIn("site_backup_offhost_last_success_timestamp_seconds 0\n", lines)
            self.assertNotIn("site_backup_offhost_last_failure_timestamp_seconds 0\n", lines)
            self.assertNotIn(NOTE, lines)
            self.assertIsNone(monitor.newest_success_mtime(directory / "missing"))
            empty = directory / "empty"
            empty.mkdir()
            self.assertIsNone(monitor.newest_success_mtime(empty))
            with mock.patch.dict(os.environ, {}, clear=True):
                defaulted = monitor.backup_metric_lines(directory)
            self.assertIn("site_backup_offhost_configured 0\n", defaulted)
        self.assertEqual(
            monitor.offhost_configured(
                {
                    "SITE_BACKUP_OFFHOST": "file",
                    "SITE_BACKUP_OFFHOST_DIR": "synthetic-dir",
                    "SITE_BACKUP_OFFHOST_KEY_FILE": "synthetic.key",
                }
            ),
            1,
        )
        self.assertEqual(
            monitor.offhost_configured(
                {
                    "SITE_BACKUP_OFFHOST": "dry-run",
                    "SITE_BACKUP_OFFHOST_DIR": "synthetic-dir",
                    "SITE_BACKUP_OFFHOST_KEY_FILE": "synthetic.key",
                }
            ),
            0,
        )

        seen: list[list[str]] = []

        def fake_run(args: list[str], *, check: bool, timeout: int) -> None:
            seen.append(args)
            self.assertTrue(check)
            self.assertEqual(timeout, 180)
            raise RuntimeError(NOTE)

        class EmptyPath:
            def glob(self, _pattern: str) -> list[object]:
                return []

        class Stop(Exception):
            pass

        def fake_sleep(seconds: float) -> None:
            self.assertEqual(seconds, 60)
            raise Stop()

        stdout = io.StringIO()
        with (
            mock.patch.object(monitor, "Path", lambda *_args, **_kwargs: EmptyPath()),
            mock.patch.object(monitor.subprocess, "run", fake_run),
            mock.patch.object(monitor, "tick_alerts", lambda **_kwargs: None),
            mock.patch.object(monitor.time, "sleep", fake_sleep),
            mock.patch.object(monitor.time, "time", lambda: NOW),
            mock.patch.dict(os.environ, {"SITE_BACKUP_INTERVAL_SECONDS": "60"}),
            contextlib.redirect_stdout(stdout),
            self.assertRaises(Stop),
        ):
            monitor.backup_loop()
        self.assertEqual(len(seen), 1)
        self.assertIn("/app/backup-site.py", seen[0])
        self.assertIn("backup_failed", stdout.getvalue())
        self.assertIn("RuntimeError", stdout.getvalue())
        self.assertNotIn(NOTE, stdout.getvalue())

        captured = io.StringIO()
        env = clean_env(
            SITE_ALERT_MODE="dry-run",
            SITE_ALERT_OBSERVATIONS=observations(readiness={"reachable": False}),
        )
        with (
            mock.patch.dict(os.environ, env, clear=True),
            contextlib.redirect_stdout(captured),
            assert_no_network(),
        ):
            self.assertEqual(monitor.main(["--once"]), 0)
        payload = json.loads(captured.getvalue())
        self.assertEqual(payload["activation"], "dry_run")
        self.assertEqual(payload["sent"], 0)
        self.assertEqual(payload["planned"][0]["state"], "unreachable")

    def test_deletion_rules_and_docs_distinguish_local_and_remote(self) -> None:
        source = (ROOT / "apps/server/monitor.py").read_text(encoding="utf-8")
        rules = (ROOT / "ops/monitoring/site-alerts.yml").read_text(encoding="utf-8")
        operations = (ROOT / "docs/OPERATIONS.md").read_text(encoding="utf-8")
        followups = (ROOT / "docs/SRE-FOLLOWUPS.md").read_text(encoding="utf-8")
        compose = (ROOT / "compose.yml").read_text(encoding="utf-8")
        self.assertEqual(source.count("def classify_readiness("), 1)
        self.assertEqual(source.count("def classify_tls("), 1)
        self.assertEqual(source.count("def classify_backup("), 1)
        self.assertEqual(source.count("def backup_loop("), 1)
        self.assertEqual(source.count("BACKUP_STALE_SECONDS = 7500"), 1)
        self.assertNotIn("deliver_offhost", source)
        self.assertNotIn("def offhost_loop", source)
        for banned in ("7500", "1209600", "site_probe_success == 0", "https://", "http://"):
            self.assertNotIn(banned, rules)
        self.assertEqual(rules.count('delivers: "false"'), 7)
        self.assertIn("This rule does not notify.", rules)
        self.assertIn("PersonalSiteErrorsHigh", rules)
        self.assertIn("PersonalSiteExporterMissing", rules)
        self.assertIn("They are not an external detector.", operations)
        self.assertIn("Unconfigured and unknown are not healthy.", operations)
        self.assertIn("No alert recipient is configured.", operations)
        self.assertIn("send nothing", operations)
        self.assertIn("No second logger is added.", operations)
        self.assertIn("OPS-06", operations)
        self.assertNotIn("notification destination is configured", operations)
        self.assertNotIn("notification destination is configured", followups)
        self.assertIn("claim paging coverage.", followups)
        self.assertIn("External recipient delivery is not activated.", followups)
        self.assertEqual(compose.count("command: [python, -m, apps.server.monitor]"), 1)
        self.assertIn("SITE_ALERT_MODE: ${SITE_ALERT_MODE:-off}", compose)
        self.assertIn("SITE_ALERT_WEBHOOK_URL: ${SITE_ALERT_WEBHOOK_URL:-}", compose)
        self.assertNotIn("SITE_ALERT_MODE:-webhook", compose)
        self.assertNotIn("hooks.slack.com", compose)
        self.assertNotIn(TOKEN, compose)
        self.assertNotIn(SECRET, compose)


if __name__ == "__main__":
    unittest.main()
