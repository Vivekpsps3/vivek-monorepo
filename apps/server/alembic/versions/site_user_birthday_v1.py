"""Birthday and the Life in Pixels age opt-in.

Expand-only. ``birthday`` is nullable. ``pixels_show_age`` is false unless the
owner opts in. Older heads stay compatible. No backfill and no drops.

``ix_episode_progress_user_watched_on`` is added because ``episode_progress``
had no ``(user_id, watched_on)`` index on ``site_town_v1``.
"""

import sqlalchemy as sa
from alembic import op

revision = "site_user_birthday_v1"
down_revision = "site_town_v1"
branch_labels = None
depends_on = None

_COMPATIBLE_HEADS = (
    "site_schema_v1",
    "site_auth_challenge_purpose_v2",
    "site_trip_pto_days_v1",
    "site_media_membership_v1",
    "site_media_progress_v1",
    "site_catalog_title_sort_v1",
    "site_trip_create_attempt_v1",
    "site_town_v1",
)


def upgrade() -> None:
    op.add_column("users", sa.Column("birthday", sa.Date(), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "pixels_show_age",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.create_index(
        "ix_episode_progress_user_watched_on",
        "episode_progress",
        ["user_id", "watched_on"],
    )
    for head in _COMPATIBLE_HEADS:
        op.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            f"VALUES ('{revision}', '{head}')"
        )


def downgrade() -> None:
    op.execute(f"DELETE FROM site_revision_compatibility WHERE revision = '{revision}'")
    op.drop_index("ix_episode_progress_user_watched_on", table_name="episode_progress")
    op.drop_column("users", "pixels_show_age")
    op.drop_column("users", "birthday")
