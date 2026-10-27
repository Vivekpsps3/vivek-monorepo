import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from apps.finance.backend.main import Base, app, engine, market_data
from apps.finance.backend.tests.conftest import authenticated_client
from apps.server.identity.models import UserRole


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    market_data.clear_memory_cache()
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def test_health_is_public():
    client = TestClient(app)
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_finance_api_requires_login():
    client = TestClient(app)
    r = client.get("/api/vault/status")
    assert r.status_code == 401


def test_session_cookie_persists_and_slides_while_the_browser_is_in_use():
    from datetime import timedelta

    from apps.finance.backend.database import SessionLocal
    from apps.server.identity.models import UserSession
    from apps.server.identity.session import utc_now_naive

    client = authenticated_client(app, email="persist@example.com")
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    session_cookie = next(
        item for item in me.headers.get_list("set-cookie") if item.startswith("finance_session=")
    )
    assert "Max-Age=604800" in session_cookie
    assert "expires=" in session_cookie.lower()

    db = SessionLocal()
    try:
        row = db.query(UserSession).one()
        row.expires_at = utc_now_naive() + timedelta(hours=1)
        db.commit()
        row_id = row.id
    finally:
        db.close()

    assert client.get("/api/auth/me").status_code == 200
    db = SessionLocal()
    try:
        updated = db.query(UserSession).filter(UserSession.id == row_id).one()
        assert updated.expires_at > utc_now_naive() + timedelta(days=6)
    finally:
        db.close()


def test_session_probe_reuses_the_finance_login():
    client = authenticated_client(app, email="session-probe@example.com")
    probed = client.post("/api/auth/session")
    assert probed.status_code == 200, probed.text
    assert probed.json()["user"]["email"] == "session-probe@example.com"
    client.headers.pop("X-CSRF-Token", None)
    assert client.post("/api/auth/session").status_code == 403
    assert client.get("/api/auth/me").status_code == 200


def test_login_me_and_logout():
    client = authenticated_client(app, email="login@example.com")
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "login@example.com"

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 200
    assert client.get("/api/vault/status").status_code == 401


def test_mutations_require_csrf_header():
    client = authenticated_client(app, email="csrf@example.com")
    client.headers.pop("X-CSRF-Token", None)
    r = client.post("/api/auth/reset-data", json={"confirm": "CLEAR MY DATA"})
    assert r.status_code == 403


def test_admin_can_create_user_and_user_cannot_access_admin():
    admin = authenticated_client(app, email="admin@example.com", role=UserRole.admin)
    created = admin.post(
        "/api/admin/users",
        json={
            "username": "new.user",
            "display_name": "New User",
            "role": "user",
        },
    )
    assert created.status_code == 200
    assert created.json()["email"] == "new.user@pending.local"
    assert created.json()["enrollment_token"]

    normal = authenticated_client(app, email="normal@example.com")
    assert normal.get("/api/admin/users").status_code == 403


def test_inactive_user_cannot_login():
    admin = authenticated_client(app, email="admin2@example.com", role=UserRole.admin)
    created = admin.post(
        "/api/admin/users",
        json={
            "username": "disabled.user",
            "display_name": "Disabled",
            "role": "user",
        },
    ).json()
    admin.patch(f"/api/admin/users/{created['id']}", json={"is_active": False})

    client = TestClient(app)
    r = client.post("/api/auth/passwordless/challenge", json={"username": "disabled.user"})
    assert r.status_code == 200
    assert set(r.json()) == {"challenge_id", "challenge", "message", "expires_at"}


def test_admin_can_delete_user_and_owned_data_is_removed():
    admin = authenticated_client(app, email="owner-admin@example.com", role=UserRole.admin)
    login = authenticated_client(app, email="delete-me@example.com")
    created = login.get("/api/auth/me").json()["user"]
    db = app.state.database.sessionmaker()
    try:
        from apps.finance.backend.models import EncryptedRecord
        from apps.server.identity.models import User

        db.add(
            EncryptedRecord(
                user_id=created["id"],
                collection="transactions",
                client_id="tx-delete-me-01",
                ciphertext_b64="Y2lwaGVy",
                schema_version=2,
                key_version=1,
                revision=1,
            )
        )
        db.commit()
        delete = admin.delete(f"/api/admin/users/{created['id']}")
        assert delete.status_code == 200
        assert all(
            u["email"] != "delete-me@example.com" for u in admin.get("/api/admin/users").json()
        )
        assert db.query(User).filter(User.email == "delete-me@example.com").first() is None
        assert (
            db.query(EncryptedRecord).filter(EncryptedRecord.user_id == created["id"]).count() == 0
        )
    finally:
        db.close()


def test_user_can_reset_own_data_without_affecting_other_users():
    owner = authenticated_client(app, email="reset-owner@example.com")
    other = authenticated_client(app, email="reset-other@example.com")
    owner_id = owner.get("/api/auth/me").json()["user"]["id"]
    other_id = other.get("/api/auth/me").json()["user"]["id"]
    db = app.state.database.sessionmaker()
    try:
        from apps.finance.backend.models import EncryptedRecord

        db.add(
            EncryptedRecord(
                user_id=owner_id,
                collection="transactions",
                client_id="tx-owner-01",
                ciphertext_b64="Y2lwaGVy",
                schema_version=2,
                key_version=1,
                revision=1,
            )
        )
        db.add(
            EncryptedRecord(
                user_id=other_id,
                collection="transactions",
                client_id="tx-other-01",
                ciphertext_b64="Y2lwaGVy",
                schema_version=2,
                key_version=1,
                revision=1,
            )
        )
        db.commit()

        denied = owner.post("/api/auth/reset-data", json={"confirm": "CLEAR"})
        assert denied.status_code == 422

        reset = owner.post("/api/auth/reset-data", json={"confirm": "CLEAR MY DATA"})
        assert reset.status_code == 200
        assert owner.get("/api/auth/me").status_code == 200
        assert db.query(EncryptedRecord).filter(EncryptedRecord.user_id == owner_id).count() == 0
        assert db.query(EncryptedRecord).filter(EncryptedRecord.user_id == other_id).count() == 1
    finally:
        db.close()


