# Media library, music, and artist portraits

## MED-01 / DB-02 — Membership is explicit

Sources: `apps/media/backend/models.py`, `services/records.py`, `routers/journal.py`; UI `static/modules/views.mjs::buildLibraryTree` and `app.mjs::libraryStandard/artistSection`.

Canonical distinction: public catalog identity and relationships describe what exists; private UserEntry membership describes what this user saved. Following an artist creates only an artist membership. Browsing an album or loading metadata creates no personal album/song membership. A score, favorite, note, or status belongs to the user's explicitly saved item.

- [ ] Freeze canonical artist/album/recording identities and relationship keys before migrating. Preserve MusicBrainz release-group versus release versus recording distinctions and multi-artist credits; do not join by title text.
- [ ] Give saved albums and songs first-class personal entries. Catalog parent relationships can link them to an artist without implicitly saving parents or siblings.
- [ ] Remove automatic `_load_artist_catalog` and missing-track backfill from Follow/read/library paths. Browse discography explicitly requests bounded pages; saved library reads work offline from provider metadata.
- [ ] Library payload returns membership cards and counts; omit full remote discographies. Load saved-child expansion only when needed.
- [ ] Decide whether rating an unsaved discovered child saves it: recommended explicit Add before edit, or clearly labeled Add and rate. Never infer a save from a background fetch.
- [ ] Migrate nested AlbumRating/TrackRating into canonical child membership/score records only where personal intent is evidenced. A numeric zero is a score; null is not evidence of a personal save by itself.
- [ ] Preserve original score rows and mapping/conflict report until verified; conflicting nested versus standalone scores require deterministic provenance and visible reconciliation, not “latest row wins” guesswork.
- [ ] Unfollowing/removing artist never deletes independently saved albums/songs. Removing a child never removes its artist or changes another score.
- [ ] Saved item count, sort, filters, pagination and expansions all count actual membership once. Group labels are not fake artist saves.
- [ ] Validate two users can save the same public item with entirely independent states, reviews, images and memberships.

## MED-02 — Uniform library UI and optional exploration

- [ ] Render every kind with one card/row component: art, title, type/year/creator, personal state, rating if present, and Open action.
- [ ] Artist uses the same footprint. Quiet chevron/button has aria-expanded/controls, saved child count, and a separate focus target from Open artist.
- [ ] Start collapsed. Expand only saved albums/songs; display clear empty copy and Browse discography link when nothing else is saved.
- [ ] Keep top-level sorting consistent across kinds. Recommended first version: every saved item appears once in the main list; artist expansion is an optional relational view, and totals never add expanded rows again.
- [ ] Respect selected sort in both flat and filtered views; no always-first unpaginated artist tree.
- [ ] Delete popular-movies fallback from Library. Empty library stays empty with Search/Add actions. Any optional discovery surface belongs under Search/Browse with clear labeling.
- [ ] Artist detail has Following and photo, rating/review, In your library, and an explicit Browse discography action.
- [ ] Discography shows remote metadata separately with Add/Saved, pagination, incomplete/loading/error states, and retry without discarding saved children.
- [ ] Handle singles, EPs, live/remix/compilation releases with honest filters; current studio-only filtering must be visible rather than making missing releases seem nonexistent.
- [ ] Save a discovered song without requiring the whole album or artist. Provider identity prevents duplicates across search, artist browse and album browse.
- [ ] Preserve scroll, filters and expansion state through detail → Back; use URL or bounded per-route state without persisting remote results as library data.

Acceptance fixture: artist A, saved album A1, saved song A2, fetched-only album B and song B1. Library contains only the three explicit memberships; expansion excludes B/B1; Browse discography can show B/B1 with Add. A different artist with the same name stays distinct.

## MED-03 — Choose an artist profile picture

Existing enrichment in `services/providers.py::cached_artist_portraits` uses MusicBrainz/Wikidata image sources. It is an automatic fallback, not a user picker. Shared `CatalogItem.artwork_url` cannot represent private selection safely.

- [ ] Add Choose photo to artist detail, with artist name prefilled and editable image-search query.
- [ ] Begin with a supported image metadata source such as Wikimedia Commons using licensed image metadata; do not scrape an arbitrary image search page into untrusted hotlinks.
- [ ] Show candidate thumbnail, source page, creator/license where supplied and selected preview. Support loading, empty, failed, broken-image and retry states.
- [ ] Save one personal artwork override on UserEntry or equivalent private table, including source URL/id and optional normalized crop. Keep the old photo until save succeeds.
- [ ] Render personal override → shared provider default → stable initials/art fallback. Reset removes only the personal override and restores provider default.
- [ ] Background enrichment must never overwrite a chosen photo. Search, library, item page and Hub summaries use the same effective-artwork rule.
- [ ] Limit image sizes, validate allowed URL schemes/hosts, retain CSP compatibility, and reject redirects to private/internal addresses if server-side fetching is introduced. Prefer remote URL metadata over inventing upload/BLOB storage.
- [ ] Optional crop may use CSS positioning and stored focal point; a full image editor is out of scope.
- [ ] Two users selecting different portraits for one catalog artist must see their own choice. Failed selection/reset and provider downtime retain a usable prior image.

## MED-04 — Artists are followed, tracks/albums are listened to

- [ ] Add an explicit per-kind personal-state schema. Artists support Following/Unfollowed; omit Listening/Listened/Anticipating/Paused artist controls and reject invalid new artist states in the API.
- [ ] Keep artist rating, overall review and favorites independent from relationship state. Following never auto-creates a listening song.
- [ ] Translate legacy artist states through a documented migration: retained artists become followed unless explicitly unfollowed; preserve original value in migration provenance where interpretation matters.
- [ ] Exclude artist-only legacy in_progress rows from listening/Now/Hub rails immediately once the new contract is active. Do not manufacture a song or a listen event.
- [ ] Track/album status remains independently editable. If showing an artist in an activity summary, show the actual active song/album as the primary item and artist as its relationship.
- [ ] Update quick Add, search Follow, item status, filters, generic labels, counts, calendar eligibility and Hub consumers together.
- [ ] Test all legacy artist states, no active children, active child with unfollowed artist, and unrelated song status changes.

## Deletion outcome

Remove the old title-keyed library music tree and superseded nested editable-score path after migration acceptance. Keep genuine public catalog relationships only where discography/detail browsing uses them. The unified Media feature uses typed components and app-owned state rather than a second giant `app.mjs` and dispatcher. Provider adapters remain Python-owned; UI does not duplicate metadata authority rules.
