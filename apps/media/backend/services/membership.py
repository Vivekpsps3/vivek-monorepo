"""Lossless media membership mapping.

Public catalog identity stays on ``catalog_items``. ``music_links`` records
artist, release-group, release, and recording relationships. A personal save is
a ``user_entries`` row. Fetched discography rows do not become saves.

``catalog_items`` stays unique on (source, source_id), not kind. MusicBrainz
artist, release-group, release, and recording ids are one UUID space, so the
same id is one entity. Album search stores a release id and discography stores
a release-group id; those stay different rows. A source id already used by
another kind is reported and is not reused. Manual rows are keyed by legacy id
(``legacy-album-<id>`` / ``legacy-track-<id>``), never by title.

Nested scores move onto a child entry only when there is one agreed non-null
score, including zero, and no different standalone score. Original
``album_ratings`` and ``track_ratings`` rows are left in place. Conflicting
scores are reported and neither side is overwritten.

Artist ``status`` is not rewritten. ``followed`` is 0 for legacy ``dropped``
and 1 for every other artist entry. ``follow_provenance`` keeps the original
status. No listening song or experience is created.

Series lifecycle is a show-level row, unknown until a provider supplies it.
Personal watch status is not copied into it. Episode and season rows are not
modified.

Portrait columns stay empty. Shared ``artwork_url`` is the provider default.

ProviderCache retention is independent of membership. Search keys are
``{provider}:{kind}:{query}`` plus the popular-movies key ``tmdb:popular:movies``.
Enrichment that stays: ``artist-portrait:``, ``tvmaze:episodes:``,
``tmdb:episodes:``, ``tmdb:collection:``, ``wikidata:related:``, and
``musicbrainz:artist-catalog:``. Any other key is kept and reported.
Deleting a personal entry must not delete catalog rows, music links, lifecycle
rows, or enrichment cache. This mapping does not delete those either.
Downgrade drops the mapped memberships; it does not restore pruned search cache.
Restore a backup for that data.
"""

from sqlalchemy import text

SEARCH_PROVIDERS = (
    "tmdb",
    "musicbrainz",
    "openlibrary",
    "rawg",
    "tvmaze",
    "itunes",
    "steam",
)
SEARCH_KINDS = ("movie", "tv", "book", "track", "album", "artist", "game", "all")
POPULAR_MOVIES_KEY = "tmdb:popular:movies"
RETAINED_PREFIXES = (
    "artist-portrait:",
    "tvmaze:episodes:",
    "tmdb:episodes:",
    "tmdb:collection:",
    "wikidata:related:",
    "musicbrainz:artist-catalog:",
)

PROVENANCE_ALBUM_SCORE = "nested-album-score"
PROVENANCE_TRACK_SCORE = "nested-track-score"
PROVENANCE_SCORE_CONFLICT = "score-conflict"
PROVENANCE_MANUAL_ALBUM = "manual-album"
PROVENANCE_MANUAL_TRACK = "manual-track"
CATALOG_ALBUM = "legacy-album"
CATALOG_TRACK = "legacy-track"

_TEMP_TABLES = (
    "media_new_member",
    "media_single_owner",
    "media_score_span",
    "media_score",
    "media_track_ident",
    "media_album_ident",
)


def is_search_cache_key(key: str) -> bool:
    """True for durable search responses, including the popular-movies fallback."""
    if key == POPULAR_MOVIES_KEY:
        return True
    provider, separator, rest = key.partition(":")
    kind, second, _query = rest.partition(":")
    return bool(separator and second) and provider in SEARCH_PROVIDERS and kind in SEARCH_KINDS


def is_retained_cache_key(key: str) -> bool:
    """True for saved enrichment and follow-up cache, which this mapping keeps."""
    return key.startswith(RETAINED_PREFIXES)


def search_cache_predicate(column: str = "cache_key") -> str:
    providers = ", ".join(f"'{provider}'" for provider in SEARCH_PROVIDERS)
    kinds = ", ".join(f"'{kind}'" for kind in SEARCH_KINDS)
    second = f"substr({column}, instr({column}, ':') + 1)"
    return (
        f"({column} = '{POPULAR_MOVIES_KEY}' OR ("
        f"substr({column}, 1, instr({column}, ':') - 1) IN ({providers}) AND "
        f"substr({column}, instr({column}, ':') + 1, instr({second}, ':') - 1) IN ({kinds}) AND "
        f"instr({second}, ':') > 0))"
    )


