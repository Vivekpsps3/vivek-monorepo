# SAFE-01 — Fix colliding lock cleanup registrations with owned fan-out

- Stable key: `SAFE-01`
- GitHub leaf: [#201](https://github.com/Vivekpsps3/vivek-monorepo/issues/201)
- Parents: [#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `finance-vault-lifecycle`, `pixels-data`
- Verification profiles: `finance_front`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Locking Finance clears every registered consumer independent of service construction or disposal order.

Replace the single dropSnapshots callback slot with a small deterministic multi-listener implementation; keep the existing lock entry point and message protocol.

## Requirements

- TD-02
- TD-09 initial callback contract; remaining transport migration belongs SAFE-04
- #198 verified Finance/Pixels callback collision

## Source paths

- `apps/finance/frontend/src/app/crypto/lock-finance.ts`
- `apps/finance/frontend/src/app/crypto/lock-finance.spec.ts`
- `apps/finance/frontend/src/app/services/finance.service.ts`
- `apps/web/src/app/pixels/pixels-data.service.ts`

## Target paths

- `apps/finance/frontend/src/app/crypto/lock-finance.ts`
- `apps/finance/frontend/src/app/crypto/lock-finance.spec.ts`
- `apps/finance/frontend/src/app/services/finance.service.ts`
- `apps/web/src/app/pixels/pixels-data.service.spec.ts`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Turn the independent callback probe into a maintained behavioral regression: bind Finance and Pixels; dispatch; dispose either; dispatch again. Establish the failure before editing implementation.
3. Keep one small Set/owned subscriber collection, advance/wipe synchronously before awaited module cleanup, snapshot dispatch membership deliberately and isolate callback exceptions. Make unbind idempotent and remove only its own binding.
4. Retain current bindLockSnapshots signature where possible and existing callers; remove single-slot assignment/no-op restoration and redundant order assumptions. Do not create a new platform package or event bus.
5. Verify actual lockFinance clears all consumers before its first awaited module load, while existing fallback error copy/retry and Finance key-wipe behavior remain correct.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | Finance and Pixels listeners are live in either registration order | lock is dispatched | both clear exactly once for that dispatch | unit tests cover both orders and repeat dispatch |
| LOCAL2 | One subscriber is disposed while another remains | lock is dispatched again | the live listener still clears and the disposed listener does not | disposal-order and double-disposal assertions |
| LOCAL3 | One listener throws and BroadcastChannel is unavailable | same-tab lock is invoked | the key is wiped and other live listeners clear; errors do not stop fan-out | held module-loader regression plus throwing-listener test |
| LOCAL4 | Finance/Pixels views hold synthetic values | lock and later unlock occur | existing locked-state and valid reload behavior survive | existing Finance lock/coherence and Pixels browser journeys |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Module-global single mutable dropSnapshots callback | Replace it with one owned multi-listener collection; delete assignment/unbind behavior that can erase another consumer | required | source diff plus behavioral test that fails against the old slot |

## Non-goals

- No broadcast protocol redesign
- No crypto/KDF/AAD/schema change
- No new singleton state store
- No changes to Finance/Town/Pixels math

## Test scenarios

- register A/B and B/A; remove A/B independently
- listener throws; register/dispose during dispatch follows explicit tested rule
- no BroadcastChannel; repeat lock; lock before async module resolution

## Risks

- An existing fallback also clears some state; do not mistake that mitigation for fixing registration semantics. This task repairs a reproduced callback defect, not a demonstrated production leak.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.
