# Architecture, ownership and compatibility

## Baseline and constraints

Inspected checkout: `0ed83e95a3727acc4f512dd2ac77211d8a622407`, 2026-11-11.
The preceding critique was source-based, not a new rendered product test.
Town is a DOM tile scene; World already renders Town and historical chunks;
Pixels owns Year/Life projections. Existing safety adapters, domain owners,
seeded worker fixtures, route manifest and accessible alternatives are assets.
Fresh-read current main and source before implementing a leaf.

## Owners and narrow integration

| Concern | Surviving owner | Change boundary |
| --- | --- | --- |
| Habits, XP, caps, cadence, authoritative day | `apps/server/town/` | TOWN-02/03/04/07 correctness remains independently required |
| Town scene, feedback, ornament UI | `apps/web/src/app/town/` | local view projections and a public narrow scene description |
| Finance-derived Treasury | Finance public budget facade, Town projection | no server/storage copies of Finance-derived results |
| Health | existing browser-local Health store/stage facade | stages/counts only, immediate lock invalidation |
| World reads/concepts | `apps/server/world/`, existing world API/controller | bounded owner-scoped reads; no new occurrence warehouse |
| World generation/render/camera | `world/engine`, `render`, `logic` | keep golden vectors, stable generation and one controller |
| Pixels reads, score and dates | `apps/server/pixels/`, Pixels service/models, `packages/ui/pixels/pixels-score.ts` | reuse owners; separate annotations from existing score |
| Media/Travel | each app's public API/routes and canonical records | adapters, not copied ledgers or provider calls on read |
| Review | TOWN-06 encrypted `town_reviews` | one editor and vault collection; source links only elsewhere |
| Cosmetic layout | Town authenticated server API + versioned Town record | asset/anchor IDs and revision only; no source/private values |
| Appearance/audio | Town owner-keyed device preference | TOWN-05 seasons remain canonical; explicit scope in UI |
| Date passage | web route composition and each feature's date parser | shared helper only for repeated validated URL behavior |

Do not introduce a global activity service, generalized event bus, universal
registry, duplicated query cache, or generic game engine. Town exposes a narrow
read-only scene model through its barrel only when both Town and World consume
it; migrate both consumers and remove their competing stage decisions together.
Domain rules remain with their current owner. A genuinely repeated date-passage
helper may be web-owned; no package should import app internals.

## Facts and identity

A display occurrence has stable source namespace/id, kind, civil day/span,
approved title (only when already authorized), source route and availability.
That is a projection shape, not a persistent central event. Prefer current
responses; extend their owning endpoints only for missing bounded facts, such as
concept annotations in Pixels. Do not retrieve every named source object when a
summary/count suffices. Selected-day details are lazy and cancellation-bound.

Document intentional differences: Media episodes can earn Town credit without
being a World finished-item artifact; completed trips credit Town on its existing
rule while World/Pixels represent their spans; concepts affect World/annotations
without changing Pixels score; budget-kept weeks and habit streaks are distinct.
The interface explains these instead of forcing equal totals. Use one fixture
with all these differences to prove provenance across the three views.

World's existing source cap/`finished_more` is not full coverage. Show truncation;
a selected detail may use a bounded owner read with stable cursor. Missing tables,
empty sources, stale values, locked values and network failures remain distinct.
Group source queries; no per-day/per-tile/per-object N+1 reads or implicit provider
refresh. Preserve existing request deadlines and shared source response reuse.

## Persistence and schema

PLACE-08 adds a small owner-bound Town layout record with version, revision and
a bounded map of approved anchor IDs to approved asset variant IDs. One layout
per owner; unique ownership key; authenticated/CSRF writes; optimistic revision
check returns conflict with current revision. Validate the [initial catalog](catalog.md) limits: 16KiB payload, twelve anchors,
unknown fields, asset allowlist, compatibility and current public Town eligibility. Decorative IDs are
public catalog IDs, never record titles, free text, URLs or arbitrary SVG.

Generate a new migration from the current single Alembic head; preserve existing
Town data and account deletion semantics. Do not edit applied migrations. Missing
layout renders deterministic defaults; corrupt/unsupported records remain intact
and produce recoverable UI, never a silent destructive reset. Server validates
catalog structure; eligibility depending on private browser-only facts must never
be sent to the server. First catalog therefore has only public Town-derived
eligibility; Treasury/Health get no private achievement ornament persistence.

Cosmetic snapshots synchronize across devices with revision conflict handling.
Season/mute are explicitly “this device”; a failure of localStorage must not
break rendering. Source-linked keepsakes remain derived and are not written as
rewards. No reward-claim endpoint or second XP ledger. Entitlement identity is
stable milestone key + catalog version, computed from authoritative facts. Undo
or source edits recompute eligibility without duplicate awards.

## Lifecycle and privacy

Bind loads, pending feedback, selections, layout drafts and asset work to the
current owner/route generation. After every asynchronous stage, verify it before
publishing. Abort actual work where supported and discard obsolete results even
when transport cancellation fails. Clear plaintext/private overlays immediately
on lock, session switch and disposal. No stale Finance/Health values survive in
canvas pixels, ARIA, toasts, screenshots, URL state or cached view models.

Use existing lifecycle/lock adapters (SAFE-04/05), not another subscriber system.
Asset caches may retain public immutable art; private view snapshots cannot be
shared between owners. Export/restore of encrypted reviews stays with Finance's
existing vault contract; Town cosmetic records follow normal server backup policy.
No analytics service or external assets are required. Synthetic fixtures only in
review artifacts and issues.

## Rendering, assets and performance

Town's bounded scene should use positioned DOM/local SVG with real controls;
World retains canvas for its historical landscape. Reuse current sprite URLs and
atlas. A read-only scene projection can share placement/stage facts without
sharing DOM/canvas implementations. Do not build a second World renderer or move
all application chrome into canvas. Scale crisp assets on their intended grid.

Catalog records declare ID, variants, anchor compatibility, accessible purpose,
logical size/baseline and reduced-motion/static frame. Keep source and attribution
with assets; no opaque generated bundles as the only editable source. Preload
only core scene assets, lazy-load secondary variants and optional sounds. Pause
ambient work when hidden/offscreen. Do not run a permanent animation loop for an
idle scene. Bound hit targets and retained chunks to the visible window.

## Migration and removal contract

For each replacement, list old path, real callers, new owner and verification.
PLACE-04 removes the old tile-scene render path only after its tasks/labels/list
alternative migrate. PLACE-05 replaces competing stage-swap/celebration decisions.
PLACE-06 replaces center-only activation with object selection while retaining
week navigation. PLACE-07 removes redundant selected-date/orientation workarounds.
PLACE-13 consolidates arrivals without removing supported direct links. A moved
file is not deleted responsibility. No blanket LOC target for this feature.

Preserve legacy URLs, all data representations, score/date vectors, World seeds,
existing keyboard controls, privacy defaults, account deletion and recovery.
Engine output changes need explicit versioning/compatibility proof; this plan
can be delivered with presentation overlays and no WORLDGEN_VERSION increment.
Update applicable AGENTS guidance only when a new owner/command/invariant lands,
not with speculative APIs in this planning PR.
