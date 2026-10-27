from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.server.identity.models import Base, utc_now


class TickerQuote(Base):
    """Cached EOD close per symbol."""

    __tablename__ = "ticker_quotes"
    symbol: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    close_price: Mapped[float] = mapped_column(Float, nullable=False)
    quote_date: Mapped[date] = mapped_column(Date, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String, default="sqlite_eod", nullable=False)


class MarketResearchCache(Base):
    """Public market research payload cache keyed by symbol and period."""

    __tablename__ = "market_research_cache"
    symbol: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    period: Mapped[str] = mapped_column(String, primary_key=True, default="10y", nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String, default="yfinance", nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)


class UserVault(Base):
    """Browser-owned DEK wraps only. Backend never sees passphrase or unwrapped key."""

    __tablename__ = "user_vaults"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True
    )
    kdf_algorithm: Mapped[str] = mapped_column(String, nullable=False, default="PBKDF2")
    kdf_salt_b64: Mapped[str] = mapped_column(String, nullable=False)
    kdf_iterations: Mapped[int] = mapped_column(Integer, nullable=False, default=310000)
    wrapped_dek_b64: Mapped[str] = mapped_column(Text, nullable=False)
    recovery_wrapped_dek_b64: Mapped[str] = mapped_column(Text, nullable=False)
    key_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, nullable=False
    )


class EncryptedRecord(Base):
    """Opaque finance ciphertext. Backend validates ownership/metadata only."""

    __tablename__ = "encrypted_records"
    __table_args__ = (
        UniqueConstraint("user_id", "collection", "client_id", name="uq_user_collection_client_id"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    collection: Mapped[str] = mapped_column(String, nullable=False, index=True)
    client_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    ciphertext_b64: Mapped[str] = mapped_column(Text, nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    key_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, nullable=False, index=True
    )


class EncryptedRecordIndex(Base):
    """Optional HMAC blind indexes for exact-match checks (e.g. import dedupe)."""

    __tablename__ = "encrypted_record_indexes"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "collection",
            "index_name",
            "index_value_b64",
            name="uq_user_blind_index_value",
        ),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    collection: Mapped[str] = mapped_column(String, nullable=False, index=True)
    client_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    index_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    index_value_b64: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
