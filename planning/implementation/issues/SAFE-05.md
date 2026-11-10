# SAFE-05 — Bound Pixels and Health work and delete ad hoc timeout ownership

- Stable key: `SAFE-05`
- GitHub leaf: [#205](https://github.com/Vivekpsps3/vivek-monorepo/issues/205)
- Parents: [#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286).
- Dependencies: `SAFE-02`, `SAFE-04`
- Conflict groups: `hub-load`, `pixels-data`, `health-store`, `world-controller`
- Verification profiles: `shared_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A hung or obsolete operation reaches a useful state promptly and cannot republish after the user leaves or locks.

Adopt the smallest reusable deadline/cancellation/publication utility for existing repeated load mechanics, using Hub’s established behavior as reference.

## Requirements

- TD-10
- TD-03 timeout loser safety follow-through
- #198 liveness/cancellation consistency with feature-specific result states

## Source paths

- `apps/web/src/app/hub/hub-load.ts`
- `apps/web/src/app/pixels/pixels-data.service.ts`
- `apps/web/src/app/pixels/pixels-data.service.spec.ts`
- `apps/web/src/app/town/health/health-store.service.ts`
- `apps/web/src/app/world/data/world-controller.ts`

## Target paths

- `apps/web/src/app/hub/hub-load.ts`
- `apps/web/src/app/pixels/pixels-data.service.ts`
- `apps/web/src/app/town/health/health-store.service.ts`
- `apps/web/src/app/world/data/world-controller.ts`
- `packages/browser/src/`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare current overlapping open PRs before assuming the reviewed source is current. Preserve unrelated edits.
2. Compare Hub/Health/Pixels deadlines, caller abort and publication checks; retain the smallest shared mechanism only where semantics match. Prefer a local reusable function over a new service hierarchy.
3. Give one user action a total deadline across Pixels source windows and Finance joins; connect caller/lifecycle abort to actual HTTP subscriptions and local controllers. Preserve request batching/range limits and partial source outcomes.
4. Migrate at least Pixels and Health’s equivalent timeout/eligibility mechanics and remove obsolete timer/race/controller copies. World may reuse the mechanism where equivalent without changing existing budget states.
5. Use held responses and virtual time for deadline, parse failure, route disposal, owner switch, lock and late resolution. Preserve stale/locked/expired/absent/corrupt distinctions in feature adapters.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | A Pixels response or Finance join hangs | the total action deadline expires | loading terminates with the appropriate unavailable/partial state and no later publication | virtual-time tests with held responses |
| LOCAL2 | Multiple source windows are required | some finish and one is slow | the total action is bounded once rather than N independent unbounded waits | request/timing contract tests |
| LOCAL3 | A completed/aborted/errored operation is disposed | timers/subscriptions/controllers are inspected | work is cleaned up idempotently and later results are ignored | cleanup and stale-result assertions |
| LOCAL4 | Valid source and locked/expired source fixtures are loaded | new mechanism is used | existing user-visible states remain distinct and independent sources remain usable | existing Hub/Pixels/Health/World regressions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Independent Health Promise.race timer ownership and Pixels unbounded firstValueFrom/local controller paths | Replace equivalent mechanics with the adopted bounded-work primitive and remove old timers/subscriptions | required | two real consumers migrated; old code removed; total deadline and late-resolve tests |

## Non-goals

- No generic loader/state framework
- No global eight-second rewrite of every operation
- No retries or swallowed failures
- No changing source-window or privacy semantics

## Test scenarios

- abort before start, during list, during decrypt, during Finance range join
- timeout then success; parse exception; cancel after complete
- independent source outage and expired session

## Risks

- Promise.race does not cancel a losing mutation. Reusing an eight-second helper per sequential window can multiply latency. Justified safety code may add LOC; delete equivalent old machinery rather than forcing a numeric shrink.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.

## Concrete deletion plan

Name the actual Hub/Health/Pixels timer, abort-listener and stale-publication paths before extracting anything. Keep source-specific states in their current adapters. Move only equivalent deadline/cleanup mechanics into one plain function, then migrate Health and Pixels and delete both superseded timer/controller paths in the same PR.

One total action deadline must cover sequential windows and Finance joins; a fresh timeout per window is not equivalent. Essential generation/owner checks may add safety LOC, so report that separately. A helper plus both original complete loaders is incomplete. World adoption must preserve its existing controller scope and distinct budget states.
