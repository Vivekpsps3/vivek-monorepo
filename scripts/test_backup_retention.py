"""Retention, last-good preservation, and backup-directory locking."""

import hashlib
import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = Path(__file__).with_name("backup-site.py")

WORKER = """
import importlib.util
import os
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location("backup_site_worker", os.environ["BACKUP_TOOL"])
if spec is None or spec.loader is None:
    raise RuntimeError("missing backup tool")
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)
role = os.environ["ROLE"]
real_verify = tool.verify


def verify(path):
    if role == "holder" and os.environ.get("GATE") == "1":
        held = Path(os.environ["HELD"])
        if not held.exists():
            held.write_text("held")
            release = Path(os.environ["RELEASE"])
            deadline = time.time() + 30
            while not release.exists():
                if time.time() > deadline:
                    raise TimeoutError("lock holder was not released")
                time.sleep(0.02)
    return real_verify(path)


tool.verify = verify
Path(os.environ["STARTED"]).write_text(role)
tool.backup(
    Path(os.environ["SOURCE"]),
    Path(os.environ["DIRECTORY"]),
    int(os.environ["KEEP"]),
    keep_days=int(os.environ["KEEP_DAYS"]),
)
"""


def _load_tool():
    spec = importlib.util.spec_from_file_location(f"backup_site_{uuid.uuid4().hex}", TOOL)
    if spec is None or spec.loader is None:
        raise RuntimeError("missing backup tool")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_database(path: Path) -> None:
    if path.exists():
        path.unlink()
    with sqlite3.connect(path) as db:
        db.executescript(
            """
            PRAGMA foreign_keys=ON;
            CREATE TABLE site_schema (id INTEGER PRIMARY KEY, version INTEGER NOT NULL);
            INSERT INTO site_schema (id, version) VALUES (1, 1);
            CREATE TABLE users (id INTEGER PRIMARY KEY);
            CREATE TABLE encrypted_records (id INTEGER PRIMARY KEY);
            CREATE TABLE trips (
                id INTEGER PRIMARY KEY,
                user_id INTEGER REFERENCES users(id)
            );
            CREATE TABLE user_entries (id INTEGER PRIMARY KEY);
            """
        )
    path.chmod(0o600)


class BackupRetentionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.database = self.root / "site.db"
        _write_database(self.database)
        self.tool = _load_tool()
        self.tool.print = lambda *_args, **_kwargs: None
        self.saved_env = {
            key: os.environ.get(key) for key in ("SITE_BACKUP_KEEP", "SITE_BACKUP_KEEP_DAYS")
        }
        for key in self.saved_env:
            os.environ.pop(key, None)
        self.addCleanup(self._restore_env)
        self.worker = self.root / "worker.py"
        self.worker.write_text(WORKER)

    def _restore_env(self):
        for key, value in self.saved_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def _plant(
        self,
        directory: Path,
        when: datetime,
        suffix: str,
        *,
        revision: str | None = None,
        manifest: bool = True,
        bad_sha: bool = False,
    ) -> Path:
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        stamp = when.strftime("%Y%m%dT%H%M%S")
        if revision is None:
            name = f"site-{stamp}-{suffix}.db"
            kind = "hourly"
        else:
            name = f"premigrate-{revision}-{stamp}-{suffix}.db"
            kind = "premigrate"
        path = directory / name
        path.write_bytes(self.database.read_bytes())
        path.chmod(0o600)
        if manifest:
            digest = "0" * 64 if bad_sha else hashlib.sha256(path.read_bytes()).hexdigest()
            payload: dict[str, object] = {
                "schema": 1,
                "sha256": digest,
                "created_at": when.isoformat(),
                "restore_checked": True,
                "kind": kind,
            }
            if revision is not None:
                payload["revision"] = revision
            manifest_path = path.with_suffix(".json")
            manifest_path.write_text(json.dumps(payload), encoding="utf-8")
            manifest_path.chmod(0o600)
        return path

    def _names(self, directory: Path, pattern: str) -> list[str]:
        return sorted(path.name for path in directory.glob(pattern))

    def test_a01_keeps_verified_copies_inside_thirty_days_past_the_minimum(self):
        directory = self.root / "young"
        now = datetime.now(UTC)
        planted = [
            self._plant(directory, now - timedelta(days=day), f"{day:08x}") for day in range(1, 10)
        ]
        created = self.tool.backup(self.database, directory)
        self.assertTrue(created.is_file())
        for path in planted:
            self.assertTrue(path.is_file(), path.name)
            self.assertTrue(path.with_suffix(".json").is_file())
        self.assertEqual(len(list(directory.glob("site-*.db"))), 10)

    def test_a01_keeps_seven_verified_copies_when_all_are_older_than_thirty_days(self):
        directory = self.root / "old"
        now = datetime.now(UTC)
        planted = [
            self._plant(directory, now - timedelta(days=day), f"{day:08x}") for day in range(31, 41)
        ]
        created = self.tool.backup(self.database, directory)
        remaining = set(self._names(directory, "site-*.db"))
        self.assertIn(created.name, remaining)
        self.assertEqual(len(remaining), 7)
        for path in planted[:6]:
            self.assertIn(path.name, remaining)
        for path in planted[6:]:
            self.assertNotIn(path.name, remaining)
            self.assertFalse(path.with_suffix(".json").exists())

    def test_a01_exact_thirty_day_boundary_stays_and_older_copies_can_go(self):
        now = datetime(2026, 11, 10, tzinfo=UTC)
        self.tool._utcnow = lambda: now
        directory = self.root / "boundary"
        edge = now - timedelta(days=30)
        boundary = [
            self._plant(directory, edge + timedelta(seconds=index), f"{index:08x}")
            for index in range(7)
        ]
        older = [
            self._plant(directory, edge - timedelta(seconds=index + 1), f"{index + 10:08x}")
            for index in range(2)
        ]
        created = self.tool.backup(self.database, directory)
        self.assertTrue(created.is_file())
        for path in boundary:
            self.assertTrue(path.is_file(), path.name)
        for path in older:
            self.assertFalse(path.exists(), path.name)
            self.assertFalse(path.with_suffix(".json").exists())
        self.assertEqual(len(list(directory.glob("site-*.db"))), 8)

    def test_a01_bad_checksum_or_missing_manifest_does_not_consume_a_keep_slot(self):
        directory = self.root / "unverified"
        now = datetime.now(UTC)
        verified = [
            self._plant(directory, now - timedelta(days=day), f"{day:08x}") for day in range(40, 46)
        ]
        orphan = self._plant(directory, now - timedelta(hours=1), "0a0a0a0a", manifest=False)
        corrupt = self._plant(directory, now - timedelta(days=2), "0b0b0b0b", bad_sha=True)
        created = self.tool.backup(self.database, directory)
        for path in verified:
            self.assertTrue(path.is_file(), path.name)
        self.assertTrue(orphan.is_file())
        self.assertFalse(orphan.with_suffix(".json").exists())
        self.assertTrue(corrupt.is_file())
        self.assertTrue(created.is_file())
        self.tool.verify(created)

    def test_a01_pre_migration_revisions_stay_outside_the_hourly_window(self):
        directory = self.root / "split"
        now = datetime.now(UTC)
        premigrations = []
        for index, revision in enumerate(("rev_a", "rev_b", "rev_c", "rev_d")):
            premigrations.append(
                self._plant(
                    directory,
                    now - timedelta(days=100 - index),
                    f"{index:08x}",
                    revision=revision,
                )
            )
        for day in range(31, 41):
            self._plant(directory, now - timedelta(days=day), f"{day:08x}")
        self.tool.backup(self.database, directory)
        self.assertEqual(
            self._names(directory, "premigrate-*.db"),
            sorted(path.name for path in premigrations),
        )
        self.assertEqual(len(list(directory.glob("site-*.db"))), 7)
        self.tool.backup(self.database, directory, kind="premigrate", revision="rev_e")
        names = self._names(directory, "premigrate-*.db")
        self.assertEqual(len(names), 3)
        self.assertTrue(any(name.startswith("premigrate-rev_e-") for name in names))
        self.assertTrue(any(name.startswith("premigrate-rev_d-") for name in names))
        self.assertTrue(any(name.startswith("premigrate-rev_c-") for name in names))
        self.assertFalse(any(name.startswith("premigrate-rev_a-") for name in names))
        self.assertEqual(len(list(directory.glob("site-*.db"))), 7)

    def test_a01_hourly_environment_does_not_widen_pre_migration_retention(self):
        os.environ["SITE_BACKUP_KEEP"] = "7"
        os.environ["SITE_BACKUP_KEEP_DAYS"] = "30"
        directory = self.root / "premigrate-floor"
        for revision in ("rev_a", "rev_b", "rev_c", "rev_d"):
            self.tool.backup(self.database, directory, kind="premigrate", revision=revision)
        self.assertEqual(len(list(directory.glob("premigrate-*.db"))), 3)
        for index in range(5):
            self.tool.backup(
                self.database,
                self.root / "premigrate-raised",
                4,
                kind="premigrate",
                revision=f"rev_{index}",
            )
        self.assertEqual(len(list((self.root / "premigrate-raised").glob("premigrate-*.db"))), 4)

    def test_deletion_minimum_one_still_keeps_the_age_window(self):
        now = datetime.now(UTC)
        young = self.root / "young-min-one"
        planted = [
            self._plant(young, now - timedelta(days=day), f"{day:08x}") for day in range(1, 4)
        ]
        created = self.tool.backup(self.database, young, keep=1, keep_days=30)
        self.assertTrue(created.is_file())
        for path in planted:
            self.assertTrue(path.is_file())
        old = self.root / "old-min-one"
        for day in range(31, 36):
            self._plant(old, now - timedelta(days=day), f"{day:08x}")
        only = self.tool.backup(self.database, old, keep=1, keep_days=30)
        self.assertEqual(list(old.glob("site-*.db")), [only])
        os.environ["SITE_BACKUP_KEEP"] = "1"
        inherited = self.root / "inherited-min-one"
        inherited_plants = [
            self._plant(inherited, now - timedelta(days=day), f"{day:08x}") for day in (2, 4)
        ]
        inherited_new = self.tool.backup(self.database, inherited)
        for path in inherited_plants:
            self.assertTrue(path.is_file())
        self.assertTrue(inherited_new.is_file())

    def test_a02_failed_verification_does_not_publish_a_manifest(self):
        directory = self.root / "verify-fail"
        good = self.tool.backup(self.database, directory)
        real_verify = self.tool.verify

        def fail(_path):
            raise RuntimeError("verification failed")

        self.tool.verify = fail
        before = self._names(directory, "site-*")
        with self.assertRaisesRegex(RuntimeError, "verification failed"):
            self.tool.backup(self.database, directory)
        self.assertEqual(self._names(directory, "site-*"), before)
        self.assertEqual(real_verify(good)["schema"], 1)
        manifest = json.loads(good.with_suffix(".json").read_text(encoding="utf-8"))
        self.assertTrue(manifest["restore_checked"])
        self.assertEqual(manifest["sha256"], hashlib.sha256(good.read_bytes()).hexdigest())

    def test_a02_missing_corrupt_and_foreign_key_sources_keep_the_last_good_snapshot(self):
        directory = self.root / "faults"
        good = self.tool.backup(self.database, directory)
        before = self._names(directory, "site-*")
        missing = self.root / "missing.db"
        with self.assertRaisesRegex(RuntimeError, "missing"):
            self.tool.backup(missing, directory)
        self.assertEqual(self._names(directory, "site-*"), before)

        saved = self.database.read_bytes()
        self.database.write_bytes(b"not a sqlite database")
        with self.assertRaises((RuntimeError, sqlite3.DatabaseError)):
            self.tool.backup(self.database, directory)
        self.assertEqual(self._names(directory, "site-*"), before)
        self.database.write_bytes(saved)

        with sqlite3.connect(self.database) as db:
            db.execute("PRAGMA foreign_keys=OFF")
            db.execute("INSERT INTO trips (id, user_id) VALUES (1, 999)")
        with self.assertRaisesRegex(RuntimeError, "foreign key"):
            self.tool.backup(self.database, directory)
        self.assertEqual(self._names(directory, "site-*"), before)
        self.assertEqual(self.tool.verify(good)["schema"], 1)

    def test_a02_interrupted_manifest_publish_removes_the_partial_snapshot(self):
        directory = self.root / "interrupt"
        good = self.tool.backup(self.database, directory)
        real_link = self.tool.os.link

        def link(src, dst, *, follow_symlinks=True):
            if str(dst).endswith(".json"):
                raise OSError("interrupted publish")
            return real_link(src, dst, follow_symlinks=follow_symlinks)

        self.tool.os.link = link
        self.addCleanup(lambda: setattr(self.tool.os, "link", real_link))
        before = self._names(directory, "site-*")
        with self.assertRaises(OSError):
            self.tool.backup(self.database, directory)
        self.assertEqual(self._names(directory, "site-*"), before)
        self.assertEqual(list(directory.glob(".backup-*")), [])
        manifest = json.loads(good.with_suffix(".json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["sha256"], hashlib.sha256(good.read_bytes()).hexdigest())

    def test_a02_cli_missing_source_exits_without_a_success_manifest(self):
        directory = self.root / "cli"
        directory.mkdir()
        env = os.environ.copy()
        env.pop("SITE_BACKUP_KEEP", None)
        env.pop("SITE_BACKUP_KEEP_DAYS", None)
        result = subprocess.run(
            [
                sys.executable,
                str(TOOL),
                "--source",
                str(self.root / "absent.db"),
                "--directory",
                str(directory),
            ],
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(list(directory.glob("site-*")), [])
        self.assertNotIn("restore_checked", result.stdout)

    def _spawn(self, directory: Path, role: str, keep: int, keep_days: int, gate: bool):
        env = os.environ.copy()
        env.pop("SITE_BACKUP_KEEP", None)
        env.pop("SITE_BACKUP_KEEP_DAYS", None)
        env.update(
            {
                "BACKUP_TOOL": str(TOOL),
                "SOURCE": str(self.database),
                "DIRECTORY": str(directory),
                "ROLE": role,
                "KEEP": str(keep),
                "KEEP_DAYS": str(keep_days),
                "GATE": "1" if gate else "0",
                "HELD": str(self.root / f"held-{role}"),
                "RELEASE": str(self.root / "release"),
                "STARTED": str(self.root / f"started-{role}"),
            }
        )
        return subprocess.Popen(
            [sys.executable, str(self.worker)],
            cwd=ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def _published(self, stdout: str, stderr: str, returncode: int) -> Path:
        self.assertEqual(returncode, 0, stderr)
        payload = json.loads(stdout)
        self.assertIsInstance(payload, dict)
        path = Path(str(payload["backup"]))
        self.assertTrue(path.is_file(), stderr)
        manifest = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertTrue(manifest["restore_checked"])
        self.assertEqual(manifest["kind"], "hourly")
        self.tool.verify(path)
        return path

    def test_a03_directory_lock_blocks_the_second_job_until_publish_can_finish(self):
        directory = self.root / "locked"
        directory.mkdir(mode=0o700)
        release = self.root / "release"
        holder = self._spawn(directory, "holder", keep=7, keep_days=30, gate=True)
        waiter = None
        try:
            self.assertTrue(
                self._wait(self.root / "held-holder", 30), "holder did not take the lock"
            )
            waiter = self._spawn(directory, "waiter", keep=7, keep_days=30, gate=False)
            self.assertTrue(self._wait(self.root / "started-waiter", 30))
            time.sleep(2)
            self.assertIsNone(waiter.poll())
            self.assertEqual(list(directory.glob("site-*.db")), [])
            self.assertEqual(len(list(directory.glob(".backup-*"))), 1)
            release.write_text("go")
            holder_out, holder_err = holder.communicate(timeout=60)
            waiter_out, waiter_err = waiter.communicate(timeout=60)
        finally:
            release.write_text("go")
            for proc in (holder, waiter):
                if proc is not None and proc.poll() is None:
                    proc.kill()
                    proc.wait(timeout=10)
        first = self._published(holder_out, holder_err, holder.returncode)
        second = self._published(waiter_out, waiter_err, waiter.returncode)
        self.assertNotEqual(first, second)
        self.assertEqual(len(list(directory.glob("site-*.db"))), 2)
        self.assertEqual(len(list(directory.glob("site-*.json"))), 2)
        self.assertEqual(list(directory.glob(".backup-*")), [])

    def test_a03_overlapping_prune_keeps_each_published_snapshot_and_its_manifest(self):
        directory = self.root / "overlap"
        now = datetime.now(UTC)
        for day in range(31, 40):
            self._plant(directory, now - timedelta(days=day), f"{day:08x}")
        jobs = [
            self._spawn(directory, f"job{index}", keep=7, keep_days=30, gate=False)
            for index in range(2)
        ]
        try:
            finished = [job.communicate(timeout=60) for job in jobs]
        finally:
            for job in jobs:
                if job.poll() is None:
                    job.kill()
                    job.wait(timeout=10)
        published = [
            self._published(stdout, stderr, job.returncode)
            for job, (stdout, stderr) in zip(jobs, finished, strict=True)
        ]
        remaining = {path.name for path in directory.glob("site-*.db")}
        self.assertTrue(all(path.name in remaining for path in published))
        self.assertEqual(len(remaining), 7)
        for manifest in directory.glob("site-*.json"):
            database = manifest.with_suffix(".db")
            self.assertTrue(database.is_file())
            payload = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual(payload["sha256"], hashlib.sha256(database.read_bytes()).hexdigest())
        self.assertEqual(list(directory.glob(".backup-*")), [])

    def _wait(self, path: Path, timeout: float) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if path.exists():
                return True
            time.sleep(0.02)
        return False

    def test_rejects_a_non_positive_minimum_or_a_negative_age(self):
        with self.assertRaisesRegex(ValueError, "At least one"):
            self.tool.backup(self.database, self.root / "zero", keep=0)
        with self.assertRaisesRegex(ValueError, "cannot be negative"):
            self.tool.backup(self.database, self.root / "negative", keep_days=-1)
        self.assertFalse((self.root / "zero").exists())


class BackupPolicyDocumentTests(unittest.TestCase):
    def test_deletion_docs_and_compose_use_one_age_and_minimum_policy(self):
        compose = (ROOT / "compose.yml").read_text(encoding="utf-8")
        backup = (ROOT / "docs/BACKUP.md").read_text(encoding="utf-8")
        operations = (ROOT / "docs/OPERATIONS.md").read_text(encoding="utf-8")
        migrations = (ROOT / "docs/MIGRATIONS.md").read_text(encoding="utf-8")
        followups = (ROOT / "docs/SRE-FOLLOWUPS.md").read_text(encoding="utf-8")
        self.assertEqual(compose.count('SITE_BACKUP_KEEP: "7"'), 2)
        self.assertEqual(compose.count('SITE_BACKUP_KEEP_DAYS: "30"'), 2)
        self.assertNotIn('SITE_BACKUP_KEEP: "1"', compose)
        for text in (backup, operations, migrations, followups):
            self.assertNotIn("notification destination is configured", text)
            self.assertNotIn("off-host destination is active", text)
        for text in (backup, operations):
            self.assertIn("seven", text.lower())
            self.assertIn("30", text)
            self.assertIn("three", text.lower())
        self.assertNotIn("keeps one verified hourly", backup.lower())
        self.assertNotIn("SITE_BACKUP_KEEP=1", backup)
        self.assertNotIn("one in production", migrations)
        self.assertNotIn("not the current Compose setting", followups)
        self.assertNotIn("Only the latest verified unified backup is retained", operations)
