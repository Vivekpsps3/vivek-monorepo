"""Persist trip-create retry identity; existing trips keep a null key."""

import sqlalchemy as sa
from alembic import op

revision = "site_trip_create_attempt_v1"
down_revision = "site_catalog_title_sort_v1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trips", sa.Column("client_request_id", sa.String(100), nullable=True))
    op.create_index("uq_trip_create_attempt", "trips", ["user_id", "client_request_id"], unique=True)
    for head in (
        "site_schema_v1",
        "site_auth_challenge_purpose_v2",
        "site_trip_pto_days_v1",
        "site_media_membership_v1",
        "site_media_progress_v1",
        "site_catalog_title_sort_v1",
    ):
        op.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            f"VALUES ('{revision}', '{head}')"
        )


def downgrade() -> None:
    op.drop_index("uq_trip_create_attempt", table_name="trips")
    op.drop_column("trips", "client_request_id")
    op.execute(f"DELETE FROM site_revision_compatibility WHERE revision = '{revision}'")
