"""Versioned site schema. Schema changes are explicit, never performed at startup."""

from sqlalchemy import Column, ForeignKeyConstraint, Integer, MetaData, String, Table

VERSION = 1
OWNER_TABLES = {
    "trips",
    "pto_policy",
    "pto_entries",
    "user_entries",
    "experiences",
    "season_progress",
    "episode_progress",
    "album_ratings",
    "track_ratings",
}


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
    Table(
        "site_schema",
        result,
        Column("id", Integer, primary_key=True),
        Column("version", Integer, nullable=False),
    )
    Table("alembic_version", result, Column("version_num", String(32), primary_key=True))
    return result


def assert_ready(connection):
    from sqlalchemy import text

    row = connection.execute(text("SELECT version FROM site_schema WHERE id=1")).scalar_one()
    if row != VERSION:
        raise RuntimeError(
            f"Database schema {row}; application requires {VERSION}. Run the migration command offline."
        )
