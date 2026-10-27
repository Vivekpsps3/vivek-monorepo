"""Store a Unicode title order beside each catalog title.

Expand-only. Existing titles, ratings, and memberships stay. SQLite lower()
only folds ASCII, so accents and non-English case were sorting by code point.
"""

import unicodedata

import sqlalchemy as sa
from alembic import op

revision = "site_catalog_title_sort_v1"
down_revision = "site_media_progress_v1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "catalog_items",
        sa.Column(
            "title_sort", sa.String(length=300), nullable=False, server_default=sa.text("''")
        ),
    )
    connection = op.get_bind()
    context = op.get_context()
    rows = (
        context.config.attributes["catalog_title_rows"]
        if context.as_sql
        else connection.execute(sa.text("SELECT id, title FROM catalog_items")).fetchall()
    )
    catalog = sa.table("catalog_items", sa.column("id", sa.Integer), sa.column("title_sort", sa.String))
    for row_id, title in rows:
        folded = unicodedata.normalize("NFKD", title or "").casefold()
        stripped = "".join(c for c in folded if not unicodedata.combining(c))
        op.execute(
            catalog.update().where(catalog.c.id == row_id).values(title_sort=stripped or folded)
        )
    for head in (
        "site_schema_v1",
        "site_auth_challenge_purpose_v2",
        "site_trip_pto_days_v1",
        "site_media_membership_v1",
        "site_media_progress_v1",
    ):
        op.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            f"VALUES ('{revision}', '{head}')"
        )


def downgrade() -> None:
    op.drop_column("catalog_items", "title_sort")
    op.execute(f"DELETE FROM site_revision_compatibility WHERE revision = '{revision}'")
