"""Draft tables are added beside existing trips. Stored trip rows stay put."""

import sqlite3

from alembic import command

from apps.server.migrations import (
    current_revision,
    head_revision,
    make_config,
    model_diff,
    sqlite_url,
)

PARENT = "site_flight_occurrence_v1"
REVISION = "site_trip_draft_v1"
HEAD = "site_town_play_receipts_v1"
STAMP_GAP = {
    "add_index:town_stamp_entitlements:ix_town_stamp_entitlements_user_id",
    "add_index:town_stamp_entitlements:uq_town_stamp_entitlement_item",
    "add_index:town_stamp_receipts:ix_town_stamp_receipts_user_id",
    "add_index:town_stamp_receipts:uq_town_stamp_receipt_grant",
    "add_table:None:town_stamp_entitlements",
    "add_table:None:town_stamp_receipts",
    "add_table:None:town_stamp_wallets",
    "add_index:town_room_layouts:uq_town_room_layout_owner",
    "add_table:None:town_room_layouts",
    "add_table:None:town_quest_journals",
    "add_table:None:town_quest_steps",
    "add_index:town_quest_steps:ix_town_quest_steps_user_id",
    "add_index:town_quest_steps:uq_town_quest_step",
    "add_table:None:town_dialogue_journals",
    "add_table:None:town_dialogue_completions",
    "add_index:town_dialogue_completions:ix_town_dialogue_completions_user_id",
    "add_index:town_dialogue_completions:uq_town_dialogue_completion",
    "add_table:None:town_discovery_journals",
    "add_table:None:town_discovery_stamps",
    "add_index:town_discovery_stamps:ix_town_discovery_stamps_user_id",
    "add_index:town_discovery_stamps:uq_town_discovery_stamp",
    "add_table:None:town_play_receipts",
    "add_index:town_play_receipts:ix_town_play_receipts_user_id",
    "add_index:town_play_receipts:uq_town_play_receipt_nonce",
}
KEPT = (
    "trips",
    "stays",
    "transports",
    "plan_items",
    "budget_lines",
    "pto_entries",
    "trip_pto_days",
)


def _rows(db, table):
    return db.execute(f"SELECT * FROM {table} ORDER BY id").fetchall()


def _snapshot(db):
    return {table: _rows(db, table) for table in KEPT}


def _label(item) -> str:
    kind = item[0]
    if kind == "add_column":
        return f"add_column:{item[2]}.{item[3].name}"
    subject = item[1]
    table = getattr(subject, "table", None)
    table_name = getattr(table, "name", None)
    return f"{kind}:{table_name}:{getattr(subject, 'name', None)}"


