"""Unified site schema.

Revision history lives in apps/server/alembic. The baseline revision
site_schema_v1 freezes this metadata. Apply revisions with
python -m apps.server.migrations. Do not run metadata.create_all or the
historical Finance Alembic environment against the production site database.
"""
from sqlalchemy import Column, ForeignKeyConstraint, Integer, MetaData, String, Table

VERSION = 1
# Separate from the historical Finance row stored in alembic_version.
MIGRATION_VERSION_TABLE = "site_alembic_version"
OWNER_TABLES = {"trips", "pto_policy", "pto_entries", "user_entries", "experiences",
                "season_progress", "episode_progress", "album_ratings", "track_ratings"}


def metadata():
    from apps.finance.backend.models import Base as Finance
    from apps.travel.backend.models import Base as Travel
    from apps.media.backend.models import Base as Media

    result = MetaData()
    for source in (Finance.metadata, Travel.metadata, Media.metadata):
        for table in source.sorted_tables:
            if table.name in result.tables:
                raise RuntimeError(f"Duplicate domain table: {table.name}")
            table.to_metadata(result)
    for name in OWNER_TABLES:
        result.tables[name].append_constraint(ForeignKeyConstraint(["user_id"], ["users.id"]))
    Table("site_schema", result, Column("id", Integer, primary_key=True), Column("version", Integer, nullable=False))
    Table("alembic_version", result, Column("version_num", String(32), primary_key=True))
    return result


def assert_ready(connection):
    from sqlalchemy import text
    from apps.server.migrations import head_revision

    row = connection.execute(text("SELECT version FROM site_schema WHERE id=1")).scalar_one()
    if row != VERSION:
        raise RuntimeError(f"Database schema {row}; application requires {VERSION}. Run python -m apps.server.migrations.")
    revision = connection.execute(text(f'SELECT version_num FROM "{MIGRATION_VERSION_TABLE}"')).scalar_one()
    expected = head_revision()
    if revision != expected:
        raise RuntimeError(f"Database revision {revision}; application requires {expected}. Run python -m apps.server.migrations.")
