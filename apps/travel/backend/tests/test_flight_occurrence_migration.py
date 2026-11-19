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
    assert head_revision() == REVISION
    assert model_diff(database) == []
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
