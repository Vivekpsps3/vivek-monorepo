# Evidence and issue register

Severity: P1 blocks a requested core journey or risks losing/misrepresenting user data; P2 materially harms clarity, resilience, accessibility, or performance; P3 is polish/documentation. No P0 production incident was established. Confidence: **P** = directly probed in existing pure code; **S** = visible source behavior; **R** = owner report awaiting browser reproduction; **H** = hypothesis/investigation, not a confirmed bug. An S finding can explain a reported symptom without proving that symptom's production root cause.

Paths below are relative to repository root. Named functions are navigation anchors; audit line numbers in the independent critique are baseline-specific.

## Navigation, Hub, and Finance

| Issue | Priority / evidence | Finding and source anchor | Task |
| --- | --- | --- | --- |
| NAV-101 | P1 S/R | Travel Hub link is inside More or at page footer; Media Hub link is in account menus. `apps/travel/backend/static/index.html`, `apps/media/backend/static/index.html`. Persistent app exit is missing. | NAV-01/02 |
| NAV-102 | P2 S/R | Finance places Hub in desktop/mobile navigation, with six mobile targets and different desktop/mobile section labels. `apps/finance/frontend/src/app/core/layout/main-layout.component.html`. Closest existing baseline, still needs one predictable header position. | NAV-02 |
| HUB-101 | P2 S | Travel summary unavailable state has no equivalent of Media Retry. `apps/finance/frontend/src/app/hub/hub.component.html`, `retryMedia()` in its TS. | HUB-01 |
| HUB-102 | P2 S/H | Hub fetches have no explicit deadline/cancellation; stalled upstream responses may leave loading indefinitely. `loadTravel()` / `loadMedia()`. Reproduce latency and destroy/navigation behavior. | HUB-01 |
| HUB-103 | P2 S | Profile form content is inside `role="menu"`; this is not a conventional menu interaction. `hub.component.html`. | HUB-01 |
| FIN-101 | P2 S | Finance connection banner says “Start the backend.” Product error exposes development instructions. `main-layout.component.html`. | ERR-01/FIN-01 |
| FIN-102 | P2 H | Div-based tutorial `aria-modal` needs focus trap, inert background, Escape, and restoration audit. It is not proven broken by markup alone. `main-layout.component.html`. | QA-01/FIN-01 |
| UX-101 | P2 S/R | Prior paper/ink visual rules differ from owner's new glass direction; app-specific layouts and overrides produce inconsistent chrome. `packages/ui/tokens.css`, app styles, `docs/DESIGN_GUIDE.md`. | UX-01/02 |

## Travel creation, forms, flights, and PTO

| Issue | Priority / evidence | Finding and source anchor | Task |
| --- | --- | --- | --- |
| TRV-101 | P1 P/S/R | Split selector says “after” selected date, but `toggleSplit` / `segments` start the next city on that date. `static/modules/views/composer.mjs`, `composer-model.mjs`. Owner also reports broken appearance; CSS grid auto-placement needs browser capture. | TRV-01 |
| TRV-102 | P1 R/S | Source has City plus Trip name, which can feel like duplicate titles. One literal trip-name editor found, so do not claim two identical fields were reproduced. `paintCities()`. | TRV-01 |
| TRV-103 | P1 P/S | `saveState` validates only first city; save filters unnamed stays. An added second segment can be silently omitted. `composer-model.mjs::saveState`, `views/composer.mjs::save`. | TRV-01 |
| TRV-104 | P2 S/H | `draw()` rebuilds city inputs; input state/focus preservation across range edits, split removal, resize and failed saves needs interaction tests. Date changes keep old city keys that may no longer match. | TRV-01 |
| TRV-105 | P2 S/H | Composer adds resize listeners without a visible dispose path; save has no in-flight guard; calendar uses `touch-action:none`. Investigate stale handlers, duplicate saves, mobile scroll trapping. | TRV-01/05 |
| TRV-106 | P1 S/R | “Getting there” always renders all roles; every day renders an adder; optional Parking/Budget/Notes/Reminders also always render. `views/trip.mjs::renderTrip`. | TRV-05 |
| TRV-107 | P1 S | Flight lookup exists in full transport form, not the composer's `legFields`; requires explicit Look up flight and candidate click. It does not implement requested automatic fill. `views/new-trip.mjs`, `actions/ui.mjs`. | TRV-03 |
| TRV-108 | P1 S | No distinct manual override provenance/lock contract for schedule fields; `applyFlight()` replaces populated fields. Need deliberate refresh versus user edits. `actions/flight.mjs`. | TRV-03 |
| TRV-109 | P2 S/H | Flight candidate buttons show route/status but omit candidate departure date/time. Two-day UTC lookup can include adjacent local dates. `renderFlightChoices()`, `services/flights.py::lookup_flights`. | TRV-03 |
| TRV-110 | P2 S | Provider 401 is returned as HTTP 401 by flight endpoint. That can be confused with suite session expiration by generic clients. Classify upstream credentials separately. `services/flights.py`, `routers/integrations.py`. | API-01/TRV-03 |
| TRV-111 | P1 S/R | PTO is a trip flag plus optional aggregate decimal, not per-date state. `models.py::Trip`, `schemas.py`, `services/pto.py`. Weekday default already excludes weekends; preserve it. | TRV-02/DB-01 |
| TRV-112 | P1 S | PTO walk deducts whole usage on start date and excludes usages starting on/before balance date. Per-day semantics must handle partial trips straddling balance date and accrual caps. `services/pto.py::walk`. | TRV-02 |
| TRV-113 | P2 H | Overlapping trips/manual leave can double-charge the same day; cancellation/date edits may leave confusing PTO usage. Confirm intended semantics and existing behavior before migration. | TRV-02/QA-01 |
| TRV-114 | P2 S | Advanced forms expose raw latitude/longitude and many fields up front; field meaning/required status differs between quick and full add. `views/new-trip.mjs`, `views/trip.mjs`. | TRV-05 |

