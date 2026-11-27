"""Disposable all-domain restore drill: preservation, refusal, and cleanup."""

import hashlib
import importlib.util
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DRILL_PATH = ROOT / "scripts" / "restore-drill.py"
BACKUP_PATH = ROOT / "scripts" / "backup-site.py"
NOW = "2026-01-15 00:00:00"
CIPHERTEXT = "CIPHERTEXT-MARKER-DO-NOT-PRINT"
VAULT = "VAULT-MARKER-DO-NOT-PRINT"
INDEX = "INDEX-MARKER-DO-NOT-PRINT"
EMAIL = "owner-marker@example.test"
KEY = b"drill-key-material!!0123456789ab"
ENV_KEYS = (
    "SITE_BACKUP_DIR",
    "SITE_DATABASE_URL",
    "SITE_BACKUP_OFFHOST",
    "SITE_BACKUP_OFFHOST_DIR",
    "SITE_BACKUP_OFFHOST_KEY_FILE",
    "SITE_BACKUP_KEEP",
    "SITE_BACKUP_KEEP_DAYS",
)
EXPECTED_OWNERS = {
    "album_ratings": 1,
    "encrypted_record_indexes": 1,
    "encrypted_records": 3,
    "episode_progress": 1,
    "experiences": 1,
    "habit_cadences": 1,
    "habit_checkins": 1,
    "habits": 1,
    "leave_policies": 1,
    "pto_entries": 1,
    "pto_policy": 1,
    "season_progress": 1,
    "town_quest_journals": 0,
    "town_quest_steps": 0,
    "town_room_layouts": 0,
    "town_stamp_entitlements": 0,
    "town_stamp_receipts": 0,
    "town_stamp_wallets": 0,
    "track_ratings": 1,
    "trip_drafts": 0,
    "trips": 1,
    "user_entries": 1,
    "user_vaults": 2,
    "users": 2,
    "world_concepts": 1,
}