def test_admin_cannot_delete_self_or_final_admin():
    admin = authenticated_client(app, email="solo-admin@example.com", role=UserRole.admin)
    me = admin.get("/api/auth/me").json()["user"]
    assert admin.delete(f"/api/admin/users/{me['id']}").status_code == 400

    second = admin.post(
        "/api/admin/users",
        json={
            "username": "second.admin",
            "display_name": "Second Admin",
            "role": "admin",
        },
    ).json()
    assert admin.delete(f"/api/admin/users/{second['id']}").status_code == 200


def test_admin_can_delete_inactive_admin_when_another_admin_is_active():
    admin = authenticated_client(app, email="active-admin@example.com", role=UserRole.admin)
    inactive_admin = admin.post(
        "/api/admin/users",
        json={
            "username": "inactive.admin",
            "display_name": "Inactive Admin",
            "role": "admin",
        },
    ).json()

    disable = admin.patch(f"/api/admin/users/{inactive_admin['id']}", json={"is_active": False})
    assert disable.status_code == 200

    delete = admin.delete(f"/api/admin/users/{inactive_admin['id']}")
    assert delete.status_code == 200
    assert all(
        u["email"] != "inactive-admin@example.com" for u in admin.get("/api/admin/users").json()
    )


def test_public_password_signup_is_unmounted():
    authenticated_client(app, email="setup-admin@example.com", role=UserRole.admin)
    client = TestClient(app)
    res = client.post(
        "/api/auth/signup",
        json={
            "email": "signup@example.com",
            "display_name": "Signup User",
            "password": "signup-password",
        },
    )
    assert res.status_code == 404


def test_admin_can_sign_out_other_devices_without_wiping_the_current_one():
    from apps.finance.backend.database import SessionLocal
    from apps.server.identity.models import UserSession

    admin = authenticated_client(app, email="session-admin@example.com", role=UserRole.admin)
    me = admin.get("/api/auth/me").json()["user"]
    other = TestClient(app)
    logged = other.post(
        "/api/auth/login/migrate",
        json={"email": "session-admin@example.com", "password": "correct-horse-battery-staple"},
    )
    assert logged.status_code == 200
    db = SessionLocal()
    try:
        db.query(UserSession).filter(UserSession.user_id == me["id"]).update(
            {UserSession.migration_only: False}, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()

    revoked = admin.post(f"/api/admin/users/{me['id']}/revoke-sessions")
    assert revoked.status_code == 200
    assert revoked.json()["revoked"] == 1
    assert admin.get("/api/auth/me").status_code == 200
    assert other.get("/api/auth/me").status_code == 401


def test_enrollment_link_can_be_replaced_and_reset_confirms_the_username():
    from apps.finance.backend.tests.test_auth_challenge import passwordless_material

    admin = authenticated_client(app, email="invite-admin@example.com", role=UserRole.admin)
    created = admin.post(
        "/api/admin/users",
        json={"username": "ada.lovelace", "display_name": "Ada Lovelace", "role": "user"},
    ).json()
    preview = TestClient(app).get(f"/api/auth/invitations/{created['enrollment_token']}")
    assert preview.status_code == 200
    assert preview.json()["username"] == "ada.lovelace"
    assert preview.json()["display_name"] == "Ada Lovelace"

    again = admin.post(f"/api/admin/users/{created['id']}/enrollment")
    assert again.status_code == 200
    assert again.json()["enrollment_token"] != created["enrollment_token"]
    assert (
        TestClient(app).get(f"/api/auth/invitations/{created['enrollment_token']}").status_code
        == 401
    )
    fresh = TestClient(app).get(f"/api/auth/invitations/{again.json()['enrollment_token']}")
    assert fresh.status_code == 200

    enrolled = TestClient(app).post(
        f"/api/auth/invitations/{again.json()['enrollment_token']}/enroll",
        json=passwordless_material(),
    )
    assert enrolled.status_code == 200
    assert admin.post(f"/api/admin/users/{created['id']}/enrollment").status_code == 409

    denied = admin.post(
        f"/api/admin/users/{created['id']}/reset-contents",
        json={"confirm": "RESET ada.lovelace@pending.local"},
    )
    assert denied.status_code == 400
    reset = admin.post(
        f"/api/admin/users/{created['id']}/reset-contents",
        json={"confirm": "RESET ada.lovelace"},
    )
    assert reset.status_code == 200
    recent = admin.get("/api/admin/metrics").json()["recent"]
    assert any("erased finance data" in item["summary"] for item in recent)
    ada = next(
        row
        for row in admin.get("/api/admin/metrics").json()["per_user"]
        if row["id"] == created["id"]
    )
    assert ada["active_sessions"] == 0
    assert ada["enrolled"] is True


def test_public_password_bootstrap_is_unmounted():
    client = TestClient(app)
    res = client.post(
        "/api/auth/bootstrap",
        json={"email": "first@example.com", "display_name": "First", "password": "first-password"},
    )
    assert res.status_code == 404
