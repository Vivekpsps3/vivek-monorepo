"""P2-BE-3 / QA-007: SQLite migration and Alembic smoke tests."""

import os
import tempfile
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text


def _backend_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def test_alembic_upgrade_head_on_legacy_holdings_sqlite():
    """Revision 44622d00bf4c expects an existing holdings table (legacy DB upgrade path)."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "legacy_alembic.db"
        url = f"sqlite:///{db_path}"
        engine = create_engine(url, connect_args={"check_same_thread": False})
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE holdings (
                        id INTEGER PRIMARY KEY,
                        symbol VARCHAR NOT NULL,
                        shares FLOAT,
                        purchase_price FLOAT,
                        purchase_date DATE
                    )
                    """
                )
            )
        engine.dispose()

        here = _backend_dir()
        cfg = Config(str(here / "alembic.ini"))
        cfg.set_main_option("script_location", str(here / "alembic"))
        cfg.set_main_option("sqlalchemy.url", url)
        prev_db_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = url
        try:
            command.upgrade(cfg, "b7c9d2e4f601")
        finally:
            if prev_db_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = prev_db_url

        engine2 = create_engine(url, connect_args={"check_same_thread": False})
        inspector = inspect(engine2)
        assert inspector.has_table("brokerages")
        assert inspector.has_table("brokerage_accounts")
        assert not inspector.has_table("tax_documents")
        holdings_cols = {c["name"] for c in inspector.get_columns("holdings")}
        assert "brokerage_account_id" in holdings_cols
        users_cols = {c["name"]: c for c in inspector.get_columns("users")}
        assert users_cols["password_hash"]["nullable"] is True
        assert not inspector.has_table("net_worth_snapshots")
        assert inspector.has_table("user_vaults")
        assert inspector.has_table("encrypted_records")
        assert inspector.has_table("encrypted_record_indexes")
        assert inspector.has_table("user_crypto_migrations")
        engine2.dispose()


def test_vault_migration_is_idempotent_after_create_all():
    """Startup runs create_all then alembic; vault migration must not crash on existing tables."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "create_all_then_alembic.db"
        url = f"sqlite:///{db_path}"
        engine = create_engine(url, connect_args={"check_same_thread": False})

        # Minimal users table so FK targets exist, then create vault tables as create_all would.
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE users (
                        id INTEGER PRIMARY KEY,
                        email VARCHAR NOT NULL,
                        display_name VARCHAR NOT NULL,
                        role VARCHAR NOT NULL,
                        password_hash VARCHAR NOT NULL,
                        is_active BOOLEAN NOT NULL,
                        must_change_password BOOLEAN NOT NULL,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        last_login_at DATETIME
                    )
                    """
                )
            )
            conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
            conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('f2d8c6a4b913')"))
            for ddl in (
                """
                CREATE TABLE user_vaults (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    kdf_algorithm VARCHAR NOT NULL,
                    kdf_salt_b64 VARCHAR NOT NULL,
                    kdf_iterations INTEGER NOT NULL,
                    wrapped_dek_b64 TEXT NOT NULL,
                    recovery_wrapped_dek_b64 TEXT NOT NULL,
                    key_version INTEGER NOT NULL,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users (id)
                )
                """,
                """
                CREATE TABLE encrypted_records (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    collection VARCHAR NOT NULL,
                    client_id VARCHAR NOT NULL,
                    ciphertext_b64 TEXT NOT NULL,
                    schema_version INTEGER NOT NULL,
                    key_version INTEGER NOT NULL,
                    revision INTEGER NOT NULL,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users (id)
                )
                """,
                """
                CREATE TABLE encrypted_record_indexes (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    collection VARCHAR NOT NULL,
                    client_id VARCHAR NOT NULL,
                    index_name VARCHAR NOT NULL,
                    index_value_b64 VARCHAR NOT NULL,
                    created_at DATETIME NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users (id)
                )
                """,
                """
                CREATE TABLE user_crypto_migrations (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    status VARCHAR NOT NULL,
                    legacy_counts_json TEXT,
                    encrypted_counts_json TEXT,
                    error_message TEXT,
                    verified_at DATETIME,
                    completed_at DATETIME,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users (id)
                )
                """,
            ):
                conn.execute(text(ddl))
        engine.dispose()

        here = _backend_dir()
        cfg = Config(str(here / "alembic.ini"))
        cfg.set_main_option("script_location", str(here / "alembic"))
        cfg.set_main_option("sqlalchemy.url", url)
        prev_db_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = url
        try:
            command.upgrade(cfg, "b7c9d2e4f601")
            command.upgrade(cfg, "b7c9d2e4f601")  # second pass must be a no-op
        finally:
            if prev_db_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = prev_db_url

        engine2 = create_engine(url, connect_args={"check_same_thread": False})
        with engine2.connect() as conn:
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        assert version == "b7c9d2e4f601"
        engine2.dispose()


