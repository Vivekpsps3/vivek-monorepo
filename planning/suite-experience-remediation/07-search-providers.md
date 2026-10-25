# Search, source authority, caching, and error visibility

## SRC-01 — Small explicit provider contracts

Use concrete adapters under each domain, not a universal plugin registry. A small common HTTP/error utility may be server-owned; Travel flight rules and Media metadata authority stay in their own folders.

| Kind / purpose | Existing source | Planned authoritative role and limitation |
| --- | --- | --- |
| Movies | TMDB official API with key; public page fallback; optional iTunes | TMDB identity/detail preferred; extraction fallback clearly lower coverage; provenance and parser fixtures required. |
| TV series / episodes | TVMaze, TMDB with key | Stable show IDs; disambiguate adaptation/year; detail includes lifecycle, episodes and freshness. |
| Artists | MusicBrainz | Stable artist identity/credits; following is personal, public artist metadata is not activity. |
| Albums / songs | MusicBrainz + Cover Art Archive | Preserve release group/release/recording identities; artist catalog is on-demand exploration. |
| Artist photos | Existing MusicBrainz/Wikidata enrichment; new selected-image source | Provider fallback plus private chosen override with attribution metadata. |
| Books | Open Library | Preserve work versus edition distinction and cover provenance; no invented precise dates. |
| Games | RAWG with key or Steam keyless search | Coverage depends on catalog; clearly show supported platforms/source and unavailable metadata. |
| Flights | FlightAware AeroAPI | Match flight/date/local airport times; credentials/horizon verified; manual fallback. |
| Places / maps | Existing Nominatim / OSM tiles | Geocoding and tile delivery are separate capabilities; public-service restrictions documented. |

- [ ] For each active adapter, document identity, supported kinds, configured capabilities, detail endpoint, timeout, rate limit, pagination, attribution, freshness and failure modes.
- [ ] Separate search summaries from detail hydration. Search returns enough identity to choose; Add fetches/validates authoritative detail by stable source ID, bounded to a useful response time.
- [ ] Save minimum durable item data first if enrichment cannot finish quickly; expose metadata pending/retry without blocking personal edits or losing the item.
- [ ] Trusted canonical metadata comes from validated source identity and adapter output. Validate browser request data; do not silently promote arbitrary search payload fields to shared truth.
- [ ] Select fields by source authority, not last response. Preserve aliases/external IDs and timestamps; avoid one global metadata blob overwriting all fields.
- [ ] Keys remain server-side. Never send personal review/history or Finance ciphertext/records to metadata services. Send only relevant query/identifier.
- [ ] Centralize bounded HTTP clients/pacing/cancellation/backoff; honor retry-after. Do not implement immediate unbounded retries or one thread pool per keystroke.
- [ ] MusicBrainz search/catalog/detail requests share provider pacing across requests, not just sleeps in one backfill loop. Delete blocking backfill from user read transactions.
- [ ] Keep scraping narrowly scoped to supported permitted extraction with parser fixtures and health indicators. Do not add speculative Spotify/IGDB/Rotten Tomatoes/Metacritic integrations without a current requirement and viable access contract.

## SRC-02 — Reliable relevance and The Gentlemen regression

Existing code already aborts/tickets stale frontend searches and has a request-error panel; retain those correct behaviors while replacing the custom UI runtime.

- [ ] Build fixed provider fixtures for The Gentlemen as movie and TV work; capture one actual public response if available, date it, redact credentials, and do not claim that sample proves all future searches work.
- [ ] Reproduce All/Movies/Series, title case/spacing/punctuation, type changes, cached versus cold, key present/absent, partial source timeout, and result order.
- [ ] Trace all loss points: adapter result cut, global 40-result cut, dedup key, filtering, frontend top-three groups, Show all, stale ticket and response cache.
- [ ] Rank exact normalized title before caps, preserving meaningful type diversity. Use stable deterministic ordering with title/year/type/source ties; do not let adapter submission order decide relevance.
- [ ] Return pagination/has_more or per-group continuation so truncation is explicit. Initial results need not download full catalogs.
- [ ] Dedup by provider identity first; link aliases using explicit external IDs/confident matching. Same title/year alone cannot silently merge unrelated works, releases or artists.
- [ ] Display kind, year, creator/network and source identity enough to distinguish movie/series adaptations. Clear active filters and show when a filter changes available coverage.
- [ ] Search query/type survive Back, retry, manual Add, and login return. Rapid input never paints old results as current.
- [ ] No-match copy is reserved for completed relevant sources. Partial failure says search is incomplete and offers Retry while retaining successful rows.
- [ ] Standard keyboard-reachable Add/Follow/Open or a fully semantic documented composite pattern; verify current custom result navigation before replacing it.

## SRC-03 — Ephemeral search, durable saved details

The existing ProviderCache table is used for query responses as well as saved-item enrichment. Do not delete all cache rows or the table blindly: calendar follow-ups and saved catalog helpers have independent uses.

- [ ] Default ordinary queries to a bounded, expiring process-memory cache, with no persistent query history. Cache key includes provider, kind, normalized query and capability/config version.
- [ ] Put strict max entries/bytes and TTL on memory cache; include short negative-cache TTL and distinguish failure from successful zero results. Coalesce identical in-flight requests to respect upstream limits.
- [ ] Durable saved catalog metadata, episode lists, relationships needed for saved items, and permitted release/follow-up caches remain persisted with provenance/freshness.
- [ ] On Add/Follow, create only intended membership and necessary catalog rows; do not import every result or full artist catalog.
- [ ] Remove query-keyed DB writes and search-only portrait enrichment writes; migrate/expire only rows proven to be search cache by explicit key taxonomy.
- [ ] Search cache is public metadata only. Saved flags/IDs are attached after public cache lookup, per authenticated user, never cached globally.
- [ ] Test searches do not change CatalogItem/UserEntry/episode/score counts, and do not add ProviderCache query rows. Test Add does create expected durable data.
- [ ] Test app restart loses transient search cache but saved details, art overrides and reviews remain readable when provider calls fail.

## ERR-01 — Useful errors across the suite

Use a small typed error response, for example `code`, `message`, optional `field_errors`, `retry_after`, `request_id`, and source-specific status. Keep compatibility handling while migrating clients; delete it after all consumers migrate.

- [ ] Separate suite unauthenticated/forbidden from upstream credential failure, provider unavailable, throttled, timeout, invalid input, no match and partial completion.
- [ ] Provider search payload reports only sources attempted or relevantly unconfigured, with `state`, affected kinds, safe reason, cache freshness and retry capability.
- [ ] A healthy fallback must not erase a failed source's coverage warning. Replace current type-only masking with concise “Some series sources unavailable” detail and expandable source information.
- [ ] Keep query/results visible on partial failure. Retry failed sources or whole search with clear behavior; manual Add remains available.
- [ ] Forms show persistent local save errors and retain values; toasts are supplementary. Session expiry offers sign-in return without confusing provider key failures with logout.
- [ ] Maps, discography, portraits and TV refresh expose local enrichment failure while keeping saved personal data usable.
- [ ] Show request ID for support details; logs identify operation/provider/status/latency safely, without keys, reviews or raw financial data.
- [ ] A real zero-result search must not show a generic service outage. A failed search must not suggest the title does not exist.

Verification includes deterministic adapter HTTP fixtures, malformed/empty/401/403/404/429/5xx/timeout cases, query cache count assertions, repeated title searches, back navigation, stale-request races, and integrated source/config combinations.
