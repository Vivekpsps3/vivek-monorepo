"""Music membership, portrait, follow, and series lifecycle mapping."""

import sqlite3
from io import StringIO

from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from apps.media.backend.models import Base
from apps.media.backend.services.membership import (
    CATALOG_ALBUM,
    POPULAR_MOVIES_KEY,
    PROVENANCE_ALBUM_SCORE,
    PROVENANCE_MANUAL_ALBUM,
    PROVENANCE_MANUAL_TRACK,
    PROVENANCE_SCORE_CONFLICT,
    PROVENANCE_TRACK_SCORE,
    backfill_media,
    backfill_statements,
    downgrade_statements,
    is_retained_cache_key,
    is_search_cache_key,
    retained_cache_predicate,
    search_cache_predicate,
)
from apps.server.migrations import (
    current_revision,
    head_revision,
    make_config,
    model_diff,
    sqlite_url,
)

PARENT = "site_trip_pto_days_v1"
REVISION = "site_media_membership_v1"
STAMP = "2026-01-01"
ARTIST = "11111111-1111-4111-8111-111111111111"
PAIR = "22222222-2222-4222-8222-222222222222"
OTHER = "33333333-3333-4333-8333-333333333333"
RG_FETCH = "44444444-4444-4444-8444-444444444444"
REC_FETCH = "55555555-5555-4555-8555-555555555555"
RG_ZERO = "66666666-6666-4666-8666-666666666666"
RG_SONG = "77777777-7777-4777-8777-777777777777"
REC_SONG = "88888888-8888-4888-8888-888888888888"
RG_SPLIT = "99999999-9999-4999-8999-999999999999"
REC_SPLIT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
RG_MATCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
RG_DIFF = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
RELEASE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
COLLISION = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
RG_BOTH = "ffffffff-ffff-4fff-8fff-ffffffffffff"


def test_cache_key_taxonomy_matches_the_sql_predicate():
    keys = {
        POPULAR_MOVIES_KEY: "search",
        "tmdb:movie:dune": "search",
        "musicbrainz:all:radiohead:rg-cover": "search",
        "tmdb:tv:show:page": "search",
        "openlibrary:book:dune": "search",
        "rawg:game:hades": "search",
        "itunes:movie:dune": "search",
        "steam:all:hades": "search",
        "tvmaze:tv:gentlemen": "search",
        "tmdb:movie:": "search",
        "artist-portrait:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": "retained",
        "tvmaze:episodes:9": "retained",
        "tmdb:episodes:9": "retained",
        "tmdb:collection:9": "retained",
        "wikidata:related:dune:2020": "retained",
        "musicbrainz:artist-catalog:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": "retained",
        "custom:unknown:key": "unclassified",
        "tmdb:movie": "unclassified",
    }
    engine = _engine()
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE provider_cache (cache_key VARCHAR(300) NOT NULL PRIMARY KEY, "
                "payload TEXT NOT NULL, fetched_at DATETIME NOT NULL)"
            )
        )
        for key in keys:
            connection.execute(
                text(
                    "INSERT INTO provider_cache (cache_key, payload, fetched_at) "
                    "VALUES (:key, '{}', :stamp)"
                ),
                {"key": key, "stamp": STAMP},
            )
        search = {
            row[0]
            for row in connection.execute(
                text(f"SELECT cache_key FROM provider_cache WHERE {search_cache_predicate()}")
            )
        }
        retained = {
            row[0]
            for row in connection.execute(
                text(f"SELECT cache_key FROM provider_cache WHERE {retained_cache_predicate()}")
            )
        }
    for key, kind in keys.items():
        assert is_search_cache_key(key) is (kind == "search")
        assert is_retained_cache_key(key) is (kind == "retained")
        assert (key in search) is (kind == "search")
        assert (key in retained) is (kind == "retained")
    engine.dispose()


