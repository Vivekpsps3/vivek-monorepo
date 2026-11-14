# Technical-debt assessment and independent-review synthesis

Review period: 2026-11-08–09 UTC. Owner objective: make future feature additions
cheap and easy, with reusable infrastructure and understandable domain modules.
The [remediation plan](2026-11-09-remediation-plan.md) turns each finding into
ordered work; the [independent review](2026-11-08-independent-review.md) preserves
the second agent's complete investigation. GitHub issues are live status; this is
a dated evidence record.

## 1. Executive assessment

The repo is not missing an architecture. It has one Angular build, an explicit
FastAPI factory, one SQLite lifecycle, app-owned Finance/Travel/Media code, public
frontend entry points, generic UI controls, pure math modules, encrypted-vault
storage and significant behavioral coverage. Replacing all of that would spend
substantial effort re-proving existing guarantees.

Its debt is concentrated in five areas:

1. **Lifecycle contracts are incomplete.** Several consumers independently
   interpret lock/session events, and the ostensibly reusable callback binding
   supports only one subscriber. A Health load can publish after invalidation.
2. **Declared architecture is stronger than enforced architecture.** The import
   check does not resolve the language graphs and broadly exempts server code;
   Town/World/Pixels/Health share app roots with no equivalent feature-level rule.
3. **The same contract has multiple handwritten representations.** Routes,
   collection membership, DTOs, test discovery and some lifecycle policies can
   drift independently. Profile's reload failure is a concrete result.
4. **Implementations accumulate responsibilities and competing entry points.**
   Provider adapters, catalog repair, entry commands, frontend rendering and async
   orchestration are concentrated in large files; an unused World wrapper coexists
   with direct component composition.
5. **Green checks have a narrower meaning than the roadmap assumes.** Some tests
   assert obsolete behavior, browser selectors omit known suites, JS and orphan
   files need explicit tool ownership, and coverage is not whole-app branch proof.

The expensive pattern is not simply “many lines.” It is needing to understand or
change several independent policies to make one feature safe. Reducing those
independent decisions is the main optimization target.

## 2. Scope, evidence and limits

