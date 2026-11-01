"""Leave buckets: leave_policies and pto_entries.bucket.

Self-contained. Do not import apps.travel: the conversion below is the
migration's own copy of the hours rules. Validate every row, then write.
"""

import os
from decimal import ROUND_HALF_UP, Decimal, Inexact, InvalidOperation, Rounded, localcontext

import sqlalchemy as sa
from alembic import op

revision = "site_leave_buckets_v1"
down_revision = "site_user_birthday_v1"
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
    "site_user_birthday_v1",
)
_CADENCES = {"weekly", "biweekly", "semimonthly", "monthly", "yearly"}
_OFFLINE = (
    "site_leave_buckets_v1: render offline SQL with python -m apps.server.migrations --plan"
)
_POLICY_SQL = (
    "SELECT id, user_id, configured, accrual_amount, accrual_unit, accrual_cadence, "
    "hours_per_day, balance_days, balance_as_of, annual_cap_days FROM pto_policy ORDER BY id"
)
_HPD_SQL = "SELECT key, value FROM settings WHERE key LIKE 'user:%\\:pto_hours_per_day'"


def _fail(row_id, field: str) -> None:
    raise RuntimeError(
        f"site_leave_buckets_v1: pto_policy id={row_id}: {field} "
        "does not convert exactly; no changes made."
    )


