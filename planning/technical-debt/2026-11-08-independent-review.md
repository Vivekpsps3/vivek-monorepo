# Independent antagonistic maintainability review — 2026-11-08

## Scope, stance, and confidence

Reviewer: independent subagent requested by the owner. Objective: find the mechanisms that make feature additions expensive or dangerous, including weaknesses in the previous optimistic assessment. This is an adversarial engineering review, not an implementation, penetration test, or production incident claim.

Reviewed checkout `8b53c8005008839208bc3d9160fb2c02078119f7`. Other agents/users were editing browser tests and planning files during review. No repository files or GitHub objects were changed by this reviewer. The report itself is written to `/tmp` at the parent's explicit request. No complete regression suite was run: the work was read-only source/configuration inspection and controlled in-memory probes of existing code. Do not treat a passing probe as full product acceptance.

Classifications:

- **Verified defect:** incorrect behavior demonstrated by code/control-flow or an in-memory execution of unchanged production logic.
- **Verified structural debt:** a directly observable ownership, duplication, discovery, or responsibility problem. It may not currently cause a user-visible failure.
- **Risk/inference:** plausible consequence of observed structure, requiring a focused regression/reproduction before claiming an incident.
- Effort **S** means a focused reviewable slice; **M** means several coordinated slices; **L** means a phased capability extraction. These are relative sizes, not delivery-date estimates.

The review supports targeted repair. It does not justify a framework migration, microservice split, rewrite of the cryptographic protocol, universal event store, arbitrary line-count deletion target, or elimination of domain-specific rules.

## Executive finding

The biggest debt is **multiple incomplete authorities for the same cross-cutting behavior**. Features each improvise vault lifecycle, async cancellation, composition and contract registration. Meanwhile, generic shared packages contain domain behavior, and supposedly narrow public interfaces expose concrete large services. This combination makes every new feature negotiate undocumented exceptions.

There are useful foundations: one explicit server composition, app-owned domain directories, public entrypoints, shared UI and formatting, pure rule modules, revision-aware encrypted writes, transaction-before-response behavior, migration rehearsal, source-boundary checks and local test gates. The problem is that enforcement is incomplete and some shipped integrations bypass the intended foundations.

A credible improvement program must begin with lifecycle correctness and test truth, then establish small reusable contracts and verified boundaries. Breaking up large files comes after those contracts, so the result is fewer independent implementations rather than more files containing the same ambiguity.

## Findings

### A01 — Vault invalidation is a single callback slot despite multiple independent consumers

**Priority:** P1. **Class:** verified API/lifecycle defect. **Confidence:** high. **Effort:** S for repair and unit contract, M for consumer migration.

Evidence:

- `apps/finance/frontend/src/app/crypto/lock-finance.ts:12–15` declares one module-level `dropSnapshots` function. `bindLockSnapshots` replaces it; disposing the current binding resets it to no-op.
- `apps/finance/frontend/src/app/services/finance.service.ts:129` registers Finance state clearing.
- `apps/web/src/app/pixels/pixels-data.service.ts:61` independently registers Pixels invalidation.
- `lock-finance.ts:26–29` wipes the key then invokes only that single current callback.

A controlled execution of this unchanged function demonstrated: register Finance, register Pixels, dispatch => only Pixels runs. Dispose Pixels while Finance is still alive, dispatch => neither runs. This is a real registration collision independent of browser timing.

Consequence: extension behavior depends on service construction order. A new encrypted feature cannot safely assume registration composes with existing listeners. Other BroadcastChannel/storage handlers and later Finance clearing mitigate some observable effects, so this finding is **not** proof that real user plaintext was exposed.

Remediation slices:

1. Specify an owner/session-aware invalidation contract with multiple listeners and an epoch.
2. Fan out synchronous memory clearing before asynchronous module/storage work. One failed callback must not prevent the others from clearing.
3. Make each disposer remove only its own listener. Define registration during dispatch and repeated disposal deliberately.
4. Migrate Finance/Pixels and the other derived consumers to the same contract; retain cross-tab delivery as transport rather than implementing another state owner.
5. Exercise lock/session change with every service creation/disposal order and with BroadcastChannel/storage unavailable.