def test_upgrade_keeps_trip_dates_children_costs_and_allocations(tmp_path):
    database = tmp_path / "site.db"
    config = make_config(sqlite_url(database))
    command.upgrade(config, PARENT)
    with sqlite3.connect(database) as db:
        assert "trip_drafts" not in {row[0] for row in db.execute("SELECT name FROM sqlite_master")}
        db.execute(
            "INSERT INTO users (email, display_name, role, is_active, must_change_password, "
            "created_at, updated_at) VALUES ('synthetic@example.invalid', 'Synthetic', 'user', "
            "1, 0, '2026-04-01', '2026-04-01')"
        )
        db.execute(
            "INSERT INTO trips (user_id, title, start_date, end_date, status, origin_label, notes, "
            "counts_as_pto, pto_days, pto_mode, created_at, updated_at) VALUES "
            "(1, 'Lisbon week', '2026-04-06', '2026-04-10', 'booked', 'Home', 'Keep this note', "
            "1, '3.5000', 'dates', '2026-04-01', '2026-04-02')"
        )
        db.execute(
            "INSERT INTO stays (trip_id, sort_order, city, arrive_on, leave_on, lodging_name) "
            "VALUES (1, 0, 'Lisbon', '2026-04-06', '2026-04-10', 'River house')"
        )
        db.execute(
            "INSERT INTO transports (trip_id, sort_order, role, mode, number, depart_place, "
            "arrive_place, cost_cents, currency, paid, status) VALUES "
            "(1, 0, 'outbound', 'flight', 'UA100', 'SFO', 'LIS', 15000, 'USD', 1, 'booked')"
        )
        db.execute(
            "INSERT INTO plan_items (trip_id, on_date, kind, title, cost_cents, currency, paid, "
            "sort_order) VALUES (1, '2026-04-07', 'activity', 'Dinner', 800, 'EUR', 0, 0)"
        )
        db.execute(
            "INSERT INTO budget_lines (trip_id, category, label, amount_cents, currency, paid) "
            "VALUES (1, 'activity', 'Museum', 2500, 'EUR', 0)"
        )
        db.execute(
            "INSERT INTO pto_entries (user_id, trip_id, start_date, end_date, days, label, kind, "
            "bucket) VALUES (1, 1, '2026-04-06', '2026-04-10', '3.5000', 'Lisbon week', 'trip', "
            "'pto')"
        )
        db.execute(
            "INSERT INTO trip_pto_days (trip_id, on_date, amount, provenance) VALUES "
            "(1, '2026-04-06', '0.5000', 'override')"
        )
        db.commit()
        before = _snapshot(db)

    command.upgrade(config, REVISION)
    assert current_revision(database) == REVISION
    assert head_revision() == HEAD
    assert {_label(item) for item in model_diff(database)} == STAMP_GAP
    with sqlite3.connect(database) as db:
        assert _snapshot(db) == before
        trip = db.execute(
            "SELECT title, start_date, end_date, notes, pto_days, counts_as_pto FROM trips"
        ).fetchone()
        assert trip == ("Lisbon week", "2026-04-06", "2026-04-10", "Keep this note", "3.5000", 1)
        assert db.execute(
            "SELECT city, arrive_on, leave_on, lodging_name FROM stays"
        ).fetchone() == (
            "Lisbon",
            "2026-04-06",
            "2026-04-10",
            "River house",
        )
        assert db.execute("SELECT number, cost_cents, currency FROM transports").fetchone() == (
            "UA100",
            15000,
            "USD",
        )
        assert db.execute("SELECT title, cost_cents, currency FROM plan_items").fetchone() == (
            "Dinner",
            800,
            "EUR",
        )
        assert db.execute("SELECT label, amount_cents, currency FROM budget_lines").fetchone() == (
            "Museum",
            2500,
            "EUR",
        )
        assert db.execute(
            "SELECT days, label, start_date, end_date FROM pto_entries"
        ).fetchone() == (
            "3.5000",
            "Lisbon week",
            "2026-04-06",
            "2026-04-10",
        )
        assert db.execute("SELECT on_date, amount, provenance FROM trip_pto_days").fetchone() == (
            "2026-04-06",
            "0.5000",
            "override",
        )
        info = {row[1]: row for row in db.execute("PRAGMA table_info(trip_drafts)")}
        assert info["end_date"][3] == 0
        assert db.execute("SELECT COUNT(*) FROM trip_drafts").fetchone() == (0,)
        assert db.execute("SELECT COUNT(*) FROM trip_draft_legs").fetchone() == (0,)
        assert db.execute("SELECT COUNT(*) FROM trip_draft_proposals").fetchone() == (0,)
        compatible = {
            row[0]
            for row in db.execute(
                "SELECT compatible_head FROM site_revision_compatibility WHERE revision = ?",
                (REVISION,),
            )
        }
        assert PARENT in compatible

    command.downgrade(config, PARENT)
    assert current_revision(database) == PARENT
    with sqlite3.connect(database) as db:
        names = {row[0] for row in db.execute("SELECT name FROM sqlite_master")}
        assert "trip_drafts" not in names
        assert "trip_draft_legs" not in names
        assert "trip_draft_proposals" not in names
        assert _snapshot(db) == before
        assert db.execute(
            "SELECT COUNT(*) FROM site_revision_compatibility WHERE revision = ?",
            (REVISION,),
        ).fetchone() == (0,)
