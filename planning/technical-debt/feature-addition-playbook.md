# Feature addition

Use this guide to add a field, a provider fixture, or a private record with the
owners that already exist. It is not a generator, a second command list, or a
claim that a future app is free. Scheduling stays in the
[execution queue](../implementation/README.md). The measured cost of three
current changes, and the rules for not copying them into another checklist, are
in section 9.

## 1. Start with the feature's owner and data plane

Write a short feature contract before adding shared infrastructure:

- What can the user do, and what observation proves success?
- Which domain owns the authoritative fact and calculation?
- Is the fact public, owner-scoped SQL, encrypted browser data, or derived ephemeral data?
- What happens on load/failure/retry, session expiry, lock, account switch and route leave?
- Is there an existing source record or command to link/reuse?
- Which schema/record version, compatibility and deletion/recovery rules apply?
- Which routes, navigation placement and optional Hub/search/agenda adapters are needed?
- Which layer proves validation/math, ownership, async behavior and the actual journey?

A new field in an existing domain should normally stay there. A new app is justified
by a distinct user object/workflow, not by the desire for another route or package.
The shell composes features; it should not become their business-logic owner.

## 2. Choose the applicable recipe

| Feature class | Normal implementation owner | Shared capability to reuse | Essential evidence |
| --- | --- | --- | --- |
| Add a field/filter to an existing view | Existing model/codec/query/editor/projection | Generic field, formatter, URL/filter conventions | save/reload, unknown/legacy shape, filtering/back-forward, errors |
| Add an owned page/editor | Feature routes/view model/commands | page/field/dialog/focus/draft primitives | direct load/reload, keyboard, save/retry/conflict, route leave |
| Add SQL-backed records | Domain model/migration/query/command | principal/database/error/request lifecycle | owner isolation, constraints, transaction rollback, seeded preservation, delete/reset |
| Add encrypted records | Domain codec/store/editor | narrow vault-record/lifecycle/collection contract | post-await eligibility, version/conflict, no plaintext leakage, full restore |
| Add a provider | Domain provider adapter | deadline/budget/cache/provenance transport | offline parsing, rate/outage/partial failure, safe URLs, no saved-read IO |
| Add a cross-domain view | Composition plus app-owned source adapters | bounded loading/typed projection contracts | independent source failure, same authoritative facts, no privacy expansion |
| Add a background/feed integration | Owning domain/service plus ops contract | auth/scoped capability/revocation, bounded work | authorization/revocation/redaction, scheduling/idempotency, activation evidence |
| Add a genuinely new app | New domain plus explicit composition | existing platform/UI/storage/test recipes | one complete vertical slice, optional adapters, all relevant above guarantees |

Use several rows when the feature spans classes. That additional work is real
feature complexity; architecture should remove repeated plumbing, not hide it.

## 3. Implementation shape

A practical domain can have public entry points, models/contracts, pure rules,
queries/commands, adapters, views and tests. Create only the layers the feature
needs. Do not generate seven empty directories and a repository interface for a
one-field screen.

### Public surface

Expose routes/components intended for composition, bounded read models, commands
with typed results and small neutral capability interfaces. Avoid exporting the
entire stateful service or dozens of internal helpers “for flexibility.” Keep
concrete storage, HTTP and formatting adapters behind their owner.
An encrypted-record capability must actually support the consumer's browser-local
codec/encrypt/decrypt operations with owner/AAD/epoch constraints; envelope transport
alone must not force consumers back to the full concrete Finance vault service.

A cross-feature consumer should know the source fact's semantics and lifecycle,
not which internal BehaviorSubject/table happens to hold it. Hub/search/agenda can
request ready summaries or link references. They should not call a giant dashboard
load to retrieve five names or copy a source's ledger algorithm.

### Async ownership

For any operation that can outlive its caller:

1. Capture owner and lifecycle generation.
2. Join an existing operation when appropriate, with explicit freshness semantics.
3. Bound the overall action by deadline and connect cancellation to transport.
4. Validate external/decrypted payloads at their boundary.
5. Recheck eligibility after awaited work and immediately before publication.
6. Dispose listeners/timers/controllers with the correct route/service scope.
7. Preserve a recoverable same-session draft on expected failure/conflict.
8. Clear private derived state immediately on lock/logout/owner change.

`Promise.race` alone does not stop its losing branch from mutating state. An
unsubscribed HTTP request and a non-cancellable WebCrypto promise also require
publication guards. A repeated no-op cleanup must be safe; one consumer's exception
or disposer must not prevent another consumer from invalidating.

### Storage and compatibility

For SQL, choose the domain owner, principal scoping, parent/child constraints,
command transaction and a versioned migration. Preserve account deletion and
older-image compatibility deliberately. For encrypted records, register collection
ownership/schema/codec/limits/export/reset behavior and keep owner binding in the
protocol. Unknown versions get explicit unsupported/preservation behavior.