def _store_hours(value: Decimal) -> str:
    amount = Decimal(value)
    if not amount.is_finite():
        raise ValueError("not finite")
    if amount == 0:
        return "0"
    exponent = amount.normalize().as_tuple().exponent
    if isinstance(exponent, int) and exponent < -6:
        raise ValueError("more than 6 dp")
    text = format(amount, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _store_days(value: Decimal) -> str:
    amount = Decimal(value).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return format(amount, "f")


def _parse(row_id, field: str, raw) -> Decimal:
    try:
        value = Decimal(str(raw))
    except (InvalidOperation, ValueError):
        _fail(row_id, field)
    if not value.is_finite():
        _fail(row_id, field)
    return value


def _product(row_id, field: str, left: Decimal, hpd: Decimal) -> str:
    try:
        product = left * hpd
        if product / hpd != left:
            _fail(row_id, field)
    except (Inexact, Rounded):
        _fail(row_id, field)
    try:
        stored = _store_hours(product)
    except ValueError:
        _fail(row_id, field)
    if Decimal(stored) != product:
        _fail(row_id, field)
    return stored


def _rows():
    context = op.get_context()
    if context.as_sql:
        try:
            policies = context.config.attributes["pto_policy_rows"]
            settings = context.config.attributes["pto_hpd_settings"]
        except KeyError:
            raise RuntimeError(_OFFLINE) from None
        return policies, settings
    connection = op.get_bind()
    policies = connection.execute(sa.text(_POLICY_SQL)).fetchall()
    settings = connection.execute(sa.text(_HPD_SQL)).fetchall()
    return policies, settings


def _plans(policies, settings) -> tuple[list, list]:
    existing = {row[0]: row[1] for row in settings}
    leave_rows = []
    setting_rows = []
    with localcontext() as ctx:
        ctx.prec = 200
        ctx.traps[Inexact] = True
        ctx.traps[Rounded] = True
        for row in policies:
            row_id, user_id, configured, amount, unit, cadence, hpd_raw, balance, as_of, cap = row
            hpd = _parse(row_id, "hours_per_day", hpd_raw)
            if hpd <= 0 or hpd > 24:
                _fail(row_id, "hours_per_day")
            balance_days = _parse(row_id, "balance_days", balance)
            accrual_amount = _parse(row_id, "accrual_amount", amount)
            if unit not in ("day", "hour"):
                _fail(row_id, "accrual_unit")
            if cadence not in _CADENCES:
                _fail(row_id, "accrual_cadence")
            start = _product(row_id, "balance_days", balance_days, hpd)
            if unit == "hour":
                try:
                    accrual = _store_hours(accrual_amount)
                except ValueError:
                    _fail(row_id, "accrual_amount")
                if Decimal(accrual) != accrual_amount:
                    _fail(row_id, "accrual_amount")
            else:
                accrual = _product(row_id, "accrual_amount", accrual_amount, hpd)
            cap_hours = None
            if cap is not None:
                cap_hours = _product(row_id, "annual_cap_days", _parse(row_id, "annual_cap_days", cap), hpd)
            key = f"user:{user_id}:pto_hours_per_day"
            if key in existing:
                current = _parse(row_id, "hours_per_day", existing[key])
                if current != hpd:
                    _fail(row_id, "hours_per_day")
            else:
                setting_rows.append({"key": key, "value": _store_hours(hpd)})
            leave_rows.append(
                {
                    "user_id": user_id,
                    "bucket": "pto",
                    "configured": int(bool(configured)),
                    "start_balance_hours": start,
                    "balance_as_of": as_of,
                    "accrual_hours": accrual,
                    "accrual_cadence": cadence,
                    "cap_hours": cap_hours,
                    "year_start": "01-01",
                }
            )
    return leave_rows, setting_rows


def upgrade() -> None:
    policies, settings = _rows()
    leave_rows, setting_rows = _plans(policies, settings)
    op.create_table(
        "leave_policies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("bucket", sa.String(length=10), nullable=False),
        sa.Column("configured", sa.Boolean(), nullable=False),
        sa.Column("start_balance_hours", sa.String(length=32), nullable=False),
        sa.Column("balance_as_of", sa.Date(), nullable=False),
        sa.Column("accrual_hours", sa.String(length=32), nullable=False),
        sa.Column("accrual_cadence", sa.String(length=20), nullable=False),
        sa.Column("cap_hours", sa.String(length=32), nullable=True),
        sa.Column("year_start", sa.String(length=5), nullable=False),
        sa.CheckConstraint("bucket IN ('pto','sick')", name="ck_leave_policies_bucket"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "bucket", name="uq_leave_policies_user_bucket"),
    )
    op.create_index("ix_leave_policies_user_id", "leave_policies", ["user_id"])
    # Offline --sql cannot reflect SQLite. copy_from is the pre-bucket table.
    # Online passes None and reflects, so the recreated table keeps real FKs.
    copy_from = None
    if op.get_context().as_sql:
        copy_from = sa.Table(
            "pto_entries",
            sa.MetaData(),
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("trip_id", sa.Integer(), nullable=True),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=False),
            sa.Column("days", sa.String(length=32), nullable=False),
            sa.Column("label", sa.String(length=200), nullable=False),
            sa.Column("kind", sa.String(length=20), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.UniqueConstraint("trip_id"),
            sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        )
    with op.batch_alter_table("pto_entries", copy_from=copy_from) as batch:
        batch.add_column(
            sa.Column("bucket", sa.String(length=10), nullable=False, server_default="pto")
        )
        batch.create_check_constraint("ck_pto_entries_bucket", "bucket IN ('pto','sick')")
    # String, not Date: sqlite3 and --sql both hand back ISO text. A Date
    # bind processor rejects that text. SQLite stores the DATE column as text.
    leave = sa.table(
        "leave_policies",
        sa.column("user_id", sa.Integer),
        sa.column("bucket", sa.String),
        sa.column("configured", sa.Boolean),
        sa.column("start_balance_hours", sa.String),
        sa.column("balance_as_of", sa.String),
        sa.column("accrual_hours", sa.String),
        sa.column("accrual_cadence", sa.String),
        sa.column("cap_hours", sa.String),
        sa.column("year_start", sa.String),
    )
    for values in leave_rows:
        op.execute(leave.insert().values(**values))
    saved = sa.table("settings", sa.column("key", sa.String), sa.column("value", sa.Text))
    for values in setting_rows:
        op.execute(saved.insert().values(**values))
    for head in _COMPATIBLE_HEADS:
        op.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            f"VALUES ('{revision}', '{head}')"
        )


def _hpd_for(connection, user_id) -> str:
    row = connection.execute(
        sa.text("SELECT value FROM settings WHERE key = :key"),
        {"key": f"user:{user_id}:pto_hours_per_day"},
    ).fetchone()
    return row[0] if row is not None else "8"


