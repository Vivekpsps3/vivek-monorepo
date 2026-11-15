"""Disposable private-record proof. The probe name never joins the production policy.

Route parity and source discovery for the same probe live in
``apps/server/tests/test_ref01_extension_contract.py``. Finance tests do not
import that server test module.
"""

import base64

import pytest
from fastapi import HTTPException
from sqlalchemy import delete

from apps.finance.backend.main import Base, app, engine
from apps.finance.backend.models import EncryptedRecord
from apps.finance.backend.services import encrypted_storage as store
from apps.finance.backend.tests.conftest import SessionLocal, authenticated_client

PROBE = "ref01_probe"


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def _cipher(label: str) -> str:
    return base64.b64encode(label.encode("ascii").ljust(16, b"q")).decode("ascii")


def _setup(client) -> None:
    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": base64.b64encode(b"s" * 16).decode("ascii"),
            "kdf_iterations": 600000,
            "wrapped_dek_b64": base64.b64encode(b"w" * 48).decode("ascii"),
            "recovery_wrapped_dek_b64": base64.b64encode(b"r" * 48).decode("ascii"),
            "key_version": 1,
        },
    )
    assert setup.status_code == 200, setup.text


def _record(ciphertext: str, expected_revision: int | None = None) -> dict:
    body = {
        "collection": PROBE,
        "client_id": "ref01_probe_1",
        "ciphertext_b64": ciphertext,
        "schema_version": 2,
        "key_version": 1,
    }
    if expected_revision is not None:
        body["expected_revision"] = expected_revision
    return body


def test_disposable_private_record_round_trip_then_unregister(monkeypatch):
    assert PROBE not in store.COLLECTION_POLICY.recovery
    original_policy = store.COLLECTION_POLICY
    original_allowed = store.ALLOWED_COLLECTIONS
    registered = store.CollectionPolicy(
        finance=original_policy.finance,
        health=original_policy.health | {PROBE},
    )
    monkeypatch.setattr(store, "COLLECTION_POLICY", registered)
    monkeypatch.setattr(store, "ALLOWED_COLLECTIONS", registered.recovery)
    store.assert_collection_contract(store.ALLOWED_COLLECTIONS, registered)
    assert PROBE in store.COLLECTION_POLICY.recovery

    client = authenticated_client(app, email="ref01-probe@example.com")
    _setup(client)
    created_cipher = _cipher("created")
    created = client.post("/api/vault/records/upsert", json={"records": [_record(created_cipher)]})
    assert created.status_code == 200, created.text
    assert created.json()[0]["revision"] == 1
    assert created.json()[0]["ciphertext_b64"] == created_cipher

    listed = client.get(f"/api/vault/records?collection={PROBE}")
    assert listed.status_code == 200
    assert listed.json()[0]["ciphertext_b64"] == created_cipher
    assert listed.json()[0]["revision"] == 1

    updated_cipher = _cipher("updated")
    updated = client.post(
        "/api/vault/records/upsert",
        json={"records": [_record(updated_cipher, expected_revision=1)]},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()[0]["revision"] == 2

    conflict = client.post(
        "/api/vault/records/upsert",
        json={"records": [_record(_cipher("stale"), expected_revision=1)]},
    )
    assert conflict.status_code == 409

    readable = client.get(f"/api/vault/records?collection={PROBE}")
    assert readable.json()[0]["revision"] == 2
    assert readable.json()[0]["ciphertext_b64"] == updated_cipher

    snapshot = client.get("/api/vault/recovery-snapshot")
    assert snapshot.status_code == 200, snapshot.text
    assert {"collection": PROBE, "schema_versions": [2], "count": 1} in snapshot.json()[
        "collections"
    ]
    assert snapshot.json()["records"][0]["collection"] == PROBE
    assert snapshot.json()["records"][0]["ciphertext_b64"] == updated_cipher

    monkeypatch.setattr(store, "COLLECTION_POLICY", original_policy)
    monkeypatch.setattr(store, "ALLOWED_COLLECTIONS", original_allowed)
    assert PROBE not in store.COLLECTION_POLICY.recovery

    rejected = client.post(
        "/api/vault/records/upsert",
        json={"records": [_record(_cipher("after"), expected_revision=2)]},
    )
    assert rejected.status_code == 400
    assert rejected.json()["detail"] == f"Unknown collection: {PROBE}"

    removed = client.post(
        "/api/vault/records/delete",
        json={
            "records": [{"collection": PROBE, "client_id": "ref01_probe_1", "expected_revision": 2}]
        },
    )
    assert removed.status_code == 400
    assert removed.json()["detail"] == f"Unknown collection: {PROBE}"

    refused = client.get("/api/vault/recovery-snapshot")
    assert refused.status_code == 422
    assert "unsupported collection" in refused.json()["detail"]

    owner_id = client.get("/api/auth/me").json()["user"]["id"]
    with SessionLocal() as db:
        row = db.query(EncryptedRecord).filter_by(user_id=owner_id, collection=PROBE).one()
        assert row.ciphertext_b64 == updated_cipher
        assert row.revision == 2
        with pytest.raises(HTTPException, match="Unknown collection") as caught:
            store.validate_collection(PROBE)
        assert caught.value.status_code == 400