Validation: meaningful callback-order tests; same-tab and cross-tab lock while an async load is held; account A to B transition; repeated lock; no obsolete publication; key wiping and all consumer snapshots remain independent invariants.

### A02 — Health can republish decrypted records after abort/lock, and retains memory until a later operation notices lock

**Priority:** P1 before Clinic/Gym UI or more encrypted domains. **Class:** verified store-level stale-publication defect; broader user-visible exposure is unproven. **Confidence:** high. **Effort:** M, depends on A01 lifecycle contract.

Evidence:

- `apps/web/src/app/town/health/health-store.service.ts:93–120` is a root service retaining decrypted `stats` and `prs`. Its public snapshot getters return them without checking lock/owner.
- `:123–128` clears only when a later operation calls `requirePresent`; `load(:131)` checks presence at its start.
- `loadAll(:161–175)` checks abort before and after record listing, then awaits decryption and assigns arrays with **no post-decrypt abort, presence, owner or epoch check**.
- `load(:136–158)` races a deadline against the work, but timing out does not cancel/invalidate that work. A later result can still mutate stored arrays.
- There is no constructor subscription to session/lock invalidation.
- `apps/finance/frontend/src/app/crypto/vault.service.ts:390–401` captures `requireDek()` before an asynchronous decrypt and returns its promise; this low-level method supplies no post-decrypt session check for the Health caller.

Probe: transpiled the actual HealthStoreService, supplied only a synthetic vault with a held decryption promise, started `load`, then aborted the supplied signal and made the presence probe false before completing decryption. Actual result: `{"aborted":true,"present":false,"result":"ready","retained":1}`. No real browser, network, key or private record was involved.

Remediation:

- Bind the store to immutable owner/session/lock epochs at start; check them after every await and before publishing any record, count or stage.
- Subscribe to lifecycle invalidation and clear snapshots synchronously. Expose a safe snapshot/read model rather than unrestricted stale getters.
- Apply the same rules to create/update/delete/refetch; successful old-session writes must not append plaintext to a new session's in-memory collection.
- Couple deadlines to work cancellation where possible and always invalidate publication. WebCrypto cannot necessarily be physically interrupted; discard its obsolete result.
- Make overlapping loads deterministic: newest eligible generation owns publication.

Validation: abort during list, decrypt and save; deadline then late success; lock then unlock; account switch; two overlapping loads; conflict refetch after lock; zero retained marker text and no late derived stage publication. Existing tests only demonstrate start-locked clearing and a hanging-store deadline, not this late-publication path.

### A03 — A normal Media library GET can perform provider calls and repair mutations before paging

**Priority:** P1 for read reliability and architecture truth. **Class:** verified control-flow behavior inconsistent with the documented saved-read contract. **Confidence:** high for current checkout; production incidence unverified. **Effort:** M.

Evidence:

- `apps/media/backend/routers/journal.py:71–93`: GET `/library` invokes `records.repair_musicbrainz_albums(db,user_id)` for mixed/music lists.
- `apps/media/backend/services/records.py:1064–1081` collects the owner's saved MusicBrainz album IDs and loops over them; the repair precedes library limit/offset processing.
- `:1095–1109` may re-place/merge catalog identities; `:1113–1116` may link saved artists.
- `:1121–1122` can release the current unit of work and call `providers.lookup_detail` for unresolved identities.
- Discography GET also invokes repair at `journal.py:184`; its explicit metadata browse can legitimately fetch public metadata, but hidden repair/mutation semantics still require an explicit design.

This work appears in local MusicBrainz changes beyond the earlier main baseline. Do not report it as an independently observed deployed outage.

Consequences: opening/filtering the saved library can depend on upstream latency/outage, scan all the user's albums regardless of current page, and mutate catalog/link state as a side effect of a read. Merely moving the function into a new file does not solve this behavior.

Remediation:

1. Separate canonical identity repair from saved-library query assembly.
2. Perform repair as a versioned migration/explicit maintenance command or an explicitly invoked bounded user action, with dry-run/reporting and safe retry.
3. Keep saved reads database-only. Render unresolved metadata honestly and allow an explicit retry/enrichment action.
4. Bound provider jobs by page/batch, total deadline, quota and cancellation; prove the SQLite unit of work is released before network IO.
5. Preserve global catalog identity and each owner's personal notes/ratings/links during merges. Do not replace legitimate membership semantics with simplistic title deduplication.

