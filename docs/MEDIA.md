# Media journal

Media owns its domain code under `apps/media`; the root Angular web app loads its `frontend` routes at `/media/`. FastAPI APIs retain `/media/api`. The shared server validates session/CSRF in-process and supplies the request database session. The unified SQLite file stores app-owned Media tables; ordinary saved reads do not fetch providers. Finance vault access is unnecessary. Use the root workflow in [Development](DEVELOPMENT.md).

## Membership and personal data

Library entries, ratings, reviews, progress, favorites, experiences and artist portrait choices belong to the signed-in user. Public catalog metadata is shared by stable provider identity. Saving/following an artist does not save albums or songs. Saving an album or song groups it by canonical artist id without following that artist or importing the rest of a discography. The same person is one membership; a compilation, a featured credit, an unknown credit, or a similar name stays distinct. The Music page lists those artist groups. Saved albums sit under the artist and saved songs sit under the album they belong to, or after the albums when the album itself is not saved. The same album is not a second card in that collection. Albums and Songs remain explicit views. Browse discography stays a separate labeled choice and is not loaded by opening a group. Add each album/song explicitly. Removing an artist preserves independently saved music. Artists are Following or Unfollowed, while real albums and songs carry listening progress.

Movies, Series, Books, Music and Games are separate library collections. Movies and Series are poster shelves. A film poster shows the status the person recorded, such as Planned or Watched, and a viewing date only when that person saved one. Marking a film watched does not invent a day. A series poster keeps production lifecycle apart from episode progress: caught up is not ended, and a newly aired episode brings the next-episode action back. Next-episode and Undo on that shelf are the same actions used on Now. The collection, sort, page and filters live in the library URL, so reload and Back return to them. All items is the deliberate mixed activity view, not the result of clearing a state. Music opens artist groups, including an album or song saved before a follow. Albums and Songs are explicit views and keep their old kind links. An album or song card links to that artist group instead of repeating the same record. Choosing another collection keeps search, sort, favorites and tags, resets the page, and drops a state the new collection cannot show. The page says so, including Following then Books. A bookmarked impossible pair is removed from the URL before the library is read. Saved reads stay database-only.

Album, song, and other library filters, counts, Unicode title order and pagination run in SQL. The artist page orders this user's saved groups from that same membership. Page-scoped relationship/progress queries replace per-card lookups. Zero is a valid rating; clearing the field means unrated. Legacy nested album/song scores remain preserved by the membership migration, including conflict provenance.

Detail forms use explicit Save changes. A movie can record an optional Watched on date. Leaving it blank stores no viewing date, and the date is not copied from the completion stamp. Updates send changed fields and keep review-base conflict checks. Newer typing during an in-flight save stays on the form. Detail artwork is 2:3 and falls back to a kind icon plus the title's first letter. Books and games show progress; other kinds disclose progress and anticipation. Episode dates use the shared calendar formatter, and episode watched controls expose pressed state. A progress success, failure or Undo rebases the same unsaved note and rating onto the new item clock. Up to ten per-tab recovery drafts are scoped to the signed-in user: matching-version drafts restore locally, stale drafts require Restore/Discard, and nothing is sent until Save. Sign-out/expiry clears private drafts. Failed operations stay local and retain editable input. Tags on that form use the shared tag model: Enter adds a chip, an empty Backspace removes the last chip, removing a chip moves focus to the next chip or the input, and Enter does not submit notes or ratings. Each tag is at most 40 Unicode code points, with at most 20 tags. Save changes sends tags with the other changed fields. Drafts written before tags omit the tag list and still restore the note.

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

Keys stay server-side. Source-specific identity, date precision and rating scales remain distinct. Saved library, summary, and detail reads use the database only. They do not call a provider and they do not repair MusicBrainz history before the page is returned. Refreshing one saved album is the explicit repair: it resolves that album's release group, stops if the lookup deadline passes, and can be retried. An unresolved album keeps its saved title and stays metadata-pending. The repair does not change another person's notes or ratings. Discography remains an explicit provider read and does not rewrite saved albums. Saved library/detail reads remain useful with no provider keys and during outages.

## TV and calendar

Mark caught up marks known aired episodes once, excluding specials unless requested and excluding future/unknown air dates. Undo changes only marks still owned by that operation, preserving later individual edits; repeated catch-up/undo is idempotent. Unknown-date episodes can be handled individually. No metadata is not proof of completion.

Production lifecycle (ongoing, ended, canceled, unknown), freshness/completeness and personal progress remain separate. Explicit refresh reconciles episodes by provider identity without losing personal marks. Newly aired episodes reappear in Now/Hub and library/detail progress even after earlier catch-up. The Series collection reads that continuation from the episodes on the page. It does not call per-card detail. A manual show can be linked to a chosen provider identity; the server never guesses from its title.

Calendar GET reads saved/cached data only. Refresh is explicit and releases the database transaction before provider IO. Episodes use browser timezone; movie month/year precision stays in a band rather than becoming a fictitious day. Saved dates survive an unavailable refresh. Anticipated movies and discovered sequels/spin-offs remain distinct from library membership. `MEDIA_TODAY` is a deterministic test clock.

See [Migrations](MIGRATIONS.md), [Quality](QUALITY.md), and [Security](SECURITY_MODEL.md).
