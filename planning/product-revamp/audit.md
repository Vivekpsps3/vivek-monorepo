# Current-product audit

Discovery evidence dated 2026-11-17; read with the [direction draft](README.md).

## Method and limits

- Read root/planning and Finance, Media, Travel, Web, Server, Town, World and Pixels
  guidance; traced routes, templates, library relationships, flight lookup and
  cross-domain public APIs.
- Read live open issues and PRs. There were no open PRs at inspection time.
  `python3 planning/implementation/plan.py list --live` reported 23 open leaves.
- Inspected working-tree source at HEAD `81280c15ec00dff233c7c47ffd537428a989bcce`.
  Local `main` was `559d4eff908df8262f64012d63d445cfce60af91`; neither is a claim
  about the deployed revision. Pre-existing uncommitted World source/test/guidance
  changes were present and left untouched. The browser bundle includes that source.
- Built the current source with `npm run build`; it passed with six existing unused
  import warnings. Used the existing disposable browser server, a temporary SQLite
  database, synthetic Media/Travel/Town fixtures and the synthetic encrypted Finance
  helper. No production database, account or connector credential was accessed.
- Exercised representative journeys at 1280×800 and 390×844. Both use reduced motion;
  World was inspected in its initial list mode and after explicitly selecting Map.
  Four exploratory browser cases passed, including the assertions below. This is
  discovery evidence, not a substitute for implementation regression suites.
- Survey screenshots additionally cover Hub/agenda, Media Now/search/calendar/add,
  Travel list/trip/calendar/PTO, shared settings landing and Finance assets/activity/
  calendar/pay/bills/planning/projection/stocks. Screenshots alone do not prove all actions.
- Temporary probe/config: `.local/product-direction-audit/`; screenshots and JSON:
  `/tmp/product-direction-audit/`. These are local artifacts, not durable release proof.
  Missing artwork fixtures limit conclusions about real cover photography.
- A compact [browser evidence summary](browser-evidence.json) preserves the measured
  headings, asserted grouping/filter results, page-error observations and surveyed
  URLs. It contains synthetic observations only. Initial exploratory route/heading
  assumptions were corrected to the actual route and empty-state semantics; World's
  reduced-motion list was inspected before explicitly choosing Map.

## Findings and consequences

