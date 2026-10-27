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
    event,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from apps.media.backend.services.title_sort import title_sort_key


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
    title_sort: Mapped[str] = mapped_column(
        String(300), nullable=False, default="", server_default=text("''")
    )
    creator: Mapped[str | None] = mapped_column(String(300))
    year: Mapped[int | None] = mapped_column(Integer)
    overview: Mapped[str | None] = mapped_column(Text)
    artwork_url: Mapped[str | None] = mapped_column(Text)
    genres: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="manual")
    source_id: Mapped[str | None] = mapped_column(String(120))
    extra: Mapped[str | None] = mapped_column(Text)
    external_ratings: Mapped[str | None] = mapped_column(Text)
    # Set only on catalog rows this migration inserted. Reused rows stay null.
    migration_provenance: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    entries: Mapped[list["UserEntry"]] = relationship(back_populates="catalog")
    episodes: Mapped[list["Episode"]] = relationship(cascade="all, delete-orphan")
    releases: Mapped[list["Release"]] = relationship(cascade="all, delete-orphan")


@event.listens_for(CatalogItem, "before_insert")
@event.listens_for(CatalogItem, "before_update")
def _sync_title_sort(_mapper, _connection, target: CatalogItem) -> None:
    target.title_sort = title_sort_key(target.title or "")


