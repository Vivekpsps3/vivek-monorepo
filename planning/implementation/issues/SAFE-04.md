# SAFE-04 — Replace duplicated lock/session transport handling in real consumers

- Stable key: `SAFE-04`
- GitHub leaf: [#204](https://github.com/Vivekpsps3/vivek-monorepo/issues/204)
- Parents: [#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286).
- Dependencies: `SAFE-01`, `SAFE-03`
- Conflict groups: `finance-vault-lifecycle`, `private-shell`, `pixels-data`, `world-ui`
- Verification profiles: `shared_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Lock/session behavior has one transport policy while each feature keeps its own records and read models.

Use one small validated lifecycle notification adapter and remove the independent Hub/Pixels/World message parsers and listener teardown copies.

## Requirements

- TD-09
- #198 multi-consumer transport adoption and same-tab behavior
- TD-11 lifecycle coordination only; World setup deletion owned DEL-03

## Source paths

- `apps/web/src/app/hub/hub.component.ts`
- `apps/web/src/app/pixels/pixels-data.service.ts`
- `apps/web/src/app/world/ui/world.component.ts`
- `apps/finance/frontend/src/app/services/market-refresh-coordinator.service.ts`
- `apps/finance/frontend/src/app/crypto/lock-finance.ts`
- `apps/web/src/app/platform/session.service.ts`

## Target paths

- `apps/finance/frontend/src/app/crypto/`
- `apps/finance/frontend/src/public-api.ts`
- `apps/web/src/app/hub/hub.component.ts`
- `apps/web/src/app/pixels/pixels-data.service.ts`
- `apps/web/src/app/world/ui/world.component.ts`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare current overlapping open PRs before assuming the reviewed source is current. Preserve unrelated edits.
2. Inventory existing storage key, channel version, owner ID, tab ID and event kinds. Specify one accepted notification format; preserve existing on-wire compatibility and same-tab dispatch.
3. Implement a small listener adapter beside the current lifecycle owner; reuse existing session port and SAFE-01 subscriber collection. Keep sensitive values out of messages/storage.
4. Migrate Hub, Pixels and World to subscribe to the same validated invalidation event, retaining their feature-specific clear/abort behavior. Delete their duplicated channel construction, key branches, isRemoteLock copies and independent teardown.
5. Test subscriptions/disposal and session A→B, malformed/foreign/self-echo messages, absent storage/BroadcastChannel and repeated signout/lock. Confirm Finance market coordinator is either migrated or deliberately remains the authoritative sender with no second parser.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | Hub, Pixels and World hold current-owner derived state | same-tab or valid remote lock arrives | all invalidate through one event policy without reloading | multi-consumer contract and browser lock tests |
| LOCAL2 | A notification has wrong owner/version/kind or is malformed | adapter receives it | it cannot affect another owner or manufacture a valid message | message matrix tests |
| LOCAL3 | A route subscriber is disposed | further notifications or self echoes arrive | disposed callback is not invoked and remaining listeners continue | listener-count/disposal tests |
| LOCAL4 | Updated consumers are searched | the migration finishes | the removed message validation/listener implementations have no live competing copies | deletion ledger and consumer graph |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Hub/Pixels/World duplicated storage/BroadcastChannel listeners and isRemoteLock logic | Delete migrated copies and route through one validated adapter | required | all three callers migrated plus foreign-owner/self-echo/teardown tests |
| Temporary lifecycle compatibility wrappers with no remaining consumer | Remove in this PR rather than deferring another state owner | required | symbol search and build |

## Non-goals

- No universal event bus
- No global plaintext state store
- No transport protocol expansion
- No change to feature calculation or stale-state semantics

## Test scenarios

- same-tab lock without browser channels
- remote A message while B current; malformed/version mismatch; repeated disposal
- real Hub/Pixels/World lock→unlock→lock and owner change

## Risks

- A shared notifier must not become a second source of session truth. Self-echo filtering must not suppress real signout. This simplification must remove several real copies, not add one helper while retaining them.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.