## Travel maps and location reliability

| Issue | Priority / evidence | Finding and source anchor | Task |
| --- | --- | --- | --- |
| MAP-101 | P1 S/R | Global `Referrer-Policy: same-origin` suppresses cross-origin Referer; OSM tile policy requires it. Strong root-cause candidate, not verified production tile rejection. `apps/server/security_headers.py::_apply_headers`. | TRV-04/API-01 |
| MAP-102 | P1 S | `cached_search` catches all fetch exceptions and returns `[]`; UI clears results without explanation. Outage and zero matches are indistinguishable. `services/places.py`, `actions/ui.mjs::find-place`. | TRV-04/ERR-01 |
| MAP-103 | P2 S | Place cache has fetched_at but no read TTL; empty successful results may persist indefinitely. `services/places.py::cached_search`. | TRV-04 |
| MAP-104 | P1 S | Map omitted if no coordinate points; missing Leaflet causes silent return. Named destination can have no map or explanation after failed resolution. `views/trip.mjs::renderTrip/mountMap`. | TRV-04 |
| MAP-105 | P2 S | Show on map flies to marker without opening collapsed map disclosure. On narrow screens action can appear ineffective. `actions/ui.mjs::show-on-map`. | TRV-04 |
| MAP-106 | P2 S | `_detail` calls `pin_trip` and flushes during read; first geocoder hit is silently selected; multi-point lookup is synchronous. This is latency, ambiguity, privacy, and SQLite contention risk. `routers/trips.py::_detail`, `services/places.py`. | TRV-04/API-01 |
| MAP-107 | P2 S/H | No application-wide Nominatim request scheduler in inspected service; public policy is aggregate 1 request/sec and prohibits autocomplete. Verify traffic and choose suitable endpoint before expanding integration. | API-01 |
| MAP-108 | P2 S | First successful tile suppresses later error banner; partial tile failure and retry/recovery are weak. Existing invalidateSize calls already exist, so investigate rather than blindly adding more. `views/trip.mjs::mountMap`. | TRV-04 |

## Media membership, music, and artwork

| Issue | Priority / evidence | Finding and source anchor | Task |
| --- | --- | --- | --- |
| MED-101 | P1 P/S/R | Artist fetched albums/tracks enter library tree as `item:null` nodes despite not being saved. `views.mjs::buildLibraryTree`, `app.mjs::libraryStandard`. | MED-01/02 |
| MED-102 | P1 S/R | Artist becomes a separate always-expanded section, others cards; no quiet collapsed saved-child expansion. `app.mjs::artistSection`. | MED-02 |
| MED-103 | P1 S | Empty Movies library loads `/api/movies` popular catalog and displays it as library contents. `app.mjs::viewLibrary`. | MED-02 |
| MED-104 | P2 S | Music grouping keys are lowercased artist/album/song titles, risking collisions and merging releases with same display name. Artist sections also bypass the non-music Show more limit. `views.mjs::ensureArtist/ensureAlbum/addSong`, `app.mjs::libraryStandard`. | MED-01/02 |
| MED-105 | P1 S/R | Artist status vocabulary includes Listening/Listened/Anticipating and backend accepts generic statuses. Summary includes any in_progress entry regardless of kind. `format.mjs`, `domain.py`, `services/summary.py`. | MED-04 |
| MED-106 | P2 S/R | Automatic portrait enrichment exists, but no user search/choose/reset flow found. `services/providers.py::cached_artist_portraits`, `records.py::apply_artist_portraits`, item UI. | MED-03 |
| MED-107 | P1 S | Artwork is shared `CatalogItem.artwork_url`; edits to provider items fill blanks only, so changing an existing portrait needs a new personal override contract. `records.py::patch_entry/apply_catalog_fields`. | MED-03/DB-02 |
| MED-108 | P1 S | Following/reading artist invokes catalog loading and track backfill; up to eight sequential sleeps/lookups happen inside request handling. Heavy catalog response also appears on library cards. `routers/journal.py::_load_artist_catalog`, `records.py::backfill_missing_tracks/library_card`. | MED-01/API-01 |
| MED-109 | P1 S | Nested AlbumRating/TrackRating records and standalone UserEntry ratings are separate representations. A redesign can accidentally duplicate or lose existing scores. `models.py`, `records.py::music_state`. | MED-01/DB-02 |