Validation: seed unresolved albums, install provider spies that fail on invocation, GET library/summary/detail repeatedly and prove no provider IO or unexpected writes; separate repair tests for idempotency, conflict, rollback, cross-owner personal-state preservation and bounded work.

### A04 — The architecture gate only enforces a coarse subset of the architecture it describes

**Priority:** P2 foundation. **Class:** verified enforcement gap. **Confidence:** high. **Effort:** M, can be incremental.

Evidence in `scripts/check-shared-boundaries.py`:

- `app_name(:76–83)` defines ownership as the second path component only. Town, World, Health, Pixels and shell are all `web`, so their intended internal public boundaries cannot be enforced.
- The cross-app condition explicitly exempts all `source_app == "server"` at `:128`; server identity/platform versus server Town/World/Pixels is not checked, and all outgoing server imports are allowed.
- Imports use a regex at `:11–13`, not language-aware resolution. Demonstrated `from .deps import Principal` is interpreted as importing `Principal`, and CommonJS `require(...)` yields no match.
- `import_target(:45–52)` does not resolve TS aliases. `.mts` is not a source suffix, although sink scanning recognizes it.
- Generic UI duplication checks cover a finite list of historical Finance paths/selectors only (`:25–34`,`:136–164`). A new duplicate elsewhere is outside that rule.
- Trusted Types source scanning covers Finance and `packages/*/src` (`:140–143`), not all same-origin web/Travel/Media source. Runtime CSP remains a separate defense; no exploit is claimed.
- Existing checker tests mainly exercise regex/helpers, not complete miniature module graphs through `main`.

Important correction: `export ... from` **is** recognized by the regex's `from` alternative. Do not claim that reexports generally evade this checker.

Remediation:

- Declare feature/domain ownership below physical app roots and permitted dependencies/public entrypoints.
- Parse Python imports with `ast` and TS/JS imports with the TypeScript compiler API plus configured module resolution. Account for Python relative imports, alias targets, reexports, lazy imports and deliberate generated/runtime modules.
- Constrain server composition exceptions to declared composition files/adapter layers rather than the entire root.
- Start with a reviewed inventory of existing edges and refuse **new** violations while fixing existing ones; never mass-disable the current gate.
- Test actual graph fixtures, legal and illegal imports, aliases, nested features, package-to-app leaks, cycles and exemptions. If all private code shares the CSP, give sink policy similarly explicit ownership.

### A05 — Existing tests can codify stale contracts instead of exposing drift

**Priority:** P1 with existing UX #196; systemic prevention P2. **Class:** verified test/contract defect. **Confidence:** high. **Effort:** S repair, M prevention.

Evidence: `apps/server/tests/test_composition.py:429` explicitly asserts `GET /settings/profile` is 404. `apps/web/src/app/settings/settings.registry.ts:23–25` explicitly mounts Profile in Angular. The independent browser review already reproduced navigation-success/reload-failure under UX #196; this review adds that the server assertion preserves the obsolete result.

Lesson: green tests are not automatically current product truth. Every new route should carry a route-contract example exercised through the real frontend handler with correct CSP and auth behavior. Preserve unknown-route 404s; fix the specific stale assertion with the implementation, not by deleting its meaningful neighboring assertions.

Ownership: do not create a competing Profile issue. UX #196 owns the repair; engineering work owns the route-contract generation/parity test that prevents recurrence.

### A06 — Test discovery is a separate quality gate, and currently hides Town/settings work

**Priority:** P2 before relying on broad “suite green” claims. **Class:** verified coverage/discovery gap. **Confidence:** high. **Effort:** S inventory, M genuine Town fixtures/activation.

Evidence: `tests/e2e/config.ts:29` restricts Town's project to `pixels-year`, `pixels-detail`, `pixels-life`, `hub-pixels` and `world` filenames. `town.spec.ts`, `town-checkin.spec.ts`, `town-dialogs.spec.ts` have `test.fixme` and are also outside that selector. `pixels-settings.spec.ts` is outside it too. The parent independently listed 28 selected tests from the five selected files.

Remediation:

