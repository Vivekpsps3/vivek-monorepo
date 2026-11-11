# HEALTH-03 — Integrate stage-only Clinic/Gym lots and Today rows without changing Town XP

- Stable key: `HEALTH-03`
- GitHub leaf: [#258](https://github.com/Vivekpsps3/vivek-monorepo/issues/258)
- Parents: [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `HEALTH-02`, `TOWN-03`
- Conflict groups: `town-main`, `town-lots`, `town-today`, `health-stage-facade`
- Verification profiles: `web_front`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Clinic and Gym are reachable and reflect private progress through coarse stages, with honest locked/unavailable states.

## Requirements

- #90 implementation6/#96 lots and Today integration; #90 layout/privacy/unchangedXP acceptance; original #96 https://github.com/Vivekpsps3/vivek-monorepo/issues/96.

## Source paths

- `apps/web/src/app/town/health/index.ts`
- `apps/web/src/app/town/town.component.ts`
- `apps/web/src/app/town/town.component.html`
- `apps/web/src/app/town/town-lot.component.ts`
- `apps/web/src/app/town/town-today.component.ts`
- `apps/web/src/app/town/town.constants.ts`

## Target paths

- `apps/web/src/app/town/town.component.ts`
- `apps/web/src/app/town/town.component.html`
- `apps/web/src/app/town/town-lot.component.ts`
- `apps/web/src/app/town/town-today.component.ts`
- `apps/web/src/app/town/town-today.component.html`
- `apps/web/src/app/town/town.constants.ts`
- `apps/web/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Consume only loadTownHealthStages through safe lifecycle and current Treasury shared markup; keep Health records/XP/counts out of Town/server public payloads.
3. Add keyboard links/lots/Today rows to mounted Clinic/Gym; use locked sprites and unavailable status with no Health digits when locked.
4. Implement11tiles+nonfocusable filler desktop,three columns with final two at narrow widths; reuse existing lot presentation instead of a parallel Health lot renderer.
5. Clear/abort stage state on lock/session/owner changes and preserve server Town XP/level.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOTS1 | ready/locked/unavailable Health stages and both routes | render Town and follow keyboard links | correct coarse sprites/state, no locked digits and real Clinic/Gym routes open | stage facade spies and actual Town→Health browser |
| LOTS2 | 390/1280 light/dark with filler and private marker records | inspect layout,Tab order,lock and Town requests | 11tiles/filler/three-column contract correct; filler notfocusable; no Health payload/serverXPchange | responsive/axe and request/XP before-after assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| potential separate Health lot renderer and duplicated stage calculation | reuse existing Town lot/Treasury markup and stage-only facade | required | same renderer/current facade serves all lots; no Health numeric import |

## Non-goals

- No Health XP on server or new duplicate Health model/renderer.

## Test scenarios

- ready/locked/unavailable;11plusfiller;390columns;Tab;routes;lockstageclear;noHealthpayload;unchangedXP

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.

## Living World scope boundary — 2026-11-11

Retain stage-only Health lots, Today rows and no XP change. PLACE-04 must preserve these consumers when available; Health plaintext and private eligibility never enter cosmetic layout records. See [scope reconciliation](../../living-world/scope.md) and [parent #304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). This is planned extension scope; it neither closes nor enlarges this packet's retained implementation acceptance.
