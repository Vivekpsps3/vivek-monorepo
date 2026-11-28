"""fa_flight_id is a nullable column on the current head. Existing rows stay."""

import sqlite3

from alembic import command

from apps.server.migrations import (
    current_revision,
    head_revision,
    make_config,
    model_diff,
    sqlite_url,
)

PARENT = "site_town_ownership_v1"
REVISION = "site_flight_occurrence_v1"
HEAD = "site_town_play_receipts_v1"
DRAFT_GAP = {
    "add_index:trip_draft_legs:ix_trip_draft_legs_draft_id",
    "add_index:trip_draft_proposals:ix_trip_draft_proposals_draft_id",
    "add_index:trip_drafts:ix_trip_drafts_user_id",
    "add_index:trip_drafts:uq_trip_draft_attempt",
    "add_table:None:trip_draft_legs",
    "add_table:None:trip_draft_proposals",
    "add_table:None:trip_drafts",
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


def _label(item) -> str:
    kind = item[0]
    if kind == "add_column":
        return f"add_column:{item[2]}.{item[3].name}"
    subject = item[1]
    table = getattr(subject, "table", None)
    table_name = getattr(table, "name", None)
    return f"{kind}:{table_name}:{getattr(subject, 'name', None)}"


def test_upgrade_adds_a_nullable_flight_id_and_keeps_the_leg(tmp_path):
    database = tmp_path / "site.db"
    config = make_config(sqlite_url(database))
    command.upgrade(config, PARENT)
    with sqlite3.connect(database) as db:
        columns = {row[1] for row in db.execute("PRAGMA table_info(transports)")}
        assert "fa_flight_id" not in columns
        db.execute(
            "INSERT INTO users (email, display_name, role, is_active, must_change_password, "
            "created_at, updated_at) VALUES ('synthetic@example.invalid', 'Synthetic', 'user', "
            "1, 0, '2026-11-19', '2026-11-19')"
        )
        db.execute(
            "INSERT INTO trips (user_id, title, start_date, end_date, status, counts_as_pto, "
            "created_at, updated_at) VALUES (1, 'Advance', '2027-05-19', '2027-05-21', "
            "'planning', 1, '2026-11-19', '2026-11-19')"
        )
        db.execute(
            "INSERT INTO transports (trip_id, sort_order, role, mode, number, depart_place, "
            "arrive_place, currency, paid, status, fa_ident, fa_scheduled_out) VALUES "
            "(1, 0, 'outbound', 'flight', 'UA837', 'SFO', 'NRT', 'USD', 0, 'planned', "
            "'UAL837', '2027-05-19T18:00:00Z')"
        )
        db.commit()
    command.upgrade(config, REVISION)
    assert current_revision(database) == REVISION
    assert head_revision() == HEAD
    assert {_label(item) for item in model_diff(database)} == DRAFT_GAP
    with sqlite3.connect(database) as db:
        info = {row[1]: row for row in db.execute("PRAGMA table_info(transports)")}
        column = info["fa_flight_id"]
        assert column[2].upper().startswith("VARCHAR")
        assert column[3] == 0
        assert column[4] is None
        row = db.execute(
            "SELECT number, depart_place, arrive_place, fa_ident, fa_scheduled_out, fa_flight_id "
            "FROM transports"
        ).fetchone()
        assert row == ("UA837", "SFO", "NRT", "UAL837", "2027-05-19T18:00:00Z", None)
        compatible = {
            item[0]
            for item in db.execute(
                "SELECT compatible_head FROM site_revision_compatibility WHERE revision = ?",
                (REVISION,),
            )
        }
        assert PARENT in compatible
    command.downgrade(config, PARENT)
    assert current_revision(database) == PARENT
    with sqlite3.connect(database) as db:
        columns = {row[1] for row in db.execute("PRAGMA table_info(transports)")}
        assert "fa_flight_id" not in columns
        assert db.execute("SELECT number, fa_ident FROM transports").fetchone() == (
            "UA837",
            "UAL837",
        )
        assert db.execute(
            "SELECT COUNT(*) FROM site_revision_compatibility WHERE revision = ?",
            (REVISION,),
        ).fetchone() == (0,)