def downgrade() -> None:
    if op.get_context().as_sql:
        raise RuntimeError("site_leave_buckets_v1 downgrade runs online only")
    connection = op.get_bind()
    sick_entries = int(
        connection.execute(
            sa.text("SELECT count(*) FROM pto_entries WHERE bucket = 'sick'")
        ).scalar_one()
    )
    sick_policies = int(
        connection.execute(
            sa.text(
                "SELECT count(*) FROM leave_policies WHERE bucket = 'sick' AND configured"
            )
        ).scalar_one()
    )
    if (sick_entries or sick_policies) and os.environ.get("TPTO1_DOWNGRADE_DROP_SICK") != "1":
        raise RuntimeError(
            f"site_leave_buckets_v1: {sick_entries} sick entries and {sick_policies} "
            "sick policies exist; set TPTO1_DOWNGRADE_DROP_SICK=1 to delete them and downgrade."
        )
    if os.environ.get("TPTO1_DOWNGRADE_DROP_SICK") == "1":
        connection.execute(sa.text("DELETE FROM pto_entries WHERE bucket = 'sick'"))
        connection.execute(sa.text("DELETE FROM leave_policies WHERE bucket = 'sick'"))
    pto_rows = connection.execute(
        sa.text(
            "SELECT user_id, configured, start_balance_hours, balance_as_of, accrual_hours, "
            "accrual_cadence, cap_hours FROM leave_policies WHERE bucket = 'pto' ORDER BY id"
        )
    ).fetchall()
    for user_id, configured, start, as_of, accrual, cadence, cap in pto_rows:
        hpd = _hpd_for(connection, user_id)
        balance_days = _store_days(Decimal(start) / Decimal(hpd))
        cap_days = None if cap is None else _store_days(Decimal(cap) / Decimal(hpd))
        found = connection.execute(
            sa.text("SELECT id FROM pto_policy WHERE user_id = :user_id"),
            {"user_id": user_id},
        ).fetchone()
        params = {
            "user_id": user_id,
            "configured": configured,
            "accrual_amount": accrual,
            "accrual_unit": "hour",
            "accrual_cadence": cadence,
            "hours_per_day": hpd,
            "balance_days": balance_days,
            "balance_as_of": as_of,
            "annual_cap_days": cap_days,
        }
        if found is None:
            connection.execute(
                sa.text(
                    "INSERT INTO pto_policy (user_id, configured, accrual_amount, accrual_unit, "
                    "accrual_cadence, hours_per_day, balance_days, balance_as_of, annual_cap_days) "
                    "VALUES (:user_id, :configured, :accrual_amount, :accrual_unit, "
                    ":accrual_cadence, :hours_per_day, :balance_days, :balance_as_of, :annual_cap_days)"
                ),
                params,
            )
        else:
            connection.execute(
                sa.text(
                    "UPDATE pto_policy SET configured = :configured, accrual_amount = :accrual_amount, "
                    "accrual_unit = :accrual_unit, accrual_cadence = :accrual_cadence, "
                    "hours_per_day = :hours_per_day, balance_days = :balance_days, "
                    "balance_as_of = :balance_as_of, annual_cap_days = :annual_cap_days "
                    "WHERE user_id = :user_id"
                ),
                params,
            )
    with op.batch_alter_table("pto_entries") as batch:
        batch.drop_constraint("ck_pto_entries_bucket", type_="check")
        batch.drop_column("bucket")
    op.drop_index("ix_leave_policies_user_id", table_name="leave_policies")
    op.drop_table("leave_policies")
    connection.exec_driver_sql(
        "DELETE FROM settings WHERE key LIKE 'user:%:pto_hours_per_day'"
    )
    connection.exec_driver_sql(
        "DELETE FROM settings WHERE key LIKE 'user:%:pto_sick_prompt_dismissed'"
    )
    op.execute(f"DELETE FROM site_revision_compatibility WHERE revision = '{revision}'")
