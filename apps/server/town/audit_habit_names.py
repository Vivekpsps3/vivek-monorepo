"""One-off read-only audit: python -m apps.server.town.audit_habit_names DEV_DB."""

import argparse
import json
import sqlite3
from contextlib import closing
from pathlib import Path

from apps.server.town.constants import HABIT_NAME_MAX


def audit_habit_names(database: Path) -> dict[str, int]:
    counts = {"checked": 0, "overlong_names": 0, "overlong_folded_names": 0}
    with closing(sqlite3.connect(f"{database.resolve().as_uri()}?mode=ro", uri=True)) as db:
        for (name,) in db.execute("SELECT name FROM habits"):
            counts["checked"] += 1
            counts["overlong_names"] += len(name) > HABIT_NAME_MAX
            counts["overlong_folded_names"] += len(name.casefold()) > HABIT_NAME_MAX
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path, help="Explicit seeded/dev SQLite database path")
    counts = audit_habit_names(parser.parse_args().database)
    print(json.dumps(counts, sort_keys=True))
    return int(bool(counts["overlong_names"] or counts["overlong_folded_names"]))


if __name__ == "__main__":
    raise SystemExit(main())