- Publish a machine-readable mapping from route/features to selected browser stories and every excluded/quarantined story with owner/reason.
- Fail for orphan test files or unintended empty projects. Do not require every variant to run if a deliberate cheaper-layer owner proves it.
- Complete the missing Town/second-owner/reset/clock fixtures, then activate actual behaviors; removing `fixme` alone is not a fix.
- Keep expected platform-specific viewport cases distinct from silently abandoned whole journeys.

Coverage interpretation: `apps/karma.conf.js:5–7` explicitly documents that only files imported by selected specs are instrumented. `pyproject.toml` sets backend `branch = false`. Floors, statement coverage and function existence are useful but do not prove branch/race/owner invariants or whole-app inclusion. Add risk-driven coverage for lifecycle, ownership, recovery and stable contracts; do not invent new repo-wide percentage goals as a substitute.

### A07 — The reusable encrypted vault is still owned by Finance, and its public API exposes the concrete implementation

**Priority:** P2 capability foundation. **Class:** verified coupling/dependency debt. **Confidence:** high. **Effort:** L staged; a narrow port is M.

Evidence:

- `apps/finance/frontend/src/public-api.ts:13` returns `injector.get(VaultService)` with its concrete inferred type.
- Health's `HealthVault` is `Awaited<ReturnType<typeof openFinanceVault>>` (`health-store.service.ts:25`), coupling consumers to every implementation change.
- Server identity schemas import Finance KDF policy and `VaultCreateRequest` (`apps/server/identity/schemas.py:6–7`); identity admin imports Finance vault ORM/services (`admin.py:8–9`).
- Finance's encrypted persistence has a closed Finance collection union/map plus an explicit `FINANCE_FOREIGN_COLLECTIONS` set for Health (`encrypted-store.persistence.ts:5–24,78–90`). Backend allowlisting lives in another Finance file.

A future encrypted app must know which Finance paths are generic infrastructure and which are domain rules. Calling this a “public API” does not make its surface narrow or stable.

Remediation:

1. Define a small versioned `VaultRecordPort`: owner identity, lifecycle epoch, list/upsert/delete envelopes, crypto operation contract, expected revision and cancellation semantics. Keep key material inaccessible.
2. Define collection descriptors with owner, schema version/codec, limits and inclusion in full-vault export/restore. Generate/check allowlist parity; never have arbitrary clients register server-accepted plaintext schema dynamically.
3. Have current Finance implement the port behind an adapter. Migrate Health first as the second consumer, then a selected new feature.
4. Extract implementation ownership only after the seam works; preserve existing endpoints, ciphertext AAD, blind indexes, stored revisions, legacy migration behavior and account deletion.
5. Keep Finance cashflow/planning/import domain APIs out of the generic vault port.

Validation: compatibility with existing ciphertext fixtures, cross-owner isolation, lock-race tests, restore of every collection, unknown-collection rejection, revision conflicts, malformed/oversized input, and owner change during all operations.

### A08 — Generic UI is a growing mixture of presentation, platform ports and domain rules

**Priority:** P2 design boundary. **Class:** verified package cohesion problem, not proof of runtime failure. **Confidence:** high. **Effort:** M, after contract ownership is decided.

Evidence: `packages/ui/src/public-api.ts:73` exports `FinanceTripSpendRegistry`; `:75–107` exports Pixels activity caps, scores, life-year geometry and domain types. `SESSION_CONTEXT` in the UI package defines the injection token for the auth-owned port. UI is acting as the permissioned “everything shared” package.

This makes new features cheap to import initially but expensive to reason about later: developers cannot tell which capabilities are app-neutral, app-owned, client-only or sensitive merely by importing `@vivek/ui`.

Remediation: distinguish presentation primitives, platform ports and domain public read contracts. Use a small number of clear entrypoints/subpaths; do not create a package per tiny helper. Domain scoring should stay with its domain unless it is intentionally a stable shared rule. Finance-trip totals require a client-only contract with explicit owner/lifecycle; putting it in a generic UI barrel does not enforce that property.

### A09 — World contains an orphan Angular wrapper beside its real controller composition

**Priority:** P2 quick simplification. **Class:** verified orphan integration path. **Confidence:** high. **Effort:** S/M.

Evidence:

- `apps/web/src/app/world/data/world-controller.service.ts:9–35` constructs a WorldController and wires session/storage cleanup.
- A repository symbol search finds only the service declaration, no consumer or public export.
- `world/ui/world.component.ts:165–177` independently constructs the controller in `connectController`, and its constructor wires its own lifecycle paths.

Consequence: two authoritative-looking setup examples can diverge. A future contributor may fix the unused one or add a third. The unused wrapper may tree-shake away; therefore do not call it demonstrated bundle bloat.

Remediation: choose exactly one composition/lifecycle seam and remove the orphan after consumer verification. Keep the pure controller injectable for testing; UI should own DOM, not duplicate data-session composition. Validate disposal, lock, owner change, retries, URL state and all existing World behavior before deleting the alternate path.

### A10 — Large files are concentrated around real mixed responsibilities

**Priority:** P2 in touched domains; avoid a single mass-refactor PR. **Class:** verified responsibility concentration; exact bloat/deletion percentage unmeasured. **Confidence:** high. **Effort:** M/L, staged.

Examples from the parent measurements and inspected code:

- Media `services/providers.py` (~2,249 physical lines): multiple provider parsers, network/pacing/cache/search aggregation, ranking, artwork and detail normalizers.
- Media `services/records.py` (~2,177): user-entry mutation, global catalog identity/reconciliation, music membership repair, episode/state editing, queries and response assembly.
- World UI component (~1,005): DI/controller creation, camera/input handling, loading/lifecycle state, URL persistence, canvas/render scheduling, concepts and derived data.
- Finance transactions/planning/portfolio and Travel trip/PTO have long components/templates/styles; PTO's inline template/style inflate its raw TypeScript size, but it still also owns loads, forms, errors, previews and policy presentation.

Extract by decisions that change independently:

- Provider modules by provider protocol, with a small typed adapter contract and shared transport policy. Keep provider-specific parsing tests next to adapters.
- Catalog identity/reconciliation, personal entry mutation, membership/episode behavior, read assemblers and explicit repair jobs as separate Media responsibilities with transaction ownership documented.
- World DOM/pointer/canvas driver separate from data/lifecycle coordinator and pure camera/engine math.
- App-specific feature facades/view models for orchestration; small fields/form validators stay plain typed functions. Reuse display/interaction primitives that actually recur.

A split that only moves methods into `utils.ts` or exports dozens of private helpers is not an improvement. Before extraction, identify current behavior owners and tests; after extraction, remove the old path and test that callers use the new seam.

### A11 — Async liveness and cancellation policies differ across modules

**Priority:** P2 reusable reliability contract. **Class:** verified policy divergence; specific hung-request UI consequence is a risk until reproduced. **Confidence:** high. **Effort:** M.

Evidence:

- Hub's `hub-load.ts` has an explicit eight-second deadline, AbortController transport abort, caller cancellation distinction, status mapping and finally cleanup.
- Pixels `pixels-data.service.ts:174–180` calls `firstValueFrom(http.get)` with no timeout/caller cancellation. `load` executes source windows sequentially; `joinFinance(:135)` creates local controllers but does not connect them to lifecycle cancellation.
- Health independently races timeouts around store reads; the race does not cancel or prevent the subsequent mutation (A02).
- World has separate budget abort/epoch logic (`world-controller.ts:392–427`) and a UI slow timer. These policies are similar in purpose but not identical.

Remediation: standardize small composable operations for deadline + abort + owner/epoch eligibility + disposal. Preserve app-specific distinctions among unavailable, partial, stale, locked, expired and corrupt. Use one overall user-action deadline with bounded per-source work when several windows/providers are involved; do not let N eight-second windows imply N×8 seconds unnoticed. Retain independent-source recovery on the Hub.

Validation: hold responses, advance virtual time, cancel navigation, switch owner, lock, throw a parse error, abort an already-complete request, and verify cleanup/publication. Timer logic needs behavior tests rather than host-speed assertions.

### A12 — Typed declarations are sometimes assurances without runtime or implementation parity

**Priority:** P2 as contracts are touched. **Class:** verified weak contract arrangement; broad defect rate not measured. **Confidence:** high. **Effort:** M phased.

Evidence:

