"""Town child rows must belong to the habit's owner.

SQLite cannot add a composite foreign key or these CHECK constraints in place.
Each Town table is copied unchanged into a replacement, then the old table is
dropped. A failing preflight raises before that copy and does not rewrite rows.
Columns stay the same, and habit_checkins keeps sqlite_autoindex_habit_checkins_1,
so an older image can still read and write values the application already accepts.
"""

import sqlalchemy as sa
from alembic import op

revision = "site_town_ownership_v1"
down_revision = "site_calendar_feeds_v1"
branch_labels = None
depends_on = None

_HABIT_COLUMNS = (
    "id",
    "user_id",
    "name",
    "slot",
    "building_style",
    "per_week",
    "created_on",
    "created_at",
    "archived_at",
    "archived_on",
    "name_key",
)
_CHECKIN_COLUMNS = ("id", "habit_id", "user_id", "day", "created_at")
_CADENCE_COLUMNS = ("id", "habit_id", "user_id", "per_week", "effective_from", "created_at")

# Predicates only. The upgrade reports the label and leaves the row as stored.
_PREFLIGHT = (
    (
        "habit_checkins owner does not match its habit",
        "SELECT 1 FROM habit_checkins AS c JOIN habits AS h ON h.id = c.habit_id "
        "WHERE c.user_id != h.user_id LIMIT 1",
    ),
    (
        "habit_cadences owner does not match its habit",
        "SELECT 1 FROM habit_cadences AS c JOIN habits AS h ON h.id = c.habit_id "
        "WHERE c.user_id != h.user_id LIMIT 1",
    ),
    (
        "habit_checkins habit is missing",
        "SELECT 1 FROM habit_checkins AS c WHERE NOT EXISTS "
        "(SELECT 1 FROM habits AS h WHERE h.id = c.habit_id) LIMIT 1",
    ),
    (
        "habit_cadences habit is missing",
        "SELECT 1 FROM habit_cadences AS c WHERE NOT EXISTS "
        "(SELECT 1 FROM habits AS h WHERE h.id = c.habit_id) LIMIT 1",
    ),
    (
        "habits building_style",
        "SELECT 1 FROM habits WHERE building_style NOT IN ('forge', 'garden', 'cottage') LIMIT 1",
    ),
    (
        "habits per_week",
        "SELECT 1 FROM habits WHERE per_week < 1 OR per_week > 7 LIMIT 1",
    ),
    (
        "habit_cadences per_week",
        "SELECT 1 FROM habit_cadences WHERE per_week < 1 OR per_week > 7 LIMIT 1",
    ),
    (
        "habits slot",
        "SELECT 1 FROM habits WHERE slot < 0 OR slot > 5 LIMIT 1",
    ),
    (
        "habits name",
        "SELECT 1 FROM habits WHERE length(name) < 1 OR length(name) > 40 LIMIT 1",
    ),
    (
        "habits name_key",
        "SELECT 1 FROM habits WHERE length(name_key) < 1 OR length(name_key) > 40 LIMIT 1",
    ),
)

_HABIT_INDEXES = (
    "CREATE INDEX ix_habits_user_id ON habits (user_id)",
    "CREATE INDEX ix_habits_user_active ON habits (user_id, archived_at)",
    "CREATE UNIQUE INDEX uq_habits_active_slot ON habits (user_id, slot) WHERE archived_at IS NULL",
    "CREATE UNIQUE INDEX uq_habits_active_name ON habits (user_id, name_key) "
    "WHERE archived_at IS NULL",
)
_CHECKIN_INDEXES = (
    "CREATE INDEX ix_habit_checkins_habit_id ON habit_checkins (habit_id)",
    "CREATE INDEX ix_habit_checkins_user_id ON habit_checkins (user_id)",
    "CREATE INDEX ix_habit_checkins_user_day ON habit_checkins (user_id, day)",
)
_CADENCE_INDEXES = (
    "CREATE INDEX ix_habit_cadences_habit_id ON habit_cadences (habit_id)",
    "CREATE INDEX ix_habit_cadences_user_id ON habit_cadences (user_id)",
)
_CADENCE_INDEXES_BEFORE = ("CREATE INDEX ix_habit_cadences_habit_id ON habit_cadences (habit_id)",)

_HABITS_SQL = """
CREATE TABLE __TABLE__ (
	id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	name VARCHAR(40) NOT NULL,
	slot SMALLINT NOT NULL,
	building_style VARCHAR(16) NOT NULL,
	per_week SMALLINT NOT NULL,
	created_on DATE NOT NULL,
	created_at DATETIME NOT NULL,
	archived_at DATETIME,
	archived_on DATE,
	name_key VARCHAR(40) NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_habits_id_user UNIQUE (id, user_id),
	CONSTRAINT ck_habits_name_key CHECK (length(name_key) BETWEEN 1 AND 40),
	CONSTRAINT ck_habits_name CHECK (length(name) BETWEEN 1 AND 40),
	CONSTRAINT ck_habits_building_style CHECK (building_style IN ('forge', 'garden', 'cottage')),
	CONSTRAINT ck_habits_slot CHECK (slot BETWEEN 0 AND 5),
	CONSTRAINT ck_habits_per_week CHECK (per_week BETWEEN 1 AND 7),
	FOREIGN KEY(user_id) REFERENCES users (id)
)
"""

