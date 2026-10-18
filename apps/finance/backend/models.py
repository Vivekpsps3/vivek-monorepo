import enum
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def utc_now() -> datetime:
    return datetime.now(UTC)


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.user, nullable=False)
    password_hash = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    must_change_password = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)
    last_login_at = Column(DateTime, nullable=True)
    username = Column(String, unique=True, index=True, nullable=True)
    auth_public_key_b64 = Column(Text, nullable=True)
    auth_algorithm = Column(String, nullable=True)
    auth_key_version = Column(Integer, nullable=True)
    auth_kdf_salt_b64 = Column(String, nullable=True)
    auth_kdf_iterations = Column(Integer, nullable=True)
    auth_wrapped_private_key_b64 = Column(Text, nullable=True)
    auth_recovery_wrapped_private_key_b64 = Column(Text, nullable=True)
    passwordless_enrolled_at = Column(DateTime, nullable=True)


class AuthChallenge(Base):
    __tablename__ = "auth_challenges"
    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(String, unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    challenge_hash = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    consumed_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)


class AuthEnrollment(Base):
    __tablename__ = "auth_enrollments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    consumed_at = Column(DateTime, nullable=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)


class UserSession(Base):
    __tablename__ = "user_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, unique=True, index=True, nullable=False)
    csrf_token_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    last_seen_at = Column(DateTime, default=utc_now, nullable=False)
    revoked_at = Column(DateTime, nullable=True, index=True)
    migration_only = Column(Boolean, default=False, nullable=False)
    user_agent = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(Integer, primary_key=True, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    target_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    event_type = Column(String, nullable=False, index=True)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False, index=True)


class TickerQuote(Base):
    """Cached EOD close per symbol."""

    __tablename__ = "ticker_quotes"
    symbol = Column(String, primary_key=True, index=True)
    close_price = Column(Float, nullable=False)
    quote_date = Column(Date, nullable=False)
    fetched_at = Column(DateTime, nullable=False, index=True)
    source = Column(String, default="sqlite_eod", nullable=False)


class MarketResearchCache(Base):
    """Public market research payload cache keyed by symbol and period."""

    __tablename__ = "market_research_cache"
    symbol = Column(String, primary_key=True, index=True)
    period = Column(String, primary_key=True, default="10y", nullable=False)
    payload_json = Column(Text, nullable=False)
    source = Column(String, default="yfinance", nullable=False)
    fetched_at = Column(DateTime, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)


class UserVault(Base):
    """Browser-owned DEK wraps only. Backend never sees passphrase or unwrapped key."""

    __tablename__ = "user_vaults"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    kdf_algorithm = Column(String, nullable=False, default="PBKDF2")
    kdf_salt_b64 = Column(String, nullable=False)
    kdf_iterations = Column(Integer, nullable=False, default=310000)
    wrapped_dek_b64 = Column(Text, nullable=False)
    recovery_wrapped_dek_b64 = Column(Text, nullable=False)
    key_version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)


class EncryptedRecord(Base):
    """Opaque finance ciphertext. Backend validates ownership/metadata only."""

    __tablename__ = "encrypted_records"
    __table_args__ = (
        UniqueConstraint("user_id", "collection", "client_id", name="uq_user_collection_client_id"),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    collection = Column(String, nullable=False, index=True)
    client_id = Column(String, nullable=False, index=True)
    ciphertext_b64 = Column(Text, nullable=False)
    schema_version = Column(Integer, nullable=False, default=1)
    key_version = Column(Integer, nullable=False, default=1)
    revision = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False, index=True)


class EncryptedRecordIndex(Base):
    """Optional HMAC blind indexes for exact-match checks (e.g. import dedupe)."""

    __tablename__ = "encrypted_record_indexes"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "collection", "index_name", "index_value_b64", name="uq_user_blind_index_value"
        ),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    collection = Column(String, nullable=False, index=True)
    client_id = Column(String, nullable=False, index=True)
    index_name = Column(String, nullable=False, index=True)
    index_value_b64 = Column(String, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
