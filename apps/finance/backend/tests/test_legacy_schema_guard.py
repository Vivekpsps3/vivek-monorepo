import pytest
from sqlalchemy import create_engine, text

from apps.finance.backend.legacy_schema_guard import assert_safe_to_remove_legacy_schema


def test_guard_refuses_populated_legacy_tables_without_changing_source_rows():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE assets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"))
        connection.execute(text("INSERT INTO assets VALUES (1, 'source marker')"))

        with pytest.raises(RuntimeError, match=r"assets=1"):
            assert_safe_to_remove_legacy_schema(connection)

        assert (
            connection.execute(text("SELECT name FROM assets WHERE id = 1")).scalar_one()
            == "source marker"
        )
    engine.dispose()


def test_guard_refuses_password_only_users_until_auth_enrollment():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, password_hash TEXT, "
                "auth_public_key_b64 TEXT)"
            )
        )
        connection.execute(text("INSERT INTO users VALUES (1, 'legacy-hash', NULL)"))

        with pytest.raises(RuntimeError, match=r"password-only users=1"):
            assert_safe_to_remove_legacy_schema(connection)

        assert (
            connection.execute(text("SELECT password_hash FROM users WHERE id = 1")).scalar_one()
            == "legacy-hash"
        )
    engine.dispose()


def test_guard_allows_empty_legacy_schema_and_passwordless_users():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE assets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"))
        connection.execute(
            text(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, password_hash TEXT, auth_public_key_b64 TEXT)"
            )
        )
        connection.execute(text("INSERT INTO users VALUES (1, NULL, 'public-key')"))

        assert_safe_to_remove_legacy_schema(connection)
    engine.dispose()


def _upgrade_file(url, monkeypatch, target="head"):
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    backend = Path(__file__).resolve().parent.parent
    cfg = Config(str(backend / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    monkeypatch.setenv("DATABASE_URL", url)
    command.upgrade(cfg, target)


def test_cleanup_preserves_ciphertext_and_keys_and_stays_clean_on_restart(tmp_path, monkeypatch):
    from sqlalchemy import inspect
    from sqlalchemy.orm import Session

    from apps.finance.backend import database
    from apps.finance.backend.models import Base, EncryptedRecord, UserVault
    from apps.server.identity.models import User, UserRole

    url = f"sqlite:///{tmp_path / 'vault.db'}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        user = User(
            email="vault@example.com",
            display_name="Vault",
            role=UserRole.admin,
            username="vault",
            auth_public_key_b64="public-key",
        )
        session.add(user)
        session.flush()
        session.add(
            UserVault(
                user_id=user.id,
                kdf_salt_b64="salt",
                wrapped_dek_b64="wrapped-key",
                recovery_wrapped_dek_b64="",
            )
        )
        session.add(
            EncryptedRecord(
                user_id=user.id,
                collection="assets",
                client_id="asset-001",
                ciphertext_b64="opaque-ciphertext",
                schema_version=2,
                revision=9,
            )
        )
        session.commit()
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
        connection.execute(text("INSERT INTO alembic_version VALUES ('b7c9d2e4f601')"))
        connection.execute(text("CREATE TABLE assets (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE transactions (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE user_crypto_migrations (id INTEGER PRIMARY KEY)"))
        connection.execute(text("INSERT INTO user_crypto_migrations VALUES (1)"))
    _upgrade_file(url, monkeypatch)
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "SQLALCHEMY_DATABASE_URL", url)
    database.init_database()
    database.init_database()
    tables = set(inspect(engine).get_table_names())
    assert not tables.intersection({"assets", "transactions", "user_crypto_migrations", "holdings"})
    with engine.connect() as connection:
        assert (
            connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            == "e0f6a2b3c4d5"
        )
        assert connection.execute(
            text("SELECT ciphertext_b64, revision FROM encrypted_records")
        ).one() == ("opaque-ciphertext", 9)
        assert (
            connection.execute(text("SELECT wrapped_dek_b64 FROM user_vaults")).scalar_one()
            == "wrapped-key"
        )
    engine.dispose()


def test_head_upgrade_refuses_legacy_data_before_any_schema_changes(tmp_path, monkeypatch):
    from sqlalchemy import inspect

    url = f"sqlite:///{tmp_path / 'legacy.db'}"
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE assets (id INTEGER PRIMARY KEY, name TEXT)"))
        connection.execute(text("INSERT INTO assets VALUES (1, 'original')"))
    with pytest.raises(RuntimeError, match="assets=1"):
        _upgrade_file(url, monkeypatch)
    assert inspect(engine).get_table_names() == ["assets"]
    with engine.connect() as connection:
        assert connection.execute(text("SELECT name FROM assets")).scalar_one() == "original"
    engine.dispose()


def test_fresh_file_startup_creates_only_current_schema(tmp_path, monkeypatch):
    from sqlalchemy import inspect

    from apps.finance.backend import database

    url = f"sqlite:///{tmp_path / 'fresh.db'}"
    engine = create_engine(url)
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "SQLALCHEMY_DATABASE_URL", url)
    database.init_database()
    database.init_database()
    assert set(inspect(engine).get_table_names()) == {
        "alembic_version",
        "users",
        "user_sessions",
        "audit_events",
        "auth_challenges",
        "auth_enrollments",
        "user_vaults",
        "encrypted_records",
        "encrypted_record_indexes",
        "ticker_quotes",
        "market_research_cache",
    }
    engine.dispose()


def test_finance_offline_sql_refuses_the_site_database_url(tmp_path, monkeypatch):
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    url = f"sqlite:///{tmp_path / 'site.db'}"
    monkeypatch.setenv("SITE_DATABASE_URL", url)
    monkeypatch.setenv("DATABASE_URL", url)
    backend = Path(__file__).resolve().parent.parent
    cfg = Config(str(backend / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    with pytest.raises(RuntimeError, match="unified site database"):
        command.upgrade(cfg, "head", sql=True)
    assert not (tmp_path / "site.db").exists()


def test_historical_finance_chain_refuses_a_unified_site_database():
    from apps.finance.backend.legacy_schema_guard import assert_not_unified_site_database

    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        assert_not_unified_site_database(connection)
        connection.execute(
            text("CREATE TABLE site_schema (id INTEGER PRIMARY KEY, version INTEGER)")
        )
        with pytest.raises(RuntimeError, match="unified site database"):
            assert_not_unified_site_database(connection)
    engine.dispose()
