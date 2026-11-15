"""Habit name normalization, casefold keys, and the §8.4 character check."""

from pathlib import Path

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient

from apps.server.database import open_database
from apps.server.errors import APIError
from apps.server.main import Dependencies, Settings, create_app
from apps.server.town.engine import (
    name_key,
)


def test_name_too_long_sets_field_errors_name(tmp_path: Path):
    with pytest.raises(APIError) as caught:
        name_key("a" * 39 + "ß")
    error = caught.value
    assert error.status_code == 422
    assert error.code == "name_too_long"
    assert error.message == "Use 1 to 40 characters."
    assert error.field_errors == {"name": "Use 1 to 40 characters."}
    router = APIRouter()

    @router.post("/town-name-too-long-probe")
    def probe() -> None:
        raise error

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
        response = client.post("/town-name-too-long-probe")
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "name_too_long"
    assert body["message"] == "Use 1 to 40 characters."
    assert body["detail"] == "Use 1 to 40 characters."
    assert body["field_errors"] == {"name": "Use 1 to 40 characters."}
    assert body["field_errors"]["name"] is not None
    assert body["retry_after"] is None
