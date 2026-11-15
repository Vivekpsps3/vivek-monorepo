"""Lit Map concepts API (L1a): CRUD, validation, CSRF, owner scoping."""

from datetime import UTC, date, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import insert

from apps.server.auth import Principal, require_principal
from apps.server.database import open_database
from apps.server.main import Dependencies, Settings, create_app
from apps.server.town.models import TownBase
from apps.server.world.models import WorldBase, WorldConcept
from apps.server.world.routes import get_world_clock

CLOCK = datetime(2026, 10, 29, 19, 0, tzinfo=UTC)  # Thu 29 Oct 2026, 12:00 PDT
TODAY = date(2026, 10, 29)


def _open(folder, principal=Principal(1, "tester", "Tester"), clock=CLOCK):
    url = f"sqlite:///{folder / 'site.db'}"
    database = open_database(url)
    TownBase.metadata.create_all(database.engine)
    WorldBase.metadata.create_all(database.engine)
    application = create_app(
        Settings(database_url=url, release="test", web_root=folder),
        Dependencies(
            database=database,
            principal=principal,
            check_schema=False,
            check_frontend=False,
        ),
    )
    application.dependency_overrides[get_world_clock] = lambda: clock
    return application, database


def _seed(db_session, user, name, understood_on=None, archived=False, **kw):
    values = {
        "user_id": user,
        "name": name,
        "name_key": name.casefold(),
        "note": kw.get("note"),
        "source": kw.get("source"),
        "understood_on": understood_on,
        "archived_at": datetime(2026, 10, 20, tzinfo=UTC) if archived else None,
        "created_at": kw.get("created_at", datetime(2026, 10, 1, tzinfo=UTC)),
        "updated_at": kw.get("updated_at", datetime(2026, 10, 1, tzinfo=UTC)),
    }
    return db_session.execute(insert(WorldConcept).values(**values)).inserted_primary_key[0]


def test_create_get_patch_delete_round_trip(tmp_path):
    application, _database = _open(tmp_path)
    with TestClient(application) as client:
        created = client.post(
            "/api/world/concepts",
            json={"name": " Kalman ", "note": "  ", "source": "", "understood_on": None},
        )
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["name"] == "Kalman"  # stored trimmed
        assert body["note"] is None and body["source"] is None  # empty -> NULL
        assert body["understood_on"] is None and body["archived"] is False
        concept_id = body["id"]

        marked = client.patch(
            f"/api/world/concepts/{concept_id}", json={"understood_on": "2026-10-29"}
        )
        assert marked.status_code == 200, marked.text
        assert marked.json()["understood_on"] == "2026-10-29"

        undone = client.patch(f"/api/world/concepts/{concept_id}", json={"understood_on": None})
        assert undone.json()["understood_on"] is None

        archived = client.patch(f"/api/world/concepts/{concept_id}", json={"archived": True})
        assert archived.json()["archived"] is True
        assert client.get("/api/world/concepts").json() == []
        assert [
            row["id"] for row in client.get("/api/world/concepts", params={"archived": 1}).json()
        ] == [concept_id]

        unarchived = client.patch(f"/api/world/concepts/{concept_id}", json={"archived": False})
        assert unarchived.json()["archived"] is False

        edited = client.patch(
            f"/api/world/concepts/{concept_id}",
            json={"name": "Kalman filter", "note": "A note", "source": "Book A"},
        )
        assert edited.json()["name"] == "Kalman filter"
        assert edited.json()["note"] == "A note"
        assert edited.json()["source"] == "Book A"

        deleted = client.delete(f"/api/world/concepts/{concept_id}")
        assert deleted.status_code == 204
        assert client.get("/api/world/concepts").json() == []
        assert client.delete(f"/api/world/concepts/{concept_id}").status_code == 404


def test_cross_user_404_and_invisibility(tmp_path):
    application, database = _open(tmp_path)
    with database.sessionmaker() as db:
        mine = _seed(db, 1, "Concept A", understood_on=date(2026, 10, 27))
        theirs = _seed(db, 2, "Concept A", understood_on=date(2026, 10, 27))
        db.commit()
    with TestClient(application) as client:
        assert (
            client.patch(f"/api/world/concepts/{theirs}", json={"name": "Hijack"}).status_code
            == 404
        )
        assert client.delete(f"/api/world/concepts/{theirs}").status_code == 404
        names = [row["name"] for row in client.get("/api/world/concepts").json()]
        assert names == ["Concept A"]
        world = client.get("/api/world").json()
        concept_ids = [c["id"] for w in world["weeks"] for c in w["concepts"]]
        assert concept_ids == [mine]
        application.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
        world_two = client.get("/api/world").json()
        assert [c["id"] for w in world_two["weeks"] for c in w["concepts"]] == [theirs]


def test_csrf_required_for_writes(tmp_path):
    from apps.server.identity.models import Base as IdentityBase
    from apps.server.identity.models import User, UserRole, UserSession
    from apps.server.identity.session import _hash_secret, utc_now_naive

    url = f"sqlite:///{tmp_path / 'site.db'}"
    database = open_database(url)
    IdentityBase.metadata.create_all(database.engine)
    TownBase.metadata.create_all(database.engine)
    WorldBase.metadata.create_all(database.engine)
    application = create_app(
        Settings(database_url=url, release="test", web_root=tmp_path),
        Dependencies(database=database, check_schema=False, check_frontend=False),
    )
    application.dependency_overrides[get_world_clock] = lambda: CLOCK
    now = utc_now_naive()
    db = database.sessionmaker()
    db.add(
        User(
            id=1,
            email="user1@example.com",
            display_name="User 1",
            username="user1",
            role=UserRole.user,
            is_active=True,
        )
    )
    db.flush()
    db.add(
        UserSession(
            user_id=1,
            token_hash=_hash_secret("token1"),
            csrf_token_hash=_hash_secret("csrf1"),
            expires_at=now + timedelta(hours=2),
            revoked_at=None,
        )
    )
    db.commit()
    db.close()

    def call(client, method, path, **kwargs):
        client.cookies.clear()
        headers = dict(kwargs.pop("headers", {}))
        headers["Cookie"] = "finance_session=token1; finance_csrf=csrf1"
        response = getattr(client, method)(path, headers=headers, **kwargs)
        client.cookies.clear()
        return response

    with TestClient(application, raise_server_exceptions=False) as client:
        denied = call(client, "post", "/api/world/concepts", json={"name": "Concept A"})
        assert denied.status_code == 403
        assert denied.json()["detail"] == "Invalid CSRF token"
        created = call(
            client,
            "post",
            "/api/world/concepts",
            json={"name": "Concept A"},
            headers={"X-CSRF-Token": "csrf1"},
        )
        assert created.status_code == 201, created.text
        concept_id = created.json()["id"]
        denied = call(
            client,
            "patch",
            f"/api/world/concepts/{concept_id}",
            json={"archived": True},
        )
        assert denied.status_code == 403
        ok = call(
            client,
            "patch",
            f"/api/world/concepts/{concept_id}",
            json={"archived": True},
            headers={"X-CSRF-Token": "csrf1"},
        )
        assert ok.status_code == 200
        denied = call(client, "delete", f"/api/world/concepts/{concept_id}")
        assert denied.status_code == 403
        ok = call(
            client,
            "delete",
            f"/api/world/concepts/{concept_id}",
            headers={"X-CSRF-Token": "csrf1"},
        )
        assert ok.status_code == 204