A card statement is not a current liability balance. A travel cost is not a Finance
transaction. A habit week is not a kept budget week. Link authoritative facts with
stable references; do not manufacture a second source of truth for convenience.

## 4. Registration checklist: necessary, optional and redundant

Current sites include `apps/web/src/app/routes.ts`, `apps/web/routes.json`, private
layout navigation, settings registry, server factory/schema composition, encrypted
allowlists, account cleanup, source adapters, test discovery and fixture reset logic.
The goal of #197 is fewer handwritten representations of the **same fact**, not
removing explicit review of security or data ownership.

| Registration | Required when | Target behavior |
| --- | --- | --- |
| Domain/public entry point | A new feature boundary exists | small owned API with enforced imports |
| Document/Angular route | A navigable page exists | one descriptor or parity-checked route examples |
| App switcher/settings links | The feature needs those locations | explicit placement; avoid automatic top-level clutter |
| SQL metadata/migration/ownership | New SQL tables/constraints | owned registration and upgrade/delete tests |
| Encrypted collection contract | New vault collection/version | checked language subsets and all-collection restore |
| Hub/search/agenda adapter | It creates a useful cross-domain action | opt-in bounded projection using authoritative source facts |
| Provider/cache/budget policy | External IO is necessary | explicit action and network ownership, saved reads remain local |
| Source/tool/test discovery | New shipped source/spec appears | automatic inclusion or explicit reviewed ownership/exclusion |
| Fixture/seed/reset | A reproducible scenario needs records | domain-owned fixture with synthetic second owner and clock |
| Operations/recovery | New persistent/external capability appears | failure/retention/activation evidence with no invented runtime success |

Reserved server routes are not evidence the client mounts a page. Test files on
disk are not evidence CI discovers them. A list of collections is not evidence the
backup protocol restores each one. Registration checks need behavior examples.

## 5. Worked example: add a card-benefit field inside Finance

The Cards design is [planning/implementation/cards.md](../implementation/cards.md).
There is no card collection on current main, and this guide does not authorize
creating one. When the owner selects implementation, that design's first slice
adds one Finance vault collection, `cards`, and keeps statement, benefit,
renewal, and debt facts distinct. It does not add a plaintext card endpoint or
a field on `liabilities`.

A later field on an existing card row reuses that collection's codec. Recovery
already follows the finance/health union, so the field does not add another
allowlist string. Benefit period and value stay distinct from statement, debt,
and transaction meaning. Tests cover edit/save/reload, a missing old field, an
invalid amount or date, conflict, and lock during save. No Travel or Media
calculation edit, and no new root shell state, should be necessary.

## 6. Worked example: add Sidequests as an encrypted domain

1. Establish Sidequests as the owner of experience/attempt/memory semantics. Keep
   those rules separate from Town habits, World concepts and a universal XP ledger.
2. Use a small public route/API boundary and domain codec/store/view model; reuse
   the generic field/dialog/theme/lifecycle and encrypted record capabilities.
3. Register the minimal versioned collection descriptor and prove unknown-schema,
   owner/lock/conflict/export/restore behavior with synthetic records.
4. Register the route and intended navigation; prove fresh load/reload/auth/CSP.
5. Supply one domain fixture and a complete create→attempt→memory→reload→correct
   journey. Tool/discovery checks should identify its source/spec automatically.
6. Add optional source references/Hub placement only if separately useful. The first
   complete slice does not need providers, background jobs, images, global scoring,
   a feed token, or changes to Finance calculations.

Sidequests design is [DISC-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/264).
That closed design does not authorize the app. Do not build it from this recipe.

## 7. Worked example: add one Media provider

1. Implement the provider-specific request/parser/identity adapter and fixtures.
2. Reuse shared bounded transport, cache/provenance and safe URL rules where identical.
3. Normalize to an owned typed result with explicit partial/unavailable states.
4. Invoke it from the explicit search/refresh/enrichment command, never from an
   ordinary saved-library read to silently repair records.
5. Verify quota/timeout/outage, malformed data, request counts, matching identity,
   safe artwork origins and database unit-of-work release before network IO.
6. Keep existing saved notes/ratings/links and use one authoritative record command.

A provider adapter may still require new domain rules. That is legitimate feature
work, not a reason to create an untyped universal provider object.

## 8. What a feature PR should make reviewable

State the concrete user trigger and resulting behavior; identify its domain/data
plane/public contract and any compatibility change. Include actual callers adopted,
old implementation removed, current tests proving the change and material limits.
For new storage, show lock/owner/version/reset/recovery coverage. For new routes,
show direct load, refresh, unknown404 and keyboard arrival. For provider work,
show request budgets and no provider IO on saved reads.

Use root AGENTS commands appropriate to changed files; run them locally before
opening a PR. Record exact failures instead of relabelling them as unrelated success.
Keep synthetic fixtures and private-data markers; do not debug with real decrypted
records or publish credentials. A screenshot is helpful visual evidence but does not
prove conflict/ownership/cancellation/recovery behavior.