class UserEntry(Base):
    __tablename__ = "user_entries"
    __table_args__ = (UniqueConstraint("user_id", "catalog_id", name="uq_user_catalog"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    catalog_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_items.id"), nullable=False, index=True
    )
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
    # Personal artist portrait. Null means use the shared catalog image.
    portrait_url: Mapped[str | None] = mapped_column(Text)
    portrait_source_url: Mapped[str | None] = mapped_column(Text)
    portrait_source_id: Mapped[str | None] = mapped_column(String(120))
    portrait_crop: Mapped[str | None] = mapped_column(String(120))
    portrait_attribution: Mapped[str | None] = mapped_column(Text)
    # Artist relationship. Null on every non-artist entry. 0 is unfollowed.
    followed: Mapped[bool | None] = mapped_column(Boolean)
    follow_provenance: Mapped[str | None] = mapped_column(String(40))
    # Set only on album/song entries the membership migration inserted.
    membership_provenance: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    catalog: Mapped[CatalogItem] = relationship(back_populates="entries")
    experiences: Mapped[list["Experience"]] = relationship(
        cascade="all, delete-orphan", order_by="Experience.id"
    )
    seasons: Mapped[list["SeasonProgress"]] = relationship(cascade="all, delete-orphan")


class Experience(Base):
    __tablename__ = "experiences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    entry_id: Mapped[int] = mapped_column(
        ForeignKey("user_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    started_on: Mapped[date | None] = mapped_column(Date)
    finished_on: Mapped[date | None] = mapped_column(Date)
    rating: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    spoiler: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class Episode(Base):
    __tablename__ = "episodes"
    __table_args__ = (
        UniqueConstraint("catalog_id", "season_number", "episode_number", name="uq_episode"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    catalog_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    season_number: Mapped[int] = mapped_column(Integer, nullable=False)
    episode_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(300))
    air_date: Mapped[date | None] = mapped_column(Date)
    overview: Mapped[str | None] = mapped_column(Text)
    source_id: Mapped[str | None] = mapped_column(String(120))


class SeasonProgress(Base):
    """Which seasons this user watched, and the score for each. No written opinion."""

    __tablename__ = "season_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "entry_id", "season_number", name="uq_season_progress"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    entry_id: Mapped[int] = mapped_column(
        ForeignKey("user_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    season_number: Mapped[int] = mapped_column(Integer, nullable=False)
    watched: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rating: Mapped[float | None] = mapped_column(Float)


class EpisodeProgress(Base):
    __tablename__ = "episode_progress"
    __table_args__ = (UniqueConstraint("user_id", "episode_id", name="uq_episode_progress"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    episode_id: Mapped[int] = mapped_column(
        ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    watched: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    watched_on: Mapped[date | None] = mapped_column(Date)
    operation_token: Mapped[str | None] = mapped_column(String(36))


class ProgressOperation(Base):
    """Undo scope for one atomic catch-up command; personal edits clear the token."""

    __tablename__ = "progress_operations"

    token: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    entry_id: Mapped[int] = mapped_column(
        ForeignKey("user_entries.id", ondelete="CASCADE"), nullable=False
    )
    changed_ids: Mapped[str] = mapped_column(Text, nullable=False)
    undone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class MusicAlbum(Base):
    """Legacy public album row. A personal save is a user entry, not this row."""

    __tablename__ = "music_albums"
    __table_args__ = (UniqueConstraint("catalog_id", "source_id", name="uq_music_album_source"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    catalog_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    year: Mapped[int | None] = mapped_column(Integer)
    source_id: Mapped[str | None] = mapped_column(String(120))
    artwork_url: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    tracks: Mapped[list["MusicTrack"]] = relationship(cascade="all, delete-orphan")


class MusicTrack(Base):
    """Legacy public song row. A personal save is a user entry, not this row."""

    __tablename__ = "music_tracks"
    __table_args__ = (UniqueConstraint("album_id", "source_id", name="uq_music_track_source"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    album_id: Mapped[int] = mapped_column(
        ForeignKey("music_albums.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_id: Mapped[str | None] = mapped_column(String(120))


class AlbumRating(Base):
    """Legacy nested score. New saves store the score on the album's user entry."""

    __tablename__ = "album_ratings"
    __table_args__ = (UniqueConstraint("user_id", "entry_id", "album_id", name="uq_album_rating"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    entry_id: Mapped[int] = mapped_column(
        ForeignKey("user_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    album_id: Mapped[int] = mapped_column(
        ForeignKey("music_albums.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rating: Mapped[float | None] = mapped_column(Float)


class TrackRating(Base):
    """Legacy nested score. New saves store the score on the song's user entry."""

    __tablename__ = "track_ratings"
    __table_args__ = (UniqueConstraint("user_id", "entry_id", "track_id", name="uq_track_rating"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    entry_id: Mapped[int] = mapped_column(
        ForeignKey("user_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    track_id: Mapped[int] = mapped_column(
        ForeignKey("music_tracks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rating: Mapped[float | None] = mapped_column(Float)


class MusicLink(Base):
    """Public music relationship. A row here is not a personal save."""

    __tablename__ = "music_links"
    __table_args__ = (
        UniqueConstraint("parent_catalog_id", "child_catalog_id", "relation", name="uq_music_link"),
        UniqueConstraint("legacy_album_id", name="uq_music_link_legacy_album"),
        UniqueConstraint("legacy_track_id", name="uq_music_link_legacy_track"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parent_catalog_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    child_catalog_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    relation: Mapped[str] = mapped_column(String(40), nullable=False)
    namespace: Mapped[str] = mapped_column(String(40), nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    credit: Mapped[str | None] = mapped_column(String(300))
    legacy_album_id: Mapped[int | None] = mapped_column(Integer)
    legacy_track_id: Mapped[int | None] = mapped_column(Integer)
    provenance: Mapped[str] = mapped_column(String(40), nullable=False)


class SeriesLifecycle(Base):
    """Production lifecycle for a show. Personal watch status stays on UserEntry."""

    __tablename__ = "series_lifecycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    catalog_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_items.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    lifecycle: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    raw_value: Mapped[str | None] = mapped_column(String(80))
    source: Mapped[str | None] = mapped_column(String(40))
    source_id: Mapped[str | None] = mapped_column(String(120))
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completeness: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    freshness: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")


class MediaMigrationReport(Base):
    """Visible mapping conflicts. Original score rows are not rewritten from this."""

    __tablename__ = "media_migration_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(60), nullable=False)
    subject: Mapped[str] = mapped_column(String(40), nullable=False)
    legacy_table: Mapped[str | None] = mapped_column(String(40))
    legacy_id: Mapped[int | None] = mapped_column(Integer)
    user_id: Mapped[int | None] = mapped_column(Integer)
    catalog_id: Mapped[int | None] = mapped_column(
        ForeignKey("catalog_items.id", ondelete="SET NULL")
    )
    entry_id: Mapped[int | None] = mapped_column(ForeignKey("user_entries.id", ondelete="SET NULL"))
    detail: Mapped[str] = mapped_column(Text, nullable=False)


class Release(Base):
    __tablename__ = "releases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    catalog_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
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
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