def test_passwordless_migration_recovers_partial_sqlite_state():
    with tempfile.TemporaryDirectory() as tmp:
        url = f"sqlite:///{Path(tmp) / 'partial_passwordless.db'}"
        engine = create_engine(url, connect_args={"check_same_thread": False})
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
            conn.execute(text("INSERT INTO alembic_version VALUES ('d4e5f6a7b8c9')"))
            conn.execute(
                text("""
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY, email VARCHAR NOT NULL,
                    username VARCHAR, auth_public_key_b64 TEXT,
                    auth_algorithm VARCHAR, auth_key_version INTEGER,
                    auth_kdf_salt_b64 VARCHAR, auth_kdf_iterations INTEGER,
                    auth_wrapped_private_key_b64 TEXT,
                    auth_recovery_wrapped_private_key_b64 TEXT,
                    passwordless_enrolled_at DATETIME
                )
            """)
            )
            conn.execute(text("INSERT INTO users (id, email) VALUES (1, 'owner@example.com')"))
            conn.execute(
                text("""
                CREATE TABLE user_sessions (
                    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL,
                    token_hash VARCHAR NOT NULL
                )
            """)
            )
            conn.execute(
                text("""
                CREATE TABLE auth_challenges (
                    id INTEGER PRIMARY KEY, challenge_id VARCHAR NOT NULL UNIQUE,
                    user_id INTEGER NOT NULL, challenge_hash VARCHAR NOT NULL UNIQUE,
                    expires_at DATETIME NOT NULL, consumed_at DATETIME,
                    created_at DATETIME NOT NULL
                )
            """)
            )
            conn.execute(
                text("""
                CREATE TABLE auth_enrollments (
                    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL,
                    token_hash VARCHAR NOT NULL UNIQUE, expires_at DATETIME NOT NULL,
                    consumed_at DATETIME, created_by_user_id INTEGER,
                    created_at DATETIME NOT NULL
                )
            """)
            )
        engine.dispose()

        here = _backend_dir()
        cfg = Config(str(here / "alembic.ini"))
        cfg.set_main_option("script_location", str(here / "alembic"))
        cfg.set_main_option("sqlalchemy.url", url)
        prev_db_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = url
        try:
            command.upgrade(cfg, "b7c9d2e4f601")
            command.upgrade(cfg, "b7c9d2e4f601")
        finally:
            if prev_db_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = prev_db_url

        engine = create_engine(url, connect_args={"check_same_thread": False})
        inspector = inspect(engine)
        assert "migration_only" in {
            column["name"] for column in inspector.get_columns("user_sessions")
        }
        assert any(
            constraint["name"] == "uq_users_username"
            for constraint in inspector.get_unique_constraints("users")
        )
        with engine.connect() as conn:
            assert (
                conn.execute(text("SELECT email FROM users WHERE id = 1")).scalar_one()
                == "owner@example.com"
            )
            assert (
                conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                == "b7c9d2e4f601"
            )
        engine.dispose()


def test_password_hash_migration_allows_passwordless_users():
    with tempfile.TemporaryDirectory() as tmp:
        url = f"sqlite:///{Path(tmp) / 'passwordless_user.db'}"
        engine = create_engine(url, connect_args={"check_same_thread": False})
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
            conn.execute(text("INSERT INTO alembic_version VALUES ('f1a2b3c4d5e6')"))
            conn.execute(
                text("CREATE TABLE users (id INTEGER PRIMARY KEY, password_hash VARCHAR NOT NULL)")
            )
            conn.execute(text("INSERT INTO users (id, password_hash) VALUES (1, 'legacy-hash')"))
        engine.dispose()

        here = _backend_dir()
        cfg = Config(str(here / "alembic.ini"))
        cfg.set_main_option("script_location", str(here / "alembic"))
        cfg.set_main_option("sqlalchemy.url", url)
        prev_db_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = url
        try:
            command.upgrade(cfg, "b7c9d2e4f601")
        finally:
            if prev_db_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = prev_db_url

        engine = create_engine(url, connect_args={"check_same_thread": False})
        assert {c["name"]: c for c in inspect(engine).get_columns("users")}["password_hash"][
            "nullable"
        ] is True
        with engine.begin() as conn:
            assert (
                conn.execute(text("SELECT password_hash FROM users WHERE id = 1")).scalar_one()
                == "legacy-hash"
            )
            conn.execute(text("INSERT INTO users (id, password_hash) VALUES (2, NULL)"))
        engine.dispose()


def test_market_research_cache_create_all_has_expected_columns():
    from sqlalchemy import create_engine, inspect

    from apps.finance.backend.models import Base, MarketResearchCache

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    columns = {c["name"] for c in inspector.get_columns("market_research_cache")}

    assert MarketResearchCache.__tablename__ == "market_research_cache"
    assert {
        "symbol",
        "period",
        "payload_json",
        "source",
        "fetched_at",
        "expires_at",
    }.issubset(columns)
