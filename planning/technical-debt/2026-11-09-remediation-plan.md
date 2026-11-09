# Detailed technical-debt remediation plan

Companion to the [assessment](2026-11-09-assessment.md) and
[independent review](2026-11-08-independent-review.md). These are proposed
implementation slices, not completed fixes. Review started 2026-11-08; this plan
was written 2026-11-09. The live status is
[roadmap #134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134).

## How to execute this plan

**S:** one focused reviewable slice. **M:** several related slices. **L:** a staged
capability/module migration. These are effort categories, not calendar promises.
A small code edit can require substantial regression evidence. Size each actual PR
around one behavior/contract or one responsibility extraction; do not implement an
entire workstream in one PR.

Priority P0 means correctness before extending the affected capability, not a
claimed production exploit. P1 removes repeated extension hazards. P2 improves
touched modules. P3 is ongoing maintenance or optional expansion. Reassess priority
when new evidence or user needs arrive.

Issue ownership:

- **E197:** [contracts/boundaries #197](https://github.com/Vivekpsps3/vivek-monorepo/issues/197).
- **E198:** [lifecycle #198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198).
- **E199:** [verification #199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199).
- **E200:** [simplification #200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200).
- Existing product/security/operations numbers remain owners of their user outcome.
  An engineering dependency does not create permission to drop that acceptance.

Every slice records: baseline behavior, intended invariant, caller migration,
old path removed, compatibility limits, relevant tests, actual result and any
remaining debt. If the abstraction has no migrated consumer, the slice is incomplete.
If there is no clear second consumer, keep a domain-local helper until reuse is real.

## 1. Ordered waves

| Wave | Work | Exit condition |
| --- | --- | --- |
| 0 — correctness and truthful tests | TD-00–TD-04, initial TD-14/TD-16 | Lock subscribers compose; Health cannot republish after invalidation; saved-library reads avoid repair/provider IO; Profile behavior and tests agree |
| 1 — enforceable extension contracts | TD-05–TD-10, TD-13–TD-15 | Feature graph, route/collection registration, lifecycle and source/test discovery have tested contracts |
| 2 — remove competing integration | TD-11/TD-12, TD-24–TD-26, TD-29/TD-30 | One integration path per migrated capability, typed boundary adapters, current comments/docs |
| 3 — simplify domain work in place | TD-17–TD-23, TD-27/TD-28/TD-35 | Real feature changes use narrow owned modules; old paths are deleted with passing behavior evidence |
| 4 — prove additions are cheaper | TD-31/TD-32/TD-37/TD-38 | Disposable feature proof and representative change comparisons demonstrate fewer independent edits and predictable verification |
| Continuous operations | TD-33/TD-34/TD-36/TD-39 | Recovery/observability/update obligations remain explicit and measured; new infrastructure requires evidence |

Do not wait for every Wave3 extraction to ship a useful small product fix. Repair
the correctness hazard and contract touched by the feature, then carry its focused
simplification in the same domain. Cards/Sidequests remain proposals until selected;
they are not excuses to bypass Wave0 or to require a universal application framework.

## 2. Work inventory

| ID | Slice | Priority / size | Owner |
| --- | --- | --- | --- |
| TD-00 | Reproducible baseline and change-cost measurements | P0 / S | E197/E199 |
| TD-01 | Correct Profile contract and obsolete assertion | P0 / S | #196, E199 |
| TD-02 | Multi-subscriber synchronous invalidation | P0 / S–M | E198 |
| TD-03 | Health owner/epoch/late-publication safety | P0 / M | E198, #90/#121 |
| TD-04 | DB-only saved reads and explicit Media repair | P0–P1 / M | #85, E200 |
| TD-05 | Language-aware, feature-level boundary enforcement | P1 / M | E197 |
| TD-06 | Route/navigation registration parity | P1 / M | E197, #196/#93 |
| TD-07 | Encrypted collection descriptors and compatibility | P1 / M | E197, #121 |
| TD-08 | Narrow vault-record capability port | P1 / M then L if justified | E198 |
| TD-09 | One lock/session transport and eligibility contract | P1 / M | E198 |
| TD-10 | Bounded async operations with owned publication | P1 / M | E198 |
| TD-11 | One World controller composition path | P1–P2 / S–M | E200/E198 |
| TD-12 | Typed API/error/decrypted-data boundaries | P1–P2 / M | E200, #121 |
| TD-13 | Explicit lint/type ownership of shipped sources | P1 / M | E199 |
| TD-14 | Spec discovery, Town fixtures, settings coverage | P1 / M | E199, #81/#196 |
| TD-15 | Honest coverage denominator and risk branches | P1 / M | E199 |
| TD-16 | Behavioral test ownership and stale-assertion repair | P1 / M | E199, owning features |
| TD-17 | Provider-specific modules and transport policy | P2 / L | E200, #85 |
| TD-18 | Media catalog/entry/progress/query responsibility split | P2 / L | E200, #85 |
| TD-19 | Narrow Finance query/command/market facades | P2 / L | E200, #65/#84 |
| TD-20 | One staged import engine and extension seam | P1–P2 / M | E200, #65 |
| TD-21 | World DOM/input/render ownership | P2 / M | E200 |
| TD-22 | PTO presentation/forms/series ownership | P2 / M | E200, #110 |
| TD-23 | Trip editor/itinerary responsibility split | P2 / M | E200, #84 |
| TD-24 | Small reusable form/interaction behaviors | P2 / M | E200, #196 |
| TD-25 | CSS layers, scope and deletion | P2 / M | E200, #196 |
| TD-26 | Explicit money/date/unit and aggregate meaning | P1–P2 / M | E197/E200, #81 |
| TD-27 | SQL ownership constraints and query boundaries | P1–P2 / M | #81/#125, E197 |
| TD-28 | Request unit of work and provider IO ownership | P1 / M | E200, #85/#125 |
| TD-29 | Verified dead-code and stale-comment retirement | P2 / S per domain | E200 |
| TD-30 | Current docs, durable decisions and generated facts | P2 / M | E197/E200 |
| TD-31 | Executable reference feature and onboarding contract | P1–P2 / M | E197 |
| TD-32 | Canonical fast feedback and measured verification | P1–P2 / M | E199, #125 |
| TD-33 | Useful bounded observability without private payloads | P2 / M | #125 |
| TD-34 | Recovery, release and migration evidence | P1 / L operational | #121/#125 |
| TD-35 | Risk-ordered type/lint debt reduction | P2 / S per slice | E200/E199 |
| TD-36 | Dependency and toolchain maintenance | P2–P3 / continuous | #125 |
| TD-37 | Cards/Sidequests extension-cost trial | P2 / S proof, feature separately | E197, #194/#195 |
| TD-38 | Maintenance scorecard and definition of done | P1–P2 / S then continuous | E197/E199 |
| TD-39 | Decision gates for new infrastructure | P3 / advisory | E197/#125 |

## 3. Correctness and trustworthy baseline

### TD-00 — Capture a baseline that can be compared

Start with the reviewed source revision, dirty-file list, active feature roots,
public entry points, selected test files, quality-tool inputs, coverage floors and
current commands. Preserve measurements separately from thresholds and historical
reports. The existing [inventory](evidence/source-inventory-2026-11-08.json) is a
physical-line snapshot, not a duplication score.

Choose three representative future changes: an existing UI field/filter; a new
provider adapter; a new private record type with a list/editor. For each record
semantic registration sites, unrelated feature edits, concepts a contributor must
understand, targeted verification command and elapsed time. Repeat comparable work
after the contracts land. Count tests and generated adapters separately from
production responsibility; a feature legitimately changes more than one file.

**Done:** a reproducible baseline and owner exist, with no invented timings or
“X% duplicated” metric. **Validation:** rerun inventory/discovery and explain any
concurrent-work differences. **Stop:** avoid building a permanent telemetry service
before a simple checked-in measurement table is useful.

### TD-01 — Fix Profile as one behavior-and-contract change

In #196, correct the server document route manifest and the stale composition
assertion together. Verify client navigation, fresh document load, refresh,
back/forward and Birthday links. Preserve auth and private CSP/Trusted Types,
public/private boundaries, aliases and unknown-path404 behavior.

Connect `pixels-settings.spec.ts` to actual selected browser coverage; its
existence on disk is not execution evidence. Add route-contract examples so
subsequent settings additions cannot repeat this mismatch. Do not fix it by
returning the SPA for every unknown path.

**Done:** the intended page loads consistently and an omitted registration is
caught. **Checks:** fast boundaries/docs, server coverage/composition, root web
Karma and relevant suite/Town Playwright. This user-facing fix can land before a
full route-generation architecture exists; TD-06 prevents recurrence later.

### TD-02 — Repair the multi-listener invalidation defect

Specify listener identity, registration, dispatch and disposal semantics before
implementation. Use a collection of live subscribers rather than one global
callback. Wipe the key synchronously, advance invalidation generation, then clear
all relevant derived state before async follow-up. One callback throwing must not
prevent remaining callbacks. A disposer may remove only its own registration;
repeated disposal and subscription changes during dispatch need deterministic rules.

Migrate Finance and Pixels first; test both construction orders, unbinding either,
double lock and callback exceptions. Retain existing owner/session binding and
message format. Do not “fix” order dependence by forcing one particular startup order.

**Done:** independent consumers clear regardless of registration order. **Checks:**
focused deterministic unit regression plus Finance/Pixels same-tab and cross-tab
lock/browser journeys, including unavailable BroadcastChannel. **Dependency:** none
beyond baseline capture. Broader lifecycle extraction is TD-09, not a blocker to
this small correctness repair.

### TD-03 — Prevent stale Health publication and retention

Capture immutable owner identity and lifecycle generation for every operation.
Invalidate retained arrays and derived data immediately when the owner/session/lock
changes. Check eligibility after loading the vault, after record listing, after
decryption, after conflict refresh and immediately before updating snapshots or
returning records/stages. Only the currently eligible load may publish. Snapshot
access must not expose a previous owner's retained arrays.

Connect timeouts to cancellation when transport supports it and always discard
late results. WebCrypto promises may finish after lock; correctness depends on
publication eligibility, not assuming crypto can be interrupted. Apply this to
writes and delete/refetch paths as well as reads. Preserve user drafts only within
the same valid session and existing revision-conflict rules.

**Done:** held list/decrypt/save promises cannot repopulate data after abort, timeout,
lock, disposal or account change. **Checks:** synthetic markers in store/DOM/network/
localStorage; overlapping loads; lock→unlock and A→B; conflict after lock; all Health
unit, Finance/shared and relevant browser gates. **Dependency:** TD-02 contract,
with #90/#121. No schema/key/wire rewrite is needed for these guards.

### TD-04 — Remove repair/provider effects from saved reads

Trace ordinary library/summary/detail query paths and pin the promise that they
read saved database state without external provider IO or canonicalization writes.
For the current MusicBrainz regression, move identity repair to a deliberate
versioned migration or explicit authenticated operation. Specify bounded batches,
progress, retry/idempotency, failure reporting and whether network enrichment is
allowed. Show unresolved metadata honestly until repair is explicitly run.

Preserve release-group/pressing identity, artwork provenance, global catalog sharing
and each owner's notes/ratings/membership. Use synthetic multi-owner merge fixtures;
never deduplicate merely by title. A paginated read must not scan/repair all saved
albums before returning its page.

**Done:** provider spies that throw on invocation do not break ordinary saved reads;
reads do not change catalog/user links. Explicit repair has conflict/rollback/retry
and bounded-work evidence. **Checks:** Media API/Node/browser, server integration,
provider request counts and transaction tests. **Owner:** #85; E200 supports later
extraction. Do not defer this behavior correction until all Media modules are split.

## 4. Shared contracts that lower extension cost

### TD-05 — Enforce the real feature graph

Inventory current imports before enforcing a target. Classify platform, generic UI,
feature implementation, public feature contracts, composition and test-only seams.
Define boundaries below the shared `web`/`server` roots and enumerate files allowed
to compose domains. The server factory/schema assembly and bounded aggregation
adapters are legitimate exceptions; the entire server tree is not an exception.

Resolve Python imports with AST/package context and TS/JS imports through the
existing compiler/module configuration. Include aliases, relative imports, dynamic
imports, reexports, type-only edges and CommonJS where used. Distinguish code from
comments/strings. Account for MTS and actual source suffixes. Decide an explicit
same-origin sink-scanning policy; runtime CSP remains independent protection.

**Done:** small legal/illegal graph fixtures exercise the complete checker, including
cycles, nested features, package→app leaks and exceptions. New violations fail;
existing reviewed debt has named migrations, not a blanket disable. **Checks:** fast
script tests, app/package typechecks and normal builds. **Stop:** do not force every
existing folder into a package before feature-level rules provide value.

### TD-06 — Make route facts agree across consumers

Define a minimal route descriptor: owner, path/pattern, mounted/reserved/alias status,
auth/privacy class, public entry point and representative deep-link examples.
Derive repeated server/shell declarations where practical, or implement a parity
check if code-shaped Angular routes cannot be generated cleanly. Keep lazy imports
explicit and reviewable; do not create a runtime plugin loader for arbitrary modules.

Handle settings, parameterized routes, aliases, private SPA reloads, public pages,
asset404s and API404s separately. Navigation labels/placement may be optional metadata;
not every route deserves a top-level tab. Add source-owned route examples to the
feature registration and exercise them through the actual server composition.

**Done:** a missing, duplicate or contradictory registration fails locally, and
unknown routes remain404. **Checks:** server composition/CSP, route matrix, root
browser keyboard/reload/navigation. **Dependency:** TD-01 establishes correct behavior;
this slice establishes prevention. Keep API endpoint schema concerns separate.

### TD-07 — Version collection ownership and recovery membership

Create a small collection descriptor contract with stable name, owner, supported
record schema versions, codec/validation owner, limits, foreign/unsupported handling,
and reset/export/restore participation. Produce/check backend accepted names and
client subsets without erasing intentional Finance-versus-Health ownership.

Add a synthetic descriptor to prove all required consumers see it. Preserve unknown
ciphertext according to an explicit forward-compatibility policy; an older client
must not silently delete or rewrite a newer domain's records. Keep owner identity
bound by authenticated session/AAD rather than trusting imported metadata. Require
collection additions to update #121's recovery tests, not an independently curated
list that can omit the newest app.

**Done:** parity, malformed/unsupported/oversized input, old/new client compatibility,
reset/account deletion and all-collection synthetic restore are tested. **Checks:**
Finance/server gates, crypto fixture compatibility, relevant browser recovery. No new
wire schema or database migration is implicit in a metadata-only declaration.

### TD-08 — Expose a narrow vault capability, then consider ownership extraction

Specify the minimum Health and future features need: owner/session identity,
eligibility generation, versioned encrypted envelope list/upsert/delete, expected
revision and cancellation rules. Health also needs browser-local crypto/codec
operations: offer codec-backed record reads/writes or scoped encrypt/decrypt with
the existing collection/owner/AAD rules. Envelope transport alone would leave it
dependent on concrete VaultService. Apply eligibility checks around those crypto
operations as well. Keep data keys and Finance cashflow/planning/import
APIs inaccessible through that port. Match actual capabilities; do not expose an
entire concrete service under a renamed type alias.

Implement the port using the existing Finance vault first. Migrate Health as the
second consumer and pin current request/AAD/ciphertext/blind-index behavior. Only
then consider moving generic implementation ownership out of Finance in mechanical,
reviewable steps. Backend identity/KDF/wrap dependencies require the same staged
ownership decision; they do not justify changing the authentication protocol.

**Done:** Health depends on the narrow interface, compatibility tests pass, and a
synthetic consumer does not import Finance internal types. **Checks:** lock, cross-owner,
conflict, crypto fixture, restore and public-graph tests. **Stop:** defer a complete
vault-package migration if the adapter already removes extension coupling safely.

### TD-09 — Unify lifecycle transport without centralizing domain state

Define session/owner/lock invalidation events and message validation once. Treat
storage events/BroadcastChannel as transports and the lifecycle epoch as eligibility,
not as new persistent state stores. Ensure same-tab lock works without cross-tab
APIs. Bind messages to the current owner/protocol/tab identity and suppress harmless
self echoes without skipping real invalidation.

Migrate Hub/Pixels/World/Finance in small steps, retaining their own record/read-model
state. Ensure subscribing/disposal follows the actual route/service scope and that
root services do not keep obsolete owners alive. Keep plain sensitive values out of
broadcasts and storage. Use compatibility adapters during migration, then delete old
listeners in the same slice that adopts the new port.

**Done:** one transport parser/eligibility source has actual migrated consumers;
construction, disposal, account switches and same/cross-tab lock pass. **Checks:**
E198 tests and affected browser journeys. Avoid a universal event bus or app-wide
mutable store as a shortcut.

### TD-10 — Share bounded-work mechanics and preserve feature states

Offer small primitives for caller cancellation, total deadline, owner/epoch capture,
cleanup and an explicit pre-publication check. Distinguish timeout from user abort
when the UI needs different behavior. Bound a multi-source user action overall;
sequential windows must not silently multiply an eight-second wait into many waits.
Cancel transport when supported and discard obsolete work when not.

Adopt in Pixels first, then equivalent repeated Hub/World/Health mechanics. Keep
feature adapters responsible for locked, absent, expired, corrupt, partial, stale
and unavailable states. Preserve independent source failures and manual Retry; a
shared helper must not turn every failure into an empty-success array.

**Done:** held responses, parse failure, timeout→late success, route disposal,
owner switch and already-completed cancellation have deterministic behavior.
**Checks:** virtual-time/promise-gate unit tests plus affected request-count/browser
stories. Do not use real sleeps, retries or broad catch-and-ignore to conceal races.

### TD-11 — Resolve World's competing setup paths

Inventory `WorldControllerService`, `connectController`, injection tokens and all
actual callers. Choose component/route-scoped or intentionally root-scoped ownership
based on lifecycle needs. Delete the unused wrapper, or adopt a single wrapper
consistently with correct disposal. Retain the plain controller's test seam.

Move Finance/session adapter construction to the chosen composition boundary and
remove duplicate session/storage wiring. Verify a new route entry creates the intended
fresh state and that leaving does not retain obsolete owner/budget work. A root service
must not accidentally preserve a previous exploration session merely because it is
convenient to inject.

**Done:** one live setup path and one lifecycle owner remain, with old symbol absent
or intentionally consumed. **Checks:** World unit/controller, URL/back-forward,
retry/dispose/lock and actual browser journeys. **Dependency:** TD-09/TD-10 contract
for changes that touch cleanup; a verified orphan deletion can be its own small PR.

### TD-12 — Type the boundaries where data enters

List external-provider, HTTP, decrypted, persisted-preference and import payload
boundaries. Define small request/response/result contracts and decoders there.
Replace `as T`/`any` at high-risk boundaries with `unknown` plus owned validation.
Preserve nullable/unknown/unavailable distinctions and expected revision metadata.
Use consistent field-error/retry/session-expiry contracts so every form does not
invent status interpretation.

Where backend schemas are stable, generate frontend DTOs or check contract fixtures;
keep domain view models separate. For MJS plus handwritten declarations, choose
checked JSDoc/`checkJs`, generated declarations or migration to one typed source in
touched modules. Add implementation/declaration parity evidence. Avoid generating a
huge client before the API's actual ownership and compatibility are clear.

**Done:** malformed and future-version examples fail predictably at one boundary;
consumers handle typed results without repeated casts. **Checks:** API/runtime codec,
frontend compile, current provider fixtures and form errors. No generic HTTP error
rewrite may accidentally treat provider401 as suite session expiry.

## 5. Verification that supports safe deletion

### TD-13 — Give every shipped source an explicit analysis owner

Build an inventory of production TS/JS/MJS/templates, backend Python, shared modules,
configuration and runtime adapters. Record whether ESLint/Ruff, tsc/mypy/checkJs,
unit tests and build steps actually include each. Imported tsc coverage and a named
package directory are different from explicit standalone ownership. Identify real
orphans and declaration-only/generated/vendor files separately.

Expand tool targets deliberately for MJS and support/config files with appropriate
language environments. Baseline only actual existing findings under the current
review rules; never add file-wide suppression or hide new paths. Add a negative
fixture showing an unowned new shipped module fails the inventory check.

**Done:** a contributor can tell which check analyzes a new file, and new uncovered
source cannot silently ship. **Checks:** quality-ratchet unit/base tests, complete
source inventory and relevant lint/type/build commands. Do not describe the task as
“Media has no tests”; it has Node/browser owners that need explicit coverage mapping.

### TD-14 — Make discovery visible and repair missing journeys

Compare all spec/test files with actual project discovery, not filename intuition.
Give each excluded journey an owner, reason, next action and intended layer. Distinguish
viewport-specific assertions from disabled whole features. Add guards for empty
projects and unintended orphan test files.

In #81 complete Town/non-owner/reset/clock fixtures and prove the real habit/edit/
history/Undo/error journeys before removing `test.fixme`. In #196 include and reconcile
Pixels settings. Preserve current Finance/Travel/Media/Pixels/World tests and worker
isolation. A passing `--list` is discovery evidence only; closure needs executed tests.

**Done:** intended routes map to selected stories with passing behavior evidence.
**Checks:** test discovery inventory, actual Town/settings suites, root project list
and applicable gates. Do not bulk-enable and then relax assertions to make the suite green.

### TD-15 — Report what coverage actually measures

Publish statement/branch mode, source inclusion/exclusions and instrumentation scope
with every report. Keep current floors: Finance83.28, Travel80.41, Media70.60,
Server61.53. Current baseline files are not fresh measurements. Karma's loaded-source
instrumentation needs a denominator explanation before anyone treats it as full-app
coverage.

Add branch/contract tests for lock/owner transitions, partial import failure,
concurrency, foreign IDs, malformed response/version, read-only provider boundaries
and recovery. Consider scoped branch measurement first; do not suddenly demand a
repo-wide percentage unsupported by current tooling. Ratchet real improvements with
reviewable source moves and preserved historical compatibility tests.

**Done:** coverage summaries state their limits, important decisions have tests and
floors do not drop. **Checks:** existing coverage gates plus targeted branch evidence.
Avoid line coverage as a substitute for proving cancellation or source ownership.

### TD-16 — Retire stale assertions with the corresponding behavior change

Inventory tests that pin obsolete route/profile behavior, pointer-only interactions,
old blockers or implementation-source strings. Assign each to a current invariant.
Correct tests and code together; keep unknown404, privacy/configuration and provider
budget assertions that still prove real safety. Source scanning can supplement
behavior, but it does not prove the mounted workflow.

Resolve optional Town UTC-clamp xfails with a documented current contract decision.
Do not implement an old speculative rule solely to remove an xfail. If a test is
superseded, identify the surviving behavior owner and explain the replacement;
never hide a real regression behind “pre-existing.”

**Done:** each changed/deleted assertion maps to a current requirement and surviving
check. **Checks:** relevant unit/API/browser suites; mutation-style challenge where
useful. Keep tests that would fail if the repaired contract regressed.

## 6. Domain-by-domain simplification

### TD-17 — Separate Media provider adapters

Create modules grouped by provider protocol and independent reason to change: TMDB,
TVMaze, MusicBrainz/artwork, Open Library, games and any other actual providers.
Extract only genuinely shared transport concerns: total deadlines, request budget,
cache/provenance envelope, safe URL rules and structured failures. Keep source-specific
parsing, identifiers, pagination and ranking facts with their provider.

Leave the current public provider entry points as thin adapters while migrating
callers. Remove the old branch only when all callers and fixtures use the new path.
Avoid one giant “provider base class” with flags for every irregular API.

**Done:** a provider change affects its adapter/fixtures and any explicit shared
contract, not unrelated providers. **Checks:** existing offline fixtures, quota/deadline/
partial outage, artwork allowlists, result ordering and request counts. **Dependency:**
TD-04 fixes saved reads first; TD-28 preserves transaction boundaries.

### TD-18 — Separate catalog identity, personal entries, progress and reads

Map Media responsibilities before moving methods: global catalog identity/merges;
personal entry commands; membership/discography relationships; episode/season/album/
track progress; saved queries; serialization/projection; explicit repair jobs.
Specify who owns transactions and which operations can change another shared catalog
row while preserving each user's personal state.

Extract one responsibility at a time with current entry points delegating. Prefer
explicit command/query functions over a generic CRUD repository that hides ownership
joins and conflict rules. Keep equivalent identity and reconciliation helpers single;
multiple calls to one authoritative helper are not duplication.

**Done:** adding an entry field or progress action has one owned command/projection
path and preserved owner/Undo behavior. **Checks:** catalog merge, deletion, rating,
provider matching, cross-owner isolation, optimistic conflict and query-count fixtures.
Record the old implementation removed per slice.

### TD-19 — Narrow Finance's broad service incrementally

Map FinanceService's query snapshots, record commands, import orchestration, market
refresh and derived calculations. Keep public UI adapters narrow: account names for
search, trip totals for Travel, budget status for Town/World/Pixels, and summaries
for Hub. Use the existing transaction-effects/calculation owners; do not copy them
into each facade.

Migrate a real consumer first, such as #84's spending bridge or #93's name search.
Retain session/collection epochs, cross-tab reload semantics, optimistic conflict,
silent-load rules and cancellation. Expose ready name rows without forcing a full
dashboard load. Keep a compatibility service while consumers migrate, then prune
unused methods rather than maintaining two complete stores.

**Done:** a small domain feature changes its owner/facade rather than every Finance
screen. **Checks:** finance coherence, lock, stale loads, imports and public-facade
contracts; actual target browser journey. A file split without narrower dependencies
is not completion.

### TD-20 — One import pipeline with format-specific front ends

Document parse → normalize → map account → validate/select → preview → stage →
commit → receipt → resume/Undo. Bank/custom CSV formats adapt to the same normalized
transaction/import plan. Brokerage replacement remains a distinct operation with
its existing staging semantics; share safe primitives only where outcomes match.

Make #65's custom mapper another parser/mapping adapter, not a parallel write engine.
Preserve account identity, imported date coverage, dedupe/refunds/ambiguous credits,
row limits, revisions, selected rows and retryable receipts. Lock/cancel clears
plaintext drafts; interruption never silently activates a partial replacement.

**Done:** a new supported format supplies parsing/mapping plus fixtures and uses the
same proven commit/recovery path. **Checks:** malformed/mixed currency, duplicate,
refund, account ambiguity, write failure, concurrent change, edited-row Undo and
staging interruption. Correct the expense-only onboarding guide in TD-30.

### TD-21 — Give World's UI a small DOM/input/render owner

After TD-11, separate pointer/keyboard camera input, canvas sizing/paint scheduling,
URL/view state and concept-sheet interaction from data loading/lifecycle. Keep pure
camera/cache/engine functions pure and reuse golden vectors. Give every listener,
frame/timer and canvas resource one explicit dispose owner.

Use presentational components/helpers for toolbar/week/list output where this
reduces independent responsibilities. Preserve reduced-motion list defaults,
keyboard interaction, static-map operation, fog preference and private chest overlays.
Do not create a second engine or global store to shorten the component.

**Done:** input/render changes do not edit data transport or Finance eligibility;
actual consumers use the extracted owners. **Checks:** engine parity, camera/input,
URL/reload/back-forward, concept invalidation, lock, reduced motion and World browser.

### TD-22 — Separate PTO presentation from policy and transport

Move PTO inline template/styles to owned files first only if that improves review;
that mechanical step alone does not remove responsibility. Separate chart/read-model,
policy draft validation, entry editor state and request coordination, retaining
existing pure model/chart helpers and server-owned exact math.

Implement #110's combined chart, hours/day display, Sick removal and versioned accrual
as user-visible slices using those boundaries. Keep stored grandfathered values,
policy revision, draft retry intent, caps, carry-forward and timezone/cadence rules.
Avoid two balance calculators or a generic form framework for different policy kinds.

**Done:** chart/policy presentation and request lifecycle can change independently
without copied math. **Checks:** Travel coverage/Node, decimal/leap/rollover policy
fixtures, draft/conflict/error browser and both themes/widths.

### TD-23 — Separate trip journey orchestration from row editors

Use #84's itinerary/day selection and reusable editor contracts as the seam. Keep
transport, destination, parking, activity, cost, reminder and note validators typed
and owned; share dialog lifecycle/focus/error mechanics. Preserve existing Undo,
map recovery, currency-separated costs and trip PTO controls.

Publish/consume Finance trip totals through the existing client-only registry and
narrow Finance facade. Keep totals and transaction tags out of server aggregation,
URLs and storage channels. Remove obsolete K1 blocker comments when the connection
is actually implemented, not merely when the comment is noticed.

**Done:** adding one trip item kind mostly touches its editor/model and explicit
itinerary adapter. **Checks:** ordering/red-eye/free-day, form submit/error focus,
all row actions, delete/retry/Undo, Travel-first unlock and lock clearing. Preserve
Travel multi-currency separation from Finance's USD total.

## 7. Reuse, types, styles and data meaning

### TD-24 — Reuse interaction contracts, not every form's shape

Inventory repeated first-invalid focus, error linkage/live regions, unsaved draft,
submit/busy/retry, focus return and sticky footer behavior. Extract a small primitive
only after comparing actual consumers. Keep domain field definitions/validation plain
and specific; optional controls must not become a schema-driven mega-form system.

Adopt the primitive in two real forms, then delete their obsolete copies. Standardize
whether submit reveals errors and how drafts survive failure. Align keyboard/dialog/
Escape and destructive confirmation with existing shared components. These decisions
must hold for a future Cards editor without leaking card facts into shared UI.

**Done:** two consumers exhibit the same interaction contract with their own rules.
**Checks:** first-invalid, field descriptions, failed-save draft, retry intent,
close/return focus, keyboard, zoom and 390/1280 screenshot/axe states. Do not delete
useful safety text to make templates smaller.

### TD-25 — Clarify CSS ownership and retire overrides safely

Map shared tokens, base elements, generic controls, shell layout and app-specific
styles. Identify competing selectors across `packages/ui/controls.css`, root styles,
imported domain CSS and component overrides. Decide layer/specificity ownership and
use theme tokens for shared values; retain feature selectors for feature structure.

Migrate one repeated form/row/card pattern at a time with before/after captures.
Remove the old override when the consumer migrates. Fix #196's oversized Hub miniature
by bounding the component's scale rather than adding another broad `.pixel` override.
Keep global selectors narrow and avoid `overflow:clip` as proof that clipped content
is usable.

**Done:** a shared control style change has predictable owners and no obsolete
competing rule. **Checks:** themes/widths, dialog scrolling/sticky footers, 200% zoom,
focus-visible, reduced motion/transparency and source-specific assets. No visual-kit
rewrite is required.

### TD-26 — Name money/date/unit/aggregate semantics explicitly

Declare boundaries for stored dollar numbers, displayed integer cents, Travel
currency-tagged decimal strings, PTO exact hours/days, Health units and approximate
Planning outputs. Keep conversions at named adapters and validate unknown/invalid
values; unknown is not automatically zero. Consider lightweight branded types on
touched APIs after runtime rules are pinned, not a bulk data migration.

Keep civil dates, instants, market trading dates, user timezone days, ISO weeks,
Sunday Pixels weeks and birthday life-year geometry distinct. Most importantly,
Town habit weeks do not satisfy Treasury's consecutive completed Finance budget
weeks. Use an explicitly named budget-run helper in #81; preserve World consumers
of habit semantics and unchanged Town XP.

**Done:** fixtures where similarly named concepts differ produce correctly different
results. **Checks:** cents/refund/rounding, DST/day boundaries, leap/month-end,
missing data, long habit streak with no budget weeks and its inverse. Reuse pure
primitives or cross-language golden contracts where source sharing is inappropriate.

### TD-27 — Make SQL ownership and read projections explicit

Document SQL model owners, composition metadata, account-delete order and intentional
shared catalog rows. Implement #81's composite ownership constraints through an
additive migration with invalid-data preflight and preserved account-deletion tests.
Never alter an applied historical migration to make models appear simpler.

Move source queries behind app-owned read projections as aggregation grows. Keep
queries owner-scoped, bounded and grouped; add realistic query-count/performance
fixtures for new list/agenda/passive-credit work. Avoid row-by-row provider/SQL loops
and whole-history reads for a paginated action. One SQLite database remains a valid
composition choice; it does not require every feature to know every model.

**Done:** foreign-owner relationships fail, source projections retain explicit privacy
and query budgets, and seeded migration preservation passes. **Checks:** Alembic
head/drift/rehearsal, account delete, cross-owner insertion, representative data and
existing performance gates.

### TD-28 — Put transaction ownership at command boundaries

Document when a request transaction starts/commits/rolls back, when provider IO may
release it, and what can be safely retried after a partial operation. Preserve the
current guarantee that success is not emitted before commit. Explicitly identify
commands that combine external fetch and catalog writes; stage external facts,
revalidate owner/revision and then write under a short transaction.

Replace accidental mid-read repair/commit with TD-04's explicit operation. Keep
provider authentication failure distinct from suite session401 and preserve structured
field errors. Test unique conflicts, disconnects and failed commit, including catalog
sharing without leaking personal state.

**Done:** each command's unit of work is clear and saved reads are side-effect-free.
**Checks:** API transaction-before-response, rollback/idempotency, provider budget and
SQLite contention tests. Do not build a generic unit-of-work framework when the
existing request session plus explicit commands is sufficient.

## 8. Cleanup and sustainable development

### TD-29 — Delete verified dead paths and retire stale claims

Build a removal ledger: candidate symbol/path, known callers (including lazy/test/
reflective use), intended replacement, preserved behavior tests and removal status.
Start with the unused World wrapper and elapsed dependency comments. Search across
production, tests, configuration, package entry points and docs before deleting.
Unused exports can be tested or compatibility surfaces even when not shipped.

Keep comments explaining algorithms, privacy/AAD/lock rules, exact rounding,
transaction ownership and historical schema constraints. Replace PR choreography
and settled “waiting for design” text with current invariants and live issue links.
A TODO disappears only when behavior is implemented or explicitly disposed.

**Done:** old implementation and its obsolete guidance are gone; no new duplicate
path remains. **Checks:** consumer graph/type/build, behavior owners and fast docs.
Record gross deleted/added production/tests separately; do not turn raw deletion
count into a quota or claim tree-shaken dead source inflated runtime bundles.

### TD-30 — Make current documentation usable for the next contributor

Update the bank-import guide to current kinds/refund/ambiguity/staged receipt rules.
Make quality prose derive volatile counts or link baselines rather than hardcoding
stale totals. Keep route/storage/error/lifecycle behavior close to contracts and
one current setup/verification path; dated reviews and old specs remain clearly
historical.

Record durable choices briefly: why this owner, which contract/version, compatibility
limits and alternatives rejected for a concrete reason. Resolve old “pending owner”
comments once decisions exist. Validate commands and links, and consider anchor
checking for current docs without rewriting archival materials indiscriminately.

**Done:** following one onboarding guide succeeds on synthetic data and does not
teach obsolete behavior. **Checks:** doc paths/examples, relevant source contracts,
clean disposable setup. Documentation cleanup is not evidence a runtime fix shipped.

### TD-31 — Exercise a reference feature from owner to verification

Use the [feature-addition playbook](feature-addition-playbook.md) to build a disposable
reference slice through current contracts: one owner, list/detail/edit, optional
SQL or encrypted storage, explicit route registration, lifecycle, errors and a user
journey. Keep the reference small; do not ship a fake production app or dozens of
empty framework extension points.

Provide a starter example/template only after the proof demonstrates which boilerplate
is stable. Optional Hub/search/calendar/provider integration remains opt-in. Show
exact commands and where tests live. Test removal too: unregistering a feature does
not silently orphan shared data or leave navigation links.

**Done:** a contributor can follow the reference without copying private Finance/
World internals or manually guessing omitted quality gates. **Checks:** negative
registration/discovery fixtures and one real user journey in the disposable proof.
Count semantic root edits before/after rather than promising zero composition work.

### TD-32 — Keep verification fast without reducing what it proves

Measure lint, types, fast scripts, each Python/Karma/Node group, production build
and browser projects on the same machine/source. Use one canonical entry point
for each verification level and run each gate once. Check whether standalone checks
such as the release-manifest fixture are actually included; this review ran that
check separately and it passed.

Use isolated worker server/database/session fixtures, shared build outputs and
bounded concurrency compatible with runner resources. Put pure arithmetic matrices
at the unit layer and keep the browser for actual route/persistence/focus/recovery
journeys. Preserve distinct outages/conflicts; a giant combined happy-path test
cannot replace them.

**Done:** before/after timing and assertion-ownership tables show savings without
weaker coverage. **Checks:** applicable full local gates before PR, deterministic
repeats only for suspected flakes and unchanged zero-retry policy. No suite may be
skipped to make the canonical command “fast.”

### TD-33 — Observe the contracts that fail, without logging private data

Use bounded labels and request IDs for provider deadline/budget failures, source
unavailability, stale-result drops, revision conflicts, queue lengths and backup
freshness. Keep personal labels, card/health facts, notes, CSV contents, tokens and
feed URLs out of logs/metrics. Distinguish no activity from failed/unimplemented
source integrations in diagnostics and UI.

Add synthetic tests that can identify a failing adapter without reproducing with
private data. Configure independent monitor/notification evidence through #125;
a local log line is not proven paging. Keep low-overhead counts rather than a
new general analytics platform.

**Done:** the owner can tell which layer failed with redacted evidence. **Checks:**
marker-redaction, bounded-cardinality, provider failure and external notification
fixtures/activation evidence as applicable. Do not log decrypted payloads to debug
lifecycle races.

### TD-34 — Keep recovery and release evidence ahead of new private data

Finish #121's atomic dual-wrap passphrase change and encrypted full-vault export
**and restore**, including every allowed collection. Preserve no-plaintext-server
and owner/revision/lock invariants. Finish #125's measured disposable restore,
off-host encryption/activation, independent monitor evidence and retention
reconciliation; current local snapshot retention differs from the selected future
30-day/minimum-seven policy.

Preserve exact tested-build promotion checks, migrations before startup, immutable
revision history, source/ciphertext preservation and explicit rollback compatibility.
New collection/API/constraint slices must say what an older compatible client/image
can do. Do not confuse server snapshot recovery with portable vault recovery.

**Done:** synthetic roundtrip and measured recovery evidence exist; missing external
activation prerequisites remain open with an exact owner/action. **Checks:** migration
rehearsal, restore integrity/owner counts/ciphertext, interruption/tampering/conflict,
trusted release checks and deployed evidence when actually performed.

### TD-35 — Pay down types and lint by risk, not easy count wins

Start with collection envelopes, API/projection decoders, provider responses,
revision/owner IDs, money/date values and async result unions. Introduce collection→
payload maps where they replace repeated persistence `any`; narrow exception/result
shapes and avoid casts that claim validation has happened. Improve ORM typing in
owned modules without rewriting historical migrations.

Reduce the corresponding baseline when a finding shrinks. Existing source moves
must preserve or reduce allowance. Constructor injection style and similar cosmetic
rules follow correctness boundaries; do not spend the program's first week converting
all stylistic warnings while Health/lock contracts remain unsafe.

**Done:** new feature code can depend on a well-typed boundary and touched risky
paths lose casts with behavioral tests. **Checks:** mypy/tsc/ESLint/Ruff/ratchet base
comparison plus relevant runtime validation. Stricter flags can be enabled in bounded
areas after owning migration errors; no one-shot global flag change is required.

### TD-36 — Make dependency maintenance routine and bounded

Keep root lockfiles, hashed Python locks, pinned actions/images and the actual
installed browser/tool versions documented. Assign an owner/cadence for runtime,
frontend and base-image updates and security advisories through #125. Test updates
against current contracts; a pinned artifact is reproducible, not permanently safe.

Inventory unused dependencies and obsolete vendor/static assets with consumer and
license provenance before removal. Keep generated build outputs/dependency caches
out of source metrics. Avoid a framework, state-library, test-runner or package-manager
migration unless it removes a measured constraint the current toolchain cannot address.

**Done:** routine updates have a repeatable verification/recovery path. **Checks:**
lock integrity, existing dependency audits/build/gates, image/asset policies and
compatibility where touched. No new version/security recommendation is claimed by
this source review without a current advisory investigation.

### TD-37 — Prove lower cost with Cards and Sidequests as future cases

Before implementation selection, compare how each proposed domain would use the
new contracts. Cards is Finance-owned and should link existing liability/transaction
facts with separate statement/benefit metadata. Sidequests owns experiences/memories
without importing private Town/World state or inventing another XP system.

Use a disposable synthetic collection/editor proof to test registration, recovery,
lock, UI primitives and quality discovery. Record awkward exceptions and fix the
reference pattern. Only a separately selected product slice builds the real app;
proof work does not authorize banking connections, credentials, uploads or providers.

**Done:** the second consumer requires fewer independent platform decisions, while
its domain remains explicit. **Checks:** the same owner/route/lifecycle/export/restore/
keyboard gates required of existing features. Do not call future features “free” or
require speculative support for every imaginable integration before shipping one.

### TD-38 — Maintain a small scorecard and change definition of done

Track manual contract copies, new boundary violations, unowned source/spec files,
repeated lifecycle implementations, targeted-check latency, flakes/retries and stale
open TODOs with owners. Record representative feature semantic edit sites and time
to understand/verify. Use the baseline as an aid, not a global line-count contest.

Each PR describes the contract/user behavior, surviving test owners, migrated callers,
old path removed and any explicit compatibility/recovery limits. Review whether a
shared helper actually has consumers and whether a domain rule was accidentally
promoted into a generic package. Keep issue checklists current after merge.

**Done:** trends and concrete examples show less change amplification and stable
verification. **Checks:** negative fixtures, selected-check logs and periodic owner
walkthroughs. No permanent agent orchestration or new dashboard is required for a
small Markdown/JSON scorecard.

### TD-39 — Require evidence before adding architectural machinery

For a proposed new package/service/framework/store, state the existing problem,
measured impact, expected consumer count, simpler option, ownership, migration,
compatibility and rollback/deletion plan. Prefer the existing monolith and explicit
composition while they satisfy requirements. Evaluate larger changes only against
real workload/team/security constraints.

Examples that need separate justification: microservices, another database,
universal event warehouse, repository-wide formatter migration, generic repository
layer, generated form builder, new state management library, replacement crypto
protocol, universal app plugin loader. Some may eventually be useful; this review
provides no evidence they are necessary now.

**Done:** architectural additions have concrete benefits and bounded ownership.
**Checks:** a measured proof and applicable existing gates; reject abstractions that
only rename today's ambiguity or leave multiple complete implementations running.

## 9. Required validation by change class

Run every applicable command in root AGENTS. This table clarifies scope, not exemptions.

| Change | Evidence to add | Existing gates to run |
| --- | --- | --- |
| Docs/planning only | links, current claims, no accidental code diff | `make test-fast`, whitespace review |
| Boundary/tool discovery | legal/illegal miniature graphs, omitted-file/spec failure | `make test-fast`, relevant lint/type/Node and discovery commands |
| Shared UI/lifecycle | caller adoption, disposal/lock/race, keyboard/drafts | root Karma plus affected Finance/site suites and browser journeys; lint/type gates |
| Finance storage/import | owner/revision/atomicity/marker/compatibility | Finance/server Python gates as affected, Finance Karma, root web and Finance/browser matrices |
| Travel/PTO | exact math/date/owner/draft/itinerary | Travel Python/Node/Playwright and affected root/shared checks |
| Media provider/records | no-IO saved reads, budgets/identity/rollback | Media Python/Node/Playwright, auth-UX and affected server/shared gates |
| Schema/model/constraints | preflight/seeded preservation/account delete/compatibility | Python lint/type, affected coverage, migration drift and seeded rehearsal; release checks |
| Operations/release | redacted dry-run/synthetic recovery and activation evidence | fast script tests, affected Python/image/release/rehearsal/browser checks |

Add targeted tests for newly proved failure mechanisms, not assertions that simply
mirror an extraction's class/file names. Leave a failure failing until its code or
assertion is actually fixed. CI is the second run. Do not lower gates, add retries,
relabel skipped features as passing or drop meaningful behavior to meet a size goal.

## 10. Deliberate non-goals and stop conditions

- No percentage-of-LOC deletion target or claim all large files are waste.
- No requirement that all domains have identical UI, money/date semantics or storage.
- No bulk rewrite of working math, authentication, encryption, migrations or imports.
- No package-per-helper or shared abstraction with no demonstrated consumers.
- No broad formatter/style campaign mixed with semantic changes.
- No success claim from source moved, helper created, test listed or issue closed alone.
- No silently abandoned Finance/Travel/Media/Health/Town/Workspace acceptance.
- No indefinite feature freeze: correct the hazard, establish the touched contract,
  ship the useful slice and continue targeted simplification.

An extraction is finished when the new owner is used, the old implementation is
removed, behavior and compatibility are proved, and the next feature demonstrably
has fewer independent decisions to make.