def retained_cache_predicate(column: str = "cache_key") -> str:
    return "(" + " OR ".join(f"{column} LIKE '{prefix}%'" for prefix in RETAINED_PREFIXES) + ")"


def _drop_temp() -> list[str]:
    return [f"DROP TABLE IF EXISTS {name}" for name in _TEMP_TABLES]


def _absent(code: str, match: str) -> str:
    return (
        "NOT EXISTS (SELECT 1 FROM media_migration_reports existing "
        f"WHERE existing.code = '{code}' AND {match})"
    )


def backfill_statements() -> tuple[str, ...]:
    """Idempotent SQL for the membership revision. Original score rows stay."""
    search = search_cache_predicate()
    retained = retained_cache_predicate()
    statements = [
        *_drop_temp(),
        """
        UPDATE user_entries
        SET followed = CASE WHEN status = 'dropped' THEN 0 ELSE 1 END,
            follow_provenance = 'legacy:' || status
        WHERE followed IS NULL
          AND catalog_id IN (SELECT id FROM catalog_items WHERE kind = 'artist')
        """,
        """
        INSERT INTO series_lifecycles (
            catalog_id, lifecycle, raw_value, source, source_id, fetched_at,
            completeness, freshness
        )
        SELECT id, 'unknown', NULL, source, source_id, NULL, 'unknown', 'unknown'
        FROM catalog_items
        WHERE kind = 'tv'
          AND NOT EXISTS (
              SELECT 1 FROM series_lifecycles existing WHERE existing.catalog_id = catalog_items.id
          )
        """,
        """
        CREATE TEMP TABLE media_album_ident AS
        SELECT
            a.id AS album_id,
            a.catalog_id AS artist_catalog_id,
            a.title AS title,
            a.year AS year,
            a.artwork_url AS artwork_url,
            a.position AS position,
            a.source_id AS raw_source_id,
            artist.title AS credit,
            artist.kind AS parent_kind,
            CASE
                WHEN a.source_id IS NOT NULL AND artist.source = 'musicbrainz' THEN 'musicbrainz'
                WHEN a.source_id IS NOT NULL THEN artist.source
                ELSE 'manual'
            END AS source,
            CASE
                WHEN a.source_id IS NOT NULL THEN a.source_id
                ELSE 'legacy-album-' || a.id
            END AS source_id,
            CASE
                WHEN a.source_id IS NOT NULL AND artist.source = 'musicbrainz'
                    THEN 'musicbrainz:release-group'
                WHEN a.source_id IS NULL THEN 'manual'
                ELSE artist.source || char(58) || 'album'
            END AS namespace,
            CASE
                WHEN a.source_id IS NULL THEN 'manual-legacy-id'
                WHEN artist.source = 'musicbrainz' THEN 'provider-release-group'
                ELSE 'provider-id'
            END AS provenance,
            CASE
                WHEN a.source_id IS NOT NULL AND artist.source = 'musicbrainz'
                     AND artist.kind = 'artist' THEN 'artist-release-group'
                WHEN a.source_id IS NOT NULL AND artist.source = 'musicbrainz'
                     AND artist.kind = 'album' THEN 'release-to-group'
                ELSE 'artist-album'
            END AS relation
        FROM music_albums a
        JOIN catalog_items artist ON artist.id = a.catalog_id
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, catalog_id, detail
        )
        SELECT
            'identity-kind-collision', 'album', 'music_albums', i.album_id, existing.id,
            'existing ' || existing.kind || ' ' || i.source || ':' || i.source_id
        FROM media_album_ident i
        JOIN catalog_items existing
          ON existing.source = i.source
         AND existing.source_id = i.source_id
         AND existing.kind != 'album'
        WHERE {_absent("identity-kind-collision", "existing.legacy_table = 'music_albums' AND existing.legacy_id = i.album_id")}
        """,
        f"""
        INSERT INTO catalog_items (
            kind, title, creator, year, artwork_url, source, source_id,
            migration_provenance, created_at, updated_at
        )
        SELECT
            'album', i.title, i.credit, i.year,
            (
                SELECT other.artwork_url
                FROM media_album_ident other
                WHERE other.source = i.source
                  AND other.source_id = i.source_id
                  AND other.artwork_url IS NOT NULL
                ORDER BY other.album_id
                LIMIT 1
            ),
            i.source, i.source_id, '{CATALOG_ALBUM}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM media_album_ident i
        WHERE i.album_id = (
            SELECT MIN(other.album_id)
            FROM media_album_ident other
            WHERE other.source = i.source AND other.source_id = i.source_id
        )
          AND NOT EXISTS (
              SELECT 1 FROM catalog_items existing
              WHERE existing.source = i.source AND existing.source_id = i.source_id
          )
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, detail
        )
        SELECT
            'identity-field-conflict', 'album', 'music_albums', i.album_id,
            'kept album ' || keeper.album_id
        FROM media_album_ident i
        JOIN media_album_ident keeper
          ON keeper.source = i.source
         AND keeper.source_id = i.source_id
         AND keeper.album_id = (
             SELECT MIN(other.album_id)
             FROM media_album_ident other
             WHERE other.source = i.source AND other.source_id = i.source_id
         )
        WHERE i.album_id != keeper.album_id
          AND (
              lower(trim(i.title)) != lower(trim(keeper.title))
              OR ifnull(i.year, -1) != ifnull(keeper.year, -1)
          )
          AND {_absent("identity-field-conflict", "existing.legacy_table = 'music_albums' AND existing.legacy_id = i.album_id")}
        """,
        """
        INSERT INTO music_links (
            parent_catalog_id, child_catalog_id, relation, namespace, source_id,
            position, credit, legacy_album_id, provenance
        )
        SELECT
            i.artist_catalog_id, child.id, i.relation, i.namespace, i.raw_source_id,
            i.position, i.credit, i.album_id, i.provenance
        FROM media_album_ident i
        JOIN catalog_items child
          ON child.source = i.source AND child.source_id = i.source_id AND child.kind = 'album'
        WHERE i.album_id = (
              SELECT MIN(other.album_id)
              FROM media_album_ident other
              WHERE other.artist_catalog_id = i.artist_catalog_id
                AND other.source = i.source
                AND other.source_id = i.source_id
                AND other.relation = i.relation
          )
          AND NOT EXISTS (
              SELECT 1 FROM music_links link WHERE link.legacy_album_id = i.album_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM music_links link
              WHERE link.parent_catalog_id = i.artist_catalog_id
                AND link.child_catalog_id = child.id
                AND link.relation = i.relation
          )
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, detail
        )
        SELECT
            'already-linked', 'album', 'music_albums', i.album_id,
            'public relationship already mapped'
        FROM media_album_ident i
        JOIN catalog_items child
          ON child.source = i.source AND child.source_id = i.source_id AND child.kind = 'album'
        WHERE NOT EXISTS (
              SELECT 1 FROM music_links link WHERE link.legacy_album_id = i.album_id
          )
          AND EXISTS (
              SELECT 1 FROM music_links link
              WHERE link.parent_catalog_id = i.artist_catalog_id
                AND link.child_catalog_id = child.id
                AND link.relation = i.relation
          )
          AND {_absent("already-linked", "existing.legacy_table = 'music_albums' AND existing.legacy_id = i.album_id")}
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, detail
        )
        SELECT
            'ambiguous-manual', 'album', 'music_albums', i.album_id,
            'mapped by legacy id, not title'
        FROM media_album_ident i
        WHERE i.raw_source_id IS NULL
          AND {_absent("ambiguous-manual", "existing.legacy_table = 'music_albums' AND existing.legacy_id = i.album_id")}
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, detail
        )
        SELECT
            'ambiguous-manual-owner', 'album', 'music_albums', i.album_id,
            'owners ' || (
                SELECT count(DISTINCT entry.user_id)
                FROM user_entries entry
                WHERE entry.catalog_id = i.artist_catalog_id
            )
        FROM media_album_ident i
        WHERE i.raw_source_id IS NULL
          AND (
              SELECT count(DISTINCT entry.user_id)
              FROM user_entries entry
              WHERE entry.catalog_id = i.artist_catalog_id
          ) != 1
          AND {_absent("ambiguous-manual-owner", "existing.legacy_table = 'music_albums' AND existing.legacy_id = i.album_id")}
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, detail
        )
        SELECT
            'same-title-distinct', 'album', 'music_albums', i.album_id,
            'also ' || (
                SELECT group_concat(other.album_id)
                FROM media_album_ident other
                WHERE other.album_id != i.album_id
                  AND other.raw_source_id IS NULL
                  AND i.raw_source_id IS NULL
                  AND lower(trim(other.title)) = lower(trim(i.title))
            )
        FROM media_album_ident i
        WHERE i.raw_source_id IS NULL
          AND EXISTS (
              SELECT 1 FROM media_album_ident other
              WHERE other.album_id != i.album_id
                AND other.raw_source_id IS NULL
                AND lower(trim(other.title)) = lower(trim(i.title))
          )
          AND {_absent("same-title-distinct", "existing.legacy_table = 'music_albums' AND existing.legacy_id = i.album_id")}
        """,
        """
        CREATE TEMP TABLE media_track_ident AS
        SELECT
            t.id AS track_id,
            t.album_id AS album_id,
            t.title AS title,
            t.position AS position,
            t.source_id AS raw_source_id,
            i.artist_catalog_id AS artist_catalog_id,
            i.raw_source_id AS album_source_id,
            i.source AS album_source,
            i.namespace AS album_namespace,
            child.id AS album_catalog_id,
            CASE
                WHEN t.source_id IS NULL THEN 'manual'
                WHEN i.namespace = 'musicbrainz:release-group' OR i.source = 'musicbrainz'
                    THEN 'musicbrainz'
                ELSE i.source
            END AS source,
            CASE
                WHEN t.source_id IS NOT NULL THEN t.source_id
                ELSE 'legacy-track-' || t.id
            END AS source_id,
            CASE
                WHEN t.source_id IS NOT NULL
                     AND (i.namespace = 'musicbrainz:release-group' OR i.source = 'musicbrainz')
                    THEN 'musicbrainz:recording'
                WHEN t.source_id IS NULL THEN 'manual'
                ELSE i.source || char(58) || 'recording'
            END AS namespace,
            CASE
                WHEN t.source_id IS NULL THEN 'manual-legacy-id'
                WHEN i.namespace = 'musicbrainz:release-group' OR i.source = 'musicbrainz'
                    THEN 'recording-or-track-id'
                ELSE 'provider-id'
            END AS provenance,
            CASE
                WHEN i.namespace = 'musicbrainz:release-group' THEN 'release-group-recording'
                ELSE 'album-recording'
            END AS relation
        FROM music_tracks t
        JOIN media_album_ident i ON i.album_id = t.album_id
        LEFT JOIN catalog_items child
          ON child.source = i.source AND child.source_id = i.source_id AND child.kind = 'album'
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, catalog_id, detail
        )
        SELECT
            'identity-kind-collision', 'track', 'music_tracks', t.track_id, existing.id,
            'existing ' || existing.kind || ' ' || t.source || ':' || t.source_id
        FROM media_track_ident t
        JOIN catalog_items existing
          ON existing.source = t.source
         AND existing.source_id = t.source_id
         AND existing.kind != 'track'
        WHERE {_absent("identity-kind-collision", "existing.legacy_table = 'music_tracks' AND existing.legacy_id = t.track_id")}
        """,
        f"""
        INSERT INTO catalog_items (
            kind, title, creator, source, source_id, migration_provenance, created_at, updated_at
        )
        SELECT
            'track', t.title, NULL, t.source, t.source_id, '{CATALOG_TRACK}',
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM media_track_ident t
        WHERE t.track_id = (
            SELECT MIN(other.track_id)
            FROM media_track_ident other
            WHERE other.source = t.source AND other.source_id = t.source_id
        )
          AND NOT EXISTS (
              SELECT 1 FROM catalog_items existing
              WHERE existing.source = t.source AND existing.source_id = t.source_id
          )
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, detail
        )
        SELECT
            'identity-field-conflict', 'track', 'music_tracks', t.track_id,
            'kept track ' || keeper.track_id
        FROM media_track_ident t
        JOIN media_track_ident keeper
          ON keeper.source = t.source
         AND keeper.source_id = t.source_id
         AND keeper.track_id = (
             SELECT MIN(other.track_id)
             FROM media_track_ident other
             WHERE other.source = t.source AND other.source_id = t.source_id
         )
        WHERE t.track_id != keeper.track_id
          AND lower(trim(t.title)) != lower(trim(keeper.title))
          AND {_absent("identity-field-conflict", "existing.legacy_table = 'music_tracks' AND existing.legacy_id = t.track_id")}
        """,
        """
        INSERT INTO music_links (
            parent_catalog_id, child_catalog_id, relation, namespace, source_id,
            position, legacy_track_id, provenance
        )
        SELECT
            t.album_catalog_id, child.id, t.relation, t.namespace, t.raw_source_id,
            t.position, t.track_id, t.provenance
        FROM media_track_ident t
        JOIN catalog_items child
          ON child.source = t.source AND child.source_id = t.source_id AND child.kind = 'track'
        WHERE t.album_catalog_id IS NOT NULL
          AND child.id != t.album_catalog_id
          AND t.track_id = (
              SELECT MIN(other.track_id)
              FROM media_track_ident other
              WHERE other.album_catalog_id = t.album_catalog_id
                AND other.source = t.source
                AND other.source_id = t.source_id
                AND other.relation = t.relation
          )
          AND NOT EXISTS (
              SELECT 1 FROM music_links link WHERE link.legacy_track_id = t.track_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM music_links link
              WHERE link.parent_catalog_id = t.album_catalog_id
                AND link.child_catalog_id = child.id
                AND link.relation = t.relation
          )
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, detail
        )
        SELECT
            'already-linked', 'track', 'music_tracks', t.track_id,
            'public relationship already mapped'
        FROM media_track_ident t
        JOIN catalog_items child
          ON child.source = t.source AND child.source_id = t.source_id AND child.kind = 'track'
        WHERE t.album_catalog_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM music_links link WHERE link.legacy_track_id = t.track_id
          )
          AND EXISTS (
              SELECT 1 FROM music_links link
              WHERE link.parent_catalog_id = t.album_catalog_id
                AND link.child_catalog_id = child.id
                AND link.relation = t.relation
          )
          AND {_absent("already-linked", "existing.legacy_table = 'music_tracks' AND existing.legacy_id = t.track_id")}
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, detail
        )
        SELECT
            'missing-parent-link', 'track', 'music_tracks', t.track_id,
            'album was not mapped'
        FROM media_track_ident t
        WHERE t.album_catalog_id IS NULL
          AND {_absent("missing-parent-link", "existing.legacy_table = 'music_tracks' AND existing.legacy_id = t.track_id")}
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, detail
        )
        SELECT
            'ambiguous-manual', 'track', 'music_tracks', t.track_id,
            CASE
                WHEN t.album_source_id IS NULL THEN 'mapped by legacy id, not title'
                ELSE 'track without an id on a provider album'
            END
        FROM media_track_ident t
        WHERE t.raw_source_id IS NULL
          AND {_absent("ambiguous-manual", "existing.legacy_table = 'music_tracks' AND existing.legacy_id = t.track_id")}
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, detail
        )
        SELECT
            'same-title-distinct', 'track', 'music_tracks', t.track_id,
            'also ' || (
                SELECT group_concat(other.track_id)
                FROM media_track_ident other
                WHERE other.track_id != t.track_id
                  AND other.raw_source_id IS NULL
                  AND lower(trim(other.title)) = lower(trim(t.title))
            )
        FROM media_track_ident t
        WHERE t.raw_source_id IS NULL
          AND EXISTS (
              SELECT 1 FROM media_track_ident other
              WHERE other.track_id != t.track_id
                AND other.raw_source_id IS NULL
                AND lower(trim(other.title)) = lower(trim(t.title))
          )
          AND {_absent("same-title-distinct", "existing.legacy_table = 'music_tracks' AND existing.legacy_id = t.track_id")}
        """,
        f"""
        INSERT INTO media_migration_reports (code, subject, detail)
        SELECT 'recording-or-track-id', 'track', cast(counted.n AS TEXT)
        FROM (
            SELECT count(*) AS n FROM media_track_ident WHERE provenance = 'recording-or-track-id'
        ) counted
        WHERE counted.n > 0
          AND {_absent("recording-or-track-id", "1 = 1")}
        """,
        """
        INSERT INTO music_links (
            parent_catalog_id, child_catalog_id, relation, namespace, source_id,
            position, provenance
        )
        SELECT
            grouped.id, release_row.id, 'release-of-group', 'musicbrainz:release',
            release_row.source_id, 0, 'extra-release-group-id'
        FROM catalog_items release_row
        JOIN catalog_items grouped
          ON grouped.kind = 'album'
         AND grouped.source = 'musicbrainz'
         AND grouped.source_id = json_extract(release_row.extra, '$.release_group_id')
        WHERE release_row.kind = 'album'
          AND release_row.source = 'musicbrainz'
          AND release_row.id != grouped.id
          AND NOT EXISTS (
              SELECT 1 FROM music_links link
              WHERE link.parent_catalog_id = grouped.id
                AND link.child_catalog_id = release_row.id
                AND link.relation = 'release-of-group'
          )
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, user_id, entry_id, detail
        )
        SELECT
            'withheld-null-score', 'album', 'album_ratings', rating.id, rating.user_id,
            rating.entry_id, 'null rating is not a save'
        FROM album_ratings rating
        WHERE rating.rating IS NULL
          AND {_absent("withheld-null-score", "existing.legacy_table = 'album_ratings' AND existing.legacy_id = rating.id")}
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, user_id, entry_id, detail
        )
        SELECT
            'withheld-null-score', 'track', 'track_ratings', rating.id, rating.user_id,
            rating.entry_id, 'null rating is not a save'
        FROM track_ratings rating
        WHERE rating.rating IS NULL
          AND {_absent("withheld-null-score", "existing.legacy_table = 'track_ratings' AND existing.legacy_id = rating.id")}
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, user_id, entry_id, detail
        )
        SELECT
            'unmapped-score', 'album', 'album_ratings', rating.id, rating.user_id,
            rating.entry_id, 'rating ' || rating.rating || ' has no mapped album'
        FROM album_ratings rating
        WHERE rating.rating IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM media_album_ident ident
              JOIN catalog_items child
                ON child.source = ident.source
               AND child.source_id = ident.source_id
               AND child.kind = 'album'
              WHERE ident.album_id = rating.album_id
          )
          AND {_absent("unmapped-score", "existing.legacy_table = 'album_ratings' AND existing.legacy_id = rating.id")}
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, legacy_table, legacy_id, user_id, entry_id, detail
        )
        SELECT
            'unmapped-score', 'track', 'track_ratings', rating.id, rating.user_id,
            rating.entry_id, 'rating ' || rating.rating || ' has no mapped track'
        FROM track_ratings rating
        WHERE rating.rating IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM media_track_ident ident
              JOIN catalog_items child
                ON child.source = ident.source
               AND child.source_id = ident.source_id
               AND child.kind = 'track'
              WHERE ident.track_id = rating.track_id
          )
          AND {_absent("unmapped-score", "existing.legacy_table = 'track_ratings' AND existing.legacy_id = rating.id")}
        """,
        """
        CREATE TEMP TABLE media_score AS
        SELECT
            rating.user_id AS user_id,
            child.id AS catalog_id,
            rating.rating AS rating,
            'album_ratings' AS legacy_table,
            rating.id AS legacy_id,
            rating.entry_id AS entry_id
        FROM album_ratings rating
        JOIN media_album_ident ident ON ident.album_id = rating.album_id
        JOIN catalog_items child
          ON child.source = ident.source
         AND child.source_id = ident.source_id
         AND child.kind = 'album'
        WHERE rating.rating IS NOT NULL
        UNION ALL
        SELECT
            rating.user_id, child.id, rating.rating, 'track_ratings', rating.id, rating.entry_id
        FROM track_ratings rating
        JOIN media_track_ident ident ON ident.track_id = rating.track_id
        JOIN catalog_items child
          ON child.source = ident.source
         AND child.source_id = ident.source_id
         AND child.kind = 'track'
        WHERE rating.rating IS NOT NULL
        """,
        """
        CREATE TEMP TABLE media_score_span AS
        SELECT user_id, catalog_id, MIN(rating) AS low, MAX(rating) AS high
        FROM media_score
        GROUP BY user_id, catalog_id
        """,
        f"""
        INSERT INTO media_migration_reports (
            code, subject, user_id, catalog_id, entry_id, detail
        )
        SELECT
            'score-conflict',
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM media_score score
                    WHERE score.user_id = span.user_id
                      AND score.catalog_id = span.catalog_id
                      AND score.legacy_table = 'track_ratings'
                ) AND NOT EXISTS (
                    SELECT 1 FROM media_score score
                    WHERE score.user_id = span.user_id
                      AND score.catalog_id = span.catalog_id
                      AND score.legacy_table = 'album_ratings'
                ) THEN 'track'
                ELSE 'album'
            END,
            span.user_id,
            span.catalog_id,
            entry.id,
            'nested ' || span.low || '..' || span.high || ' standalone '
                || ifnull(cast(entry.rating AS TEXT), 'null')
        FROM media_score_span span
        LEFT JOIN user_entries entry
          ON entry.user_id = span.user_id AND entry.catalog_id = span.catalog_id
        WHERE NOT (
            span.low = span.high
            AND (entry.id IS NULL OR (entry.rating IS NOT NULL AND entry.rating = span.low))
        )
          AND {_absent("score-conflict", "existing.user_id = span.user_id AND existing.catalog_id = span.catalog_id")}
        """,
        """
        CREATE TEMP TABLE media_single_owner AS
        SELECT catalog_id, MIN(user_id) AS user_id
        FROM user_entries
        GROUP BY catalog_id
        HAVING count(DISTINCT user_id) = 1
        """,
        """
        CREATE TEMP TABLE media_new_member (
            user_id INTEGER NOT NULL,
            catalog_id INTEGER NOT NULL,
            rating FLOAT,
            provenance VARCHAR(60) NOT NULL,
            PRIMARY KEY (user_id, catalog_id)
        )
        """,
        f"""
        INSERT INTO media_new_member (user_id, catalog_id, rating, provenance)
        SELECT
            span.user_id,
            span.catalog_id,
            CASE WHEN span.low = span.high THEN span.low ELSE NULL END,
            CASE
                WHEN span.low != span.high THEN '{PROVENANCE_SCORE_CONFLICT}'
                WHEN EXISTS (
                    SELECT 1 FROM media_score score
                    WHERE score.user_id = span.user_id
                      AND score.catalog_id = span.catalog_id
                      AND score.legacy_table = 'album_ratings'
                ) THEN '{PROVENANCE_ALBUM_SCORE}'
                ELSE '{PROVENANCE_TRACK_SCORE}'
            END
        FROM media_score_span span
        WHERE NOT EXISTS (
            SELECT 1 FROM user_entries entry
            WHERE entry.user_id = span.user_id AND entry.catalog_id = span.catalog_id
        )
        """,
        f"""
        INSERT OR IGNORE INTO media_new_member (user_id, catalog_id, rating, provenance)
        SELECT owner.user_id, child.id, NULL, '{PROVENANCE_MANUAL_ALBUM}'
        FROM media_album_ident ident
        JOIN catalog_items child
          ON child.source = ident.source
         AND child.source_id = ident.source_id
         AND child.kind = 'album'
        JOIN media_single_owner owner ON owner.catalog_id = ident.artist_catalog_id
        WHERE ident.raw_source_id IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM user_entries entry
              WHERE entry.user_id = owner.user_id
                AND entry.catalog_id = child.id
          )
        """,
        f"""
        INSERT OR IGNORE INTO media_new_member (user_id, catalog_id, rating, provenance)
        SELECT owner.user_id, child.id, NULL, '{PROVENANCE_MANUAL_TRACK}'
        FROM media_track_ident track
        JOIN catalog_items child
          ON child.source = track.source
         AND child.source_id = track.source_id
         AND child.kind = 'track'
        JOIN media_single_owner owner ON owner.catalog_id = track.artist_catalog_id
        WHERE track.raw_source_id IS NULL
          AND track.album_source_id IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM user_entries entry
              WHERE entry.user_id = owner.user_id AND entry.catalog_id = child.id
          )
        """,
        """
        INSERT INTO user_entries (
            user_id, catalog_id, status, rating, review_spoiler, favorite, anticipated,
            created_at, updated_at, membership_provenance
        )
        SELECT
            member.user_id, member.catalog_id, 'want', member.rating, 0, 0, 0,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, member.provenance
        FROM media_new_member member
        WHERE NOT EXISTS (
            SELECT 1 FROM user_entries entry
            WHERE entry.user_id = member.user_id AND entry.catalog_id = member.catalog_id
        )
        """,
        f"""
        INSERT INTO media_migration_reports (code, subject, detail)
        SELECT 'search-cache-pruned', 'cache', cast(counted.n AS TEXT)
        FROM (SELECT count(*) AS n FROM provider_cache WHERE {search}) counted
        WHERE counted.n > 0
          AND {_absent("search-cache-pruned", "1 = 1")}
        """,
        f"""
        INSERT INTO media_migration_reports (code, subject, detail)
        SELECT 'cache-retained', 'cache', cast(counted.n AS TEXT)
        FROM (SELECT count(*) AS n FROM provider_cache WHERE NOT ({search})) counted
        WHERE counted.n > 0
          AND {_absent("cache-retained", "1 = 1")}
        """,
        f"""
        INSERT INTO media_migration_reports (code, subject, detail)
        SELECT 'cache-retained-unclassified', 'cache', cache.cache_key
        FROM provider_cache cache
        WHERE NOT ({search})
          AND NOT ({retained})
          AND {_absent("cache-retained-unclassified", "existing.detail = cache.cache_key")}
        """,
        f"DELETE FROM provider_cache WHERE {search}",
        *_drop_temp(),
    ]
    return tuple(statement.strip() for statement in statements)


