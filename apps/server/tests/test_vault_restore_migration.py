"""Expand-only restore staging preserves ciphertext and old-head ownership."""

import sqlite3

from alembic import command

from apps.server.migrations import make_config


def test_restore_migration_preserves_ciphertext_and_old_app_owner_deletion(tmp_path):
    path = tmp_path / "restore-migration.db"
    config = make_config(f"sqlite:///{path}")
    command.upgrade(config, "site_leave_accrual_v1")
    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO users (id,email,display_name,role,is_active,must_change_password,created_at,updated_at) VALUES (1,'synthetic@example.invalid','Synthetic','user',1,0,'2026-01-01','2026-01-01')"
        )
        db.execute(
            "INSERT INTO encrypted_records (user_id,collection,client_id,ciphertext_b64,schema_version,key_version,revision,created_at,updated_at) VALUES (1,'health_stats','synthetic_health','opaque-preserved-ciphertext',2,1,7,'2026-01-01','2026-01-01')"
        )
        before = db.execute("SELECT * FROM encrypted_records").fetchall()
    command.upgrade(config, "site_vault_restore_v1")
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT * FROM encrypted_records").fetchall() == before
        assert db.execute(
            "SELECT compatible_head FROM site_revision_compatibility WHERE revision='site_vault_restore_v1' AND compatible_head='site_leave_accrual_v1'"
        ).fetchone() == ("site_leave_accrual_v1",)
        db.execute("PRAGMA foreign_keys=ON")
        db.execute(
            "INSERT INTO vault_restore_stages (id,user_id,vault_wrap_hash,source_hash,base_fingerprint,mode,key_version,expected_counts_json,batch_count,status,result_json,created_at) VALUES ('synthetic-stage',1,'hash','source','base','merge',1,'{}',1,'pending','{}','2026-01-01')"
        )
        db.execute("INSERT INTO vault_restore_batches VALUES ('synthetic-stage',0,'[]')")
        db.commit()
        db.execute("DELETE FROM encrypted_records WHERE user_id=1")
        # An older image does not know the staging tables. Its normal account
        # deletion must still cascade temporary rows through the new foreign keys.
        db.execute("DELETE FROM users WHERE id=1")
        assert db.execute("SELECT COUNT(*) FROM vault_restore_stages").fetchone() == (0,)
        assert db.execute("SELECT COUNT(*) FROM vault_restore_batches").fetchone() == (0,)
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    command.downgrade(config, "site_leave_accrual_v1")
    with sqlite3.connect(path) as db:
        assert not db.execute(
            "SELECT name FROM sqlite_master WHERE name LIKE 'vault_restore_%'"
        ).fetchall()
