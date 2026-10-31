"""Discover every integer path parameter; compare failures with genuine missing rows."""

from pathlib import Path
from typing import Annotated

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from apps.server.auth import Principal
from apps.server.database import open_database
from apps.server.identity.models import User
from apps.server.identity.session import get_current_admin
from apps.server.main import Dependencies, Settings, create_app
from apps.server.path_ids import MAX_PATH_ID, bounded_path_id
from apps.server.tests.test_composition import _app

INVALID = ["abc", "1.5", "0", "-1", "9223372036854775808", "99999999999999999999999", ""]


def _routes(router, prefix=""):
    for route in router.routes:
        if isinstance(route, APIRoute):
            yield prefix, route
        elif hasattr(route, "original_router"):
            yield from _routes(route.original_router, prefix + route.include_context.prefix)


def _cases():
    database = open_database("sqlite:///:memory:")
    app = create_app(
        Settings("sqlite:///:memory:", "test", Path("/unused")),
        Dependencies(database=database, check_schema=False, check_frontend=False),
    )
    try:
        for prefix, route in _routes(app):
            for field in route.dependant.path_params:
                if field.field_info.annotation is not int:
                    continue
                for method in sorted(route.methods):
                    for value in INVALID:
                        path = route.path_format.format(
                            **{
                                p.name: value if p is field else "1"
                                for p in route.dependant.path_params
                            }
                        )
                        if value == "" and not route.path_regex.fullmatch(path):
                            continue  # Empty segments cannot reach this route's validator.
                        yield pytest.param(
                            prefix + route.path_format,
                            method,
                            field.name,
                            value,
                            id=f"{method} {prefix}{route.path}:{field.name}={value!r}",
                        )
    finally:
        database.engine.dispose()


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    app, database = _app(
        tmp_path_factory.mktemp("path-ids"), principal=Principal(1, "test", "Test")
    )
    app.dependency_overrides[get_current_admin] = lambda: User(id=1)
    with TestClient(app) as client:
        # A real parent ensures nested child-ID checks reach the missing child lookup.
        response = client.post(
            "/media/api/library", json={"kind": "artist", "title": "Seed artist"}
        )
        assert response.status_code == 200, response.text
        assert response.json()["id"] == 1
        yield client
    database.engine.dispose()


@pytest.mark.parametrize("path,method,name,value", list(_cases()))
def test_invalid_path_id_matches_unknown(client, path, method, name, value):
    fields = {part.split("}")[0]: "1" for part in path.split("{")[1:]}
    body = {
        "title": "Seed",
        "city": "Seed",
        "arrive_on": "2026-01-01",
        "leave_on": "2026-01-02",
        "on_date": "2026-01-01",
        "label": "Seed",
        "category": "other",
        "amount": "1.00",
        "body": "Seed note",
        "confirm": "RESET seed",
    }
    if "transports" in path:
        body.update(role="outbound", mode="flight")
    kwargs = {
        "json": body,
        "params": {"q": "seed"},
        "headers": {"X-Request-ID": "0" * 32},
        "follow_redirects": False,
    }
    unknown = client.request(method, path.format(**{**fields, name: str(MAX_PATH_ID)}), **kwargs)
    invalid = client.request(method, path.format(**{**fields, name: value}), **kwargs)
    assert unknown.status_code == 404, unknown.text
    assert invalid.status_code == unknown.status_code, invalid.text
    assert invalid.content == unknown.content
    assert invalid.headers == unknown.headers


def test_path_id_boundaries_and_unroutable_empty_segment():
    adapter: TypeAdapter[int] = TypeAdapter(Annotated[int, bounded_path_id("Missing")])
    assert adapter.validate_python("1") == 1
    assert adapter.validate_python(str(MAX_PATH_ID)) == MAX_PATH_ID
    with pytest.raises(HTTPException) as error:
        adapter.validate_python("")
    assert (error.value.status_code, error.value.detail) == (404, "Missing")