## Search and TV

| Issue | Priority / evidence | Finding and source anchor | Task |
| --- | --- | --- | --- |
| SRC-101 | P1 R | The Gentlemen intermittently missing. No live authenticated reproduction; preserve as a named regression case rather than inventing a single cause. | SRC-02 |
| SRC-102 | P1 S | Backend truncates combined provider-ordered results to 40 before frontend relevance/group ranking; exact matches in later categories can disappear. `providers.py::search`, `search-groups.mjs::orderGroups`. | SRC-02 |
| SRC-103 | P1 P/S | Any healthy provider for a type suppresses degradation for another provider of that type. Probe with TMDB error/TVMaze ok warns only about movies, hiding incomplete series coverage. `search-groups.mjs::affectedSentence`. | ERR-01/SRC-02 |
| SRC-104 | P2 S | `provider_status` reports configured/assumed state even for adapters not used by current request. `providers.py::provider_status/search`. | SRC-01/ERR-01 |
| SRC-105 | P1 S/R | Search writes query-keyed ProviderCache rows for 24h and portrait caches, against ephemeral-search preference. Search does not itself create UserEntry or CatalogItem; retain that existing separation. `providers.py::_cache_put/search/attach_artist_portraits`. | SRC-03 |
| SRC-106 | P2 S | Three-second pooled budget, sequential multi-kind adapter work, immediate MusicBrainz retry, 8-result per-adapter cuts, and no general coordinated provider pacing can reduce coverage. Distinguish timeout from real empty. `providers.py::search/musicbrainz_search`. | SRC-01/02 |
| SRC-107 | P2 S | Dedup based on kind/title/year-or-creator can merge distinct works and fails to model provider aliases. `providers.py::prefer_unique`. | SRC-02/DB-02 |
| SRC-108 | P2 S | Request failure already has error panel; partial failures are generic `error`, no reason/retry-after/freshness per source. Do not claim error UI is wholly absent. `app.mjs::runSearch/renderResults`, providers. | ERR-01 |
| SRC-109 | P2 S/H | TV fallback without TMDB key is TVMaze; movies use scraped TMDB page; games default Steam. Coverage differences are real, but title-specific availability still needs fixtures/live sample. | SRC-01/02 |
| SRC-110 | P2 H | Saved-from-provider request accepts metadata payload; validate whether authoritative detail is fetched and source identity is trustworthy before using it as canonical catalog data. Shared metadata must not be overwritten by arbitrary stale clients. | API-01/SRC-01 |
| TV-101 | P1 S/R | Derived caught_up exists and Mark next exists, but no requested one-action bulk caught-up command. `records.py::episode_state/mark_next`, `app.mjs::episodeBlock`. | TV-01 |
| TV-102 | P1 S/R | TVMaze result drops production lifecycle into empty `extra`; model lacks explicit lifecycle. Personal completed does not mean production ended. `providers.py::tvmaze_search/tmdb_media_hit`, models. | TV-02 |
| TV-103 | P1 S | Unknown air_date is treated as released in `episode_state`; derived caught_up is true if episodes exist and no next_episode, even if all are future. Must handle unknown/partial metadata explicitly in bulk action. | TV-01/02 |
| TV-104 | P1 S | `next_episodes` excludes completed shows; future episodes of a formerly completed ongoing show can miss Continue despite calendar containing library episodes. `services/summary.py::next_episodes`, calendar. | TV-01/02 |
| TV-105 | P2 S | Season watched state and episode marks are separate today. Bulk caught-up must define reconciliation without overwriting ratings/review or future episode marks. `records.py::save_season/episode_state`, `SeasonProgress`. | TV-01/DB-02 |
| DOC-101 | P3 S | Domain docs describe historical standalone topology and earlier visual/search contracts alongside current unified deployment. Planning/implementation must cite current code and refresh canonical docs. | DOC-01 |