def downgrade_statements() -> tuple[str, ...]:
    """Remove mapped memberships. Legacy scores, episodes, and seasons stay.

    Search cache rows already deleted are not put back.
    """
    member = "SELECT id FROM user_entries WHERE membership_provenance IS NOT NULL"
    return (
        "DELETE FROM media_migration_reports",
        f"DELETE FROM experiences WHERE entry_id IN ({member})",
        f"DELETE FROM season_progress WHERE entry_id IN ({member})",
        f"DELETE FROM album_ratings WHERE entry_id IN ({member})",
        f"DELETE FROM track_ratings WHERE entry_id IN ({member})",
        "DELETE FROM user_entries WHERE membership_provenance IS NOT NULL",
        "DELETE FROM music_links",
        "DELETE FROM series_lifecycles",
        """
        DELETE FROM catalog_items
        WHERE migration_provenance IS NOT NULL
          AND id NOT IN (SELECT catalog_id FROM user_entries)
          AND id NOT IN (SELECT catalog_id FROM episodes)
          AND id NOT IN (SELECT catalog_id FROM releases)
          AND id NOT IN (SELECT catalog_id FROM music_albums)
        """,
    )


def backfill_media(connection) -> dict[str, int]:
    """Run the mapping. Safe to call again on the same database."""
    for statement in backfill_statements():
        connection.execute(text(statement))
    return {
        "memberships": _count(
            connection, "SELECT count(*) FROM user_entries WHERE membership_provenance IS NOT NULL"
        ),
        "links": _count(connection, "SELECT count(*) FROM music_links"),
        "reports": _count(connection, "SELECT count(*) FROM media_migration_reports"),
        "followed": _count(connection, "SELECT count(*) FROM user_entries WHERE followed = 1"),
        "unfollowed": _count(connection, "SELECT count(*) FROM user_entries WHERE followed = 0"),
        "lifecycles": _count(connection, "SELECT count(*) FROM series_lifecycles"),
    }


def _count(connection, statement: str) -> int:
    return int(connection.execute(text(statement)).scalar_one())
