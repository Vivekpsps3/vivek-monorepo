"""Habit name normalization, casefold keys, and the §8.4 character check."""

import pytest

from apps.server.town.engine import NAME_CHARACTERS_ERROR, name_key, normalize_name, validate_name


def test_length_whitespace_nfc_casefold_and_emoji():
    assert validate_name("a" * 40).ok and validate_name("  " + "a" * 40 + " ").ok
    long = validate_name("a" * 41)
    assert long.ok is False and long.error is None
    assert validate_name("").ok is False and validate_name("   ").name == ""
    assert normalize_name("  Read \u00a0  20   pages  ") == "Read 20 pages"
    assert normalize_name("a\tb") == "a b"
    tab = validate_name("a\tb")
    assert tab.ok is False and tab.error == NAME_CHARACTERS_ERROR
    assert normalize_name("  Cafe\u0301  ") == "Caf\u00e9"
    assert len(validate_name("e\u0301" * 40).name) == 40
    assert validate_name("e\u0301" * 41).ok is False
    assert name_key("Read") == name_key("READ") == "read"
    assert name_key("Straße") == name_key("STRASSE") == "strasse"
    assert validate_name("Read 20 pages!").ok
    flag = "🇮🇳"
    assert len(flag) == 2
    assert validate_name("a" * 38 + flag).ok
    assert validate_name("a" * 39 + flag).ok is False
    assert validate_name("👍" * 40).ok
    assert validate_name("👍" * 41).ok is False


@pytest.mark.parametrize(
    "ch",
    ("\u0000", "\u001f", "\u007f", "\u0080", "\u009f", "\u202a", "\u202e", "\u2066", "\u2069"),
)
def test_control_and_bidi_range_ends(ch: str):
    result = validate_name(f"Read{ch}pages")
    assert result.ok is False and result.error == NAME_CHARACTERS_ERROR


def test_neighbors_of_the_bidi_ranges_are_allowed():
    assert validate_name("Read\u2065").ok
    assert normalize_name("a\u2029b") == "a b"
    assert validate_name("a\u2029b").ok