def test_mapping_keeps_scores_and_creates_only_evidenced_memberships():
    engine = _engine()
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        ids = _seed(connection)
        before_scores = _rows(connection, "SELECT * FROM album_ratings ORDER BY id")
        before_tracks = _rows(connection, "SELECT * FROM track_ratings ORDER BY id")
        before_episodes = _rows(connection, "SELECT * FROM episodes ORDER BY id")
        before_progress = _rows(connection, "SELECT * FROM episode_progress ORDER BY id")
        before_seasons = _rows(connection, "SELECT * FROM season_progress ORDER BY id")
        before_experiences = _rows(connection, "SELECT * FROM experiences ORDER BY id")
        before_artists = _rows(
            connection, "SELECT id FROM catalog_items WHERE kind = 'artist' ORDER BY id"
        )
        first = backfill_media(connection)
        second = backfill_media(connection)
        assert second == first
        assert _rows(connection, "SELECT * FROM album_ratings ORDER BY id") == before_scores
        assert _rows(connection, "SELECT * FROM track_ratings ORDER BY id") == before_tracks
        assert _rows(connection, "SELECT * FROM episodes ORDER BY id") == before_episodes
        assert _rows(connection, "SELECT * FROM episode_progress ORDER BY id") == before_progress
        assert _rows(connection, "SELECT * FROM season_progress ORDER BY id") == before_seasons
        assert _rows(connection, "SELECT * FROM experiences ORDER BY id") == before_experiences
        assert (
            _rows(connection, "SELECT id FROM catalog_items WHERE kind = 'artist' ORDER BY id")
            == before_artists
        )

        solo = connection.execute(
            text(
                "SELECT status, rating, review, followed, follow_provenance, portrait_url, "
                "portrait_source_url, portrait_source_id, portrait_crop "
                "FROM user_entries WHERE id = :entry"
            ),
            {"entry": ids["solo_entry"]},
        ).one()
        assert solo == (
            "in_progress",
            9,
            "love",
            1,
            "legacy:in_progress",
            None,
            None,
            None,
            None,
        )
        artwork = connection.execute(
            text("SELECT artwork_url FROM catalog_items WHERE id = :catalog"),
            {"catalog": ids["solo"]},
        ).scalar_one()
        assert artwork == "https://example.com/solo.jpg"
        followed = {
            title: (flag, provenance)
            for title, flag, provenance in connection.execute(
                text(
                    "SELECT catalog_items.title, user_entries.followed, user_entries.follow_provenance "
                    "FROM user_entries JOIN catalog_items ON catalog_items.id = user_entries.catalog_id "
                    "WHERE catalog_items.kind = 'artist'"
                )
            ).fetchall()
        }
        assert followed["Want"] == (1, "legacy:want")
        assert followed["Anticipating"] == (1, "legacy:anticipating")
        assert followed["Done"] == (1, "legacy:completed")
        assert followed["Paused"] == (1, "legacy:paused")
        assert followed["Left"] == (0, "legacy:dropped")
        movie = connection.execute(
            text("SELECT followed FROM user_entries WHERE id = :entry"),
            {"entry": ids["movie_entry"]},
        ).scalar_one()
        assert movie is None

        show = connection.execute(
            text(
                "SELECT lifecycle, raw_value, source, source_id, fetched_at, completeness, freshness "
                "FROM series_lifecycles WHERE catalog_id = :catalog"
            ),
            {"catalog": ids["show"]},
        ).one()
        assert show == ("unknown", None, "tvmaze", "42", None, "unknown", "unknown")
        assert (
            connection.execute(
                text("SELECT status FROM user_entries WHERE id = :entry"),
                {"entry": ids["show_entry"]},
            ).scalar_one()
            == "completed"
        )
        assert connection.execute(text("SELECT count(*) FROM series_lifecycles")).scalar_one() == 1

        def membership(source, source_id):
            return connection.execute(
                text(
                    "SELECT user_entries.user_id, user_entries.status, user_entries.rating, "
                    "user_entries.review, user_entries.membership_provenance, catalog_items.kind "
                    "FROM user_entries JOIN catalog_items ON catalog_items.id = user_entries.catalog_id "
                    "WHERE catalog_items.source = :source AND catalog_items.source_id = :source_id "
                    "ORDER BY user_entries.user_id"
                ),
                {"source": source, "source_id": source_id},
            ).fetchall()

        assert membership("musicbrainz", RG_FETCH) == []
        assert membership("musicbrainz", REC_FETCH) == []
        assert membership("musicbrainz", RG_ZERO) == [
            (1, "want", 0, None, PROVENANCE_ALBUM_SCORE, "album")
        ]
        assert membership("musicbrainz", RG_SONG) == []
        assert membership("musicbrainz", REC_SONG) == [
            (1, "want", 8, None, PROVENANCE_TRACK_SCORE, "track")
        ]
        assert membership("musicbrainz", RG_SPLIT) == [
            (1, "want", None, None, PROVENANCE_SCORE_CONFLICT, "album")
        ]
        assert membership("musicbrainz", RG_BOTH) == [
            (1, "want", 1, None, PROVENANCE_ALBUM_SCORE, "album"),
            (2, "want", 2, None, PROVENANCE_ALBUM_SCORE, "album"),
        ]
        assert membership("musicbrainz", RG_MATCH) == [(1, "completed", 6, "keep", None, "album")]
        assert membership("musicbrainz", RG_DIFF) == [
            (1, "completed", 6, "keep diff", None, "album")
        ]
        assert membership("musicbrainz", COLLISION) == []
        manuals = connection.execute(
            text(
                "SELECT catalog_items.source_id, user_entries.membership_provenance "
                "FROM user_entries JOIN catalog_items ON catalog_items.id = user_entries.catalog_id "
                "WHERE catalog_items.migration_provenance = :provenance "
                "AND user_entries.membership_provenance IN (:album, :track) "
                "ORDER BY catalog_items.source_id"
            ),
            {
                "provenance": CATALOG_ALBUM,
                "album": PROVENANCE_MANUAL_ALBUM,
                "track": PROVENANCE_MANUAL_TRACK,
            },
        ).fetchall()
        assert (f"legacy-album-{ids['twin_a']}", PROVENANCE_MANUAL_ALBUM) in manuals
        assert (f"legacy-album-{ids['twin_b']}", PROVENANCE_MANUAL_ALBUM) in manuals
        assert (f"legacy-album-{ids['shared_album']}", PROVENANCE_MANUAL_ALBUM) not in manuals
        track_members = connection.execute(
            text(
                "SELECT catalog_items.source_id FROM user_entries "
                "JOIN catalog_items ON catalog_items.id = user_entries.catalog_id "
                "WHERE user_entries.membership_provenance = :provenance"
            ),
            {"provenance": PROVENANCE_MANUAL_TRACK},
        ).fetchall()
        assert (f"legacy-track-{ids['duet_a']}",) in track_members
        assert (f"legacy-track-{ids['bare_track']}",) not in track_members

        link = connection.execute(
            text(
                "SELECT relation, namespace FROM music_links "
                "WHERE relation = 'release-of-group' AND source_id = :release"
            ),
            {"release": RELEASE},
        ).one()
        assert link == ("release-of-group", "musicbrainz:release")
        itunes = connection.execute(
            text("SELECT namespace, provenance FROM music_links WHERE source_id = 'it-album'")
        ).one()
        assert itunes == ("itunes:album", "provider-id")
        codes = dict(
            connection.execute(
                text("SELECT code, count(*) FROM media_migration_reports GROUP BY code")
            ).fetchall()
        )
        for code in (
            "ambiguous-manual",
            "ambiguous-manual-owner",
            "same-title-distinct",
            "identity-kind-collision",
            "identity-field-conflict",
            "already-linked",
            "missing-parent-link",
            "withheld-null-score",
            "unmapped-score",
            "score-conflict",
            "recording-or-track-id",
            "search-cache-pruned",
            "cache-retained",
            "cache-retained-unclassified",
        ):
            assert codes[code] >= 1
        assert (
            connection.execute(
                text("SELECT cache_key FROM provider_cache ORDER BY cache_key")
            ).fetchall()
        ) == [
            ("artist-portrait:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",),
            ("custom:unknown:key",),
            ("musicbrainz:artist-catalog:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",),
        ]
        conflicts = connection.execute(
            text("SELECT detail FROM media_migration_reports WHERE code = 'score-conflict'")
        ).fetchall()
        assert any(row[0].startswith("nested 7") for row in conflicts)
        assert any("standalone 6" in row[0] for row in conflicts)
        assert not any("standalone 6.0" in row[0] and "nested 6" in row[0] for row in conflicts)

        downgrade_statements_ran = downgrade_statements()
        for statement in downgrade_statements_ran:
            connection.execute(text(statement))
        assert connection.execute(text("SELECT count(*) FROM music_links")).scalar_one() == 0
        assert (
            connection.execute(
                text("SELECT count(*) FROM user_entries WHERE membership_provenance IS NOT NULL")
            ).scalar_one()
            == 0
        )
        assert (
            connection.execute(
                text("SELECT title FROM music_albums WHERE id = :album"),
                {"album": ids["fetched_album"]},
            ).scalar_one()
            == "Fetched"
        )
        assert connection.execute(
            text("SELECT rating, review FROM user_entries WHERE id = :entry"),
            {"entry": ids["match_entry"]},
        ).one() == (6, "keep")
        assert connection.execute(text("SELECT count(*) FROM experiences")).scalar_one() == 1
    engine.dispose()


