import base64
import importlib.util
import os
import subprocess
import sys
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from sqlalchemy import delete

from apps.finance.backend.main import Base, app, engine
from apps.finance.backend.models import EncryptedRecord, utc_now
from apps.finance.backend.services.encrypted_storage import (
    ALLOWED_COLLECTIONS,
    COLLECTION_POLICY,
    CollectionContractError,
    CollectionPolicy,
    assert_collection_contract,
)
from apps.finance.backend.tests.conftest import authenticated_client

ROOT = Path(__file__).resolve().parents[4]


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def _policy_script():
    path = ROOT / "scripts" / "check_collection_policy.py"
    spec = importlib.util.spec_from_file_location("check_collection_policy", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _b64(n: int = 64) -> str:
    return base64.b64encode(b"x" * n).decode("ascii")


def _cipher(name: str) -> str:
    return base64.b64encode(name.encode("ascii").ljust(16, b"q")).decode("ascii")


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


def test_local1_accepted_name_absent_from_policy_fails():
    script = _policy_script()
    accepted = set(ALLOWED_COLLECTIONS) | {"future_private"}
    errors = script.evaluate(
        accepted,
        set(COLLECTION_POLICY.finance),
        set(COLLECTION_POLICY.health),
        set(COLLECTION_POLICY.health),
    )
    assert errors == ["server-accepted names absent from owner/recovery policy: future_private"]
    with pytest.raises(CollectionContractError, match="future_private"):
        assert_collection_contract(frozenset(accepted), COLLECTION_POLICY)


def test_contract_rejects_overlap_equal_subsets_and_unaccepted_policy_names():
    overlap = CollectionPolicy(
        finance=frozenset({"transactions", "health_stats"}),
        health=frozenset({"health_stats", "health_prs"}),
    )
    with pytest.raises(CollectionContractError, match="overlap"):
        assert_collection_contract(overlap.recovery, overlap)

    empty_finance = CollectionPolicy(
        finance=frozenset(),
        health=frozenset({"health_stats"}),
    )
    with pytest.raises(CollectionContractError, match="must differ"):
        assert_collection_contract(empty_finance.recovery, empty_finance)

    extra = CollectionPolicy(
        finance=frozenset({"transactions", "assets"}),
        health=frozenset({"health_stats"}),
    )
    with pytest.raises(CollectionContractError, match="does not accept"):
        assert_collection_contract(frozenset({"transactions", "health_stats"}), extra)


def test_foreign_copy_must_match_the_health_subset():
    script = _policy_script()
    errors = script.evaluate(
        set(ALLOWED_COLLECTIONS),
        set(COLLECTION_POLICY.finance),
        set(COLLECTION_POLICY.health),
        set(),
    )
    assert any("Finance foreign subset" in error for error in errors)


def test_live_collection_policy_parity_script():
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "check_collection_policy.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "collection policy parity passed" in result.stdout


def test_local2_owner_subsets_differ_and_allowed_records_stay():
    assert COLLECTION_POLICY.finance.isdisjoint(COLLECTION_POLICY.health)
    assert COLLECTION_POLICY.finance != COLLECTION_POLICY.health
    assert COLLECTION_POLICY.recovery == ALLOWED_COLLECTIONS
    assert COLLECTION_POLICY.health == frozenset({"health_stats", "health_prs"})

    client = authenticated_client(app, email="con03-owners@example.com")
    _setup(client)
    for name in sorted(ALLOWED_COLLECTIONS):
        created = client.post(
            "/api/vault/records/upsert",
            json={
                "records": [
                    {
                        "collection": name,
                        "client_id": f"rec_{name}",
                        "ciphertext_b64": _cipher(name),
                        "schema_version": 2,
                        "key_version": 1,
                    }
                ]
            },
        )
        assert created.status_code == 200, created.text
        row = created.json()[0]
        assert row["collection"] == name
        assert row["revision"] == 1
        assert row["ciphertext_b64"] == _cipher(name)
        assert row["schema_version"] == 2

    listed = client.get("/api/vault/records")
    assert listed.status_code == 200
    by_collection = {row["collection"]: row for row in listed.json()}
    assert set(by_collection) == set(ALLOWED_COLLECTIONS)
    for name, row in by_collection.items():
        assert row["ciphertext_b64"] == _cipher(name)
        assert row["revision"] == 1
        assert row["schema_version"] == 2

    counts = client.get("/api/vault/counts")
    assert counts.status_code == 200
    assert counts.json()["counts"] == {name: 1 for name in sorted(ALLOWED_COLLECTIONS)}


def test_local3_unknown_row_survives_list_save_and_rejected_delete():
    client = authenticated_client(app, email="con03-unknown@example.com")
    _setup(client)
    owner_id = client.get("/api/auth/me").json()["user"]["id"]
    cipher = _cipher("future_private")
    db = app.state.database.sessionmaker()
    try:
        db.add(
            EncryptedRecord(
                user_id=owner_id,
                collection="future_private",
                client_id="future_private_1",
                ciphertext_b64=cipher,
                schema_version=1,
                key_version=1,
                revision=4,
                created_at=utc_now(),
                updated_at=utc_now(),
            )
        )
        db.commit()
    finally:
        db.close()

    listed = client.get("/api/vault/records")
    assert listed.status_code == 200
    unknown = [row for row in listed.json() if row["collection"] == "future_private"]
    assert len(unknown) == 1
    assert unknown[0]["ciphertext_b64"] == cipher
    assert unknown[0]["revision"] == 4
    assert unknown[0]["schema_version"] == 1

    saved = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "assets",
                    "client_id": "rec_assets_1",
                    "ciphertext_b64": _cipher("assets"),
                    "schema_version": 2,
                    "key_version": 1,
                }
            ]
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()[0]["revision"] == 1

    rejected = client.post(
        "/api/vault/records/delete",
        json={
            "records": [
                {
                    "collection": "future_private",
                    "client_id": "future_private_1",
                    "expected_revision": 4,
                }
            ]
        },
    )
    assert rejected.status_code == 400
    assert rejected.json()["detail"] == "Unknown collection: future_private"

    again = client.get("/api/vault/records")
    rows = {row["collection"]: row for row in again.json()}
    assert rows["future_private"]["ciphertext_b64"] == cipher
    assert rows["future_private"]["revision"] == 4
    assert rows["future_private"]["schema_version"] == 1
    assert rows["assets"]["ciphertext_b64"] == _cipher("assets")
    assert rows["assets"]["revision"] == 1


