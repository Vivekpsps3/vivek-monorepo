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
# Written by a later revision that old images may still serve. Not part of the
# baseline, so adopting a current production file does not require the table.
COMPATIBILITY_TABLE = "site_revision_compatibility"
FINANCE_REVISION = "e0f6a2b3c4d5"
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
    """Fail startup unless this image can serve the database as it is.

    Exact head is always accepted. A newer revision is accepted only when
    ``site_revision_compatibility`` lists this image's head for that revision.
    That row means the change is expand-only for the named head: new tables,
    or new columns that are nullable or have a default. A drop, rename,
    retype, or NOT NULL column without a default must not record the old
    head. A database behind head is not upgraded here.
    """
    from sqlalchemy import text
    from apps.server.migrations import head_revision

    row = connection.execute(text("SELECT version FROM site_schema WHERE id=1")).scalar_one()
    if row != VERSION:
        raise RuntimeError(f"Database schema {row}; application requires {VERSION}. Run python -m apps.server.migrations.")
    revision = connection.execute(text(f'SELECT version_num FROM "{MIGRATION_VERSION_TABLE}"')).scalar_one()
    expected = head_revision()
    if revision == expected or _forward_compatible(connection, revision, expected):
        return
    raise RuntimeError(
        f"Database revision {revision}; this image's head is {expected}. "
        "Refusing to migrate at startup. Run python -m apps.server.migrations."
    )


def _forward_compatible(connection, revision, image_head) -> bool:
    from sqlalchemy import text

    present = connection.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:name"),
        {"name": COMPATIBILITY_TABLE},
    ).first()
    if not present:
        return False
    match = connection.execute(
        text(
            f'SELECT 1 FROM "{COMPATIBILITY_TABLE}" '
            "WHERE revision = :revision AND compatible_head = :head"
        ),
        {"revision": revision, "head": image_head},
    ).first()
    return match is not None
