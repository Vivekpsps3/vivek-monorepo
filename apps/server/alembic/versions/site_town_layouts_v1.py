"""Town room layouts.

Expand-only. One new table stores a cosmetic layout per owner and room.
Existing rows, including tables this revision does not know, stay in place.
The previous image can still serve this head because it does not read the
new table.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "site_town_layouts_v1"
down_revision: Union[str, None] = "site_town_stamps_v1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "town_room_layouts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.String(length=16), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "room_id IN ('living', 'study', 'bedroom', 'courtyard', 'exterior')",
            name="ck_town_room_layouts_room",
        ),
        sa.CheckConstraint("revision >= 1", name="ck_town_room_layouts_revision"),
        sa.CheckConstraint(
            "length(payload) BETWEEN 2 AND 16384",
            name="ck_town_room_layouts_payload",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_town_room_layout_owner",
        "town_room_layouts",
        ["user_id", "room_id"],
        unique=True,
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "SELECT 'site_town_layouts_v1', compatible_head FROM site_revision_compatibility "
        "WHERE revision = 'site_town_stamps_v1'"
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "VALUES ('site_town_layouts_v1', 'site_town_stamps_v1')"
    )


def downgrade() -> None:
    op.execute("DELETE FROM site_revision_compatibility WHERE revision = 'site_town_layouts_v1'")
    op.drop_index("uq_town_room_layout_owner", table_name="town_room_layouts")
    op.drop_table("town_room_layouts")
