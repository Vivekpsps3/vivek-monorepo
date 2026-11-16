"""An additive wrap revision preserves credentials, sessions, ciphertext and indexes."""

import sqlite3

from alembic import command

from apps.server.migrations import make_config, model_diff


def test_wrap_revision_upgrade_and_downgrade_preserve_existing_rows(tmp_path):
    path = tmp_path / "credentials.db"
    config = make_config(f"sqlite:///{path}")
    command.upgrade(config, "site_vault_restore_v1")
    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO users (id,email,display_name,role,is_active,must_change_password,created_at,updated_at,auth_kdf_iterations,auth_wrapped_private_key_b64) VALUES (1,'synthetic@example.invalid','Synthetic','user',1,0,'2026-01-01','2026-01-01',310000,'opaque-signing-wrap')"
        )
        db.execute(
            "INSERT INTO user_vaults (user_id,kdf_algorithm,kdf_salt_b64,kdf_iterations,wrapped_dek_b64,recovery_wrapped_dek_b64,key_version,created_at,updated_at) VALUES (1,'PBKDF2','opaque-salt',310000,'opaque-data-wrap','legacy-recovery',1,'2026-01-01','2026-01-01')"
        )
        db.execute(
            "INSERT INTO encrypted_records (user_id,collection,client_id,ciphertext_b64,schema_version,key_version,revision,created_at,updated_at) VALUES (1,'health_stats','synthetic_health','opaque-preserved-ciphertext',2,1,7,'2026-01-01','2026-01-01')"
        )
        db.execute(
            "INSERT INTO encrypted_record_indexes (user_id,collection,client_id,index_name,index_value_b64,created_at) VALUES (1,'health_stats','synthetic_health','synthetic','opaque-index','2026-01-01')"
        )
        db.execute(
            "INSERT INTO user_sessions (user_id,token_hash,csrf_token_hash,created_at,expires_at,last_seen_at,migration_only) VALUES (1,'synthetic-session','synthetic-csrf','2026-01-01','2027-01-01','2026-01-01',0)"
        )
        tables = (
            "users",
            "user_vaults",
            "encrypted_records",
            "encrypted_record_indexes",
            "user_sessions",
        )
        before = {table: db.execute(f"SELECT * FROM {table}").fetchall() for table in tables}
    command.upgrade(config, "head")
    assert model_diff(path) == []
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT credential_wrap_revision FROM users").fetchall() == [(1,)]
        for table in tables:
            columns = [
                row[1]
                for row in db.execute(f"PRAGMA table_info({table})")
                if row[1] != "credential_wrap_revision"
            ]
            assert (
                db.execute(f"SELECT {','.join(columns)} FROM {table}").fetchall() == before[table]
            )
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert db.execute(
            "SELECT compatible_head FROM site_revision_compatibility WHERE revision='site_credential_wrap_revision_v1' AND compatible_head='site_vault_restore_v1'"
        ).fetchone() == ("site_vault_restore_v1",)
        # A prior image can insert an account without knowing the new column.
        db.execute(
            "INSERT INTO users (email,display_name,role,is_active,must_change_password,created_at,updated_at) VALUES ('older@example.invalid','Older','user',1,0,'2026-01-01','2026-01-01')"
        )
        assert db.execute("SELECT credential_wrap_revision FROM users WHERE id=2").fetchone() == (
            1,
        )
        db.execute("DELETE FROM users WHERE id=2")
    command.downgrade(config, "site_vault_restore_v1")
    with sqlite3.connect(path) as db:
        for table in tables:
            assert db.execute(f"SELECT * FROM {table}").fetchall() == before[table]
