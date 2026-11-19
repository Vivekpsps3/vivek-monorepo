"""Store a FlightAware flight id without truncating it into fa_ident.

Expand-only. ``fa_flight_id`` is nullable, so the previous image can still
read and write transports. A null value means the schedule had no id and a
later refresh matches the saved ident, operating ident, route, and instant.
"""

import sqlalchemy as sa
from alembic import op

revision = "site_flight_occurrence_v1"
down_revision = "site_town_ownership_v1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transports", sa.Column("fa_flight_id", sa.String(length=80), nullable=True))
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "SELECT 'site_flight_occurrence_v1', compatible_head FROM site_revision_compatibility "
        "WHERE revision = 'site_town_ownership_v1'"
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "VALUES ('site_flight_occurrence_v1', 'site_town_ownership_v1')"
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM site_revision_compatibility WHERE revision = 'site_flight_occurrence_v1'"
    )
    op.drop_column("transports", "fa_flight_id")
