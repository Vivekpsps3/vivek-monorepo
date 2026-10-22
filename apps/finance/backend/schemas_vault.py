from __future__ import annotations

from pydantic import BaseModel, Field

from apps.finance.backend.kdf_policy import MAX_PBKDF2_ITERATIONS, MIN_PBKDF2_ITERATIONS


class VaultCreateRequest(BaseModel):
    kdf_algorithm: str = "PBKDF2"
    kdf_salt_b64: str
    kdf_iterations: int = Field(
        MIN_PBKDF2_ITERATIONS, ge=MIN_PBKDF2_ITERATIONS, le=MAX_PBKDF2_ITERATIONS
    )
    wrapped_dek_b64: str
    # Legacy column; recovery-key path removed. Empty string means unused.
    recovery_wrapped_dek_b64: str = ""
    key_version: int = 1


class VaultUpdateRequest(BaseModel):
    kdf_salt_b64: str | None = None
    kdf_iterations: int | None = Field(None, ge=MIN_PBKDF2_ITERATIONS, le=MAX_PBKDF2_ITERATIONS)
    wrapped_dek_b64: str | None = None
    recovery_wrapped_dek_b64: str | None = None
    key_version: int | None = None


class VaultResponse(BaseModel):
    exists: bool
    kdf_algorithm: str | None = None
    kdf_salt_b64: str | None = None
    kdf_iterations: int | None = None
    wrapped_dek_b64: str | None = None
    recovery_wrapped_dek_b64: str | None = None
    key_version: int | None = None


class BlindIndexInput(BaseModel):
    index_name: str
    index_value_b64: str


class EncryptedRecordInput(BaseModel):
    collection: str
    client_id: str
    ciphertext_b64: str
    schema_version: int = 1
    key_version: int = 1
    expected_revision: int | None = None
    indexes: list[BlindIndexInput] = Field(default_factory=list)


class EncryptedRecordBatchUpsert(BaseModel):
    records: list[EncryptedRecordInput]


class EncryptedRecordDeleteItem(BaseModel):
    collection: str
    client_id: str
    expected_revision: int


class EncryptedRecordBatchDelete(BaseModel):
    records: list[EncryptedRecordDeleteItem]


class EncryptedRecordResponse(BaseModel):
    collection: str
    client_id: str
    ciphertext_b64: str
    schema_version: int
    key_version: int
    revision: int
    updated_at: str


class BlindIndexLookupRequest(BaseModel):
    collection: str
    index_name: str
    index_value_b64: str