- `fetchHubSummary<T>` trusts `await response.json() as T`; malformed responses can satisfy the compiler while violating required fields.
- Media APIs often accept/return dictionaries and service-assembled bodies; frontend interfaces are maintained independently.
- Travel/Media `.mjs` helpers have hand-maintained `.d.mts` counterparts (e.g. `tag-model.mjs` and `tag-model.d.mts`). The main TS compilation does not establish implementation/declaration equivalence.
- TypeScript `strict` is enabled, but `noUncheckedIndexedAccess` is not; Python mypy accepts missing third-party stubs and lacks required typed function definitions. Existing `any` debt is ratcheted, not eliminated.

Remediation:

1. Use typed request/response DTOs at API boundaries, with generated frontend DTOs or explicit parity checks from OpenAPI after stable backend schemas exist.
2. Validate external-provider payloads and sensitive persisted/encrypted data using small owned codecs. Schema versions should carry migration/unsupported handling.
3. Migrate new/touched JS helpers to one typed source or enable `checkJs` with checked JSDoc/generation. Keep Node tests runnable; avoid a repository-wide conversion without behavior value.
4. Tighten types first at public interfaces, money/date/ID boundaries and async result unions. Introduce stricter checks in bounded directories before raising global strictness.

Do not generate a huge universal client or validate every internal pure function repeatedly. Focus on places untrusted or versioned data enters a module.

### A13 — Stale comments and internal spec IDs still serve as misleading operational authority

**Priority:** P2 quick repair alongside the owning feature; P3 maintenance policy. **Class:** verified misleading state. **Confidence:** high. **Effort:** S inventory and targeted edits.

Examples:

- `apps/travel/frontend/src/trip-costs.component.ts:210–220` says K1/PR145 is unmerged and returns null despite the registry existing.
- `apps/web/src/app/search/search-dialog.component.ts:28–35` claims Finance name streams do not exist; `finance.service.ts:108–114` exposes them.
- `apps/web/src/app/town/health/health.constants.ts:29–50` leaves design-placeholder names, although issue90 settled display names.
- `apps/server/town/service.py:39–43` returns empty passive maps with both sources “available”; future-work comments do not express a user-facing unavailable/incomplete state.
- Several comments explain old branch/PR choreography or nonexistent review queues instead of current invariants.

Remediation: remove elapsed scheduling comments; retain explanation of non-obvious rules, privacy boundaries, compatibility constraints and algorithms. Every real TODO gets an owning live issue and a completion condition. Delete a TODO only when its behavior is implemented or explicitly deferred—not to improve a comment count. Do not delete mathematical/protocol documentation as “noise.”

### A14 — Read-model reuse must preserve domain meaning

**Priority:** P2 correctness during consolidation. **Class:** verified semantic collision, plus architectural caution. **Confidence:** high. **Effort:** M in #81.

Evidence: `apps/web/src/app/town/weeks-kept.ts:1–16` computes the maximum habit streak expressed in weeks and explicitly says it is not Finance. Current Town `town.component.ts:130–135` uses that helper for Treasury. World also consumes Town helpers. Existing accepted Treasury behavior requires consecutive completed budget-kept weeks from Finance.

The temptation to reuse a similarly named helper has already produced the wrong meaning. Introduce an explicitly named Finance-budget run normalizer and keep habit semantics separately named. Shared read adapters may reuse source facts/queries; they must not force Pixels activity scoring, Town XP, World fog and Finance budget streaks into one universal score or date convention.

Validation: give a user long habit streaks but no kept Finance weeks and vice versa; assert different results and unchanged Town XP. Pin founding dates, current versus completed weeks, timezones, missing source status and refund semantics.

### A15 — Feature registration is scattered across source and tooling

**Priority:** P2 feature-addition cost. **Class:** verified structural debt, informed by route/test/schema lists. **Confidence:** high. **Effort:** M/L.

Evidence: a new feature touches Angular routes, server `routes.json`, shell navigation, settings/Hub composition as relevant, model metadata in `apps/server/schema.py`, collection allowlists, test project domain unions/switches, fixture resets and CI/test documentation. The four-domain union in `tests/e2e/config.ts` and explicit metadata assembly are reasonable for today's suite but not a discoverable extension contract.

