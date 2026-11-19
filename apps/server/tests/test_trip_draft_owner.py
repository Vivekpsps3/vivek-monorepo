"""Deleting an account removes that owner's drafts and leaves the other owner's."""

from pathlib import Path

from alembic import command
from sqlalchemy import text

from apps.server.database import open_database
from apps.server.identity.admin import delete_user_account
from apps.server.identity.models import User, UserRole
from apps.server.migrations import make_config, sqlite_url


def test_delete_user_account_removes_only_that_owners_draft(tmp_path: Path) -> None:
    database = tmp_path / "site.db"
    command.upgrade(make_config(sqlite_url(database)), "head")
    opened = open_database(f"sqlite:///{database}")
    db = opened.sessionmaker()
    try:
        kept = User(
            email="kept@example.invalid",
            display_name="Kept",
            role=UserRole.user,
            username="kept",
            is_active=True,
            must_change_password=False,
        )
        deleted = User(
            email="deleted@example.invalid",
            display_name="Deleted",
            role=UserRole.user,
            username="deleted",
            is_active=True,
            must_change_password=False,
        )
        db.add_all([kept, deleted])
        db.commit()
        for owner, title in ((kept.id, "Kept draft"), (deleted.id, "Deleted draft")):
            db.execute(
                text(
                    "INSERT INTO trip_drafts (user_id, title, start_date, lifecycle, revision, "
                    "created_at, updated_at) VALUES (:owner, :title, '2026-06-01', 'draft', 1, "
                    "'2026-06-01', '2026-06-01')"
                ),
                {"owner": owner, "title": title},
            )
            draft_id = db.execute(text("SELECT last_insert_rowid()")).scalar_one()
            db.execute(
                text(
                    "INSERT INTO trip_draft_legs (draft_id, sort_order, role, mode, currency, "
                    "paid, status) VALUES (:draft_id, 0, 'outbound', 'flight', 'USD', 0, 'planned')"
                ),
                {"draft_id": draft_id},
            )
            db.execute(
                text(
                    "INSERT INTO trip_draft_proposals (draft_id, field, value, source) VALUES "
                    "(:draft_id, 'end_date', '2026-06-09', 'inferred')"
                ),
                {"draft_id": draft_id},
            )
        db.commit()

        delete_user_account(db, deleted, actor_user_id=kept.id)
        db.commit()

        assert db.execute(text("SELECT title FROM trip_drafts")).scalars().all() == ["Kept draft"]
        kept_id = db.execute(text("SELECT id FROM trip_drafts")).scalar_one()
        assert db.execute(text("SELECT COUNT(*) FROM trip_draft_legs")).scalar_one() == 1
        assert db.execute(text("SELECT draft_id FROM trip_draft_proposals")).scalar_one() == kept_id
        assert db.get(User, deleted.id) is None
    finally:
        db.close()
        opened.engine.dispose()
