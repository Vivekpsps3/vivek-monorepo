# TOWN-05 — Add a small Town Hall using existing progress/rules and bounded appearance settings

- Stable key: `TOWN-05`
- GitHub leaf: [#253](https://github.com/Vivekpsps3/vivek-monorepo/issues/253)
- Parents: [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `TOWN-04`, `CON-02`
- Conflict groups: `town-main`, `town-hall`, `private-routes`
- Verification profiles: `web_front`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Town Hall explains progress and existing habits, with simple previewable seasonal appearance that changes no game facts.

## Requirements

- #81 delivery7/Town Hall+appearance; selected #133 https://github.com/Vivekpsps3/vivek-monorepo/issues/133.

## Source paths

- `apps/web/src/app/town/town.component.html`
- `apps/web/src/app/town/town.constants.ts`
- `apps/web/src/app/town/town.api.ts`
- `apps/web/src/app/routes.ts`
- `apps/web/routes.json`
- `packages/ui/tokens.css`

## Target paths

- `apps/web/src/app/town/`
- `apps/web/src/app/routes.ts`
- `apps/web/routes.json`
- `apps/web/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Mount /town/hall linked from Town header through current route contract; render current progress and How Town grows from canonical tuning constants and existing API.
3. Link active/archived habits to existing edit/history rather than building another habit controller or ledger.
4. Provide Default/Spring/Summer/Autumn/Winter, live preview and explicit automatic browser-local seasonal mode; store only owner-keyed device preference and no XP/server state.
5. Use current tokens/local sprites and preserve contrast/focus/reduced motion; remove duplicated rule threshold/copy tables if a prototype created them.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| HALL1 | active/archived habits and canonical thresholds | open/deep-reload Hall and follow edit/history | rules/progress match existing facts and links use current owners | route/CSP/API fixture and actual browser flow |
| APPEAR1 | ownerA/B and each explicit/automatic seasonal preference near month boundaries | preview/save/reload/change owner | correct season ranges, isolated preference, no server mutation or XP change | clock/preference tests, network assertions and screenshots |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| potential second Town Hall progress/habit/rule model | use existing API/constant/barrel and link existing editors | required | no duplicate ledger/threshold constants or duplicate editor |
| appearance prototype state copied into multiple features | one small owner-keyed device preference in Town | required | two owner/theme/boundary fixtures |

## Non-goals

- No new Town Hall backend ledger, new art system or automaticXP.

## Test scenarios

- deepreload;active/archive links;canonicalrules;seasonMarMay/JunAug/SepNov/DecFeb;ownerprefs;preview;noXP

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.

## Living World scope boundary — 2026-11-11

Retain Hall, rule provenance, active/archived links and owner/device seasonal persistence. PLACE-01 owns art direction; PLACE-04 consumes this appearance owner; PLACE-08 separately owns bounded cross-device ornament placement. This packet still adds no new art framework. See [scope reconciliation](../../living-world/scope.md) and [parent #304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). This is planned extension scope; it neither closes nor enlarges this packet's retained implementation acceptance.