The parent reviewed code, repository guidance, package/configuration boundaries,
root tooling and live issue bodies. A separately spawned agent performed a
read-only antagonistic investigation and executed controlled probes of unchanged
application classes. The parent cross-checked the central findings in source.
The earlier [frontend walkthrough](https://github.com/Vivekpsps3/vivek-monorepo/blob/5bc07c2aab4345446f408d6e331cd1bef193f4d6/planning/frontend-ux-review-2026-11-08.md) supplies
actual synthetic browser observations for route and UX findings.

The inspected checkout was `8b53c8005008839208bc3d9160fb2c02078119f7`, with concurrent
local test edits and this session's documentation edits. Earlier GitHub main was
`ab67b90fdcbcea7802d6ee724585127181959f9c`; the local MusicBrainz changes extend that
baseline. Findings from local code are not automatically deployed-main findings.
No checkout reset, merge, rebase, source cleanup, production mutation, secret
inspection or deployment was performed for this review.

Confidence labels:

- **Reproduced:** actual controlled execution or browser behavior establishes the
  stated result. A synthetic probe is labelled as such, not a production incident.
- **Verified source:** the code/contract/configuration fact was directly inspected.
- **Risk:** a credible failure or cost mechanism needing broader reproduction or
  measurement; do not describe it as a confirmed exploit or measured slowdown.
- **Recommendation:** a proposed improvement; not every suggestion is a release gate.

This was not a whole-repository semantic clone scan, vulnerability assessment,
load test, dependency audit, production restore drill or exhaustive browser run.
No full-safety or “everything is now fixed” claim follows from publishing the report.

## 3. Highest-priority correctness findings

### F-01 — Lock callback registrations overwrite one another

**Reproduced at the callback-contract level; priority P0 for repair.**
[Lock binding](../../apps/finance/frontend/src/app/crypto/lock-finance.ts) stores one
mutable `dropSnapshots` callback. [FinanceService](../../apps/finance/frontend/src/app/services/finance.service.ts)
and [PixelsDataService](../../apps/web/src/app/pixels/pixels-data.service.ts) both
register. The separate agent executed unchanged transpiled source with controlled
imports: Finance registration followed by Pixels registration calls only Pixels;
disposing Pixels then calls neither, despite the Finance registration still being live.

This is a verified multi-subscriber contract defect. It does not establish a
production plaintext leak: other lock paths also clear data, and the probe did
not reproduce every browser/session path. That distinction must survive issue
summaries and PR descriptions.

**Remedy:** TD-02/TD-09, [#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198).
Use owned multi-listener invalidation, synchronous key wipe, independent listener
failure handling and disposal by subscription identity. Do not merely add another
consumer to the current slot or duplicate another storage-event workaround.

### F-02 — A late Health decrypt can publish after abort/lock

**Reproduced in a controlled real-class probe; priority P0 for repair.**
[HealthStoreService](../../apps/web/src/app/town/health/health-store.service.ts)
checks signal abortion before decrypting but writes `stats`/`prs` after awaited
decryption without another signal/owner/epoch check. It lacks immediate lock/session
subscriptions. Its deadline uses `Promise.race` but does not inherently stop the
losing work. [VaultService](../../apps/finance/frontend/src/app/crypto/vault.service.ts)
checks DEK presence when starting decrypt; that does not invalidate a crypto promise
already holding a key reference.

The independent probe held decryption, aborted the signal and changed vault presence
to false, then resolved decryption. The store returned ready and retained one synthetic
record. This establishes late publication/retention in that controlled sequence;
there is no claim of network exfiltration or a production-browser incident.

**Remedy:** TD-03/TD-08/TD-10, #198 with Health #90 and security #121. Invalidate
memory synchronously, bind work to owner/session/lock generation, and validate the
generation after async boundaries and immediately before storing or returning data.
Audit load, save, delete and conflict-refresh paths; a check only at entry is insufficient.

### F-03 — A saved-library GET performs repair and can call providers

**Verified call path in current local source; priority P0/P1 correction.**
[Media library route](../../apps/media/backend/routers/journal.py) calls
`repair_musicbrainz_albums` for mixed/music reads before pagination.
[The repair](../../apps/media/backend/services/records.py) enumerates the user's
saved albums, can repair catalog/link identity, can release/commit the unit of work,
and can call `providers.lookup_detail`. A request for a bounded saved list therefore
has a path to unbounded-by-page repair work and external IO.

This contradicts the stated DB-only saved-read boundary. It couples viewing to
provider availability and expands transaction/latency behavior. The exact live
latency and deployed status were not measured. Explicit discography metadata browsing
can legitimately fetch providers; its hidden repair/mutation still needs a deliberate
contract. Catalog identity repair is useful;
the issue is its placement on ordinary reads.

**Remedy:** TD-04/TD-28, product #85 with #200 extraction support. Make saved reads
DB-only. Put external repair behind a deliberate bounded operation with progress,
retry, concurrency handling and preserved catalog/user history. Do not remove the
identity fix by deleting data or silently leaving ambiguous duplicates.

## 4. Contracts, boundaries and correctness of verification

### F-04 — Profile contract drift is preserved by a passing test

**Reproduced browser behavior plus verified assertion.** Angular's
[settings registry](../../apps/web/src/app/settings/settings.registry.ts) mounts
Profile; [server routes](../../apps/web/routes.json) omit it. In-app navigation
works; fresh/reloaded `/settings/profile` returns HTTP404. More seriously,
[server composition tests](../../apps/server/tests/test_composition.py) explicitly
expect that404. A green test can preserve the wrong product behavior.

**Remedy:** visible repair in #196; TD-01/TD-06/TD-16 in #197/#199. Correct behavior
and its assertion together, then add a parity contract that distinguishes mounted,
reserved, alias and unknown routes. A blanket document catch-all would hide the drift.

### F-05 — Boundary enforcement has structural blind spots

**Verified parser probes and source configuration.**
[The checker](../../scripts/check-shared-boundaries.py) uses a regex rather than
resolved imports, exempts all `source_app == 'server'`, and treats every `apps/web`
feature as the same app. `require` is not captured; aliases return no target;
Python relative imports are not resolved. TypeScript `export … from` is captured
by the current regex and must not be falsely reported as a universal bypass.

Legitimate server composition necessarily imports domains. The missing piece is
an explicit distinction between composition/aggregate adapters and platform code,
and between separate feature modules beneath the same root. There is no claim
that every existing cross-feature import is wrong or malicious.

**Remedy:** TD-05, #197. Use language-aware extraction/resolution, an explicit allowed
graph and negative fixtures. Preserve legitimate public API/composition edges and
add feature-level roots. Do not automatically break server aggregation or require
domains to import the shell to satisfy a superficial package rule.

### F-06 — Generic UI contains domain capabilities and rule tables

**Verified public exports.**
[UI public API](../../packages/ui/src/public-api.ts) exports Finance trip-spend
contracts and Pixels score/geometry functions. These are reused, but their ownership
is not generic presentation. New domains may follow this precedent and turn UI into
a catch-all dependency. [Session contract](../../packages/auth/src/session-contract.ts)
and its Angular token are better examples of an explicit capability boundary.

**Remedy:** TD-05/TD-08/TD-31. Draw the allowed graph first. Put reusable neutral
contracts in a small appropriate owner and keep feature rules feature-owned.
Preserve compatibility exports while migrating actual consumers, then remove them.
Moving files without changing dependencies provides little benefit.

### F-07 — A concrete Finance vault service is the cross-feature interface

**Verified API shape; extension-coupling risk.**
[Finance public API](../../apps/finance/frontend/src/public-api.ts) returns the
concrete VaultService from `openFinanceVault`; Health derives a port from that
return type. Identity/backend storage code also retains Finance-owned KDF/wrap/model
dependencies. The reusable encrypted storage capability is broader than Finance,
but its public contract is not yet a narrow independently owned capability.

**Remedy:** TD-07/TD-08. Define minimal owner-aware record/lifecycle interfaces,
including browser-local codec-backed reads/writes or scoped encrypt/decrypt without
key exposure; envelope transport alone is insufficient for Health. Use the current
Finance implementation behind them and test at the adapter. A
later ownership extraction is justified only once the interface is stable. Keep
AES-GCM/AAD/revision/KDF/wire compatibility; this report is not a crypto rewrite.

### F-08 — Encrypted collection registration is scattered

**Verified multiple source representations; omission risk.** Backend
[allowlists](../../apps/finance/backend/services/encrypted_storage.py), Finance's
[type union/bags/foreign exclusions](../../apps/finance/frontend/src/app/crypto/encrypted-store.persistence.ts),
Health constants and future recovery enumeration encode overlapping policy. The
Finance-vs-Health subset distinction is intentional; it should be declared, not erased.

**Remedy:** TD-07 and security #121. Version a small declarative collection contract
with explicit owner/subset/schema/export/reset semantics; generate/check appropriate
language views. Unsupported/foreign ciphertext needs an explicit preservation policy.
Never let “clean up unknown collections” become silent deletion or decryption.

### F-09 — Test discovery does not cover all intended screens

**Reproduced discovery.** `playwright --list` for the Town wrapper reports28 tests
in five Pixels/World files. [The selector](../../tests/e2e/config.ts) excludes three
legacy Town files and Pixels settings; the Town files also contain `test.fixme`.
The harness/clock exists but Town-specific seeds and journeys still need work.

**Remedy:** TD-14 with #81/#196/#125, under #199. Supply actual fixtures and make
tests run; prove discovery with an inventory. Avoid a “remove all fixmes” change
that creates failures and then broadens mocks or weakens assertions to get green.

### F-10 — Tool coverage is implicit and uneven

**Verified configuration; exact missing source inventory is a work item.** ESLint
ratchet targets TS/templates, though shipped pure helpers use MJS. Application tsc
walks its import graph, so an orphan source file can escape; the standalone package
config includes browser/auth/UI `src` paths, with other modules relying on imports.
Media's component behavior is largely covered through browser/pure-model tests rather
than a separate Media Karma component project. This is a coverage ownership question,
not proof every Media component is broken or untested.

**Remedy:** TD-13/TD-15, #199. Enumerate shipped sources and which tools actually
analyze/execute them. Add declared ownership for MJS, adapters, configuration and
orphan candidates. Environments and generated/declaration exclusions must be explicit.

### F-11 — Coverage metrics are easily overinterpreted

**Verified configuration/baselines, not a fresh coverage measurement.** Python
coverage is statement-based. Karma measures loaded sources, not all app files.
Current committed floors are Finance83.28%, Travel80.41%, Media70.60%, Server61.53%.
Historical reports show other measurements; those are not current run results.
Two Town xfails describe an optional UTC clamp; they need an explicit contract
disposition, not automatic production changes to satisfy old speculative acceptance.

**Remedy:** TD-15/TD-16. Improve risky branch and concurrency coverage, report
denominators, preserve meaningful assertions and ratchet actual gains. Do not lower
floors, relabel failures, or confuse condition-specific viewport exclusions with
unimplemented whole journeys.

## 5. Responsibility concentration and reuse

### F-12 — World has competing composition paths

**Verified symbol/use search.**
The route [World UI](../../apps/web/src/app/world/ui/world.component.ts)
constructs the controller through `connectController`. The unused root
`WorldControllerService` wrapper had no consumers and was removed; do not put it
back as a singleton. The UI also owns keyboard,
pointer/camera, animation scheduling, source lifecycle and rendering orchestration.

**Remedy:** TD-11/TD-21. Choose one correctly scoped composition path and remove
the other, then extract named input/render owners with explicit dispose contracts.
Adopting a root singleton blindly could retain state across routes; deletion should
follow a consumer/protocol inventory, not a filename-based dead-code tool alone.

### F-13 — Media provider and record modules combine multiple change axes

**Verified code organization.** `providers.py` has2249 physical lines and provider
search/detail/portrait/page parsing/cache/deadline logic. `records.py` has2177 lines
and catalog identity/reconciliation, persistence, entry/progress commands, reads and
serialization. Multiple functions are substantial; line count alone does not prove
a branch or domain rule can be discarded.

**Remedy:** TD-17/TD-18/TD-28. Provider-specific adapters plus small shared transport
primitives; owned catalog identity, query, entry, progress and projection modules.
Preserve MusicBrainz release-group/pressing semantics and existing owner/Undo tests.
Do not introduce a universal database repository just to make files shorter.

### F-14 — Frontend screens combine state, transport and presentation

**Verified organization; decomposition benefit needs consumer measurement.** Finance
transactions1170 lines plus758 template and1174CSS; Planning1022 plus656 template;
Travel PTO1114 including inline presentation; Trip756 plus873 template; World1005.
Some responsibilities already have pure helpers and importer workflows. Reuse those
rather than recreating “cleaner” competing versions.

**Remedy:** TD-19–TD-25. Narrow query/command facades, domain-specific form/editor
subcomponents, one async owner, and small shared interaction primitives. Extract
when there are independent reasons to change or real repeated behavior; every
extraction should leave actual migrated consumers and a clear deletion path.

### F-15 — Lock and bounded-load plumbing is repeated with different semantics

**Verified repeated code; some consequences remain risks.** Hub/Pixels/World each
interpret storage/session events. Pixels network reads lack the explicit bounded
abort/deadline ownership used in Hub; discarded work may keep running. A generic
`fetch<T>` cast also does not validate response payloads at runtime.

**Remedy:** TD-09/TD-10/TD-12. Share event validation/lifecycle and bounded-work
mechanics while letting features interpret locked/absent/stale/unavailable states.
Decode critical external/decrypted payloads at boundaries, not with a claim that a
TypeScript generic proves network shape. Avoid a universal state framework.

### F-16 — Typing debt concentrates at useful extraction boundaries

**Verified recorded baselines and source examples.** The broad frontend baseline
records360 `no-explicit-any` findings. Persistence bags and decrypted/HTTP payloads
use weakly typed structures. Mypy baseline records87 findings, often ORM inference.
Not every finding has equal runtime significance; constructor-injection preference
has much lower priority than an unknown collection payload cast.

**Remedy:** TD-12/TD-35. Type payload maps and narrow unknown values at boundaries,
then pay down touched code. Keep ratchets and reduce baselines when findings shrink.
Do not mass-reformat or enable strictness flags globally before owning the migration.

### F-17 — Styling and interaction contracts are repeated

**Verified overlapping surfaces; not every wrapper is duplication.** Global imports,
shared controls, per-domain CSS and large component overrides all participate in
page/form styling. The frontend walkthrough shows hierarchy and interaction drift.
A small `showMoney` wrapper that converts a Travel decimal string to canonical cents
is a useful adapter, not evidence of a duplicate money engine.

**Remedy:** TD-24/TD-25/TD-26 and #196. Define CSS layers/ownership, preserve shared
tokens, reuse error/focus/footer behavior, and retain domain-specific form rules.
Check themes, widths, dialogs and forced/reduced settings when moving style rules.

## 6. Documentation, cleanup and operational debt

### F-18 — Comments retain obsolete dependency/decision narratives

**Verified examples.** Travel's spend lookup still says K1 is unmerged;
search says existing Finance streams do not exist; Health badge copy waits on
already settled design names. Some code comments carry spec section IDs or work
history without a current invariant. These comments can produce wrong engineering
choices, as demonstrated by helper-only integrations remaining unfinished.

**Remedy:** TD-29/TD-30. Replace stale claims with current invariants and owned issue
links; move historical decisions to dated records. Keep why-comments about exact
money math, date rules, key handling, revision conflicts and migration constraints.
A global “delete comments” pass would destroy valuable safety context.

### F-19 — Onboarding and quality summaries drift from source

**Verified examples.** `ADDING_A_BANK_IMPORT.md` describes older expense-only and
skipped-credit behavior, while current parsers/architecture distinguish refunds,
payments and ambiguous credits. Quality prose says package findings are zero,
while the committed package baseline currently records one. Backup retention
contradictions were corrected earlier in this session; broader historical docs
remain dated evidence, not current commands.

**Remedy:** TD-30. Keep one current guide per operational/development contract,
generate volatile counts or link authoritative files, validate links and relevant
examples. Prefer current tests/types as contract evidence over old planning snippets.

### F-20 — Feature addition still crosses many central declarations

**Verified registration sites; measured feature-change cost still needed.** A new
domain may touch Angular composition, server document routes, app switcher, settings,
API composition, schema/owner registration, account deletion, collection policies,
Hub/search adapters, seeds, lint/type/spec discovery and deployment checks. Some
central composition is correct; repeating the same facts independently is the debt.

**Remedy:** TD-00/TD-31/TD-37. Publish the feature-addition checklist and exercise a
disposable extension. Keep optional capabilities optional. Reduce repeated semantic
registrations, not legitimate domain tests or the explicit root wiring boundary.

### F-21 — Operations remains part of feature reliability

**Verified open obligations, not a new production audit.** One SQLite lifecycle,
migration rehearsal, verified local snapshots and trusted release checks are useful.
Off-host recovery, independent monitoring/alert evidence, retention reconciliation,
provider budgets and capacity exercises remain in #125. Adding private collections
without export/reset/recovery coverage increases the cost of repairing mistakes.

**Remedy:** TD-27/TD-33/TD-34/TD-36. Preserve immutable applied revisions, run seeded
upgrade/downgrade-compatibility evidence as required, test reset/delete ownership,
measure actual recovery and keep secrets out of shared logs/artifacts. Avoid a
microservices/database migration presented as a code-cleanup prerequisite.

### F-22 — Similar helper names mask different domain meaning

**Verified local semantic mismatch.** [Town weeks-kept](../../apps/web/src/app/town/weeks-kept.ts)
computes a maximum habit streak in weeks, and current local Treasury presentation
uses it. Accepted Treasury behavior requires consecutive completed Finance budget-kept
weeks. World also consumes Town helpers, so changing the existing helper silently
would break another meaning. This is an example where more indiscriminate reuse
would make correctness worse.

**Remedy:** TD-26 in #81 with #197/#200. Add an explicitly named budget-run normalizer,
keep habit semantics separate, and test users with long habits/no budget weeks and
the reverse. Preserve founding/current/completed-week and timezone rules. Do not
merge Pixels, Town, World and Finance into a universal score/date convention.

## 7. Measured inventory and what it does not prove

The [inventory JSON](evidence/source-inventory-2026-11-08.json) was generated from
`rg --files apps packages scripts`, counting physical lines in selected source
suffixes, excluding dependency/build/vendor directories and separating path-labelled
tests and Python migrations. Comments, blanks, CSS and templates count. Declaration
files with suffixes outside the selected set do not. Concurrent local changes mean
this is an observed checkout snapshot, not a pristine main benchmark.

| Domain | Production-labelled lines | Test-labelled lines | Migration lines |
| --- | ---: | ---: | ---: |
| Finance | 35,271 | 25,339 | 937 |
| Media | 13,414 | 9,949 | 0 |
| Travel | 13,236 | 9,135 | 0 |
| Server | 8,971 | 9,173 | 1,274 |
| Root web | 16,908 | 10,643 | 0 |
| Public site | 873 | 208 | 0 |
| Shared UI | 5,232 | 1,513 | 0 |
| Shared browser | 744 | 186 | 0 |

The exact-file scan found no byte-identical production files of at least20 lines
in that selected set. This **does not** disprove repeated functions, similar workflows
or architectural duplication. It does refute a shortcut that treats every similarly
named file as a full copy. The Pixels spec under `ui/src` is a four-line import adapter,
not another copy of its owned spec.

Committed lint baselines, not fresh linter findings: broad frontend469, public9,
packages1, World engine0, Ruff101, mypy87, suppressions0. The broad frontend count
includes360 explicit-any findings,84 injection preferences and smaller template
categories. Cleanup priority follows risk/change cost, not the cheapest count decrease.

## 8. Target architecture and extension rules

Retain the monolith's simple deployment and domain ownership. The target is:

- **Platform capabilities:** session/principal, safe navigation, lifecycle invalidation,
  clock/date primitives, database unit of work, bounded request mechanics and
  encrypted record protocols. Expose minimal ports with explicit ownership.
- **Generic UI:** controls, dialogs, fields, tokens, formatting presentation and
  accessible interaction building blocks. Domain scoring/ledger math does not belong here.
- **Feature domains:** authoritative validation, models, math, repositories/queries,
  commands, API adapters and UI. Their public entry points are small and intentional.
- **Composition:** server factory/schema assembly and root web routes/registries/
  aggregators connect feature public capabilities. No domain reaches back into shell code.
- **Adapters:** Hub/search/agenda/World/Pixels consume bounded public read models.
  They do not become owners of every source's database model or private records.
- **Contract verification:** route/storage/source/test metadata is generated or
  compared where it repeats, with negative fixtures and explicit exceptions.

Pure domain algorithms, client/server validation, timezone-specific calendars and
cross-language contract fixtures may legitimately exist on both sides. Share source
only when runtime/semantics allow it; otherwise compare contracts or golden vectors.
Finance amounts, PTO hours, Health units, birthday civil dates and Market trading
dates are not one interchangeable number/date model.

## 9. Sequence, ownership and definition of success

**First repair correctness:** callback fan-out, Health late publication, Profile's
wrong assertion/route, and Media saved-read behavior. Capture the current tests and
add deterministic regressions before each fix. #198/#199/#196/#85 own these slices.

**Then make extension contracts enforceable:** feature graph, routes/collections,
source/test ownership and narrow lifecycle/vault ports (#197/#198/#199).

**Then simplify in the path of product work:** Media adapters/records, Finance
facades/imports, World input/render owners and Travel editors (#200 with existing
product issues). Retire stale implementations in the same slice that migrates consumers.

**Then demonstrate the payoff:** implement a disposable feature proof using the
[playbook](feature-addition-playbook.md), record root semantic registrations and
verification cost, and use Cards/Sidequests as future acceptance cases. Keep both
as proposals until selected; no foundational mega-project should grow indefinitely.

Success means a routine feature has one domain owner, a small stable public surface,
known storage/lifecycle behavior, automatic route/tool discovery and tests that prove
its contract. Measure representative changes before/after. Do not promise every
future feature is easy: integration complexity and novel product rules remain real.

All original delivery outcomes remain intact. New engineering issues are foundations,
not excuses to close or silently drop old product scope. The detailed plan records
individual PR units, completion criteria, dependencies and deliberately deferred work.
