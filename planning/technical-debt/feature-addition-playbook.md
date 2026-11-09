# Feature-addition playbook

This is the **target workflow** produced by the 2026-11-08–09 review. Contracts,
generators and inventory guards described as targets do not yet exist. Current
commands/architecture remain in root AGENTS and the maintained docs. Implement
[#197](https://github.com/Vivekpsps3/vivek-monorepo/issues/197),
[#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198) and
[#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199) incrementally, then
prove this workflow with a disposable example. Do not copy this document as a
claim that the repo already has a universal feature scaffold.

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

1. Keep the feature in Finance. Add the typed optional field and legacy decoder/default
   to its owned encrypted card metadata, not a plaintext server card endpoint.
2. Extend its existing editor/projection and reuse canonical money/date controls.
3. Keep the benefit period/value distinct from statement/debt/transaction meaning.
4. If the collection already participates in recovery, add a record-version example;
   do not create a new allowlist string everywhere for each field.
5. Test edit/save/reload, absent old field, invalid amount/date, conflict and lock during save.
6. Run relevant Finance/shared and browser checks. No Travel/Media calculation edit
   or new root shell state should be necessary.

This is an example for future selected Cards #195 work. It does not implement or
approve its complete product scope.

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

Use a disposable proof before implementing the real proposal #194. Record every
platform exception it needs and refine the reference contract before broad adoption.

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

## 9. Feature cost scorecard

Before and after adopting this playbook, record:

- independent platform decisions/registrations required;
- existing feature implementation files changed outside the new owner;
- duplicated contracts/lifecycle code introduced or removed;
- time to find the correct extension point and run targeted verification;
- all applicable checks and their source/spec discovery;
- defects found only after integration, flakes and repeated manual setup;
- remaining novel product or external-integration work.

Success is predictable overhead and strong contracts. A small edit may legitimately
have many tests. A novel payment/feed/provider/recovery protocol may remain difficult.
Do not trade away ownership, private data boundaries or useful error states to reduce
file count or make the happy-path scaffold look shorter.
