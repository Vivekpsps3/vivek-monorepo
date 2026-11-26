# Private shell and projections

Start with [routes](src/app/routes.ts), [platform session](src/app/platform/session.service.ts)
and the affected [Hub](src/app/hub/) or [search](src/app/search/) owner.
Domain applications expose their own public APIs. Shell code composes those APIs;
it must not become a second Finance, Travel or Media store. Private layout starts
Finance trip spend from the Finance public API when a vault is present and stops
it on lock, sign-out, and owner change.

Read guidance for [Town/Health](src/app/town/AGENTS.md),
[World](src/app/world/AGENTS.md) or [Pixels](src/app/pixels/AGENTS.md) when editing them.

Keep locked, empty, stale, expired and unavailable sources independent. Invalidate
old owner, route and query work before publication. Clear private snapshots on lock.
Dispose subscriptions/listeners when their consumer ends. Search retries Travel/Media
while keeping current local Finance matches.

Hub Up next, its agenda child route, and app cards share Travel summary, Media
summary plus saved calendar months, and one browser-only Finance load. Keep the
Hub component alive across `/hub` and `/hub/agenda`; month/source filters live in
the URL. Compact Up next retains its 14-day window and overdue rules; the agenda
uses bounded summary windows and authoritative saved dates. Reminder PATCH uses
every ReminderIn field.
`hub-up-next.spec.ts` executes with the web browser suite.

Account forms share `platform/auth/account-error.ts` for safe copy and Retry-After;
keep username validation with `@vivek/auth`.

Use existing Hub loaders and controls. The shell owns global shortcuts; mounted Hub
commands route Quick add to app editors with a browser-local transaction date.
Health checks are admin-only, owner-bound and visibility-throttled. Share source
responses and test request counts; bounded reuse must preserve result semantics.

The app switcher reuses canonical app-local destinations and respects app guards.
Hub pins store allowlisted destination IDs per owner and device. Reset restores
the default order.
Canceled navigation preserves browser history. Verify refresh and keyboard focus.
See [FRONTEND](../../docs/FRONTEND.md) for shell ownership. Run root Karma and
affected [browser journeys](e2e/), including Town, Pixels and World.