def test_revision_is_the_only_head_after_trip_pto(tmp_path):
    script = ScriptDirectory.from_config(make_config("sqlite://"))
    assert script.get_heads() == ["site_leave_buckets_v1"]
    assert (
        script.get_revision("site_catalog_title_sort_v1").down_revision == "site_media_progress_v1"
    )
    assert script.get_revision("site_media_progress_v1").down_revision == REVISION
    assert script.get_revision(REVISION).down_revision == PARENT
    assert head_revision() == "site_leave_buckets_v1"
    offline = StringIO()
    plan = make_config("sqlite://")
    plan.stdout = offline
    command.upgrade(plan, f"{PARENT}:{REVISION}", sql=True)
    planned = offline.getvalue()
    assert "CREATE TABLE music_links" in planned or "CREATE TABLE series_lifecycles" in planned
    for statement in backfill_statements():
        assert statement.split(None, 1)[0] in {"UPDATE", "INSERT", "CREATE", "DELETE", "DROP"}
        assert statement in planned

    database = tmp_path / "site.db"
    url = sqlite_url(database)
    cfg = make_config(url)
    command.upgrade(cfg, PARENT)
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO users (email, display_name, role, is_active, must_change_password, created_at, updated_at) "
            "VALUES ('media@example.com', 'Media', 'user', 1, 0, '2026-01-01', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO catalog_items (kind, title, source, source_id, artwork_url, created_at, updated_at) "
            "VALUES ('artist', 'A', 'musicbrainz', ?, 'https://example.com/a.jpg', '2026-01-01', '2026-01-01')",
            (ARTIST,),
        )
        db.execute(
            "INSERT INTO catalog_items (kind, title, source, source_id, created_at, updated_at) "
            "VALUES ('tv', 'Show', 'tvmaze', '42', '2026-01-01', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO user_entries (user_id, catalog_id, status, rating, review, review_spoiler, favorite, anticipated, created_at, updated_at) "
            "VALUES (1, 1, 'in_progress', 9, 'love', 0, 0, 0, '2026-01-01', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO user_entries (user_id, catalog_id, status, review_spoiler, favorite, anticipated, created_at, updated_at) "
            "VALUES (1, 2, 'completed', 0, 0, 0, '2026-01-01', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO music_albums (catalog_id, title, source_id, position) "
            "VALUES (1, 'Fetched', ?, 0)",
            (RG_FETCH,),
        )
        db.execute(
            "INSERT INTO album_ratings (user_id, entry_id, album_id, rating) VALUES (1, 1, 1, 0)"
        )
        db.execute(
            "INSERT INTO episodes (catalog_id, season_number, episode_number, title) "
            "VALUES (2, 1, 1, 'Pilot')"
        )
        db.execute(
            "INSERT INTO episode_progress (user_id, episode_id, watched, watched_on) "
            "VALUES (1, 1, 1, '2026-02-01')"
        )
        db.execute(
            "INSERT INTO season_progress (user_id, entry_id, season_number, watched, rating) "
            "VALUES (1, 2, 1, 1, 8)"
        )
        db.execute(
            "INSERT INTO experiences (user_id, entry_id, kind, spoiler, created_at) "
            "VALUES (1, 1, 'listen', 0, '2026-01-01')"
        )
        db.execute(
            "INSERT INTO provider_cache (cache_key, payload, fetched_at) "
            "VALUES ('tmdb:movie:dune', '[]', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO provider_cache (cache_key, payload, fetched_at) "
            "VALUES ('musicbrainz:artist-catalog:abc', '{}', '2026-01-01')"
        )
        db.commit()

    command.upgrade(cfg, "head")
    assert current_revision(database) == "site_leave_buckets_v1"
    assert model_diff(database) == []
    with sqlite3.connect(database) as db:
        assert db.execute(
            "SELECT followed, follow_provenance FROM user_entries WHERE id = 1"
        ).fetchone() == (
            1,
            "legacy:in_progress",
        )
        assert db.execute(
            "SELECT lifecycle, source, source_id, completeness, freshness FROM series_lifecycles"
        ).fetchone() == ("unknown", "tvmaze", "42", "unknown", "unknown")
        assert db.execute("SELECT status FROM user_entries WHERE id = 2").fetchone() == (
            "completed",
        )
        member = db.execute(
            "SELECT status, rating, membership_provenance FROM user_entries WHERE catalog_id != 1 AND catalog_id != 2"
        ).fetchone()
        assert member == ("want", 0, PROVENANCE_ALBUM_SCORE)
        assert db.execute("SELECT artwork_url FROM catalog_items WHERE id = 1").fetchone() == (
            "https://example.com/a.jpg",
        )
        assert db.execute("SELECT portrait_url FROM user_entries WHERE id = 1").fetchone() == (
            None,
        )
        assert db.execute("SELECT watched_on FROM episode_progress").fetchone() == ("2026-02-01",)
        assert db.execute("SELECT rating FROM season_progress").fetchone() == (8,)
        assert db.execute("SELECT kind FROM experiences").fetchone() == ("listen",)
        assert db.execute("SELECT cache_key FROM provider_cache").fetchone() == (
            "musicbrainz:artist-catalog:abc",
        )
        assert db.execute("SELECT rating FROM album_ratings").fetchone() == (0,)
        heads = {
            row[0]
            for row in db.execute(
                "SELECT compatible_head FROM site_revision_compatibility WHERE revision = ?",
                (REVISION,),
            )
        }
        assert heads == {"site_schema_v1", "site_auth_challenge_purpose_v2", PARENT}
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []

    command.downgrade(cfg, PARENT)
    assert current_revision(database) == PARENT
    with sqlite3.connect(database) as db:
        tables = {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert "music_links" not in tables
        assert "series_lifecycles" not in tables
        assert "media_migration_reports" not in tables
        columns = {row[1] for row in db.execute("PRAGMA table_info(user_entries)")}
        assert "followed" not in columns
        assert "portrait_url" not in columns
        assert "migration_provenance" not in {
            row[1] for row in db.execute("PRAGMA table_info(catalog_items)")
        }
        assert db.execute(
            "SELECT status, rating, review FROM user_entries WHERE id = 1"
        ).fetchone() == (
            "in_progress",
            9,
            "love",
        )
        assert db.execute("SELECT count(*) FROM user_entries").fetchone() == (2,)
        assert db.execute("SELECT title FROM music_albums").fetchone() == ("Fetched",)
        assert db.execute("SELECT watched_on FROM episode_progress").fetchone() == ("2026-02-01",)
        assert db.execute("SELECT cache_key FROM provider_cache").fetchall() == [
            ("musicbrainz:artist-catalog:abc",)
        ]
        assert db.execute(
            "SELECT count(*) FROM site_revision_compatibility WHERE revision = ?",
            (REVISION,),
        ).fetchone() == (0,)

    command.upgrade(cfg, "head")
    assert current_revision(database) == "site_leave_buckets_v1"
    assert model_diff(database) == []


def test_title_sort_backfill_folds_accents(tmp_path):
    database = tmp_path / "site.db"
    cfg = make_config(sqlite_url(database))
    command.upgrade(cfg, "site_media_progress_v1")
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO catalog_items (kind, title, source, created_at, updated_at) "
            "VALUES ('book', 'Éclair', 'manual', '2026-01-01', '2026-01-01')"
        )
        db.commit()
    command.upgrade(cfg, "head")
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT title_sort FROM catalog_items").fetchone() == ("eclair",)
    command.downgrade(cfg, "site_media_progress_v1")
    with sqlite3.connect(database) as db:
        columns = {row[1] for row in db.execute("PRAGMA table_info(catalog_items)")}
        assert "title_sort" not in columns
        assert db.execute("SELECT title FROM catalog_items").fetchone() == ("Éclair",)


