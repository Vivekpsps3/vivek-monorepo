# Media

- [Journal router](backend/routers/journal.py) calls [record services](backend/services/records.py).
  Shared catalog identity and an owner's personal entry are different entities.
- [Providers](backend/services/providers.py) owns public metadata transport/parsing;
  [metadata](backend/services/metadata.py) owns explicit refresh behavior.
- [Detail](frontend/src/detail.component.ts), [library](frontend/src/library.component.ts),
  and [search](frontend/src/search.component.ts) own the screens, including manual add.

Saved reads stay bounded and database-only: do not contact providers
or repair saved state during a GET. Keep provider I/O outside write transactions.
Preserve source identity, MusicBrainz release-group versus pressing, and isolation of
notes, ratings, progress and Undo across owners. A film date is a recorded watch, not completed_on. Theater does not play films. Public metadata is not a personal save.
An album or song save groups under a canonical artist id and does not follow that
artist or import a discography. The Music page lists albums, then songs on each saved album, and keeps a song separate when its album is not saved.
Compilations, featured credits, unknown credits, and similar names stay distinct.
A group read is this user's saved rows only.
Games are a Media cabinet of stored status and progress, not a Town minigame. Updating one game does not rewrite another.

Consolidate repeated policy in small functions and reuse the shared pacing and client helpers. Do not add a provider plugin
framework or merge transport and cache semantics. TMDB movie and series detail share
one authenticated fetch. Public movie HTML and series
network, lifecycle, and episode fields stay in their adapters. API payloads with
similar fields can represent different privacy/identity contracts; prove
equivalence before combining serializers.

[membership.py](backend/services/membership.py) contains migration SQL imported by
applied revisions. It is not an orphan; preserve historical migration
behavior and its imports when cleaning records code.

Use [MEDIA](../../docs/MEDIA.md) for affected behavior and root gates for changed
frontend/backend/screens. Provider tests use offline fixtures; add request-count,
owner, rollback and no-op assertions where behavior changes.
