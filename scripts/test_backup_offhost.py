"""Dry-run and fake-destination coverage for the off-host backup adapter."""

import hashlib
import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import uuid
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = Path(__file__).with_name("backup-site.py")
MONITOR = ROOT / "apps/server/monitor.py"
PLAINTEXT = "PLAINTEXT_MARKER_ops03_9f3a"
TOKEN = "TOKEN_MARKER_ops03_9f3a"
KEY = b"KEYMARKER_ops03_9f3a_0123456789!"
KEY_MARKER = "KEYMARKER_ops03_9f3a"

if len(KEY) != 32:
    raise RuntimeError("synthetic backup key must be 32 bytes")


def _load_monitor():
    spec = importlib.util.spec_from_file_location(f"site_monitor_{uuid.uuid4().hex}", MONITOR)
    if spec is None or spec.loader is None:
        raise RuntimeError("missing monitor")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_tool():
    spec = importlib.util.spec_from_file_location(f"backup_site_{uuid.uuid4().hex}", TOOL)
    if spec is None or spec.loader is None:
        raise RuntimeError("missing backup tool")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_database(path: Path, marker: str) -> None:
    if path.exists():
        path.unlink()
    with sqlite3.connect(path) as db:
        db.executescript(
            """
            PRAGMA foreign_keys=ON;
            CREATE TABLE site_schema (id INTEGER PRIMARY KEY, version INTEGER NOT NULL);
            INSERT INTO site_schema (id, version) VALUES (1, 1);
            CREATE TABLE users (id INTEGER PRIMARY KEY, note TEXT);
            INSERT INTO users (id, note) VALUES (1, 'seed');
            CREATE TABLE encrypted_records (id INTEGER PRIMARY KEY);
            CREATE TABLE trips (
                id INTEGER PRIMARY KEY,
                user_id INTEGER REFERENCES users(id)
            );
            CREATE TABLE user_entries (id INTEGER PRIMARY KEY);
            """
        )
        db.execute("UPDATE users SET note = ? WHERE id = 1", (marker,))
    path.chmod(0o600)


class FakeTransport:
    def __init__(self, error_type: type[Exception]) -> None:
        self.error_type = error_type
        self.objects: dict[str, bytes] = {}
        self.partials: dict[str, bytes] = {}
        self.stage_calls = 0
        self.fail_times = 0
        self.fail_reason = "transfer"
        self.interrupt = False
        self.swap: bytes | None = None
        self.corrupt_bytes = False

    def fetch(self, name: str) -> bytes | None:
        return self.objects.get(name)

    def stage(self, name: str, body: bytes) -> bytes:
        self.stage_calls += 1
        self.partials[name] = body
        if self.fail_times > 0 and not self.corrupt_bytes:
            self.fail_times -= 1
            raise self.error_type(self.fail_reason, 0)
        if self.corrupt_bytes:
            return body[:-1] + bytes([body[-1] ^ 0x01])
        if self.swap is not None:
            return self.swap
        return body

    def commit(self, name: str) -> None:
        self.objects[name] = self.partials.pop(name)

    def discard_partial(self, name: str) -> None:
        self.partials.pop(name, None)


class RaisingTransport:
    def fetch(self, name: str) -> bytes | None:
        raise AssertionError("dry-run touched the destination")

    def stage(self, name: str, body: bytes) -> bytes:
        raise AssertionError("dry-run touched the destination")

    def commit(self, name: str) -> None:
        raise AssertionError("dry-run touched the destination")

    def discard_partial(self, name: str) -> None:
        raise AssertionError("dry-run touched the destination")


class OffhostAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.tool = _load_tool()
        self.monitor = _load_monitor()
        self.printed: list[str] = []
        self.tool.print = lambda *args, **kwargs: self.printed.append(
            " ".join(str(arg) for arg in args)
        )
        self.database = self.root / "site.db"
        _write_database(self.database, PLAINTEXT)
        self.other = self.root / "other.db"
        _write_database(self.other, PLAINTEXT + "-other")
        self.local = self.root / "local"
        self.destination = self.root / "destination"
        self.destination.mkdir(mode=0o700)
        self.key_file = self.root / "recovery.key"
        self.key_file.write_bytes(KEY)
        self.key_file.chmod(0o600)
        self.sleeps: list[float] = []
        saved = {
            key: os.environ.get(key)
            for key in (
                "SITE_BACKUP_OFFHOST",
                "SITE_BACKUP_OFFHOST_DIR",
                "SITE_BACKUP_OFFHOST_KEY_FILE",
                "SITE_BACKUP_OFFHOST_TOKEN",
                "SITE_BACKUP_KEEP",
                "SITE_BACKUP_KEEP_DAYS",
            )
        }

        def restore() -> None:
            for key, value in saved.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

        self.addCleanup(restore)
        for key in saved:
            os.environ.pop(key, None)
        os.environ["SITE_BACKUP_OFFHOST_TOKEN"] = TOKEN

    def _settings(self, mode: str = "file"):
        return self.tool.OffhostSettings(mode, self.destination, KEY)

    def _fake(self) -> FakeTransport:
        return FakeTransport(self.tool.OffhostError)

    def _backup(self, source: Path, transport=None, mode: str = "file"):
        return self.tool.backup(
            source,
            self.local,
            keep=7,
            keep_days=30,
            offhost=self._settings(mode),
            transport=transport,
            sleep=self.sleeps.append,
        )

    def _manifest(self, snapshot: Path) -> dict:
        return json.loads(snapshot.with_suffix(".json").read_text(encoding="utf-8"))

    def _assert_clean(self, blob: str) -> None:
        self.assertNotIn(PLAINTEXT, blob)
        self.assertNotIn(TOKEN, blob)
        self.assertNotIn(KEY_MARKER, blob)
        self.assertNotIn(KEY.hex(), blob)

    def _open_object(self, blob: bytes, source: Path) -> dict:
        opened, header = self.tool.open_sealed(blob, KEY)
        self.assertEqual(opened, source.read_bytes())
        self.assertEqual(header["sha256"], hashlib.sha256(opened).hexdigest())
        self.assertEqual(header["schema"], 1)
        self.assertEqual(header["kind"], "hourly")
        self.assertEqual(header["bytes"], len(opened))
        return header

    def test_a01_dry_run_sends_nothing(self) -> None:
        before = sorted(path.name for path in self.destination.iterdir())
        receipt = self.tool.deliver_offhost(
            Path("/no/such/snapshot"),
            {},
            self.tool.OffhostSettings("dry-run"),
            transport=RaisingTransport(),
            sleep=self.sleeps.append,
        )
        self.assertEqual(receipt["status"], "dry-run")
        self.assertFalse(receipt["transferred"])
        self.assertEqual(receipt["bytes_sent"], 0)
        self.assertEqual(receipt["attempts"], 0)
        snapshot = self._backup(self.database, transport=RaisingTransport(), mode="dry-run")
        manifest = self._manifest(snapshot)
        self.assertEqual(manifest["offhost"]["status"], "dry-run")
        self.assertFalse(manifest["offhost"]["transferred"])
        self.assertEqual(manifest["offhost"]["bytes_sent"], 0)
        self.assertEqual(sorted(path.name for path in self.destination.iterdir()), before)
        self.assertTrue(self.database.read_bytes().decode("utf-8", "replace").find(PLAINTEXT) >= 0)
        self._assert_clean(json.dumps(manifest))
        os.environ["SITE_BACKUP_OFFHOST"] = "dry-run"
        os.environ["SITE_BACKUP_OFFHOST_KEY_FILE"] = str(self.root / "missing-key")
        os.environ["SITE_BACKUP_OFFHOST_DIR"] = str(self.root / "missing-destination")
        self.tool.backup(self.database, self.root / "dry-local", keep=7, keep_days=30)

    def test_a01_fake_transport_roundtrip_restores_bytes_and_metadata(self) -> None:
        transport = self._fake()
        snapshot = self._backup(self.database, transport=transport)
        self.assertEqual(transport.stage_calls, 1)
        self.assertEqual(len(transport.objects), 1)
        self.assertEqual(transport.partials, {})
        manifest = self._manifest(snapshot)
        name, blob = next(iter(transport.objects.items()))
        header = self._open_object(blob, snapshot)
        self.assertEqual(header["created_at"], manifest["created_at"])
        self.assertEqual(manifest["offhost"]["status"], "verified")
        self.assertTrue(manifest["offhost"]["transferred"])
        self.assertEqual(manifest["offhost"]["object"], name)
        self.assertEqual(manifest["offhost"]["ciphertext_sha256"], hashlib.sha256(blob).hexdigest())
        self.assertNotEqual(blob, snapshot.read_bytes())
        self._assert_clean(blob.decode("utf-8", "replace"))
        self._assert_clean(json.dumps(manifest))
        self._assert_clean("\n".join(self.printed))

    def test_a01_file_destination_roundtrip_and_idempotence(self) -> None:
        os.environ["SITE_BACKUP_OFFHOST"] = "file"
        os.environ["SITE_BACKUP_OFFHOST_DIR"] = str(self.destination)
        os.environ["SITE_BACKUP_OFFHOST_KEY_FILE"] = str(self.key_file)
        snapshot = self.tool.backup(self.database, self.local, keep=7, keep_days=30)
        stored = list(self.destination.glob("*.psbk"))
        self.assertEqual(len(stored), 1)
        self.assertEqual(list(self.destination.glob("*.partial")), [])
        self.assertEqual(list(self.destination.glob("*.db")), [])
        header = self._open_object(stored[0].read_bytes(), snapshot)
        manifest = self._manifest(snapshot)
        self.assertEqual(header["sha256"], manifest["sha256"])
        self.assertTrue(manifest["restore_checked"])
        again = self.tool.deliver_offhost(snapshot, manifest, self.tool.load_offhost_settings())
        self.assertEqual(again["attempts"], 0)
        self.assertEqual(again["bytes_sent"], 0)
        self.assertTrue(again["transferred"])
        self.assertEqual(len(list(self.destination.glob("*.psbk"))), 1)
        self.assertEqual(
            again["ciphertext_sha256"], hashlib.sha256(stored[0].read_bytes()).hexdigest()
        )

    def test_a02_interruption_retries_and_preserves_last_good(self) -> None:
        transport = self._fake()
        first = self._backup(self.database, transport=transport)
        self.assertEqual(transport.stage_calls, 1)
        good = dict(transport.objects)
        transport.fail_times = 1
        transport.interrupt = True
        second = self._backup(self.other, transport=transport)
        self.assertEqual(self.sleeps, [0.5])
        self.assertEqual(transport.partials, {})
        self.assertEqual(self._manifest(second)["offhost"]["attempts"], 2)
        self._open_object(good[next(iter(good))], first)
        self.assertEqual(transport.objects[next(iter(good))], good[next(iter(good))])
        self._open_object(
            next(blob for name, blob in transport.objects.items() if name not in good), second
        )

    def test_a02_exhausted_transfer_keeps_local_and_remote_state(self) -> None:
        transport = self._fake()
        first = self._backup(self.database, transport=transport)
        good = dict(transport.objects)
        transport.fail_times = 5
        transport.interrupt = True
        transport.fail_reason = TOKEN
        with self.assertRaises(self.tool.OffhostError) as caught:
            self._backup(self.other, transport=transport)
        self.assertEqual(str(caught.exception), "transfer")
        self.assertEqual(caught.exception.attempts, self.tool.OFFHOST_ATTEMPTS)
        self.assertEqual(self.sleeps, [0.5, 1.0])
        self.assertEqual(transport.objects, good)
        self.assertEqual(transport.partials, {})
        published = list(self.local.glob("site-*.db"))
        self.assertEqual(len(published), 2)
        failed = next(path for path in published if path != first)
        self.assertIn((PLAINTEXT + "-other").encode(), failed.read_bytes())
        self.tool.verify(failed)
        manifest = self._manifest(failed)
        self.assertTrue(manifest["restore_checked"])
        self.assertEqual(manifest["offhost"]["status"], "failed")
        self.assertFalse(manifest["offhost"]["transferred"])
        self.assertEqual(manifest["offhost"]["attempts"], 3)
        self._assert_clean(json.dumps(manifest))
        self._assert_clean(str(caught.exception))
        self._assert_clean("\n".join(self.printed))
        self._open_object(good[next(iter(good))], first)

    def test_a02_corruption_and_authentication_are_explicit(self) -> None:
        transport = self._fake()
        first = self._backup(self.database, transport=transport)
        good_name, good_blob = next(iter(transport.objects.items()))
        transport.swap = good_blob
        with self.assertRaises(self.tool.OffhostError) as swapped:
            self._backup(self.other, transport=transport)
        self.assertEqual(swapped.exception.reason, "corrupt")
        self.assertEqual(swapped.exception.attempts, 3)
        self.assertEqual(transport.objects, {good_name: good_blob})
        self.assertEqual(transport.partials, {})

        flipped = bytearray(good_blob)
        flipped[-1] ^= 0x01
        with self.assertRaises(self.tool.OffhostError) as tampered:
            self.tool.open_sealed(bytes(flipped), KEY)
        self.assertEqual(tampered.exception.reason, "authentication")
        self._assert_clean(str(tampered.exception))

        other = bytes(byte ^ 0x5A for byte in KEY)
        sealed = self.tool.seal(
            first.read_bytes(),
            KEY,
            {
                "bytes": first.stat().st_size,
                "created_at": self._manifest(first)["created_at"],
                "kind": "hourly",
                "schema": 1,
                "sha256": hashlib.sha256(first.read_bytes()).hexdigest(),
                "v": 1,
            },
        )
        with self.assertRaises(self.tool.OffhostError) as wrong_key:
            self.tool.open_sealed(sealed, other)
        self.assertEqual(wrong_key.exception.reason, "authentication")
        self._assert_clean(str(wrong_key.exception))
        self.assertEqual(transport.objects[good_name], good_blob)

        auth = self._fake()
        auth.fail_times = 5
        auth.fail_reason = "authentication"
        with self.assertRaises(self.tool.OffhostError) as rejected:
            self._backup(self.database, transport=auth)
        self.assertEqual(rejected.exception.reason, "authentication")
        self.assertEqual(rejected.exception.attempts, 3)
        self.assertEqual(auth.objects, {})
        self.assertEqual(auth.partials, {})

    def test_a02_config_failure_sends_nothing(self) -> None:
        missing_local = self.root / "not-created"
        cases = [
            {"SITE_BACKUP_OFFHOST": "s3"},
            {
                "SITE_BACKUP_OFFHOST": "file",
                "SITE_BACKUP_OFFHOST_DIR": "",
                "SITE_BACKUP_OFFHOST_KEY_FILE": str(self.key_file),
            },
            {
                "SITE_BACKUP_OFFHOST": "file",
                "SITE_BACKUP_OFFHOST_DIR": str(self.destination),
                "SITE_BACKUP_OFFHOST_KEY_FILE": str(self.root / "absent.key"),
            },
        ]
        self.key_file.chmod(0o644)
        cases.append(
            {
                "SITE_BACKUP_OFFHOST": "file",
                "SITE_BACKUP_OFFHOST_DIR": str(self.destination),
                "SITE_BACKUP_OFFHOST_KEY_FILE": str(self.key_file),
            }
        )
        short = self.root / "short.key"
        short.write_bytes(b"short")
        short.chmod(0o600)
        cases.append(
            {
                "SITE_BACKUP_OFFHOST": "file",
                "SITE_BACKUP_OFFHOST_DIR": str(self.destination),
                "SITE_BACKUP_OFFHOST_KEY_FILE": str(short),
            }
        )
        for env in cases:
            for key in (
                "SITE_BACKUP_OFFHOST",
                "SITE_BACKUP_OFFHOST_DIR",
                "SITE_BACKUP_OFFHOST_KEY_FILE",
            ):
                os.environ.pop(key, None)
            os.environ.update(env)
            with self.assertRaises(self.tool.OffhostError) as caught:
                self.tool.backup(self.database, missing_local, keep=7, keep_days=30)
            self.assertEqual(caught.exception.reason, "config")
            self.assertEqual(caught.exception.attempts, 0)
            self._assert_clean(str(caught.exception))
        self.assertFalse(missing_local.exists())
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_a02_cli_config_failure_is_redacted(self) -> None:
        self.key_file.chmod(0o644)
        env = os.environ.copy()
        env.update(
            {
                "SITE_BACKUP_OFFHOST": "file",
                "SITE_BACKUP_OFFHOST_DIR": str(self.destination),
                "SITE_BACKUP_OFFHOST_KEY_FILE": str(self.key_file),
                "SITE_BACKUP_OFFHOST_TOKEN": TOKEN,
            }
        )
        result = subprocess.run(
            [
                sys.executable,
                str(TOOL),
                "--source",
                str(self.database),
                "--directory",
                str(self.root / "cli-local"),
            ],
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn('"reason": "config"', result.stderr)
        self._assert_clean(result.stdout)
        self._assert_clean(result.stderr)
        self.assertFalse((self.root / "cli-local").exists())
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_a03_failure_diagnostics_omit_markers_and_freshness_is_honest(self) -> None:
        transport = self._fake()
        transport.fail_times = 1
        transport.fail_reason = TOKEN
        snapshot = self._backup(self.database, transport=transport)
        manifest = self._manifest(snapshot)
        self._assert_clean(json.dumps(manifest))
        self.assertEqual(manifest["offhost"]["status"], "verified")
        self.assertNotIn("reason", manifest["offhost"])
        blob = next(iter(transport.objects.values()))
        self._assert_clean(blob.decode("utf-8", "replace"))
        dry_dir = self.root / "dry"
        self.tool.backup(
            self.database,
            dry_dir,
            keep=7,
            keep_days=30,
            offhost=self.tool.OffhostSettings("dry-run"),
            transport=RaisingTransport(),
            sleep=self.sleeps.append,
        )
        dry_lines = self.monitor.backup_metric_lines(
            dry_dir,
            {
                "SITE_BACKUP_OFFHOST": "dry-run",
                "SITE_BACKUP_OFFHOST_DIR": str(self.destination),
                "SITE_BACKUP_OFFHOST_KEY_FILE": str(self.key_file),
            },
        )
        self._assert_clean(dry_lines)
        self.assertIn("site_backup_offhost_configured 0\n", dry_lines)
        self.assertIn("site_backup_offhost_last_success_timestamp_seconds 0\n", dry_lines)
        self.assertIn("site_backup_offhost_last_failure_timestamp_seconds 0\n", dry_lines)
        self.assertNotIn("site_backup_last_success_timestamp_seconds 0\n", dry_lines)
        verified_at = datetime(2026, 11, 11, 12, 0, tzinfo=UTC)
        manifest["offhost"] = {
            "status": "verified",
            "transferred": True,
            "verified_at": verified_at.isoformat(),
            "object": "hourly-synthetic.psbk",
        }
        snapshot.with_suffix(".json").write_text(json.dumps(manifest), encoding="utf-8")
        dry = {
            "status": "dry-run",
            "transferred": True,
            "verified_at": "2026-11-11T18:00:00+00:00",
        }
        dishonest = self.local / "site-20261111T180000-dryrun01.json"
        dishonest.write_text(
            json.dumps({"restore_checked": True, "offhost": dry}), encoding="utf-8"
        )
        success_lines = self.monitor.backup_metric_lines(self.local, {})
        self.assertIn("site_backup_offhost_configured 0\n", success_lines)
        self.assertIn(
            f"site_backup_offhost_last_success_timestamp_seconds {verified_at.timestamp():.3f}\n",
            success_lines,
        )
        self.assertNotIn("18:00:00", success_lines)
        failed_at = datetime(2026, 11, 11, 13, 0, tzinfo=UTC)
        manifest["offhost"] = {
            "status": "failed",
            "transferred": False,
            "reason": "transfer",
            "attempts": 3,
            "failed_at": failed_at.isoformat(),
        }
        snapshot.with_suffix(".json").write_text(json.dumps(manifest), encoding="utf-8")
        failed_lines = self.monitor.backup_metric_lines(
            self.local,
            {
                "SITE_BACKUP_OFFHOST": "file",
                "SITE_BACKUP_OFFHOST_DIR": str(self.destination),
                "SITE_BACKUP_OFFHOST_KEY_FILE": str(self.key_file),
            },
        )
        self.assertIn("site_backup_offhost_configured 1\n", failed_lines)
        self.assertIn(
            f"site_backup_offhost_last_failure_timestamp_seconds {failed_at.timestamp():.3f}\n",
            failed_lines,
        )
        self.assertIn("site_backup_offhost_last_success_timestamp_seconds 0\n", failed_lines)
        self.assertIn("site_backup_last_success_timestamp_seconds ", failed_lines)
        self.assertNotIn(PLAINTEXT, failed_lines)

    def test_deletion_one_producer_and_scheduler_and_docs_do_not_claim_activation(self) -> None:
        source = TOOL.read_text(encoding="utf-8")
        monitor = (ROOT / "apps/server/monitor.py").read_text(encoding="utf-8")
        compose = (ROOT / "compose.yml").read_text(encoding="utf-8")
        shell = (ROOT / "scripts/backup-site.sh").read_text(encoding="utf-8")
        backup_doc = (ROOT / "docs/BACKUP.md").read_text(encoding="utf-8")
        operations = (ROOT / "docs/OPERATIONS.md").read_text(encoding="utf-8")
        self.assertEqual(source.count("def backup("), 1)
        self.assertEqual(source.count("def deliver_offhost("), 1)
        self.assertEqual(monitor.count("def backup_loop("), 1)
        self.assertNotIn("deliver_offhost", monitor)
        self.assertNotIn("def offhost_loop", monitor)
        self.assertEqual(compose.count("command: [python, /app/backup-site.py"), 1)
        self.assertEqual(compose.count("command: [python, -m, apps.server.monitor]"), 1)
        self.assertEqual(compose.count("SITE_BACKUP_OFFHOST:-off"), 2)
        self.assertNotIn("SITE_BACKUP_OFFHOST:-file", compose)
        self.assertNotIn("s3://", compose)
        self.assertNotIn("offhost:", compose)
        self.assertIn("export SITE_BACKUP_OFFHOST=dry-run", shell)
        self.assertNotIn("SITE_BACKUP_OFFHOST_DIR=", shell)
        for text in (backup_doc, operations):
            self.assertIn(
                "This is not a configured destination and not production activation.", text
            )
            self.assertIn("No alert recipient is configured.", text)
            self.assertIn("send nothing", text)
        self.assertIn("OPS-06", operations)
        self.assertIn("mode-0600", operations)
        self.assertNotIn("off-host destination is active", operations.lower())
        self.assertNotIn("notification destination is configured", operations)


class BackupShellTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.log = self.root / "docker.log"
        self.mode = self.root / "mode"
        self.dest = self.root / "dest"
        self.key = self.root / "key"
        fake = self.root / "docker"
        fake.write_text(
            "#!/bin/sh\n"
            f"printf '%s\\n' \"$*\" >> {self.log}\n"
            'if [ "$1" = inspect ]; then\n'
            "  echo sha256:fixture\n"
            "  exit 0\n"
            "fi\n"
            f"printf '%s' \"$SITE_BACKUP_OFFHOST\" > {self.mode}\n"
            f"printf '%s' \"$SITE_BACKUP_OFFHOST_DIR\" > {self.dest}\n"
            f"printf '%s' \"$SITE_BACKUP_OFFHOST_KEY_FILE\" > {self.key}\n"
            "exit 0\n",
            encoding="utf-8",
        )
        fake.chmod(0o755)
        self.fake = fake

    def _run(self, *args: str) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env["DOCKER_COMMAND"] = str(self.fake)
        env.pop("SITE_BACKUP_OFFHOST", None)
        env.pop("SITE_BACKUP_OFFHOST_DIR", None)
        env.pop("SITE_BACKUP_OFFHOST_KEY_FILE", None)
        return subprocess.run(
            ["bash", str(ROOT / "scripts/backup-site.sh"), *args],
            check=False,
            capture_output=True,
            text=True,
            env=env,
            cwd=ROOT,
        )

    def test_usage_exits_before_docker(self) -> None:
        result = self._run("--nope")
        self.assertEqual(result.returncode, 2)
        self.assertIn("--dry-run", result.stderr)
        self.assertFalse(self.log.exists())

    def test_dry_run_exports_mode_and_does_not_set_a_destination(self) -> None:
        result = self._run("--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.mode.read_text(encoding="utf-8"), "dry-run")
        self.assertEqual(self.dest.read_text(encoding="utf-8"), "")
        self.assertEqual(self.key.read_text(encoding="utf-8"), "")
        self.assertNotIn(TOKEN, self.log.read_text(encoding="utf-8"))

    def test_default_does_not_force_a_destination(self) -> None:
        result = self._run()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.mode.read_text(encoding="utf-8"), "")
        self.assertEqual(self.dest.read_text(encoding="utf-8"), "")
        self.assertEqual(self.key.read_text(encoding="utf-8"), "")


if __name__ == "__main__":
    unittest.main()
