import base64
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from sqlalchemy import delete

from apps.finance.backend.main import Base, app, engine
from apps.finance.backend.models import EncryptedRecord
from apps.finance.backend.services.encrypted_storage import (
    ALLOWED_COLLECTIONS,
    wipe_encrypted_user_data,
)
from apps.finance.backend.tests.conftest import authenticated_client

_HEALTH = (
    ("health_stats", "hlt_stats0001"),
    ("health_prs", "hlt_prs000001"),
)


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def _b64(n: int = 64) -> str:
    return base64.b64encode(b"x" * n).decode("ascii")


def _setup(client) -> None:
    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": _b64(16),
            "kdf_iterations": 600000,
            "wrapped_dek_b64": _b64(48),
            "recovery_wrapped_dek_b64": _b64(48),
            "key_version": 1,
        },
    )
    assert setup.status_code == 200, setup.text


def _upsert(client, collection: str, client_id: str, *, expected_revision: int | None = None):
    record: dict[str, object] = {
        "collection": collection,
        "client_id": client_id,
        "ciphertext_b64": _b64(),
        "schema_version": 2,
        "key_version": 1,
    }
    if expected_revision is not None:
        record["expected_revision"] = expected_revision
    return client.post("/api/vault/records/upsert", json={"records": [record]})


def test_allowed_collections_include_health():
    assert {"health_stats", "health_prs"} <= ALLOWED_COLLECTIONS


def test_health_collections_roundtrip_conflict_counts_and_delete():
    client = authenticated_client(app, email="thv1-health-vault@example.com")
    _setup(client)
    for collection, client_id in _HEALTH:
        created = _upsert(client, collection, client_id)
        assert created.status_code == 200, created.text
        row = created.json()[0]
        assert row["client_id"] == client_id
        assert row["revision"] == 1
        assert row["ciphertext_b64"] == _b64()
        assert set(row) == {
            "collection",
            "client_id",
            "ciphertext_b64",
            "schema_version",
            "key_version",
            "revision",
            "updated_at",
        }
        listed = client.get(f"/api/vault/records?collection={collection}")
        assert listed.status_code == 200
        assert [item["client_id"] for item in listed.json()] == [client_id]
        conflict = _upsert(client, collection, client_id, expected_revision=99)
        assert conflict.status_code == 409

    counts = client.get("/api/vault/counts")
    assert counts.status_code == 200
    assert counts.json()["counts"]["health_stats"] == 1
    assert counts.json()["counts"]["health_prs"] == 1

    deleted = client.post(
        "/api/vault/records/delete",
        json={
            "records": [
                {"collection": collection, "client_id": client_id, "expected_revision": 1}
                for collection, client_id in _HEALTH
            ]
        },
    )
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] == 2
    for collection, _client_id in _HEALTH:
        assert client.get(f"/api/vault/records?collection={collection}").json() == []


def test_unknown_collection_is_rejected():
    client = authenticated_client(app, email="thv1-health-unknown@example.com")
    _setup(client)
    rejected = _upsert(client, "health_notes", "hlt_notes0001")
    assert rejected.status_code == 400
    assert rejected.json()["detail"] == "Unknown collection: health_notes"
    listed = client.get("/api/vault/records?collection=health_notes")
    assert listed.status_code == 400
    assert listed.json()["detail"] == "Unknown collection: health_notes"


def test_other_user_cannot_list_or_delete_health_rows():
    owner = authenticated_client(app, email="thv1-health-owner@example.com")
    other = authenticated_client(app, email="thv1-health-other@example.com")
    _setup(owner)
    for collection, client_id in _HEALTH:
        assert _upsert(owner, collection, client_id).status_code == 200

    assert other.get("/api/vault/records").json() == []
    for collection, _client_id in _HEALTH:
        assert other.get(f"/api/vault/records?collection={collection}").json() == []

    # The row is not this caller's, so delete is a no-op rather than a revision conflict.
    denied = other.post(
        "/api/vault/records/delete",
        json={
            "records": [
                {"collection": collection, "client_id": client_id, "expected_revision": 1}
                for collection, client_id in _HEALTH
            ]
        },
    )
    assert denied.status_code == 200
    assert denied.json() == {"deleted": 0}
    for collection, client_id in _HEALTH:
        rows = owner.get(f"/api/vault/records?collection={collection}").json()
        assert [row["client_id"] for row in rows] == [client_id]
        assert rows[0]["revision"] == 1


def test_wipe_encrypted_user_data_removes_health_rows():
    owner = authenticated_client(app, email="thv1-health-wipe@example.com")
    other = authenticated_client(app, email="thv1-health-keep@example.com")
    _setup(owner)
    _setup(other)
    for collection, client_id in _HEALTH:
        assert _upsert(owner, collection, client_id).status_code == 200
    assert _upsert(other, "health_stats", "hlt_stats0001").status_code == 200
    owner_id = owner.get("/api/auth/me").json()["user"]["id"]
    other_id = other.get("/api/auth/me").json()["user"]["id"]

    db = app.state.database.sessionmaker()
    try:
        owned = (
            db.query(EncryptedRecord)
            .filter(EncryptedRecord.user_id == owner_id)
            .order_by(EncryptedRecord.collection)
            .all()
        )
        assert [row.collection for row in owned] == ["health_prs", "health_stats"]
        wipe_encrypted_user_data(db, owner_id)
        db.commit()
        assert db.query(EncryptedRecord).filter(EncryptedRecord.user_id == owner_id).count() == 0
        kept = db.query(EncryptedRecord).filter(EncryptedRecord.user_id == other_id).all()
        assert [row.collection for row in kept] == ["health_stats"]
    finally:
        db.close()

    assert owner.get("/api/vault/records").json() == []
    assert len(other.get("/api/vault/records?collection=health_stats").json()) == 1
