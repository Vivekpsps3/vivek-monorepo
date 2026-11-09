# Roadmap review — 2026-11-08

The live roadmap is [GitHub #134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134).
This is a dated review of its evidence and priorities, not a second implementation
queue. Detailed acceptance stays in the nine remaining delivery issues.

## Evidence and current status

Reviewed the inventory of all 77 GitHub issues, closure reasons, recent merged pull requests, the
remaining delivery bodies, and the relevant code. GitHub `main` was
`ab67b90fdcbcea7802d6ee724585127181959f9c`:
[CI](https://github.com/Vivekpsps3/vivek-monorepo/actions/runs/42517774050)
passed Backend, Frontend, Playwright and Unified Site Release;
[Deploy](https://github.com/Vivekpsps3/vivek-monorepo/actions/runs/42518413682)
also succeeded for that revision. These are workflow results; this review did
not independently inspect the live browser, external monitoring or backup destination.

The checkout also contains ongoing work beyond that GitHub revision, including
Treasury presentation, PTO carry-forward and navigation/profile changes. Those
changes are not counted as merged delivery evidence. Relevant audit files were
compared with the exact GitHub revision rather than assuming the checkout was main.

| Delivery | Evidence-backed state | Remaining outcome |
| --- | --- | --- |
| [Finance #65](https://github.com/Vivekpsps3/vivek-monorepo/issues/65) | Partial: price preferences/quote infrastructure and earlier import/copy work merged | Mounted automatic-price controls, recurring editors, Planning source counts, custom CSV mapping and residual QA |
| [Travel #84](https://github.com/Vivekpsps3/vivek-monorepo/issues/84) | Partial: costs/reminders, trip cards and shared UI merged | Finance trip tags/spend bridge, itinerary, actions, form validation and trip PTO picker |
| [PTO #110](https://github.com/Vivekpsps3/vivek-monorepo/issues/110) | Partial: hours-based buckets/policies, series API and per-bucket charts exist | Combined accessible forecast, Home days/hours, safe Sick-policy removal and explicit scheduled accrual |
| [Media #85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) | Partial: library/Add behavior and several models/services merged | Mount tag/rating/Related/Popular workflows and finish detail/draft acceptance |
| [Workspace #93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93) | Partial: shared shell, settings/search, Town card and Pixels strip exist | Up next/agenda, unlocked local Finance search, Quick add/account UX and scoped calendar subscriptions |
| [Town #81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81) | Partial: habits, API, Hub card and shared browser infrastructure exist | Passive activity credits, Finance Treasury, enabled Town journeys, Hall/review, accessibility and schema work |
| [Health #90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90) | Foundation only: encrypted store, validation/math and stage facade merged | Mounted Clinic/Gym routes, entry/edit/delete, approved badge copy and Town lots |
| [Pixels #100](https://github.com/Vivekpsps3/vivek-monorepo/issues/100) | Closed completed; [PR #189](https://github.com/Vivekpsps3/vivek-monorepo/pull/189) | Maintenance/regressions only; Year, Life and Hub are no longer future dependencies |
| [World #102](https://github.com/Vivekpsps3/vivek-monorepo/issues/102) | Closed completed; [PR #190](https://github.com/Vivekpsps3/vivek-monorepo/pull/190) | Maintenance and later Health/Town integration; explorer, concepts, fog and chests are no longer a future delivery |
| [Security/recovery #121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121) | Open; existing crypto/session foundations do not complete it | Origin/CSRF/concurrency hardening, atomic passphrase change and encrypted full-vault export **and restore** |
| [Operations #125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125) | Partial: runner/release/backup implementations and latest green workflows | Retention reconciliation, off-host encrypted transfer, disposable recovery drills, independent alert delivery and deployment evidence |

There are **10 open issues: nine deliveries plus the roadmap**. Two of the
original eleven consolidated deliveries are closed completed. Closed
`not_planned` source tickets were often superseded into these deliveries; they
must not be counted as shipped. Issue counts are not a percentage of product completion.

## What is wrong with the roadmap

1. **Its dependency graph describes yesterday's plan.** Stabilization landed in
   [PR #188](https://github.com/Vivekpsps3/vivek-monorepo/pull/188); later fixes
   [#191](https://github.com/Vivekpsps3/vivek-monorepo/pull/191) and
   [#192](https://github.com/Vivekpsps3/vivek-monorepo/pull/192) have a green main
   run. Pixels and World shipped before all their stated Town/Health dependencies.
   The World renderer does not prove Clinic/Gym are usable. Track remaining
   integration where it belongs instead of blocking on already merged pages.
2. **The epics are too broad to communicate progress.** #93 includes account UX,
   search, a new agenda and token-based calendar publishing; #121 combines
   security fixes, credential rotation and a restore protocol. Keep their full
   acceptance, but track independently reviewable slices inside each issue,
   with a next slice and evidence. Avoid another round of duplicate umbrella tickets.
3. **Foundations are confused with working experiences.** A registry, model or
   stage facade is useful infrastructure, but it does not deliver a working
   trip-spend row, Popular button or Clinic. Count the mounted journey.
4. **A passing suite can hide missing coverage.** The Town project currently
   selects Pixels/World files. Three legacy Town suites remain `test.fixme`,
   and the selection also omits `pixels-settings.spec.ts`. Green CI is evidence
   for the selected tests, not Town completion. Restore behavioral coverage;
   do not reduce gates or merely remove `fixme` before supplying fixtures.
5. **Operational intent and current behavior disagree.** #125 selected a future
   30-day/minimum-seven snapshot policy. Compose and the backup script currently
   retain one hourly snapshot plus pre-migration recovery copies. The old backup
   summary claimed the future policy already existed. Off-host support selected
   in the backlog also does not mean a destination is configured or a restore proved.
6. **There is no learning loop.** The roadmap mostly enumerates screens and
   visual polish. It should also establish whether the owner can finish a weekly
   review, import a real supported statement, or plan a trip without duplicate
   entry. Start with structured owner walkthroughs; no telemetry service is required.

## Code findings that change the priority

These are focused source findings, not a full security or production audit.

| Finding | Source | Consequence / owner |
| --- | --- | --- |
| `passive_days()` returns four empty maps with both sources marked available | [Town read service](../apps/server/town/service.py) | Town's promise that Media/Travel activity grows the town is incomplete. Implement bounded owner-scoped queries and reversal/date tests first in #81. |
| Shipped Town does not load the Finance budget facade for Treasury; the existing `weeksKeptRun` consumes habit streaks | [Town component](../apps/web/src/app/town/town.component.ts), [habit helper](../apps/web/src/app/town/weeks-kept.ts) | Rendering a tier from habit weeks does not satisfy a Finance spending-plan streak. Keep habit and Finance semantics distinct; #81 owns the correction and lock lifecycle. |
| Town test infrastructure exists, but legacy journeys and settings are outside the active selector; Town reset seeds are incomplete | [test selection](../tests/e2e/config.ts), [fixture server](../tests/e2e/server.py), [Town journeys](../apps/web/e2e/town.spec.ts) | Extend the existing harness instead of rebuilding it. Enable and run actual check-in/dialog/history/privacy journeys in #81; reconcile Pixels settings coverage in #125. |
| Travel's `financeSpendLookup()` always returns `null`, with an obsolete K1 blocker comment | [trip costs](../apps/travel/frontend/src/trip-costs.component.ts), [existing registry](../packages/ui/src/finance-trip-spend.ts) | Finish the producer and consumer in #84; another registry will not fix the user journey. |
| Search implements only the Finance locked row and claims streams are absent, although the Finance service exposes them | [search dialog](../apps/web/src/app/search/search-dialog.component.ts), [Finance service](../apps/finance/frontend/src/app/services/finance.service.ts) | #93 should add the small lazy public name-search facade and clear results on lock, without importing private internals or loading the whole dashboard. |
| Clinic/Gym stage logic exists, but Angular has no mounted Clinic/Gym routes | [Health facade](../apps/web/src/app/town/health/index.ts), [routes](../apps/web/src/app/routes.ts) | Health remains a new user-facing delivery in #90 even though backend collections and World sprites exist. |

The architecture has useful strengths worth preserving: app-owned domains,
narrow public facades, browser-only Finance/Health plaintext, reusable pure math,
and a shared test/runtime composition. The main problem is unfinished integration
and stale assumptions at those boundaries. A new framework or general event bus
would add more foundations before the existing ones are used.

## Recommended build order

**Next feature: finish the private Finance–Travel spending link (#84).** It is
a bounded connection between two useful existing apps: add trip tags to encrypted
transactions, publish refund-aware integer-cent totals through the existing
registry, and replace Travel's null lookup. Demonstrate Travel-first navigation,
unlock, a tagged purchase/refund, and immediate clearing on lock. Keep Travel's
multi-currency costs separate from Finance's USD total and prove no plaintext
leaves the browser. This completes an existing promise without adding a new app.

**Next Town slice: real activity credits and Treasury (#81), with browser
journeys enabled.** Finish the remaining Town fixtures and test selection;
follow with passive Media/Travel credits, then the real Finance Treasury.
Evidence should show each source action changes the correct building,
Undo/delete retracts it, another owner has no effect, unavailable sources remain
distinguishable, and locking clears Finance-derived state. Preserve the 600 ms
p50 gate and existing coverage floors.

Keep security/recovery #121 and operational recovery #125 early in the queue.
Treat their slices as independent from Town rather than waiting for all product
work. Prioritize reproducible auth boundary regressions, atomic credential
changes and a synthetic encrypted export/restore roundtrip before expanding
encrypted Health/review data. Host recovery and a portable vault bundle solve
different failure modes; both are needed.

Then finish core journeys: #84 trip planning/spend, #110 PTO, #65 recurring and
CSV workflows, and #85 Media editing/discovery. Start #93 with compact Up next
using app-owned adapters and the existing response/state contracts. Expand that
same read model into the agenda; avoid duplicating requests and storage.
Search and Quick add can be separate slices in the same issue.

Complete Town Hall and encrypted review in #81, linked from #93. Health #90
follows working Town integration and the vault lifecycle contract. Calendar
subscriptions and seasonal appearance retain their accepted scope, but follow
the core journeys and recovery work. Pixels/World require maintenance, not a
second implementation wave.

## Future direction

Build a **private weekly workspace**: plan upcoming commitments, act in the
owning app, then review what happened. Hub Up next/agenda is the planning view;
Town and Pixels are the progress views; the encrypted Town Hall review records
the owner's priorities. World remains an optional way to explore the same
history. This direction mostly assembles already selected work in #93/#81,
rather than adding a seventh domain.

Evaluate it through owner walkthroughs: finish a weekly review, plan one trip
with PTO/costs/reminders, and find or edit a saved item from the Hub. Record
confusing steps and duplicate entry; prioritize those before extra visual systems.
Keep Finance's Hub agenda contribution count-only and encrypted reflection
browser-local; a useful combined workspace does not require a server-readable
personal event warehouse.

A later candidate is the already expressed
[SimpleFIN direction](../docs/ARCHITECTURE.md#imports), after CSV normalization,
deduplication and encrypted recovery are reliable. It is a separate discovery
item: first settle a credential/data-flow threat model compatible with the vault,
then consider a read-only integration with explicit review of imports. No banking
integration, AI assistant, notification service or revived cancelled feature is
authorized for implementation by this review.