def _load(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"missing {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _clear_backup_env() -> None:
    for key in ENV_KEYS:
        os.environ.pop(key, None)


def _plant(path: Path) -> None:
    from apps.server.migrations import adopt_or_upgrade, sqlite_url

    adopt_or_upgrade(sqlite_url(path))
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute(
            """
            INSERT INTO users (
                id, email, display_name, role, is_active, must_change_password,
                created_at, updated_at, pixels_show_age
            ) VALUES (1, ?, 'Synthetic Owner', 'user', 1, 0, ?, ?, 0)
            """,
            (EMAIL, NOW, NOW),
        )
        db.execute(
            """
            INSERT INTO users (
                id, email, display_name, role, is_active, must_change_password,
                created_at, updated_at, pixels_show_age
            ) VALUES (2, 'second-owner@example.test', 'Second Owner', 'user', 1, 0, ?, ?, 0)
            """,
            (NOW, NOW),
        )
        for user_id in (1, 2):
            db.execute(
                """
                INSERT INTO user_vaults (
                    user_id, kdf_algorithm, kdf_salt_b64, kdf_iterations,
                    wrapped_dek_b64, recovery_wrapped_dek_b64, key_version,
                    created_at, updated_at
                ) VALUES (?, 'PBKDF2', 'synthetic-salt', 600000, ?, '', 1, ?, ?)
                """,
                (user_id, VAULT, NOW, NOW),
            )
        records = (
            (1, "transactions", "synthetic-1", f"{CIPHERTEXT}-1"),
            (1, "assets", "synthetic-2", f"{CIPHERTEXT}-2"),
            (2, "liabilities", "synthetic-3", f"{CIPHERTEXT}-3"),
        )
        for user_id, collection, client_id, ciphertext in records:
            db.execute(
                """
                INSERT INTO encrypted_records (
                    user_id, collection, client_id, ciphertext_b64,
                    schema_version, key_version, revision, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 1, 1, 1, ?, ?)
                """,
                (user_id, collection, client_id, ciphertext, NOW, NOW),
            )
        db.execute(
            """
            INSERT INTO encrypted_record_indexes (
                user_id, collection, client_id, index_name, index_value_b64, created_at
            ) VALUES (1, 'transactions', 'synthetic-1', 'seed', ?, ?)
            """,
            (INDEX, NOW),
        )
        db.execute(
            """
            INSERT INTO trips (
                id, user_id, title, start_date, end_date, status, counts_as_pto,
                created_at, updated_at
            ) VALUES (1, 1, 'Synthetic trip', '2026-02-01', '2026-02-03', 'planning', 0, ?, ?)
            """,
            (NOW, NOW),
        )
        db.execute(
            """
            INSERT INTO pto_policy (
                user_id, configured, accrual_amount, accrual_unit, accrual_cadence,
                hours_per_day, balance_days, balance_as_of
            ) VALUES (1, 0, '0', 'day', 'yearly', '8', '0', '2026-01-01')
            """
        )
        db.execute(
            """
            INSERT INTO leave_policies (
                user_id, bucket, configured, start_balance_hours, balance_as_of,
                accrual_hours, accrual_cadence, year_start, carry_forward,
                accrual_mode, accrual_version
            ) VALUES (1, 'pto', 0, '0', '2026-01-01', '0', 'yearly', '01-01', 1, 'daily', 0)
            """
        )
        db.execute(
            """
            INSERT INTO pto_entries (
                user_id, trip_id, start_date, end_date, days, label, kind, bucket
            ) VALUES (1, 1, '2026-02-01', '2026-02-03', '1', 'Synthetic leave', 'manual', 'pto')
            """
        )
        db.execute(
            """
            INSERT INTO catalog_items (
                id, kind, title, title_sort, source, source_id, created_at, updated_at
            ) VALUES (1, 'movie', 'Lantern Tide', 'lantern tide', 'manual', 'synthetic-1', ?, ?)
            """,
            (NOW, NOW),
        )
        db.execute(
            """
            INSERT INTO user_entries (
                id, user_id, catalog_id, status, review_spoiler, favorite, anticipated,
                created_at, updated_at
            ) VALUES (1, 1, 1, 'want', 0, 0, 0, ?, ?)
            """,
            (NOW, NOW),
        )
        db.execute(
            """
            INSERT INTO experiences (user_id, entry_id, kind, spoiler, created_at)
            VALUES (1, 1, 'listen', 0, ?)
            """,
            (NOW,),
        )
        db.execute(
            """
            INSERT INTO episodes (id, catalog_id, season_number, episode_number)
            VALUES (1, 1, 1, 1)
            """
        )
        db.execute(
            """
            INSERT INTO season_progress (user_id, entry_id, season_number, watched)
            VALUES (1, 1, 1, 1)
            """
        )
        db.execute(
            """
            INSERT INTO episode_progress (user_id, episode_id, watched)
            VALUES (1, 1, 1)
            """
        )
        db.execute(
            """
            INSERT INTO music_albums (id, catalog_id, title, position, source_id)
            VALUES (1, 1, 'Second Pressing', 0, 'album-1')
            """
        )
        db.execute(
            """
            INSERT INTO music_tracks (id, album_id, title, position, source_id)
            VALUES (1, 1, 'Blue Platform', 0, 'track-1')
            """
        )
        db.execute(
            """
            INSERT INTO album_ratings (user_id, entry_id, album_id, rating)
            VALUES (1, 1, 1, 4)
            """
        )
        db.execute(
            """
            INSERT INTO track_ratings (user_id, entry_id, track_id, rating)
            VALUES (1, 1, 1, 5)
            """
        )
        db.execute(
            """
            INSERT INTO habits (
                id, user_id, name, slot, building_style, per_week, created_on,
                created_at, name_key
            ) VALUES (1, 1, 'Stretch', 1, 'forge', 3, '2026-01-15', ?, 'stretch')
            """,
            (NOW,),
        )
        db.execute(
            """
            INSERT INTO habit_checkins (habit_id, user_id, day, created_at)
            VALUES (1, 1, '2026-01-15', ?)
            """,
            (NOW,),
        )
        db.execute(
            """
            INSERT INTO habit_cadences (habit_id, user_id, per_week, effective_from, created_at)
            VALUES (1, 1, 3, '2026-01-15', ?)
            """,
            (NOW,),
        )
        db.execute(
            """
            INSERT INTO world_concepts (
                user_id, name, name_key, created_at, updated_at
            ) VALUES (2, 'Harbor', 'harbor', ?, ?)
            """,
            (NOW, NOW),
        )
        integrity = db.execute("PRAGMA integrity_check").fetchone()
        foreign = db.execute("PRAGMA foreign_key_check").fetchall()
        db.commit()
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    if integrity != ("ok",) or foreign:
        raise RuntimeError(f"synthetic database failed checks: {integrity} {foreign}")


class RestoreDrillTests(unittest.TestCase):
    _saved_env: dict[str, str | None]
    _base: tempfile.TemporaryDirectory[str]
    base_db: Path
    drill: Any
    backup: Any
    tmp: tempfile.TemporaryDirectory[str]
    root: Path
    source: Path
    backups: Path
    snapshot: Path
    snapshot_bytes: bytes
    manifest_bytes: bytes
    source_bytes: bytes
    work: Path

    @classmethod
    def setUpClass(cls) -> None:
        cls._saved_env = {key: os.environ.get(key) for key in ENV_KEYS}
        _clear_backup_env()
        cls._base = tempfile.TemporaryDirectory()
        cls.base_db = Path(cls._base.name) / "synthetic.db"
        _plant(cls.base_db)
        cls.base_db.chmod(0o600)
        cls.drill = _load(f"restore_drill_{uuid.uuid4().hex}", DRILL_PATH)
        cls.backup = _load(f"backup_site_{uuid.uuid4().hex}", BACKUP_PATH)
        cls.backup.print = lambda *_args, **_kwargs: None

    @classmethod
    def tearDownClass(cls) -> None:
        cls._base.cleanup()
        for key, value in cls._saved_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def setUp(self) -> None:
        _clear_backup_env()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / "synthetic.db"
        shutil.copy(self.base_db, self.source)
        self.source.chmod(0o600)
        self.backups = self.root / "backups"
        self.backup.backup(self.source, self.backups, keep=7, keep_days=30)
        self.snapshot = next(self.backups.glob("site-*.db"))
        self.snapshot_bytes = self.snapshot.read_bytes()
        self.manifest_bytes = self.snapshot.with_suffix(".json").read_bytes()
        self.source_bytes = self.source.read_bytes()
        self.work = self.root / "work"
        self.work.mkdir()

    def assert_untouched(self) -> None:
        self.assertEqual(self.snapshot.read_bytes(), self.snapshot_bytes)
        self.assertEqual(self.snapshot.with_suffix(".json").read_bytes(), self.manifest_bytes)
        self.assertEqual(self.source.read_bytes(), self.source_bytes)
        self.assertEqual(
            sorted(path.name for path in self.backups.iterdir()),
            sorted(
                name
                for name in (
                    self.snapshot.name,
                    self.snapshot.with_suffix(".json").name,
                )
            ),
        )

    def _copy_snapshot(self, directory: Path) -> Path:
        directory.mkdir()
        target = directory / self.snapshot.name
        shutil.copy(self.snapshot, target)
        shutil.copy(self.snapshot.with_suffix(".json"), target.with_suffix(".json"))
        return target

    def _commit(self, target: Path, sql: str, params: tuple[object, ...] = ()) -> None:
        with sqlite3.connect(target) as db:
            db.execute(sql, params)
            db.commit()
        with sqlite3.connect(target) as db:
            db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        for suffix in ("-wal", "-shm"):
            Path(f"{target}{suffix}").unlink(missing_ok=True)

    def _rewrite_manifest(self, target: Path, **changes: object) -> None:
        payload = json.loads(target.with_suffix(".json").read_text(encoding="utf-8"))
        payload.update(changes)
        payload["sha256"] = hashlib.sha256(target.read_bytes()).hexdigest()
        target.with_suffix(".json").write_text(json.dumps(payload), encoding="utf-8")

    def _refuse(self, reason: str, source: Path | None = None, **kwargs):
        with self.assertRaises(self.drill.DrillRefused) as caught:
            self.drill.drill(source or self.snapshot, **kwargs)
        self.assertEqual(caught.exception.reason, reason)
        self.assertFalse(
            any(
                path.name.startswith("restore-drill-")
                for path in self.work.iterdir()
                if path != kwargs.get("destination")
            )
        )
        self.assert_untouched()

    def test_a01_seeded_restore_matches_schema_owners_ciphertext_and_duration(self):
        from apps.server.migrations import head_revision

        report = self.drill.drill(self.snapshot, parent=self.work)
        self.assertEqual(report["event"], "restore_drill")
        self.assertTrue(report["synthetic"])
        self.assertFalse(report["production_restore"])
        self.assertFalse(report["production_rpo_established"])
        self.assertFalse(report["production_rto_established"])
        self.assertFalse(report["offhost_activated"])
        self.assertFalse(report["authenticated_decryption"])
        self.assertTrue(report["checksum_ok"])
        self.assertEqual(report["integrity"], "ok")
        self.assertEqual(report["foreign_keys"], "ok")
        self.assertEqual(report["schema_version"], 1)
        self.assertEqual(report["schema_head"], head_revision())
        self.assertTrue(report["schema_head_ok"])
        self.assertEqual(report["owners"], EXPECTED_OWNERS)
        self.assertEqual(report["owner_orphans"], 0)
        self.assertEqual(
            report["ciphertext"]["collections"],
            {"assets": 1, "liabilities": 1, "transactions": 1},
        )
        self.assertEqual(report["ciphertext"]["records"], 3)
        self.assertEqual(report["ciphertext"]["nonempty"], 3)
        self.assertEqual(
            set(report["domains"]), {"identity", "finance", "travel", "media", "town", "world"}
        )
        self.assertNotIn("other", report["domains"])
        self.assertEqual(report["comparison"]["local_rpo"], "within_objective")
        self.assertEqual(report["comparison"]["offhost_rpo"], "within_objective")
        self.assertEqual(report["comparison"]["restore_rto"], "within_objective")
        self.assertFalse(report["comparison"]["production_rpo_established"])
        self.assertFalse(report["comparison"]["production_rto_established"])
        self.assertGreaterEqual(report["duration_seconds"], 0)
        self.assertLess(report["duration_seconds"], self.drill.RESTORE_RTO_SECONDS)
        self.assertGreaterEqual(report["data_loss_window_seconds"], 0)
        self.assertLess(report["data_loss_window_seconds"], self.drill.LOCAL_RPO_SECONDS)
        self.assertEqual(report["objectives"]["local_rpo_seconds"], 3600)
        self.assertEqual(report["objectives"]["offhost_rpo_seconds"], 86400)
        self.assertEqual(report["objectives"]["restore_rto_seconds"], 14400)
        rendered = json.dumps(report)
        for marker in (CIPHERTEXT, VAULT, INDEX, EMAIL, "drill-key-material"):
            self.assertNotIn(marker, rendered)
        destination = Path(report["destination"])
        restored = destination / "restored.db"
        self.assertTrue(restored.is_file())
        self.assertEqual(
            (destination / ".restore-drill-owned").read_text(encoding="utf-8"), destination.name
        )
        with sqlite3.connect(restored.resolve().as_uri() + "?mode=ro", uri=True) as db:
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone(), ("ok",))
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
            self.assertEqual(
                db.execute("SELECT version_num FROM site_alembic_version").fetchone()[0],
                head_revision(),
            )
            self.assertEqual(db.execute("SELECT COUNT(*) FROM trips").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM users").fetchone()[0], 2)
            stored = db.execute("SELECT ciphertext_b64 FROM encrypted_records").fetchall()
        self.assertIn((f"{CIPHERTEXT}-1",), stored)
        self.assert_untouched()

    def test_a01_sealed_snapshot_decrypts_without_activating_offhost(self):
        payload = json.loads(self.manifest_bytes)
        header = self.backup._object_header(payload, len(self.snapshot_bytes))
        sealed = self.root / "envelopes" / "snapshot.psbk"
        sealed.parent.mkdir()
        sealed.write_bytes(self.backup.seal(self.snapshot_bytes, KEY, header))
        key_file = self.root / "recovery.key"
        key_file.write_bytes(KEY)
        key_file.chmod(0o600)
        offhost = self.root / "offhost"
        offhost.mkdir(mode=0o700)
        os.environ["SITE_BACKUP_OFFHOST"] = "file"
        os.environ["SITE_BACKUP_OFFHOST_DIR"] = str(offhost)
        os.environ["SITE_BACKUP_OFFHOST_KEY_FILE"] = str(key_file)
        report = self.drill.drill(sealed, parent=self.work, key_file=key_file, sealed=True)
        self.assertTrue(report["authenticated_decryption"])
        self.assertEqual(report["owners"], EXPECTED_OWNERS)
        self.assertFalse(report["offhost_activated"])
        self.assertFalse(report["production_restore"])
        self.assertEqual(list(offhost.iterdir()), [])
        rendered = json.dumps(report)
        self.assertNotIn("drill-key-material", rendered)
        self.assertNotIn(CIPHERTEXT, rendered)
        self.assert_untouched()

    def test_a01_old_snapshot_records_local_objective_miss_without_production_claim(self):
        copy = self._copy_snapshot(self.root / "aged")
        payload = json.loads(copy.with_suffix(".json").read_text(encoding="utf-8"))
        payload["created_at"] = (datetime.now(UTC) - timedelta(hours=2)).isoformat()
        copy.with_suffix(".json").write_text(json.dumps(payload), encoding="utf-8")
        report = self.drill.drill(copy, parent=self.work)
        self.assertEqual(report["comparison"]["local_rpo"], "outside_objective")
        self.assertEqual(report["comparison"]["offhost_rpo"], "within_objective")
        self.assertEqual(report["comparison"]["restore_rto"], "within_objective")
        self.assertFalse(report["production_rpo_established"])
        self.assertFalse(report["production_rto_established"])
        self.assertFalse(report["production_restore"])
        self.assertGreaterEqual(report["data_loss_window_seconds"], 7200)
        self.assert_untouched()

    def test_objectives_stay_unclaimed_on_either_side_of_the_limits(self):
        within = self.drill.compare_objectives(3600, 14400)
        outside = self.drill.compare_objectives(3601, 14401)
        far = self.drill.compare_objectives(86401, 1)
        self.assertEqual(within["local_rpo"], "within_objective")
        self.assertEqual(within["offhost_rpo"], "within_objective")
        self.assertEqual(within["restore_rto"], "within_objective")
        self.assertEqual(outside["local_rpo"], "outside_objective")
        self.assertEqual(outside["offhost_rpo"], "within_objective")
        self.assertEqual(outside["restore_rto"], "outside_objective")
        self.assertEqual(far["offhost_rpo"], "outside_objective")
        for result in (within, outside, far):
            self.assertFalse(result["production_rpo_established"])
            self.assertFalse(result["production_rto_established"])

    def test_a02_nonempty_and_existing_targets_refuse_before_write(self):
        destination = self.work / "restore-drill-existing"
        destination.mkdir()
        sentinel = destination / "sentinel"
        sentinel.write_text("keep", encoding="utf-8")
        self._refuse("nonempty", destination=destination)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")
        empty = self.work / "restore-drill-empty"
        empty.mkdir()
        with self.assertRaises(self.drill.DrillRefused) as caught:
            self.drill.drill(self.snapshot, destination=empty)
        self.assertEqual(caught.exception.reason, "target")
        self.assertEqual(list(empty.iterdir()), [])
        self.assert_untouched()

    def test_a02_production_targets_and_live_database_are_refused(self):
        self.assertTrue(self.drill.production_like(Path("/data/site.db")))
        self.assertTrue(
            self.drill.production_like(Path("/var/lib/docker/volumes/personal-site_data/_data"))
        )
        volume = self.root / "personal-site_backups"
        volume.mkdir()
        snapshot = volume / self.snapshot.name
        shutil.copy(self.snapshot, snapshot)
        shutil.copy(self.snapshot.with_suffix(".json"), snapshot.with_suffix(".json"))
        sentinel = volume / "LAST-GOOD"
        sentinel.write_text("keep", encoding="utf-8")
        with self.assertRaises(self.drill.DrillRefused) as caught:
            self.drill.drill(snapshot, parent=self.work)
        self.assertEqual(caught.exception.reason, "production-target")
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")
        self.assertEqual(snapshot.read_bytes(), self.snapshot_bytes)
        self.assertFalse(self.work.exists() and any(self.work.iterdir()))
        live = self.root / ".local" / "data" / "site.db"
        live.parent.mkdir(parents=True)
        live.write_bytes(b"live-database")
        with self.assertRaises(self.drill.DrillRefused) as live_caught:
            self.drill.drill(live, parent=self.work)
        self.assertEqual(live_caught.exception.reason, "production-target")
        self.assertEqual(live.read_bytes(), b"live-database")
        self.assert_untouched()

    def test_a02_corrupt_checksum_wrong_version_and_unsupported_preserve_backups(self):
        bad_sum = self._copy_snapshot(self.root / "bad-sum")
        payload = json.loads(bad_sum.with_suffix(".json").read_text(encoding="utf-8"))
        payload["sha256"] = "0" * 64
        bad_sum.with_suffix(".json").write_text(json.dumps(payload), encoding="utf-8")
        self._refuse("checksum", bad_sum, parent=self.work)

        old = self._copy_snapshot(self.root / "old-revision")
        self._commit(old, "UPDATE site_alembic_version SET version_num='site_schema_v1'")
        self._rewrite_manifest(old)
        self._refuse("wrong-version", old, parent=self.work)

        unsupported = self._copy_snapshot(self.root / "unsupported")
        self._commit(unsupported, "UPDATE site_schema SET version=2 WHERE id=1")
        self._rewrite_manifest(unsupported)
        self._refuse("unsupported", unsupported, parent=self.work)

        corrupt = self._copy_snapshot(self.root / "corrupt")
        mutated = bytearray(corrupt.read_bytes())
        mutated[100] ^= 0xFF
        corrupt.write_bytes(mutated)
        self._rewrite_manifest(corrupt)
        with self.assertRaises(self.drill.DrillRefused) as caught:
            self.drill.drill(corrupt, parent=self.work)
        self.assertIn(caught.exception.reason, {"corrupt", "unsupported"})
        self.assertEqual(list(self.work.iterdir()), [])
        self.assert_untouched()

    def test_a02_bad_seal_refuses_before_a_destination_exists(self):
        payload = json.loads(self.manifest_bytes)
        header = self.backup._object_header(payload, len(self.snapshot_bytes))
        sealed = self.root / "envelopes" / "snapshot.psbk"
        sealed.parent.mkdir()
        sealed.write_bytes(self.backup.seal(self.snapshot_bytes, KEY, header))
        wrong = self.root / "wrong.key"
        wrong.write_bytes(b"b" * 32)
        wrong.chmod(0o600)
        with self.assertRaises(self.drill.DrillRefused) as caught:
            self.drill.drill(sealed, parent=self.work, key_file=wrong, sealed=True)
        self.assertEqual(caught.exception.reason, "authentication")
        self.assertEqual(list(self.work.iterdir()), [])
        self.assert_untouched()

    def test_a03_interrupt_removes_only_the_drill_directory(self):
        sibling = self.work / "keep.txt"
        sibling.write_text("keep", encoding="utf-8")
        seen: list[Path] = []

        def interrupt() -> None:
            found = [path for path in self.work.iterdir() if path.name.startswith("restore-drill-")]
            self.assertEqual(len(found), 1)
            self.assertTrue((found[0] / "restored.db").is_file())
            seen.append(found[0])
            raise RuntimeError("interrupted")

        with self.assertRaises(self.drill.DrillRefused) as caught:
            self.drill.drill(self.snapshot, parent=self.work, interrupt=interrupt)
        self.assertEqual(caught.exception.reason, "interrupted")
        self.assertEqual(len(seen), 1)
        self.assertFalse(seen[0].exists())
        self.assertEqual(sibling.read_text(encoding="utf-8"), "keep")
        self.assert_untouched()

    def test_a03_repeat_and_cleanup_are_idempotent_and_refuse_foreign_paths(self):
        destination = self.work / "restore-drill-retry"
        first = self.drill.drill(self.snapshot, destination=destination)
        self.assertEqual(self.drill.cleanup(destination)["removed"], True)
        self.assertFalse(destination.exists())
        second = self.drill.drill(self.snapshot, destination=destination)
        self.assertEqual(first["owners"], second["owners"])
        again = self.drill.cleanup(destination)
        self.assertEqual(again["removed"], True)
        absent = self.drill.cleanup(destination)
        self.assertEqual(absent["removed"], False)
        self.assert_untouched()

        first_dir = self.drill.drill(self.snapshot, parent=self.work)
        second_dir = self.drill.drill(self.snapshot, parent=self.work)
        self.assertNotEqual(first_dir["destination"], second_dir["destination"])
        self.drill.cleanup(Path(first_dir["destination"]))
        self.assertFalse(Path(first_dir["destination"]).exists())
        self.assertTrue(Path(second_dir["destination"]).is_dir())

        unmarked = self.work / "restore-drill-manual"
        unmarked.mkdir()
        sentinel = unmarked / "sentinel"
        sentinel.write_text("keep", encoding="utf-8")
        with self.assertRaises(self.drill.DrillRefused) as unmarked_caught:
            self.drill.cleanup(unmarked)
        self.assertEqual(unmarked_caught.exception.reason, "not-owned")
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")

        linked_target = self.work / "linked-target"
        linked_target.mkdir()
        (linked_target / "sentinel").write_text("keep", encoding="utf-8")
        link = self.work / "restore-drill-link"
        link.symlink_to(linked_target, target_is_directory=True)
        with self.assertRaises(self.drill.DrillRefused) as link_caught:
            self.drill.cleanup(link)
        self.assertEqual(link_caught.exception.reason, "not-owned")
        self.assertEqual((linked_target / "sentinel").read_text(encoding="utf-8"), "keep")
        self.assertTrue(link.is_symlink())

        bait = self.work / "restore-drill-bait"
        bait.mkdir()
        (bait / ".restore-drill-owned").write_text(bait.name, encoding="utf-8")
        planted = bait / self.snapshot.name
        planted.write_bytes(b"last-good")
        with self.assertRaises(self.drill.DrillRefused) as bait_caught:
            self.drill.cleanup(bait)
        self.assertEqual(bait_caught.exception.reason, "production-target")
        self.assertEqual(planted.read_bytes(), b"last-good")

        volume = self.root / "personal-site_data"
        volume.mkdir()
        (volume / "site.db").write_bytes(b"live")
        with self.assertRaises(self.drill.DrillRefused) as volume_caught:
            self.drill.cleanup(volume)
        self.assertEqual(volume_caught.exception.reason, "production-target")
        self.assertEqual((volume / "site.db").read_bytes(), b"live")
        with self.assertRaises(self.drill.DrillRefused) as missing_caught:
            self.drill.cleanup(Path("/data/restore-drill-missing"))
        self.assertEqual(missing_caught.exception.reason, "production-target")
        self.assert_untouched()

    def test_cli_report_and_refusal_omit_synthetic_markers(self):
        success = subprocess.run(
            [
                sys.executable,
                str(DRILL_PATH),
                "--backup",
                str(self.snapshot),
                "--parent",
                str(self.work),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(success.returncode, 0, success.stderr)
        report = json.loads(success.stdout)
        self.assertEqual(report["owners"], EXPECTED_OWNERS)
        self.assertFalse(report["production_restore"])
        for marker in (CIPHERTEXT, VAULT, INDEX, EMAIL):
            self.assertNotIn(marker, success.stdout)
            self.assertNotIn(marker, success.stderr)
        destination = self.work / "restore-drill-cli"
        destination.mkdir()
        (destination / "sentinel").write_text("keep", encoding="utf-8")
        refused = subprocess.run(
            [
                sys.executable,
                str(DRILL_PATH),
                "--backup",
                str(self.snapshot),
                "--destination",
                str(destination),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(refused.returncode, 1)
        self.assertEqual(json.loads(refused.stderr)["reason"], "nonempty")
        self.assertNotIn(CIPHERTEXT, refused.stderr)
        self.assertEqual((destination / "sentinel").read_text(encoding="utf-8"), "keep")
        self.assert_untouched()

    def test_deletion_keeps_one_drill_entrypoint_and_the_backup_producer(self):
        published = self.backup.backup(self.source, self.backups, keep=7, keep_days=30)
        self.assertTrue(published.with_suffix(".json").is_file())
        manifest = json.loads(published.with_suffix(".json").read_text(encoding="utf-8"))
        self.assertTrue(manifest["restore_checked"])
        report = self.drill.drill(published, parent=self.work)
        self.assertEqual(report["event"], "restore_drill")
        self.assertTrue(published.is_file())
        self.assertTrue(self.source.is_file())