| Finding | Evidence | Planning consequence |
| --- | --- | --- |
| Holdings is hidden under Net worth | Finance section navigation exposes five categories; `HaveHubComponent` adds an Assets/debts–Holdings sub-navigation. Browser: two clicks from Finance Home after unlock; app switching adds more on phone. The owner's three-click report depends on starting point. | Direct access to frequent destinations; define click budgets from explicit starting states rather than asserting every page always needs three clicks. |
| Useful holdings rows are below the phone's first viewport | Eight synthetic positions: Holdings heading at y≈694 on 390×844 and y≈547 on 1280×800; actions, value/date/gain summary and allocation appear first. The phone first screen contains no position row. | Compact summary and secondary actions; bring first useful record into view; evaluate rich real-shaped fixtures. |
| Finance repeats nested discovery | Planning contains three categories plus individual tools; recurring and activity introduce further choices. [Hub components](../../apps/finance/frontend/src/app/hubs/) compose substantial screens. | Audit every destination and deep link, including tools, imports, account detail and bill editing. Keep the calculation engines. |
| Media mixes incompatible visual categories | [Library](../../apps/media/frontend/src/library.component.ts) defaults to all kinds; Type is inside a modal filter. All kinds share the same generic [card](../../apps/media/frontend/src/media-card.component.ts). | Visible media categories and type-specific collections/detail layouts; retain a deliberate all-media activity view if useful. |
| One album can appear twice without two records | Created one artist and one linked album. Library had five cards including both. Expanding the artist produced six cards and two links to the same album. API still returned one album entry. | Fix default hierarchy and grouping before considering any destructive deduplication. Reproduce actual identity collisions separately. |
| Music hierarchy depends on save path | [Saved children](../../apps/media/backend/services/records.py) follow explicit `MusicLink` relations. Creator text alone does not establish artist identity, and saving/following an artist does not save its catalog. | Specify album-first/artist-first/song-first flows, implicit navigation grouping and independent library membership. Do not auto-save an entire discography. |
| Media offers impossible filters | The static state list contains Following/Unfollowed alongside consumption states. Browser: Book + Following is selectable and produces an empty library. Server intentionally returns zero for that combination. | Kind-appropriate states and normalization when changing kind; distinguish no results from a confusing invalid combination. |
| Media detail loses collection context | [Detail header](../../apps/media/frontend/src/detail.component.html) links back to bare `/media/library`. Library URL/scroll machinery cannot reconstruct a discarded filter from that link alone. | Preserve the source collection, filters, page and scroll; direct links get a sensible fallback. |
| Flight autofill already exists, but is poorly matched to planning | [Transport editor](../../apps/travel/frontend/src/transport-editor.component.ts), [lookup service](../../apps/travel/backend/services/flights.py), and [router](../../apps/travel/backend/routers/integrations.py). The selected provider path is near-departure lookup; code bounds it to ten days back/two days ahead, with the last boundary lacking a valid window. | Extend or replace the appropriate source path for advance schedules; make flight-first creation a primary journey. This is not simply a missing lookup button. |
| Flight capability requires configuration | Disposable browser correctly showed missing FlightAware key and retained manual entry. Production configuration was not inspected. | Show capability before data entry, link to the correct setting and return with the draft intact. Do not diagnose the owner's configuration without evidence. |
| Flight timeouts disagree | Browser `.pipe(timeout(5000))`; provider client allows 20 seconds. | One end-to-end request budget with cancellation and an intelligible retry policy. This is a source-observed mismatch, not a reproduced production timeout. |
| Trip creation starts with manual structure | [New trip](../../apps/travel/frontend/src/new-trip.component.ts) asks dates and destination before optional transport; transport selection does not compose a destination/whole trip. | Add flight/booking-first paths that propose dates/locations and require review of inferred trip scope. |
| Travel and Finance totals intentionally differ | [Trip costs](../../apps/travel/frontend/src/trip-costs.component.ts) separately shows Travel cost buckets and tagged Finance spend; it explicitly avoids summing them. | Plan linked planned/booked/paid views and a reconciliation choice. Never combine totals silently under a new label. |
| Town is currently an app launcher and habit grid | [Scene](../../apps/web/src/app/town/town.component.html) and [lot behavior](../../apps/web/src/app/town/town-lot.component.ts): Library opens `/media`, Inn opens `/travel`, habits open a dialog. | Enterable functional rooms are new scope, not merely prettier tiles or more sprites. |
| Habit creation gates the entire building scene | Browser on an empty Town shows founding prompts; scene is inside `founded_on !== null`. | A home, usable buildings and exploration should work before recording a habit. Preserve existing progression semantics separately. |
| Clinic and Gym are not complete routed experiences | Root [routes](../../apps/web/src/app/routes.ts) mount Town/World, but no Clinic/Gym components. Existing [Health types](../../apps/web/src/app/town/health/health.types.ts) provide measurements and PRs, not full workout sessions. | Keep promised Health CRUD/privacy; expand scope deliberately if full workouts are selected. |
| Pixels describes activity more than memory | Browser day detail shows counts, trip name and Finance budget state. [Day detail](../../apps/web/src/app/pixels/day-detail.component.html) uses generic Town/Media links and `/pixels` as unlock return. | Named records, photos, note excerpts, exact-date destinations and preserved return context. |
| Some failed Finance states read as no data | [Day-detail formatter](../../apps/web/src/app/pixels/day-detail.component.ts) maps all non-ready/non-locked statuses to “Finance · no data.” | Keep unavailable/expired/absent distinct across the entire suite; do not report a failure as a factual empty day. |
| World has real state that a visual deletion would strand | [Concept model](../../apps/server/world/models.py) stores names, notes, sources and understood dates. Current World also offers date selection, source inspectors, history and accessible list mode. | Migrate or preserve those capabilities and records before retiring the separate route. Saved notes are not disposable rendering data. |
| The active roadmap does not describe the new product | PLACE packets preserve separate World exploration, bounded anchors and small keepsakes. Health promises stage-only exterior integration. No current packet covers rich room interiors, suite-wide art/gamification or Immich/Obsidian. | Rewrite scope rather than implementing the old packets and calling the owner's request complete. |
| Local and live planning state differ | Local snapshot lists SEC-03/04 and HUB-01/05/06; live list omits all five. #93 records merged HUB PRs #379–381; #134 still listed those three at inspection. | Reconcile from fresh merge/acceptance evidence when amending. Do not rebuild completed Hub features or close issues based only on this table. |

## Follow-up audit coverage required in the plan

The samples identify recurring defects, not every defect. Future work packets must
include an explicit screen/action inventory for their whole surface: primary entry,
create, edit, delete/Undo, search/filter, import/provider refresh, loading, empty,
failed save, stale response, lock/owner change, direct refresh and return navigation.
Use both small and large collections, long names, missing artwork/metadata, mixed
currencies, date boundaries and disconnected sources. Record each uncovered case
as unknown until inspected; do not convert a passing screenshot into a bug-free claim.

The [application plan](applications.md), [Town plan](town.md), and
[connection plan](connections.md) expand these patterns into concrete journeys and
acceptance. No application fix has been implemented by this audit.

## Local verification of this planning delivery

- `npm run build`: passed; six existing unused-import warnings. This prepared the
  audit bundle, not an implementation release.
- `npx playwright test --config .local/product-direction-audit/playwright.config.ts`:
  four exploratory cases passed, desktop and phone. The standard application
  regression suites were not executed or claimed as executed.
- `env PATH=/home/vivek/Deployments/vivek-monorepo/.venv/bin:$PATH make test-fast`:
  passed, including documentation/planner validation, boundary checks, 111 Python
  tests, browser-discovery checks and 21 Node tests. Initial system-Python run failed
  because Alembic was absent; the full command passed under the repository environment.
- `git diff --check`: passed. This delivery adds planning documents/evidence and
  their planning-index link; pre-existing application changes remain untouched.
