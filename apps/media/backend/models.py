"""Media journal tables.

Catalog rows are shared public metadata. Ratings, reviews, progress,
season scores, and experiences are private to the finance user id that
created them.
"""

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class CatalogItem(Base):
    __tablename__ = "catalog_items"
    __table_args__ = (UniqueConstraint("source", "source_id", name="uq_catalog_source"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    creator: Mapped[str | None] = mapped_column(String(300))
    year: Mapped[int | None] = mapped_column(Integer)
    overview: Mapped[str | None] = mapped_column(Text)
    artwork_url: Mapped[str | None] = mapped_column(Text)
    genres: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="manual")
    source_id: Mapped[str | None] = mapped_column(String(120))
    extra: Mapped[str | None] = mapped_column(Text)
    external_ratings: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    entries: Mapped[list["UserEntry"]] = relationship(back_populates="catalog")
    episodes: Mapped[list["Episode"]] = relationship(cascade="all, delete-orphan")
    releases: Mapped[list["Release"]] = relationship(cascade="all, delete-orphan")


class UserEntry(Base):
    __tablename__ = "user_entries"
    __table_args__ = (UniqueConstraint("user_id", "catalog_id", name="uq_user_catalog"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    catalog_id: Mapped[int] = mapped_column(ForeignKey("catalog_items.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="want")
    rating: Mapped[float | None] = mapped_column(Float)
    review: Mapped[str | None] = mapped_column(Text)
    review_spoiler: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    review_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    summary: Mapped[str | None] = mapped_column(String(400))
    tags: Mapped[str | None] = mapped_column(Text)
    progress_value: Mapped[float | None] = mapped_column(Float)
    progress_unit: Mapped[str | None] = mapped_column(String(20))
    favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    anticipated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    catalog: Mapped[CatalogItem] = relationship(back_populates="entries")
    experiences: Mapped[list["Experience"]] = relationship(cascade="all, delete-orphan", order_by="Experience.id")
    seasons: Mapped[list["SeasonProgress"]] = relationship(cascade="all, delete-orphan")


class Experience(Base):
    __tablename__ = "experiences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("user_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    started_on: Mapped[date | None] = mapped_column(Date)
    finished_on: Mapped[date | None] = mapped_column(Date)
    rating: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    spoiler: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class Episode(Base):
    __tablename__ = "episodes"
    __table_args__ = (UniqueConstraint("catalog_id", "season_number", "episode_number", name="uq_episode"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    catalog_id: Mapped[int] = mapped_column(ForeignKey("catalog_items.id", ondelete="CASCADE"), nullable=False, index=True)
    season_number: Mapped[int] = mapped_column(Integer, nullable=False)
    episode_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(300))
    air_date: Mapped[date | None] = mapped_column(Date)
    overview: Mapped[str | None] = mapped_column(Text)
    source_id: Mapped[str | None] = mapped_column(String(120))


class SeasonProgress(Base):
    """Which seasons this user watched, and the score for each. No written opinion."""

    __tablename__ = "season_progress"
    __table_args__ = (UniqueConstraint("user_id", "entry_id", "season_number", name="uq_season_progress"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("user_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    season_number: Mapped[int] = mapped_column(Integer, nullable=False)
    watched: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rating: Mapped[float | None] = mapped_column(Float)


class EpisodeProgress(Base):
    __tablename__ = "episode_progress"
    __table_args__ = (UniqueConstraint("user_id", "episode_id", name="uq_episode_progress"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    episode_id: Mapped[int] = mapped_column(ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False, index=True)
    watched: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    watched_on: Mapped[date | None] = mapped_column(Date)


class Release(Base):
    __tablename__ = "releases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    catalog_id: Mapped[int] = mapped_column(ForeignKey("catalog_items.id", ondelete="CASCADE"), nullable=False, index=True)
    region: Mapped[str | None] = mapped_column(String(40))
    platform: Mapped[str | None] = mapped_column(String(80))
    released_on: Mapped[date | None] = mapped_column(Date)
    precision: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    note: Mapped[str | None] = mapped_column(String(300))


class ProviderCache(Base):
    __tablename__ = "provider_cache"

    cache_key: Mapped[str] = mapped_column(String(300), primary_key=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
