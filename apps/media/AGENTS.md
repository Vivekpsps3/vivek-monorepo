# Media

- [Journal router](backend/routers/journal.py) calls [record services](backend/services/records.py).
  Shared catalog identity and an owner's personal entry are different entities.
- [Providers](backend/services/providers.py) owns public metadata transport/parsing;
  [metadata](backend/services/metadata.py) owns explicit refresh behavior.
- [Detail](frontend/src/detail.component.ts), [library](frontend/src/library.component.ts)
  and [Add](frontend/src/add.component.ts) are existing UI owners.

Ordinary saved reads must remain bounded and database-only: do not contact providers
or repair saved state during a GET. Keep provider I/O outside write transactions.
Preserve source identity, MusicBrainz release-group versus pressing, and isolation of
notes, ratings, progress and Undo across owners. Public metadata is not a personal save.
An album or song save groups under a canonical artist id and does not follow that
artist or import a discography. Compilations, featured credits, unknown credits,
and similar names stay distinct. A group read is this user's saved rows only.

Consolidate proven repeated policy in small functions. Do not build a provider plugin
framework or merge different transport/cache semantics. The current pacing/client
helpers are already shared: reuse them. Official TMDB movie and series detail share
one authenticated fetch and common projection. Public movie HTML and series
network, lifecycle, and episode fields stay in their adapters. API payloads with
similar fields can represent different privacy/identity contracts; prove
equivalence before combining serializers.

[membership.py](backend/services/membership.py) contains migration SQL imported by
applied revisions. It is not an orphan runtime store; preserve historical migration
behavior and its imports when cleaning records code.

Use [MEDIA](../../docs/MEDIA.md) for affected behavior and root gates for changed
frontend/backend/screens. Provider tests use offline fixtures; add request-count,
owner, rollback and no-op assertions where behavior changes.
