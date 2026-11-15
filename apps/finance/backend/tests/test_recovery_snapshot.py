"""Recovery enumeration uses the owner contract and never returns another owner."""

import base64

import pytest
from sqlalchemy import delete

from apps.finance.backend.main import Base, app, engine
from apps.finance.backend.models import EncryptedRecord, utc_now
from apps.finance.backend.services import encrypted_storage as store
from apps.finance.backend.tests.conftest import SessionLocal, authenticated_client


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def seed(owner, collection, *, schema=2, ciphertext=None):
    with SessionLocal() as db:
        db.add(
            EncryptedRecord(
                user_id=owner,
                collection=collection,
                client_id=f"recovery_{collection}",
                ciphertext_b64=ciphertext or base64.b64encode(b"synthetic ciphertext" * 4).decode(),
                schema_version=schema,
                key_version=1,
                revision=7,
                updated_at=utc_now(),
            )
        )
        db.commit()


def test_all_collection_manifest_and_current_owner_only():
    owner = authenticated_client(app)
    other = authenticated_client(app, email="other@example.com")
    owner_id = owner.get("/api/auth/me").json()["user"]["id"]
    other_id = other.get("/api/auth/me").json()["user"]["id"]
    for name in store.COLLECTION_POLICY.recovery:
        seed(owner_id, name, schema=2 if name in store.COLLECTION_POLICY.health else 1)
    seed(other_id, "transactions", ciphertext="FOREIGN_CIPHERTEXT")
    response = owner.get("/api/vault/recovery-snapshot")
    assert response.status_code == 200, response.text
    body = response.json()
    assert {row["collection"] for row in body["collections"]} == store.ALLOWED_COLLECTIONS
    assert all(row["count"] == 1 for row in body["collections"])
    assert len(body["records"]) == len(store.ALLOWED_COLLECTIONS)
    assert all(row["revision"] == 7 for row in body["records"])
    assert "FOREIGN_CIPHERTEXT" not in response.text
    assert not ({"user_id", "wrapped_dek_b64", "cookies"} & body.keys())
    for row in body["collections"]:
        assert row["schema_versions"] == (
            [2] if row["collection"] in store.COLLECTION_POLICY.health else [1, 2]
        )


def test_new_owner_registered_collection_needs_no_recovery_list(monkeypatch):
    client = authenticated_client(app)
    owner = client.get("/api/auth/me").json()["user"]["id"]
    policy = store.CollectionPolicy(
        finance=store.COLLECTION_POLICY.finance,
        health=store.COLLECTION_POLICY.health | {"future_review"},
    )
    monkeypatch.setattr(store, "COLLECTION_POLICY", policy)
    monkeypatch.setattr(store, "ALLOWED_COLLECTIONS", policy.recovery)
    store.assert_collection_contract(store.ALLOWED_COLLECTIONS, policy)
    seed(owner, "future_review")
    response = client.get("/api/vault/recovery-snapshot")
    assert response.status_code == 200
    assert {"collection": "future_review", "schema_versions": [2], "count": 1} in response.json()[
        "collections"
    ]
    assert response.json()["records"][0]["collection"] == "future_review"


@pytest.mark.parametrize(
    "collection,schema", [("future_unknown", 2), ("transactions", 3), ("health_stats", 1)]
)
def test_unknown_or_unsupported_record_fails_whole_snapshot(collection, schema):
    client = authenticated_client(app)
    owner = client.get("/api/auth/me").json()["user"]["id"]
    seed(owner, collection, schema=schema)
    response = client.get("/api/vault/recovery-snapshot")
    assert response.status_code == 422
    assert "records" not in response.json()
    with SessionLocal() as db:
        assert db.query(EncryptedRecord).filter_by(user_id=owner).count() == 1


@pytest.mark.parametrize("limit", ["MAX_RECOVERY_RECORDS", "MAX_RECOVERY_CIPHERTEXT_CHARS"])
def test_limit_refuses_partial_snapshot_without_mutation(monkeypatch, limit):
    client = authenticated_client(app)
    owner = client.get("/api/auth/me").json()["user"]["id"]
    seed(owner, "transactions")
    seed(owner, "assets")
    monkeypatch.setattr(store, limit, 1)
    response = client.get("/api/vault/recovery-snapshot")
    assert response.status_code == 413
    assert "partial" in response.json()["detail"]
    with SessionLocal() as db:
        assert db.query(EncryptedRecord).filter_by(user_id=owner).count() == 2