## 9. Measured scorecard

Measured on commit `3d02609` on 2026-11-14. Python is 3.12 from the repository `.venv`. Node is v24.22.2. Chrome is the installed Playwright Chromium set as `CHROME_BIN`. Times are wall clock on this machine for one targeted command. They are observations, not a CI budget and not a coverage floor.

| Change | Semantic sites | Outside the owner | Targeted check | Observed |
| --- | --- | --- | --- | --- |
| Activity category filter | `filterTransactionActivity` in `transactions-activity-query.ts`; URL and chip state in `transactions.component.ts`; the control in `transactions.component.html`. The key reuses `spendingGroupKey`. | none | Finance Karma include of `transactions-activity-query.spec.ts`, coverage off | 6.85s wall, 4 SUCCESS |
| TMDB public-search fixture | `parse_tmdb_search_page` and the existing `tmdb` extraction branch inside `providers.py` `search`. The HTML fixture stays in `test_bundle_m.py`. | none | `pytest apps/media/backend/tests/test_bundle_m.py::test_public_tmdb_search_page_reads_cards_and_skips_adult_titles` | 0.79s wall, 1 passed |
| Encrypted collection name | Server `HEALTH_OWNER_COLLECTIONS` (recovery is that union, not a third list), Health `HEALTH_OWNER_COLLECTIONS`, and Finance `FINANCE_FOREIGN_COLLECTIONS`. | none | `python scripts/check_collection_policy.py` after adding `ref01_probe` to those three declarations | 0.32s; diff +3/−2 across 3 files; parity passed; registration reverted |

A Health list/editor already saves through `createStat` / `createPr` with `expected_revision`. Lock uses `bindLockNotices` and clears only the live subscriber. Those calls are not extra registration sites for a new collection name.

`apps/finance/backend/tests/test_ref01_extension_contract.py` is the vault half of the disposable proof. It registers `ref01_probe` only on a copied policy, creates the ciphertext, reloads it, rejects a stale revision 1, and finds the name on the recovery snapshot. After the production policy is restored, upsert and delete return 400, the snapshot returns 422, and the ciphertext row remains. `apps/server/tests/test_ref01_extension_contract.py` checks that `settings/ref01-probe` fails route parity and is absent from `routes.json`. `scripts/test_source_inventory.py` checks that `apps/ref01-probe.mjs` fails source inventory and that a scan of the real tree reports no gap. The inventory test lives with the other source-ownership tests because that command runs where Node is installed. `lock-notice.spec.ts` clears one disposable subscriber and ignores it after release. The production policy does not contain `ref01_probe`. Focused pytest of the vault half reported 1 passed in 0.81s.

### Agent checklist

1. Read the domain AGENTS.md and the recipe above. Name the owner before adding a file.
2. Edit that owner. Touch another app only for a contract copy named in the table.
3. Run the targeted check, then every command in [Verification](../../docs/VERIFICATION.md) that the diff actually requires.
4. Remove the superseded path in the same change. Count production, tests, and docs separately.

### Stop

- Do not add a package, plugin loader, second recovery list, generic repository, or event bus for one feature.
- Do not leave a toy route, collection, or symbol in production. The `ref01_probe` registration in the table was reverted before this guide was committed.
- The Cards design is [planning/implementation/cards.md](../implementation/cards.md) (DISC-02 / [#265](https://github.com/Vivekpsps3/vivek-monorepo/issues/265)). It does not authorize the app. The Sidequests design is [#264](https://github.com/Vivekpsps3/vivek-monorepo/issues/264) (DISC-01) and does not authorize that app. This guide does not approve a bank connection, credential, or provider.
- Historical leaf ownership is `td_coverage` in the [completion registry](../implementation/completed/registry.json). Only unfinished owners remain in the [active queue](../implementation/queue.json). This file is the REF-01 slice of TD-00, TD-30, TD-31, TD-37, TD-38, and TD-39 only.

Commands, floors, and architecture stay in [Verification](../../docs/VERIFICATION.md), [Quality](../../docs/QUALITY.md), [Architecture](../../docs/ARCHITECTURE.md), [Security](../../docs/SECURITY_MODEL.md), root [AGENTS.md](../../AGENTS.md), the [deletion contract](../implementation/deletion-strategy.md), and the [workflow](../implementation/workflow.md). Bank CSV rules stay in [Adding a bank import](../../docs/ADDING_A_BANK_IMPORT.md).

Primary sources for practices those documents already require: [Google code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html), [small changes](https://google.github.io/eng-practices/review/developer/small-cls.html), [TypeScript narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html), [Angular DestroyRef](https://angular.dev/guide/components/lifecycle), [SQLAlchemy sessions](https://docs.sqlalchemy.org/en/20/orm/session_basics.html), and [W3C form validation](https://www.w3.org/WAI/tutorials/forms/validation/).

Select the next task from the [execution queue](../implementation/README.md).