Remediation: publish a small feature manifest/registration checklist covering route examples, public API, privacy/data plane, navigation placement, read adapters, schema/collection descriptor, lifecycle cleanup and test selection. Generate/check redundant registrations where schemas match. Supply one executable reference vertical slice rather than a huge code generator. Some cross-cutting security/deployment registration should stay explicit and reviewed.

Measure: files outside the feature touched, number of manual contract copies, time to targeted verification, and count of changes needed in existing features. Use Sidequests or Cards as a later real trial only after lifecycle/route boundaries are reliable. Do not promise that an arbitrary new payment provider or data model becomes trivial.

## What not to consolidate or delete

1. Finance money effects, Travel multi-currency costs and speculative Planning are separate data planes. Reuse safe primitives; never merge their totals implicitly.
2. Town habit streaks, completed Finance weeks, Pixels Sunday-start view and World ISO-week generation have different meanings. Reuse civil-date primitives with explicit named conventions.
3. Health and reflection plaintext stay browser-local; cross-domain views get stages/counts or intentionally narrow aggregates. A universal plaintext event warehouse defeats this boundary.
4. Provider adapters share deadlines, budgets and result contracts; provider parsing and identity rules remain specific.
5. SQL read adapters in the server may deliberately compose owner-scoped source data in one database. The fix is explicit ownership and stable projections, not one network service per app.
6. Applied migration files are historical execution records; do not reformat/delete them to reduce LOC. Preserve schema-head, seed/rehearsal, rollback compatibility and data-preservation evidence.
7. Wrapper/reexport files are not inherently duplication. `packages/ui/src/pixels/pixels-score.spec.ts` imports the owned spec; it does not copy its assertions. Remove discovery shims only when configuration directly discovers the owner.
8. Existing pure Node tests generally do assert real outputs and useful edge cases; the presence of source-scanning tests does not make all tests fake. Security/config source assertions are useful supplementary controls, not user-journey substitutes.
9. Graceful stale/unavailable state distinctions are deliberate resilience, not boilerplate to erase. Consolidate mechanics while preserving those meanings.
10. Keep one FastAPI process/SQLite database and one Angular build unless actual requirements contradict that operational model. More packages, services or event frameworks are not automatic debt reduction.

## Suggested independent remediation sequence

**Wave 0 — restore truth and safety:** A01 multi-subscriber lifecycle; A02 Health publication guards; A03 saved-read/provider separation; UX196 route assertion+manifest repair; discover all test files. Use focused regression probes before changing design.

**Wave 1 — make boundaries real:** resolve feature ownership graph, strengthen architecture checker; introduce narrow vault/lifecycle ports; unify collection metadata/export coverage; define route parity and test discovery contracts. Constrain platform-to-domain exceptions.

**Wave 2 — remove competing implementations:** one World composition seam; one lock/session transport adapter; consistent deadline/eligibility helpers; delete stale branch comments and verified orphan paths. Existing app journeys adopt them through small PRs.

**Wave 3 — separate responsibility clusters:** typed Media provider adapters and explicit catalog repair; Finance/Travel/World view-model/controller boundaries; app-owned source projections and response DTOs. Preserve meaningful tests and transaction/privacy semantics.

**Wave 4 — validate extension cost:** one selected small real feature built through the new contracts, with all manual integration touchpoints and test times recorded. Revise the reference pattern before scaling to more features.

For every extraction: record surviving behavior owner, callers migrated, old path removed, compatibility preserved, test evidence and any remaining deliberate duplication. “Created a shared helper” is not completion if consumers still carry their own version.

## In-memory proof commands and observed outputs

These probes execute existing function/class logic with controlled synthetic boundaries. They are evidence for the specific mechanisms only. They are not committed tests, production runs, or a substitute for the required AGENTS suites.

### Callback registration collision

From repository root:

```bash
node - <<'JS'
const fs=require('fs'),ts=require('typescript'),vm=require('vm');
const source=fs.readFileSync('apps/finance/frontend/src/app/crypto/lock-finance.ts','utf8');
const start=source.indexOf('let dropSnapshots');
const end=source.indexOf('\nfunction postLock',start);
const sample=source.slice(start,end)+'\nexport const dispatchForReview = () => dropSnapshots();';
const compiled=ts.transpileModule(sample,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const box={exports:{}};vm.runInNewContext(compiled,box);
const hits=[];
const unbindA=box.exports.bindLockSnapshots(()=>hits.push('Finance'));
const unbindB=box.exports.bindLockSnapshots(()=>hits.push('Pixels'));
box.exports.dispatchForReview();
console.log('Both live:',JSON.stringify(hits));hits.length=0;
unbindB();box.exports.dispatchForReview();
console.log('Pixels removed, Finance still live:',JSON.stringify(hits));
unbindA();
JS
```

