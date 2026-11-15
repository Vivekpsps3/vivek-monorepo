"""Route parity over the document handler, settings registry, and example owner.

Settings paths come from settings.registry.ts. Document patterns and aliases
come from routes.json. Representative mounted, reserved, alias, and unknown
paths come from apps/web/route-examples.json. This file does not keep a second
copy of those lists.
"""

import copy
import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.server.frontend import document_kind
from apps.server.security_headers import classify, content_security_policy

ROOT = Path(__file__).resolve().parents[3]
MANIFEST_PATH = ROOT / "apps/web/routes.json"
EXAMPLES_PATH = ROOT / "apps/web/route-examples.json"
REGISTRY_PATH = ROOT / "apps/web/src/app/settings/settings.registry.ts"
_SETTINGS_DOCUMENT = re.compile(r"^settings\(\?:/\(\?:([a-z0-9-]+(?:\|[a-z0-9-]+)*)\)\)\?$")
_STATUSES = {
    "mounted",
    "reserved",
    "alias",
    "public",
    "unknown-page",
    "unknown-asset",
    "unknown-api",
}


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def load_examples() -> list[dict]:
    rows = json.loads(EXAMPLES_PATH.read_text(encoding="utf-8"))["examples"]
    ids = [row["id"] for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError(f"duplicate route example id: {ids}")
    unknown = {row["status"] for row in rows} - _STATUSES
    if unknown:
        raise ValueError(f"unknown route example status: {sorted(unknown)}")
    return rows


def registry_sections(source: str | None = None) -> list[str]:
    text = source if source is not None else REGISTRY_PATH.read_text(encoding="utf-8")
    match = re.search(r"export const SETTINGS_SECTIONS\b[^=]*=\s*\[([\s\S]*?)\n\];", text)
    if match is None:
        raise ValueError("SETTINGS_SECTIONS is missing")
    paths = re.findall(r"\bpath:\s*'([a-z0-9-]+)'", match.group(1))
    if not paths:
        raise ValueError("SETTINGS_SECTIONS declares no paths")
    return paths


def settings_document_sections(manifest: dict) -> list[str]:
    found: list[str] | None = None
    for pattern in manifest["private"]:
        match = _SETTINGS_DOCUMENT.fullmatch(pattern)
        if match is None:
            continue
        if found is not None:
            raise ValueError("multiple settings document patterns")
        found = match.group(1).split("|")
    if found is None:
        raise ValueError("settings document pattern is not an explicit section list")
    return found


def settings_parity_errors(manifest: dict, sections: list[str]) -> list[str]:
    """Name each settings path the registry and the document manifest do not share."""
    declared = settings_document_sections(manifest)
    errors = [
        f"missing mounted settings route settings/{path} owner=settings"
        for path in sections
        if path not in declared
    ]
    errors.extend(
        f"settings document route settings/{path} has no mounted owner"
        for path in declared
        if path not in sections
    )
    unknown = "settings/not-a-section"
    if any(re.fullmatch(pattern, unknown) for pattern in manifest["private"]):
        errors.append(f"unknown settings path {unknown} is treated as a document")
    return errors


def omit_settings_section(manifest: dict, section: str) -> dict:
    sections = [item for item in settings_document_sections(manifest) if item != section]
    if len(sections) == len(settings_document_sections(manifest)):
        raise ValueError(f"settings manifest has no {section}")
    pattern = "settings(?:/(?:" + "|".join(sections) + "))?"
    copied = copy.deepcopy(manifest)
    copied["private"] = [
        pattern if _SETTINGS_DOCUMENT.fullmatch(item) else item for item in copied["private"]
    ]
    return copied


def _examples(status: str) -> list[dict]:
    return [row for row in load_examples() if row["status"] == status]


def _request_path(example: dict) -> str:
    path = "/" + example["path"] if example["path"] else "/"
    query = example.get("query")
    return f"{path}?{query}" if query else path


def _web_root(directory: Path, manifest: dict) -> None:
    directory.mkdir()
    (directory / "index.csr.html").write_text("<app-root></app-root>", encoding="utf-8")
    (directory / "index.html").write_text("<h1>Public home</h1>", encoding="utf-8")
    for name in manifest["public"]:
        if not name:
            continue
        folder = directory / name
        folder.mkdir()
        (folder / "index.html").write_text(f"<h1>{name}</h1>", encoding="utf-8")


def _client(directory: Path, manifest: dict | None = None):
    import apps.server.frontend as frontend
    from apps.server.main import Dependencies, Settings, create_app
    from apps.server.migrate import migrate

    database = directory / "site.db"
    migrate(database)
    web = directory / "web"
    active = manifest if manifest is not None else frontend.ROUTES
    _web_root(web, active)
    frontend.ROUTES = active
    application = create_app(
        Settings(
            database_url=f"sqlite:///{database}",
            release="route-parity",
            web_root=web,
            openapi=False,
        ),
        Dependencies(check_schema=False, check_frontend=False),
    )
    return TestClient(application)


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    import apps.server.frontend as frontend

    saved = frontend.ROUTES
    opened = _client(tmp_path_factory.mktemp("route-parity"))
    try:
        with opened as live:
            yield live
    finally:
        frontend.ROUTES = saved


def _assert_shell(response, path: str) -> None:
    assert response.status_code == 200, path
    assert response.headers["cache-control"] == "no-store"
    policy = response.headers["content-security-policy"]
    kind = classify(path)
    nonce = re.search(r"'nonce-([A-Za-z0-9_-]+)'", policy)
    assert nonce, policy
    assert policy == content_security_policy(kind, nonce.group(1))
    assert "unsafe-eval" not in policy
    assert "frame-ancestors 'none'" in policy
    if kind in {"finance", "travel", "media"}:
        assert "tile.openstreetmap.org" in policy
    else:
        assert "tile.openstreetmap.org" not in policy


def test_live_settings_registry_matches_the_document_manifest():
    errors = settings_parity_errors(load_manifest(), registry_sections())
    assert errors == []
    assert "profile" in registry_sections()


def test_settings_examples_do_not_copy_the_registry():
    listed = {
        row["path"]
        for row in load_examples()
        if row["status"] == "mounted" and row["owner"] == "settings"
    }
    owned = {f"settings/{path}" for path in registry_sections()}
    assert listed == {"settings/profile"}
    assert listed < owned


def test_omitted_profile_fails_with_the_missing_owner(tmp_path):
    import apps.server.frontend as frontend

    saved = frontend.ROUTES
    omitted = omit_settings_section(load_manifest(), "profile")
    errors = settings_parity_errors(omitted, registry_sections())
    assert errors == ["missing mounted settings route settings/profile owner=settings"]
    assert document_kind(omitted, "settings/profile") == "missing"
    assert document_kind(omitted, "settings/account") == "private"
    try:
        with _client(tmp_path, omitted) as client:
            missing = client.get("/settings/profile")
            # The document handler 404s. That status is the old passing assertion.
            assert missing.status_code == 404
            assert missing.json()["detail"] == "Not found"
            assert "<app-root" not in missing.text
            account = client.get("/settings/account")
            assert account.status_code == 200
            assert "<app-root" in account.text
    finally:
        frontend.ROUTES = saved
    assert errors


def test_extra_settings_document_has_no_mounted_owner():
    manifest = load_manifest()
    sections = [*settings_document_sections(manifest), "future"]
    manifest = copy.deepcopy(manifest)
    pattern = "settings(?:/(?:" + "|".join(sections) + "))?"
    manifest["private"] = [
        pattern if _SETTINGS_DOCUMENT.fullmatch(item) else item for item in manifest["private"]
    ]
    assert settings_parity_errors(manifest, registry_sections()) == [
        "settings document route settings/future has no mounted owner"
    ]


@pytest.mark.parametrize("example", _examples("mounted"), ids=lambda row: row["id"])
def test_mounted_examples_load_and_reload(client, example):
    assert document_kind(load_manifest(), example["path"]) == "private"
    first = client.get(_request_path(example))
    second = client.get(_request_path(example))
    for response in (first, second):
        _assert_shell(response, "/" + example["path"])
        assert "<app-root" in response.text
        assert "ngCspNonce=" in response.text


@pytest.mark.parametrize("example", _examples("reserved"), ids=lambda row: row["id"])
def test_reserved_examples_are_documents_not_mounted_pages(client, example):
    assert document_kind(load_manifest(), example["path"]) == "private"
    response = client.get("/" + example["path"])
    _assert_shell(response, "/" + example["path"])
    assert "<app-root" in response.text


@pytest.mark.parametrize("example", _examples("public"), ids=lambda row: row["id"])
def test_public_examples_load_and_reload(client, example):
    assert document_kind(load_manifest(), example["path"]) == "public"
    path = "/" + example["path"] if example["path"] else "/"
    first = client.get(path)
    second = client.get(path)
    for response in (first, second):
        _assert_shell(response, path)
        assert "<app-root" not in response.text
        if example["path"] == "":
            assert "Public home" in response.text


@pytest.mark.parametrize("example", _examples("alias"), ids=lambda row: row["id"])
def test_alias_examples_redirect_and_keep_query(client, example):
    manifest = load_manifest()
    assert manifest["aliases"][example["path"]] == example["target"]
    query = f"?{example['query']}" if example.get("query") else ""
    response = client.get(f"/{example['path']}{query}", follow_redirects=False)
    assert response.status_code == 308
    assert response.headers["location"] == f"/{example['target']}{query}"
    target = example["target"].strip("/")
    assert document_kind(manifest, target) in {"public", "private"}


def test_every_manifest_alias_preserves_a_deep_query(client):
    manifest = load_manifest()
    for source, target in manifest["aliases"].items():
        response = client.get(f"/{source}?from=deep", follow_redirects=False)
        assert response.status_code == 308, source
        assert response.headers["location"] == f"/{target}?from=deep"
        assert document_kind(manifest, target.strip("/")) in {"public", "private"}


def test_every_settings_section_is_a_private_document(client):
    manifest = load_manifest()
    for section in registry_sections():
        path = f"settings/{section}"
        assert document_kind(manifest, path) == "private", path
        response = client.get("/" + path)
        _assert_shell(response, "/" + path)
        assert "<app-root" in response.text
        assert "ngCspNonce=" in response.text
    bare = client.get("/settings")
    _assert_shell(bare, "/settings")
    assert "<app-root" in bare.text


@pytest.mark.parametrize(
    "example",
    _examples("unknown-page") + _examples("unknown-asset") + _examples("unknown-api"),
    ids=lambda row: row["id"],
)
def test_unknown_page_asset_and_api_paths_stay_404(client, example):
    response = client.get("/" + example["path"])
    assert response.status_code == 404, example["id"]
    assert "<app-root" not in response.text
    assert response.json()["detail"]
    assert "text/html" not in response.headers["content-type"]
