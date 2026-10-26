"""Add music membership, portrait, follow, and series lifecycle fields.

Revision ID: site_media_membership_v1
Revises: site_trip_pto_days_v1
Create Date: 2026-10-26

Expand-only for site_schema_v1, site_auth_challenge_purpose_v2, and
site_trip_pto_days_v1. New tables and nullable columns only. Catalog
uniqueness stays (source, source_id).

The backfill adds public album and recording rows, personal membership for
manual adds and non-null scores, artist follow flags, and unknown series
lifecycle rows. It does not rewrite legacy scores, reviews, episode marks,
or shared artwork. Search cache rows are removed; enrichment cache stays.
Downgrade drops the new fields and mapped memberships. It does not restore
pruned search cache.
"""

import sqlalchemy as sa
from alembic import op

revision = "site_media_membership_v1"
down_revision = "site_trip_pto_days_v1"
branch_labels = None
depends_on = None

_COMPATIBLE_HEADS = (
    "site_schema_v1",
    "site_auth_challenge_purpose_v2",
    "site_trip_pto_days_v1",
)


def upgrade() -> None:
    op.add_column(
        "catalog_items", sa.Column("migration_provenance", sa.String(length=40), nullable=True)
    )
    op.add_column("user_entries", sa.Column("portrait_url", sa.Text(), nullable=True))
    op.add_column("user_entries", sa.Column("portrait_source_url", sa.Text(), nullable=True))
    op.add_column(
        "user_entries", sa.Column("portrait_source_id", sa.String(length=120), nullable=True)
    )
    op.add_column("user_entries", sa.Column("portrait_crop", sa.String(length=120), nullable=True))
    op.add_column("user_entries", sa.Column("followed", sa.Boolean(), nullable=True))
    op.add_column(
        "user_entries", sa.Column("follow_provenance", sa.String(length=40), nullable=True)
    )
    op.add_column(
        "user_entries", sa.Column("membership_provenance", sa.String(length=60), nullable=True)
    )
    op.create_table(
        "music_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("parent_catalog_id", sa.Integer(), nullable=False),
        sa.Column("child_catalog_id", sa.Integer(), nullable=False),
        sa.Column("relation", sa.String(length=40), nullable=False),
        sa.Column("namespace", sa.String(length=40), nullable=False),
        sa.Column("source_id", sa.String(length=120), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("credit", sa.String(length=300), nullable=True),
        sa.Column("legacy_album_id", sa.Integer(), nullable=True),
        sa.Column("legacy_track_id", sa.Integer(), nullable=True),
        sa.Column("provenance", sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(["child_catalog_id"], ["catalog_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_catalog_id"], ["catalog_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "parent_catalog_id", "child_catalog_id", "relation", name="uq_music_link"
        ),
        sa.UniqueConstraint("legacy_album_id", name="uq_music_link_legacy_album"),
        sa.UniqueConstraint("legacy_track_id", name="uq_music_link_legacy_track"),
    )
    op.create_index(
        "ix_music_links_parent_catalog_id", "music_links", ["parent_catalog_id"], unique=False
    )
    op.create_index(
        "ix_music_links_child_catalog_id", "music_links", ["child_catalog_id"], unique=False
    )
    op.create_table(
        "series_lifecycles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("catalog_id", sa.Integer(), nullable=False),
        sa.Column("lifecycle", sa.String(length=20), nullable=False),
        sa.Column("raw_value", sa.String(length=80), nullable=True),
        sa.Column("source", sa.String(length=40), nullable=True),
        sa.Column("source_id", sa.String(length=120), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completeness", sa.String(length=20), nullable=False),
        sa.Column("freshness", sa.String(length=20), nullable=False),
        sa.ForeignKeyConstraint(["catalog_id"], ["catalog_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("catalog_id"),
    )
    op.create_table(
        "media_migration_reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=60), nullable=False),
        sa.Column("subject", sa.String(length=40), nullable=False),
        sa.Column("legacy_table", sa.String(length=40), nullable=True),
        sa.Column("legacy_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("catalog_id", sa.Integer(), nullable=True),
        sa.Column("entry_id", sa.Integer(), nullable=True),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["catalog_id"], ["catalog_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["entry_id"], ["user_entries.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    from apps.media.backend.services.membership import backfill_media, backfill_statements

    if op.get_context().as_sql:
        for statement in backfill_statements():
            op.execute(statement)
    else:
        backfill_media(op.get_bind())
    for head in _COMPATIBLE_HEADS:
        op.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            f"VALUES ('{revision}', '{head}')"
        )


def downgrade() -> None:
    from apps.media.backend.services.membership import downgrade_statements

    for statement in downgrade_statements():
        op.execute(statement)
    op.drop_table("media_migration_reports")
    op.drop_index("ix_music_links_child_catalog_id", table_name="music_links")
    op.drop_index("ix_music_links_parent_catalog_id", table_name="music_links")
    op.drop_table("music_links")
    op.drop_table("series_lifecycles")
    op.drop_column("user_entries", "membership_provenance")
    op.drop_column("user_entries", "follow_provenance")
    op.drop_column("user_entries", "followed")
    op.drop_column("user_entries", "portrait_crop")
    op.drop_column("user_entries", "portrait_source_id")
    op.drop_column("user_entries", "portrait_source_url")
    op.drop_column("user_entries", "portrait_url")
    op.drop_column("catalog_items", "migration_provenance")
    op.execute(
        "DELETE FROM site_revision_compatibility "
        f"WHERE revision = '{revision}'"
    )
