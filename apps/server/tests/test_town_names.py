"""Habit name normalization, casefold keys, and the §8.4 character check."""

from pathlib import Path

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient

from apps.server.database import open_database
from apps.server.errors import APIError
from apps.server.main import Dependencies, Settings, create_app
from apps.server.town.engine import (
    NAME_CHARACTERS_ERROR,
    NAME_LENGTH_ERROR,
    name_field_errors,
    name_key,
    name_validation_error,
    normalize_name,
    validate_name,
)
from apps.server.town.models import make_name_key


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


def test_casefold_longer_than_40_is_rejected_and_not_truncated():
    assert make_name_key is name_key
    short = "a" * 39 + "s"
    assert name_key(short) == short
    # Truncation used to make 39 a's plus ß equal 39 a's plus s.
    assert ("a" * 39 + "ß").casefold()[:40] == short
    with pytest.raises(APIError) as eszett:
        name_key("a" * 39 + "ß")
    assert eszett.value.status_code == 422
    assert eszett.value.code == "name_too_long"
    assert eszett.value.message == NAME_LENGTH_ERROR
    dotted = ("a" * 39 + "\u0130").casefold()
    assert len(dotted) == 41 and dotted[-1] == "\u0307"
    with pytest.raises(APIError) as mark:
        name_key("a" * 39 + "\u0130")
    assert mark.value.code == "name_too_long"
    assert mark.value.message == NAME_LENGTH_ERROR
    with pytest.raises(APIError) as many:
        name_key("ß" * 40)
    assert many.value.code == "name_too_long"
    assert name_key("ß" * 20) == "ss" * 20
    length = validate_name("a" * 41)
    assert length.ok is False and length.error is None
    assert name_field_errors(length) == {"name": NAME_LENGTH_ERROR}
    assert name_field_errors(length)["name"] is not None
    assert name_field_errors(validate_name("Read")) == {}
    characters = validate_name("a\tb")
    assert name_field_errors(characters) == {"name": NAME_CHARACTERS_ERROR}
    with pytest.raises(ValueError, match="passed validation"):
        name_validation_error(validate_name("Read"))


def test_length_failure_serializes_the_copy_not_null(tmp_path: Path):
    result = validate_name("a" * 41)
    assert result.ok is False and result.error is None
    router = APIRouter()

    @router.post("/town-name-length-probe")
    def probe() -> None:
        raise name_validation_error(result)

    url = f"sqlite:///{tmp_path / 'site.db'}"
    application = create_app(
        Settings(
            database_url=url,
            release="test",
            web_root=tmp_path / "web",
            openapi=False,
        ),
        Dependencies(
            database=open_database(url),
            check_schema=False,
            check_frontend=False,
            test_router=router,
        ),
    )
    with TestClient(application) as client:
        response = client.post("/town-name-length-probe")
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert body["message"] == "Check the highlighted fields."
    assert body["field_errors"] == {"name": "Use 1 to 40 characters."}
    assert body["field_errors"]["name"] is not None
    assert body["retry_after"] is None
