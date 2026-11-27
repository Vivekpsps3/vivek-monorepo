"""Town discovery journal.

Expand-only. Two new tables store one revision and one journal stamp per
hotspot. Existing rows stay in place. The previous image can still serve this
head because it does not read the new tables. Discoveries grant no currency.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "site_town_discoveries_v1"
down_revision: Union[str, None] = "site_town_dialogue_v1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_KNOWN = (
    "discovery_id IN ('tidepool-shells', 'ferry-bell', 'library-globe', "
    "'theater-light-booth', 'music-mural', 'gym-chalkboard', 'clinic-garden', "
    "'hall-sundial', 'courtyard-birdbath', 'lantern-alley', 'rooftop-telescope', "
    "'arcade-sign')"
)


def upgrade() -> None:
    op.create_table(
        "town_discovery_journals",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision >= 1", name="ck_town_discovery_journals_revision"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "town_discovery_stamps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("discovery_id", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(discovery_id) BETWEEN 1 AND 40",
            name="ck_town_discovery_stamps_id",
        ),
        sa.CheckConstraint(_KNOWN, name="ck_town_discovery_stamps_known"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_town_discovery_stamps_user_id", "town_discovery_stamps", ["user_id"])
    op.create_index(
        "uq_town_discovery_stamp",
        "town_discovery_stamps",
        ["user_id", "discovery_id"],
        unique=True,
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "SELECT 'site_town_discoveries_v1', compatible_head FROM site_revision_compatibility "
        "WHERE revision = 'site_town_dialogue_v1'"
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "VALUES ('site_town_discoveries_v1', 'site_town_dialogue_v1')"
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM site_revision_compatibility WHERE revision = 'site_town_discoveries_v1'"
    )
    op.drop_index("uq_town_discovery_stamp", table_name="town_discovery_stamps")
    op.drop_index("ix_town_discovery_stamps_user_id", table_name="town_discovery_stamps")
    op.drop_table("town_discovery_stamps")
    op.drop_table("town_discovery_journals")
