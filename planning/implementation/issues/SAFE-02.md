# SAFE-02 — Prevent Health data publication after lock, cancellation or owner change

- Stable key: `SAFE-02`
- GitHub leaf: [#202](https://github.com/Vivekpsps3/vivek-monorepo/issues/202)
- Parents: [#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198), [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `SAFE-01`
- Conflict groups: `finance-vault-lifecycle`, `health-store`
- Verification profiles: `finance_front`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A locked or changed account cannot regain old Health records from an in-flight promise.

Make the existing Health store invalidate memory immediately and refuse late list/decrypt/write results without adding another record store.

## Requirements

- TD-03
- TD-10 Health timeout loser publication
- #198 controlled late-decrypt reproduction
- #90 locked/unavailable/draft/conflict privacy invariants

## Source paths

- `apps/web/src/app/town/health/health-store.service.ts`
- `apps/web/src/app/town/health/health-store.service.spec.ts`
- `apps/web/src/app/town/health/index.ts`
- `apps/finance/frontend/src/app/crypto/dek-holder.ts`
- `apps/web/src/app/platform/session.service.ts`

## Target paths

- `apps/web/src/app/town/health/health-store.service.ts`
- `apps/web/src/app/town/health/health-store.service.spec.ts`
- `apps/web/src/app/town/health/no-passphrase.spec.ts`
- `apps/web/src/app/town/health/index.ts`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Convert the held-decrypt probe to a maintained test using synthetic records: begin load, invalidate owner/presence and abort, then resolve decrypt; pin zero retained rows and a non-ready obsolete result.
3. Use the repaired callback binding and session port to clear arrays/counts synchronously. Capture owner and generation at operation start; increment generation on lock/logout/owner switch and clear listeners with the actual service lifetime.
4. Apply eligibility checks after vault acquisition, listing, decryption, conflict-refetch and write completion, immediately before storing/returning values or derived stages. Define overlapping-load ownership.
5. Make deadline completion invalidate publication of its losing work; cancel transport where supported without pretending WebCrypto itself is cancellable. Remove scattered start-only clear assumptions and stale unrestricted publication paths.
6. Preserve v2-only refusal, unreadable-row accounting, expected revision behavior, same-session drafts and existing encrypted protocol; test snapshots as well as returned values.
7. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | A decrypt is held with one synthetic Health row | lock/abort happens before it resolves | the store returns no ready obsolete result, snapshots/counts remain cleared and stage facade cannot publish old values | controlled-promise tests inspect return and all public snapshots |
| LOCAL2 | An A-owner load/write is held | session becomes B or route work is disposed before completion | no A plaintext is appended to B state | owner-switch and save/conflict-refetch tests |
| LOCAL3 | A request exceeds its deadline | late success arrives | unavailable/locked state is not replaced by late retained data | virtual-time timeout-then-resolve test |
| LOCAL4 | Current-owner valid operations and malformed records are used | load/save/delete/conflict occurs without invalidation | valid values persist with original revision rules and corrupt rows are counted, not silently deleted | existing store regressions plus marker assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Start-only presence checking and unguarded post-decrypt assignments | Replace with one generation/owner eligibility path and immediate invalidation; remove obsolete branches assuming entry-time checks suffice | required | race tests fail on old assignments and all snapshot writes use the same eligibility rule |

## Non-goals

- No Clinic/Gym page implementation
- No new Health endpoint/collection
- No new crypto algorithm
- No generic load framework

## Test scenarios

- abort during listing/decrypt/save and conflict refresh
- deadline then late resolve; two overlapping loads; A→B; lock→unlock
- marker strings absent after invalidation in store/read-model/DOM and never sent plaintext

## Risks

- Clearing only the returned result leaves root-service arrays retained. Timeout alone does not cancel mutation. Existing v1 refusal and corrupt-row preservation must remain.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.
