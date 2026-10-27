# Media journal

Media owns its domain code under `apps/media`; the root Angular web app loads its `frontend` routes at `/media/`. FastAPI APIs retain `/media/api`. The shared server validates session/CSRF in-process and supplies the request database session. The unified SQLite file stores app-owned Media tables; ordinary saved reads do not fetch providers. Finance vault access is unnecessary. Use the root workflow in [Development](DEVELOPMENT.md).

## Membership and personal data

Library entries, ratings, reviews, progress, favorites, experiences and artist portrait choices belong to the signed-in user. Public catalog metadata is shared by stable provider identity. Saving/following an artist does not save albums or songs. Artists use the same card treatment and a collapsed saved-child expansion; Browse discography is a separate bounded discovery flow. Add each album/song explicitly. Removing an artist preserves independently saved music. Artists are Following or Unfollowed, while real albums and songs carry listening progress.

Library filters, counts, Unicode title order and pagination run in SQL. Page-scoped relationship/progress queries replace per-card lookups. Zero is a valid rating; clearing the field means unrated. Legacy nested album/song scores remain preserved by the membership migration, including conflict provenance.

Detail forms use explicit Save changes. Updates send changed fields and keep review-base conflict checks. Newer typing during an in-flight save stays on the form. Up to ten per-tab recovery drafts are scoped to the signed-in user: matching-version drafts restore locally, stale drafts require Restore/Discard, and nothing is sent until Save. Sign-out/expiry clears private drafts. Failed operations stay local and retain editable input.

Artist photos use explicit Wikimedia Commons search, preview and selection, with license/source attribution. Broken candidates cannot be selected. The server resolves the selected source identity instead of fetching a browser-supplied URL. The override belongs to that user; reset reveals catalog artwork again without changing anyone else's choice.

## Search and saved metadata

Search is transient. A process cache is bounded by TTL, entry count, bytes and in-flight requests; search writes no query history or library rows to SQLite. Saving an item hydrates authoritative metadata by source identity and persists it independently of later search/provider outages. Same-named works are not merged by title alone. Relevance ranks before the result cap, with Previous/More results pagination.

The UI shows the active type/query, source coverage, partial failure, missing configuration, timeout, throttling, empty results and retry. Deterministic The Gentlemen movie/series fixtures cover ambiguous titles and partial source failure. They establish regression behavior rather than proving a past intermittent production cause.

| Source | Capability |
| --- | --- |
| TMDB | Movies/series using `TMDB_API_KEY`; public movie-search fallback without a key |
| TVMaze | Keyless series search and explicit saved-show episode refresh |
| MusicBrainz | Artist/album/song identity and on-demand discography, with paced requests |
| Cover Art Archive | Album artwork by release identity |
| Open Library | Books, editions and covers |
| RAWG / Steam | Games with RAWG key, otherwise keyless Steam search |
| iTunes Search | Optional additional movie results when `MEDIA_SCRAPE_MODE=1` |
| Wikimedia Commons | Explicit artist portrait search/selection and attribution |
| Wikidata | Explicit calendar follow-up discovery for saved movie activity |

Keys stay server-side. Source-specific identity, date precision and rating scales remain distinct. Saved library/detail reads remain useful with no provider keys and during outages.

## TV and calendar

Mark caught up marks known aired episodes once, excluding specials unless requested and excluding future/unknown air dates. Undo changes only marks still owned by that operation, preserving later individual edits; repeated catch-up/undo is idempotent. Unknown-date episodes can be handled individually. No metadata is not proof of completion.

Production lifecycle (ongoing, ended, canceled, unknown), freshness/completeness and personal progress remain separate. Explicit refresh reconciles episodes by provider identity without losing personal marks. Newly aired episodes reappear in Now/Hub and library/detail progress even after earlier catch-up. A manual show can be linked to a chosen provider identity; the server never guesses from its title.

Calendar GET reads saved/cached data only. Refresh is explicit and releases the database transaction before provider IO. Episodes use browser timezone; movie month/year precision stays in a band rather than becoming a fictitious day. Saved dates survive an unavailable refresh. Anticipated movies and discovered sequels/spin-offs remain distinct from library membership. `MEDIA_TODAY` is a deterministic test clock.

See [Migrations](MIGRATIONS.md), [Quality](QUALITY.md), and [Security](SECURITY_MODEL.md).