def _engine():
    return create_engine(
        "sqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )


def _rows(connection, statement):
    return connection.execute(text(statement)).fetchall()


def _insert(connection, statement, **params):
    result = connection.execute(text(statement), params)
    return result.lastrowid


def _catalog(connection, **values):
    values.setdefault("creator", None)
    values.setdefault("year", None)
    values.setdefault("artwork_url", None)
    values.setdefault("source_id", None)
    values.setdefault("extra", None)
    return _insert(
        connection,
        """
        INSERT INTO catalog_items (
            kind, title, creator, year, artwork_url, source, source_id, extra, created_at, updated_at
        ) VALUES (
            :kind, :title, :creator, :year, :artwork_url, :source, :source_id, :extra, :stamp, :stamp
        )
        """,
        stamp=STAMP,
        **values,
    )


def _entry(connection, catalog_id, user_id=1, status="want", rating=None, review=None):
    return _insert(
        connection,
        """
        INSERT INTO user_entries (
            user_id, catalog_id, status, rating, review, review_spoiler, favorite, anticipated,
            created_at, updated_at
        ) VALUES (
            :user_id, :catalog_id, :status, :rating, :review, 0, 0, 0, :stamp, :stamp
        )
        """,
        user_id=user_id,
        catalog_id=catalog_id,
        status=status,
        rating=rating,
        review=review,
        stamp=STAMP,
    )


def _album(connection, catalog_id, title, source_id=None, year=None, artwork=None):
    return _insert(
        connection,
        """
        INSERT INTO music_albums (catalog_id, title, year, source_id, artwork_url, position)
        VALUES (:catalog_id, :title, :year, :source_id, :artwork, 0)
        """,
        catalog_id=catalog_id,
        title=title,
        year=year,
        source_id=source_id,
        artwork=artwork,
    )


def _track(connection, album_id, title, source_id=None):
    return _insert(
        connection,
        """
        INSERT INTO music_tracks (album_id, title, position, source_id)
        VALUES (:album_id, :title, 1, :source_id)
        """,
        album_id=album_id,
        title=title,
        source_id=source_id,
    )


def _seed(connection):
    solo = _catalog(
        connection,
        kind="artist",
        title="Same Name",
        source="musicbrainz",
        source_id=ARTIST,
        artwork_url="https://example.com/solo.jpg",
    )
    solo_entry = _entry(connection, solo, status="in_progress", rating=9, review="love")
    _insert(
        connection,
        """
        INSERT INTO experiences (user_id, entry_id, kind, spoiler, created_at)
        VALUES (1, :entry, 'listen', 0, :stamp)
        """,
        entry=solo_entry,
        stamp=STAMP,
    )
    pair = _catalog(
        connection, kind="artist", title="Same Name", source="musicbrainz", source_id=PAIR
    )
    pair_entry = _entry(connection, pair, user_id=1, status="want")
    _entry(connection, pair, user_id=2, status="paused")
    other = _catalog(
        connection, kind="artist", title="Other", source="musicbrainz", source_id=OTHER
    )
    other_entry = _entry(connection, other, status="want")
    for title, status in (
        ("Want", "want"),
        ("Anticipating", "anticipating"),
        ("Done", "completed"),
        ("Paused", "paused"),
        ("Left", "dropped"),
    ):
        catalog = _catalog(connection, kind="artist", title=title, source="manual")
        _entry(connection, catalog, status=status)
    movie = _catalog(connection, kind="movie", title="Watching", source="manual")
    movie_entry = _entry(connection, movie, status="dropped")
    show = _catalog(connection, kind="tv", title="Show", source="tvmaze", source_id="42")
    show_entry = _entry(connection, show, status="completed", rating=10, review="finished")
    episode = _insert(
        connection,
        """
        INSERT INTO episodes (catalog_id, season_number, episode_number, title, air_date)
        VALUES (:catalog, 1, 1, 'Pilot', '2026-02-01')
        """,
        catalog=show,
    )
    _insert(
        connection,
        """
        INSERT INTO episode_progress (user_id, episode_id, watched, watched_on)
        VALUES (1, :episode, 1, '2026-02-02')
        """,
        episode=episode,
    )
    _insert(
        connection,
        """
        INSERT INTO season_progress (user_id, entry_id, season_number, watched, rating)
        VALUES (1, :entry, 1, 1, 8)
        """,
        entry=show_entry,
    )

    fetched = _album(connection, solo, "Fetched", RG_FETCH, 2001, "https://example.com/fetched.jpg")
    _track(connection, fetched, "Fetched Song", REC_FETCH)
    bare_track = _track(connection, fetched, "No Id")
    _insert(
        connection,
        "INSERT INTO album_ratings (user_id, entry_id, album_id, rating) VALUES (1, :entry, :album, NULL)",
        entry=solo_entry,
        album=_album(connection, solo, "Unrated", "abababab-abab-4aba-8aba-abababababab"),
    )
    zero = _album(connection, solo, "Zero", RG_ZERO, 2002)
    _insert(
        connection,
        "INSERT INTO album_ratings (user_id, entry_id, album_id, rating) VALUES (1, :entry, :album, 0)",
        entry=solo_entry,
        album=zero,
    )
    song_album = _album(connection, solo, "Songs", RG_SONG, 2003)
    _track(connection, song_album, "Scored", REC_SONG)
    scored_track = connection.execute(
        text("SELECT id FROM music_tracks WHERE source_id = :source"), {"source": REC_SONG}
    ).scalar_one()
    _insert(
        connection,
        "INSERT INTO track_ratings (user_id, entry_id, track_id, rating) VALUES (1, :entry, :track, 8)",
        entry=solo_entry,
        track=scored_track,
    )
    twin_a = _album(connection, solo, "Twin")
    twin_b = _album(connection, solo, "Twin")
    duet_a = _track(connection, twin_a, "Duet")
    _track(connection, twin_b, "Duet")
    shared_album = _album(connection, pair, "Shared")
    both = _album(connection, pair, "Both", RG_BOTH, 1999)
    _insert(
        connection,
        "INSERT INTO album_ratings (user_id, entry_id, album_id, rating) VALUES (1, :entry, :album, 1)",
        entry=pair_entry,
        album=both,
    )
    _insert(
        connection,
        "INSERT INTO album_ratings (user_id, entry_id, album_id, rating) VALUES (2, :entry, :album, 2)",
        entry=connection.execute(
            text("SELECT id FROM user_entries WHERE catalog_id = :catalog AND user_id = 2"),
            {"catalog": pair},
        ).scalar_one(),
        album=both,
    )
    split_a = _album(connection, solo, "Split A", RG_SPLIT, 2004)
    split_b = _album(connection, other, "Split B", RG_SPLIT, 2005)
    _insert(
        connection,
        "INSERT INTO album_ratings (user_id, entry_id, album_id, rating) VALUES (1, :entry, :album, 7)",
        entry=solo_entry,
        album=split_a,
    )
    _insert(
        connection,
        "INSERT INTO album_ratings (user_id, entry_id, album_id, rating) VALUES (1, :entry, :album, 8)",
        entry=other_entry,
        album=split_b,
    )
    _track(connection, split_a, "Alt A", REC_SPLIT)
    _track(connection, split_b, "Alt B", REC_SPLIT)

    match = _catalog(
        connection,
        kind="album",
        title="Matched",
        source="musicbrainz",
        source_id=RG_MATCH,
        year=2010,
    )
    match_entry = _entry(connection, match, status="completed", rating=6, review="keep")
    match_album = _album(connection, solo, "Matched", RG_MATCH, 2010)
    _insert(
        connection,
        "INSERT INTO album_ratings (user_id, entry_id, album_id, rating) VALUES (1, :entry, :album, 6)",
        entry=solo_entry,
        album=match_album,
    )
    diff = _catalog(
        connection,
        kind="album",
        title="Different",
        source="musicbrainz",
        source_id=RG_DIFF,
        year=2011,
    )
    _entry(connection, diff, status="completed", rating=6, review="keep diff")
    diff_album = _album(connection, solo, "Different", RG_DIFF, 2011)
    _insert(
        connection,
        "INSERT INTO album_ratings (user_id, entry_id, album_id, rating) VALUES (1, :entry, :album, 7)",
        entry=solo_entry,
        album=diff_album,
    )
    _catalog(
        connection,
        kind="album",
        title="Release",
        source="musicbrainz",
        source_id=RELEASE,
        extra=f'{{"release_group_id": "{RG_FETCH}"}}',
    )
    _catalog(connection, kind="track", title="Blocking", source="musicbrainz", source_id=COLLISION)
    blocked = _album(connection, solo, "Blocked", COLLISION)
    _track(connection, blocked, "Orphan Rec", "12345678-1234-4234-8234-123456781234")
    _insert(
        connection,
        "INSERT INTO album_ratings (user_id, entry_id, album_id, rating) VALUES (1, :entry, :album, 4)",
        entry=solo_entry,
        album=blocked,
    )
    itunes = _catalog(
        connection, kind="artist", title="Itunes", source="itunes", source_id="it-artist"
    )
    _entry(connection, itunes, status="want")
    itunes_album = _album(connection, itunes, "Store", "it-album")
    _track(connection, itunes_album, "File", "it-track")
    for key, payload in (
        ("tmdb:movie:dune", "[]"),
        (POPULAR_MOVIES_KEY, "[]"),
        ("artist-portrait:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "{}"),
        ("musicbrainz:artist-catalog:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "{}"),
        ("custom:unknown:key", "{}"),
    ):
        _insert(
            connection,
            "INSERT INTO provider_cache (cache_key, payload, fetched_at) VALUES (:key, :payload, :stamp)",
            key=key,
            payload=payload,
            stamp=STAMP,
        )
    return {
        "solo": solo,
        "solo_entry": solo_entry,
        "movie_entry": movie_entry,
        "show": show,
        "show_entry": show_entry,
        "fetched_album": fetched,
        "twin_a": twin_a,
        "twin_b": twin_b,
        "duet_a": duet_a,
        "shared_album": shared_album,
        "bare_track": bare_track,
        "match_entry": match_entry,
    }
