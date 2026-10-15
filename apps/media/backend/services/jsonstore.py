"""JSON text columns. SQLite stores them as plain text."""

import json


def dump_json(value) -> str | None:
    if value is None:
        return None
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def load_json(value):
    if value is None or value == "":
        return None
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


def load_list(value) -> list:
    parsed = load_json(value)
    return parsed if isinstance(parsed, list) else []


def load_dict(value) -> dict:
    parsed = load_json(value)
    return parsed if isinstance(parsed, dict) else {}
