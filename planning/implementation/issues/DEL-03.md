# DEL-03 — Delete competing World setup and reduce component orchestration

- Stable key: `DEL-03`
- GitHub leaf: [#215](https://github.com/Vivekpsps3/vivek-monorepo/issues/215)
- Parents: [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200), [#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `world-ui`, `world-controller`, `world-engine`
- Verification profiles: `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A World change has one clear controller setup and a smaller component responsibility surface.

Choose one controller/lifecycle composition path, remove the orphan wrapper, and simplify actual DOM/input/render ownership without creating another framework.

## Requirements

- TD-11
- TD-21
- TD-29 World-specific deletion
- #200 one live integration path; old code removed
- #198 live lifecycle adoption remains SAFE-04/SAFE-05; this packet must not add a competing path

## Source paths

- `apps/web/src/app/world/ui/world.component.ts`
- `apps/web/src/app/world/data/world-controller.service.ts`
- `apps/web/src/app/world/data/world-controller.ts`
- `apps/web/src/app/world/data/index.ts`
- `apps/web/src/app/world/logic/camera.ts`
- `apps/web/src/app/world/render/renderer.ts`

## Target paths

- `apps/web/src/app/world/ui/world.component.ts`
- `apps/web/src/app/world/data/world-controller.service.ts`
- `apps/web/src/app/world/data/index.ts`
- `apps/web/src/app/world/ui/world.component.spec.ts`
- `apps/web/src/app/world/logic/`
- `apps/web/e2e/world.spec.ts`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Verify zero consumers of WorldControllerService on fresh main and decide the actual controller scope from route entry/leave behavior. Prefer deleting the unused wrapper if the current connectController seam already satisfies scope; do not adopt a root singleton just because it exists.
3. Keep the existing route-owned connectController path and WORLD_CONTROLLER test seam. Delete the orphan root wrapper after consumer proof; coordinate SAFE-04/05 live lifecycle adoption rather than requiring their future helper for an unused-file deletion.
4. Simplify repeated component camera/input/paint calculations by calling existing pure camera/render helpers. Extract a small domain-local owner only where it removes real duplicated responsibility; do not replace a long component with many pass-through classes.
5. Retain URL/back-forward, concept invalidation, golden vectors, fog preference, private chests, reduced motion, pointer and keyboard semantics. Record production net delta across the complete World subtree and explain any bounded guard addition.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | A route opens, leaves and opens World again | controller ownership is observed | exactly the intended scoped controller/listeners exist with no retained prior owner or orphan setup | dispose/reentry and subscription assertions |
| LOCAL2 | The old service symbol and setup are searched | cleanup is complete | one actual composition path remains and all old consumers/exports are removed or intentionally migrated | consumer search and deletion ledger |
| LOCAL3 | Camera/URL/concept/budget interactions run | simplified component uses existing owners | visible behavior and deterministic engine output remain unchanged | unit/golden/World browser regressions |
| LOCAL4 | The PR’s production code is counted | review compares whole subtree rather than one file | redundant implementation has been removed, not hidden by moving it; any net addition is a specific safety/compatibility exception | source/test/adapter delta table |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Unused WorldControllerService and duplicate construction/lifecycle code | Delete the orphan wrapper and redundant setup after caller/scope verification | required | zero-consumer search plus route/dispose tests |
| Repeated camera/render orchestration already represented by pure helpers | Replace real duplicate calculations with existing helper calls and remove old logic | conditional | equivalent input/output tests and source diff |

## Non-goals

- No new engine or event store
- No broad map redesign
- No claiming tree-shaken source was measured bundle bloat
- No helper-only extraction without consumer migration

## Test scenarios

- route reentry/disposal and A→B lock
- pointer/keyboard camera, reduced motion, theme redraw
- URL reload/back-forward; concept edit invalidation; budget late-result drop

## Risks

- Shared singleton scope can preserve private/stale data across routes. Existing World helper semantics include habit-based weeks and must not be changed into Finance budget logic by this cleanup.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.

## Dependency rationale

Deleting the unused wrapper changes no live caller. Retain the existing route-owned composition and coordinate world-ui edits with SAFE-04/05; their future shared helper is not needed to delete an orphan.

## Concrete deletion plan

The baseline WorldControllerService is a 36-line file with no source consumer beyond its declaration. Re-run rg for WorldControllerService and world-controller.service, including provider/config/lazy imports. Delete that file when the zero-consumer result holds; its constructor, storage/session listeners and root-singleton lifetime disappear together. ui/world.component.ts connectController remains the live route-owned composition and WORLD_CONTROLLER remains its test override.

Keep the current live lifecycle behavior; this orphan removal needs no new shared helper. SAFE-04/05 retain ownership of the merged lifecycle/bounded-work integration. Coordinate their actual World diffs. Reuse existing camera/render functions only where a second calculation is proven identical; keep URL/concept/golden behavior unchanged.

Acceptance adds: zero production files reference the retired symbol/path, route leave/reentry has no extra listeners, and total World production LOC decreases. Count any extra guard separately. Component-size movement is not a reduction.