def test_local4_current_schema_record_stays_readable():
    client = authenticated_client(app, email="con03-revision@example.com")
    _setup(client)
    original = _cipher("transactions")
    created = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "transactions",
                    "client_id": "rec_transactions",
                    "ciphertext_b64": original,
                    "schema_version": 2,
                    "key_version": 1,
                }
            ]
        },
    )
    assert created.status_code == 200, created.text
    assert created.json()[0]["revision"] == 1
    assert created.json()[0]["schema_version"] == 2

    listed = client.get("/api/vault/records?collection=transactions")
    assert listed.status_code == 200
    assert listed.json()[0]["ciphertext_b64"] == original
    assert listed.json()[0]["revision"] == 1
    assert listed.json()[0]["schema_version"] == 2

    updated_cipher = _cipher("transactions-v2")
    updated = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "transactions",
                    "client_id": "rec_transactions",
                    "ciphertext_b64": updated_cipher,
                    "schema_version": 2,
                    "key_version": 1,
                    "expected_revision": 1,
                }
            ]
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()[0]["revision"] == 2
    assert updated.json()[0]["ciphertext_b64"] == updated_cipher

    conflict = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "transactions",
                    "client_id": "rec_transactions",
                    "ciphertext_b64": _cipher("transactions-stale"),
                    "schema_version": 2,
                    "key_version": 1,
                    "expected_revision": 1,
                }
            ]
        },
    )
    assert conflict.status_code == 409

    readable = client.get("/api/vault/records?collection=transactions")
    assert readable.status_code == 200
    assert readable.json()[0]["revision"] == 2
    assert readable.json()[0]["schema_version"] == 2
    assert readable.json()[0]["ciphertext_b64"] == updated_cipher