## Top-down architecture and developer-experience findings

These findings extend the original product audit after the owner's second instruction. The [architecture decision](14-top-down-refactor.md) and [deletion ledger](15-deletion-ledger.md) specify exact replacements.

| Issue | Priority / evidence | Finding and source anchor | Task |
| --- | --- | --- | --- |
| ARC-101 | P1 S/R | Public site, shared Hub/auth, and subapps have different ownership, navigation and runtime stories. Public site has its own Angular bootstrap; Hub/auth live under Finance; Travel/Media have custom hash UIs. | ARC-01/03, WEB-01 |
| ARC-102 | P2 S | Two nearly identical Angular dependency/install/build/TS/lint/Karma configurations and locks; root Dockerfile builds both separately, alongside static domain frontends. | ARC-03 |
| ARC-103 | P1 S | Root server mutates environment before imports, rebinds domain engines, reflects/copies Finance routes/middleware and excludes logging by class-name string. `apps/server/main.py`. | ARC-02 |
| ARC-104 | P1 S | Travel/Media duplicate Principal/AuthResult/session middleware and remote Finance auth fallback despite in-process production auth. `backend/deps.py`, `backend/app.py`, `apps/server/auth.py`. | ARC-02/API-01 |
| ARC-105 | P1 S | Domain DB modules retain import-time engines, startup create_all/ALTER and standalone fallback paths; test harnesses depend on them, so delete only after fixture migration. | ARC-02 |
| ARC-106 | P1 S | Finance AuthService eagerly injects FinanceService/VaultService. A superficial move to suite-level auth would eagerly load and couple other apps to Finance. `frontend/src/app/auth/auth.service.ts`. | ARC-01/03/HUB-01 |
| ARC-107 | P1 S | Current per-path CSP differs for Finance/Travel/Media. A one-SPA move cannot rely on changed URL to change document CSP; Leaflet contains additional sinks. `apps/server/security_headers.py`, map library. | ARC-01/API-01 |
| ARC-108 | P2 S | Retired `apps/site/flask` remains, Socket.IO dependency is unused in current source, and decrypted user text uses MarkdownModule/global Markdown providers though demo is now local ECDH. | WEB-01/DEL-ALL |
| ARC-109 | P2 S | `packages/browser/src/validators.ts` exports Finance-specific asset/job/holding/transaction rules despite app-neutral package intent. | ARC-03/DEL-ALL |
| ARC-110 | P2 S | Travel/Media API wrappers differ in timeout/preflight/error semantics; Travel preflight does not share the request abort signal, Media maps generic 503 to sign-in unavailable. | API-01/ERR-01 |
| ARC-111 | P2 S | Media `app.mjs` mixes route/page rendering, drafts, writes and all dispatch in roughly 2.7k lines; provider and record services also mix distinct tasks. Size alone is not a defect, but combined responsibilities make changes conflict-prone. | ARC-03/MED-01/SRC-01 |
| ARC-112 | P2 S/H | Public prerender route source exists, but shown build config does not prove it is wired; moving to one root must verify generated HTML and lazy bundles. | ARC-01/WEB-01 |
| ARC-113 | P2 S | Standalone compose/requirements/docs coexist with unified production; active pinned locks, adoption tools and backup/route scripts must be distinguished from unused historical paths. | DEL-ALL/DOC-01 |

## Direct probe record

Executed read-only with Node 20.20.2 against existing exported modules; no app server, network provider, production DB, or browser was involved:

1. Range Oct 24–30, split selected Oct 27 → segments Oct 24–26 and Oct 27–30. Confirms the “after” mismatch (TRV-101).
2. Same split with only first city Kyoto → `saveState().ok === true`; second city unnamed. Confirms missing validation (TRV-103); filtering unnamed stays is separately visible in save source.
3. One saved artist with fetched unsaved album/song → tree includes album and song with `item:null`. Confirms catalog leakage (MED-101).
4. `affectedSentence({tmdb:'error',tvmaze:'ok'})` → `Movies can't be searched right now.` Series degradation is masked (SRC-103).

## Discovery protocol

- [ ] Reproduce R/H issues with disposable synthetic fixtures and production-like routing/headers; record observed result, expected result, route, viewport, theme, provider mode, console/network evidence.
- [ ] Add newly found issues here with a stable ID, severity, evidence confidence, and execution owner.
- [ ] Link each fixed issue to its regression test and visual evidence where applicable.
- [ ] Do not close a broad complaint such as “forms are unobvious” after fixing only one field.
- [ ] Re-check this inventory after the final integrated browser pass; explicitly list unverified reports and accepted limits.