_CHECKINS_SQL = """
CREATE TABLE __TABLE__ (
	id INTEGER NOT NULL,
	habit_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	day DATE NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_checkin_habit_day UNIQUE (habit_id, day),
	CONSTRAINT fk_habit_checkins_owner FOREIGN KEY(habit_id, user_id)
		REFERENCES habits (id, user_id) ON DELETE RESTRICT,
	FOREIGN KEY(user_id) REFERENCES users (id)
)
"""

_CADENCES_SQL = """
CREATE TABLE __TABLE__ (
	id INTEGER NOT NULL,
	habit_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	per_week SMALLINT NOT NULL,
	effective_from DATE NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_habit_cadences_per_week CHECK (per_week BETWEEN 1 AND 7),
	CONSTRAINT uq_cadence_habit_from UNIQUE (habit_id, effective_from),
	CONSTRAINT fk_habit_cadences_owner FOREIGN KEY(habit_id, user_id)
		REFERENCES habits (id, user_id) ON DELETE RESTRICT,
	FOREIGN KEY(user_id) REFERENCES users (id)
)
"""

_HABITS_BEFORE_SQL = """
CREATE TABLE __TABLE__ (
	id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	name VARCHAR(40) NOT NULL,
	slot SMALLINT NOT NULL,
	building_style VARCHAR(16) NOT NULL,
	per_week SMALLINT NOT NULL,
	created_on DATE NOT NULL,
	created_at DATETIME NOT NULL,
	archived_at DATETIME,
	archived_on DATE,
	name_key VARCHAR(40) NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id)
)
"""

_CHECKINS_BEFORE_SQL = """
CREATE TABLE __TABLE__ (
	id INTEGER NOT NULL,
	habit_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	day DATE NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(habit_id) REFERENCES habits (id) ON DELETE RESTRICT,
	FOREIGN KEY(user_id) REFERENCES users (id),
	CONSTRAINT uq_checkin_habit_day UNIQUE (habit_id, day)
)
"""

_CADENCES_BEFORE_SQL = """
CREATE TABLE __TABLE__ (
	id INTEGER NOT NULL,
	habit_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	per_week SMALLINT NOT NULL,
	effective_from DATE NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(habit_id) REFERENCES habits (id),
	FOREIGN KEY(user_id) REFERENCES users (id),
	CONSTRAINT uq_cadence_habit_from UNIQUE (habit_id, effective_from)
)
"""


def _guard(sql: str) -> str:
    predicate = sql.rsplit(" LIMIT ", 1)[0]
    return f"SELECT CASE WHEN EXISTS ({predicate}) THEN 1/0 ELSE 1 END"


def _preflight() -> None:
    if op.get_context().as_sql:
        for _label, sql in _PREFLIGHT:
            op.execute(_guard(sql))
        return
    failed = [
        label
        for label, sql in _PREFLIGHT
        if op.get_bind().execute(sa.text(sql)).first() is not None
    ]
    if failed:
        raise RuntimeError(
            "site_town_ownership_v1 preflight failed: "
            + "; ".join(failed)
            + ". Existing rows were left unchanged."
        )


def _rebuild(
    table: str, create_sql: str, columns: tuple[str, ...], indexes: tuple[str, ...]
) -> None:
    temporary = f"_new_{table}"
    quoted = ", ".join(f'"{column}"' for column in columns)
    op.execute(create_sql.replace("__TABLE__", temporary, 1))
    op.execute(f'INSERT INTO "{temporary}" ({quoted}) SELECT {quoted} FROM "{table}"')
    op.execute(f'DROP TABLE "{table}"')
    op.execute(f'ALTER TABLE "{temporary}" RENAME TO "{table}"')
    for statement in indexes:
        op.execute(statement)


def _record_compatibility() -> None:
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "SELECT 'site_town_ownership_v1', compatible_head FROM site_revision_compatibility "
        "WHERE revision = 'site_calendar_feeds_v1'"
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "VALUES ('site_town_ownership_v1', 'site_calendar_feeds_v1')"
    )


def upgrade() -> None:
    _preflight()
    # Parent unique key first. The composite child keys reference it.
    _rebuild("habits", _HABITS_SQL, _HABIT_COLUMNS, _HABIT_INDEXES)
    _rebuild("habit_checkins", _CHECKINS_SQL, _CHECKIN_COLUMNS, _CHECKIN_INDEXES)
    _rebuild("habit_cadences", _CADENCES_SQL, _CADENCE_COLUMNS, _CADENCE_INDEXES)
    _record_compatibility()


def downgrade() -> None:
    op.execute("DELETE FROM site_revision_compatibility WHERE revision = 'site_town_ownership_v1'")
    # Drop the composite keys before the parent unique key they reference.
    _rebuild("habit_checkins", _CHECKINS_BEFORE_SQL, _CHECKIN_COLUMNS, _CHECKIN_INDEXES)
    _rebuild("habit_cadences", _CADENCES_BEFORE_SQL, _CADENCE_COLUMNS, _CADENCE_INDEXES_BEFORE)
    _rebuild("habits", _HABITS_BEFORE_SQL, _HABIT_COLUMNS, _HABIT_INDEXES)