Observed:

```text
Both live: ["Pixels"]
Pixels removed, Finance still live: []
```

### Health late publication after abort and lock

```bash
node - <<'JS'
const fs=require('fs'),ts=require('typescript'),vm=require('vm'),rxjs=require('rxjs');
const code=fs.readFileSync('apps/web/src/app/town/health/health-store.service.ts','utf8');
const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
(async()=>{
 let present=true,finish,started;
 const startedPromise=new Promise(r=>started=r);
 const pendingDecrypt=new Promise(r=>finish=r);
 const row={client_id:'hlt_synthetic',ciphertext_b64:'synthetic',schema_version:2,key_version:1,revision:1};
 const vault={listRecords:c=>rxjs.of(c==='health_stats'?[row]:[]),decryptPayload:()=>{started();return pendingDecrypt;}};
 const box={exports:{},setTimeout,clearTimeout,require:name=>{
  if(name==='@angular/core')return {Injectable:()=>x=>x,Injector:class{},inject:()=>({})};
  if(name==='rxjs')return rxjs;
  if(name.includes('finance/frontend/src/public-api'))return {financeVaultPresent:()=>present,openFinanceVault:async()=>vault};
  throw Error(name);
 }};
 vm.runInNewContext(js,box);
 const store=new box.exports.HealthStoreService();
 const ctrl=new AbortController();
 const pending=store.load({signal:ctrl.signal});
 await startedPromise;present=false;ctrl.abort();
 finish({kind:'weight',kg:70,measured_on:'2026-10-01',logged_on:'2026-10-01'});
 const result=await pending;
 console.log(JSON.stringify({aborted:ctrl.signal.aborted,present,result:result.state,retained:store.statsSnapshot.length}));
})();
JS
```

Observed:

```text
{"aborted":true,"present":false,"result":"ready","retained":1}
```

### Import scanner limitations

```bash
python3 - <<'PY'
import importlib.util
spec=importlib.util.spec_from_file_location('checker','scripts/check-shared-boundaries.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for snippet in [
    'from .deps import Principal',
    "const a = require('../../../../finance/frontend/src/app/services/finance.service')",
    "export * from '../../../../finance/frontend/src/app/services/finance.service'",
]:
    print(snippet, '=>', [a or b for a,b in m.IMPORT_RE.findall(snippet)])
print('Owners:',m.app_name(m.ROOT/'apps/web/src/app/town/x.ts'),m.app_name(m.ROOT/'apps/web/src/app/world/x.ts'))
PY
```

Observed: relative Python is misread as `Principal`; CommonJS require has no match; `export ... from` correctly matches the relative path; both nested domains have owner `web`.

### Orphan World wrapper search

```bash
rg -n 'WorldControllerService' apps packages tests --glob '*.ts'
```

Observed one occurrence: its class declaration. Real composition is `connectController()` in the UI component. This proves no statically named consumer was found; it does not claim an arbitrary reflective string lookup is impossible.

## Review limits and unresolved questions

- No complete clone detector, dependency-cycle analyzer, complexity benchmark, bundle-tree analysis or database workload benchmark was run. Do not invent duplication percentages or deletion targets from this review.
- No real private data was inspected. Neither store probe demonstrates an existing production data breach.
- No full suite pass/fail is claimed here. Other agents' test state and the parent's independent verification must be reported separately.
- Current local MusicBrainz read-side repair must be compared with the intended final branch before describing deployment behavior.
- A generated API strategy requires the backend's intended DTO ownership and compatibility policy first. One shared codec library does not solve a muddled domain contract.
- Choose lifecycle semantics before moving files. Otherwise extraction can preserve today's races under better names.
- The goal is lower change amplification for common feature classes with explicit escape hatches for novel requirements. “Any feature is cheap, regardless of what it is” is not an engineering guarantee that a finite architecture can make.
