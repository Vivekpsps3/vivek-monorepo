import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# Use the project's models
import sys

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[4]))
from apps.finance.backend.legacy_schema_guard import (
    assert_not_unified_site_database,
    assert_offline_not_site_database,
    assert_safe_to_remove_legacy_schema,
)
from apps.finance.backend.models import Base

target_metadata = Base.metadata

# Override url from env if set (for DATABASE_URL)
database_url = os.getenv("DATABASE_URL")
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    assert_offline_not_site_database(url)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        # After configure(). A query beforehand autobegins a transaction, and
        # Alembic then treats the connection as externally managed and rolls
        # the revision back when the connection closes.
        assert_not_unified_site_database(connection)

        target = context.get_revision_argument()
        if target in ("head", "heads", "e0f6a2b3c4d5"):
            assert_safe_to_remove_legacy_schema(connection)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
