"""World concepts (Lit Map, L1a).

WorldBase is its own registry, separate from Town, Finance, Travel and
Media. The owner foreign key to users.id is attached in the unified schema
by apps.server.schema.OWNER_TABLES and created by the site_world_v1
migration; per WG-17 (interim) there is no ON DELETE CASCADE — account
deletion removes concepts explicitly in delete_user_account, the repo
pattern Town follows.
"""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Index, Integer, String, Text, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

__all__ = ["WorldBase", "WorldConcept", "make_concept_name_key"]


def make_concept_name_key(name: str) -> str:
    """Uniqueness key for a concept name: casefold of the stored name."""
    return name.casefold()


class WorldBase(DeclarativeBase):
    pass


class WorldConcept(WorldBase):
    __tablename__ = "world_concepts"
    __table_args__ = (
        Index("ix_world_concepts_user_understood", "user_id", "understood_on"),
        Index(
            "uq_world_concepts_active_name",
            "user_id",
            "name_key",
            unique=True,
            sqlite_where=text("archived_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # make_concept_name_key(name). Uniqueness is the partial index, among
    # active (non-archived) rows only.
    name_key: Mapped[str] = mapped_column(String(120), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    understood_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
