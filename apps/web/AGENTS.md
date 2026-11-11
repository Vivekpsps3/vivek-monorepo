# Private shell and projections

Start with [routes](src/app/routes.ts), [platform session](src/app/platform/session.service.ts)
and the affected [Hub](src/app/hub/) or [search](src/app/search/) owner.
Domain applications expose their own public APIs. Shell code composes those APIs;
it must not become a second Finance, Travel or Media store. Private layout starts
Finance trip spend from the Finance public API when a vault is present and stops
it on lock, sign-out, and owner change.

Read the narrower guidance for [Town/Health](src/app/town/AGENTS.md),
[World](src/app/world/AGENTS.md) or [Pixels](src/app/pixels/AGENTS.md) when editing them.

A source can be locked, empty, stale, expired or unavailable. Keep those states
honest and independent; failure of one card must not remove other usable cards.
Invalidate old owner/route work before publication, clear private snapshots on lock,
and dispose subscriptions/listeners with the actual consumer lifetime. Cancellation
must not leave a promise that can still mutate shared state.

Use existing Hub load/state mechanics and shared controls before adding another
loader, dialog or event bus. Keep summary responses reusable between views and test
request counts. Reuse a bounded mechanism only where its result semantics match.

Direct navigation, refresh, back/forward and keyboard/focus are part of a route change.
Use [FRONTEND](../../docs/FRONTEND.md) for shell/UI ownership and root gates for root
Karma plus affected browser journeys. [e2e](e2e/) includes Town, Pixels and World;
listing tests alone does not prove execution.
