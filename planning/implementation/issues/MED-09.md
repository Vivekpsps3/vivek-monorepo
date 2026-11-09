# MED-09 — Finish retained Media library and Add interaction acceptance

- Stable key: `MED-09`
- GitHub leaf: [#284](https://github.com/Vivekpsps3/vivek-monorepo/issues/284)
- Parents: [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286). Use its branch if the amendment is not yet on main.
- Dependencies: `MED-01`
- Conflict groups: `media-library`, `media-add`, `media-runtime`
- Verification profiles: `media_front`, `media_back`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Library filters, URL navigation and Add recovery are correct and predictable.

Complete the existing library and Add flows without a second filter, debounce or validation engine.

## Requirements

- #85 scope6/M8/M11 from original #86 and MED-06 LIB1. MED-06 owns detail presentation; MED-10 owns retained #128 runtime QA.

## Source paths

- `apps/media/frontend/src/library.component.ts`
- `apps/media/frontend/src/add.component.ts`
- `apps/media/e2e/library-filters.spec.ts`

## Target paths

- `apps/media/frontend/src/library.component.ts`
- `apps/media/frontend/src/add.component.ts`
- `apps/media/frontend/src/media.css`
- `apps/media/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Verify M8 library single debounced request/live URL filters/AND tags/search-sort-preserving clear/fav aliases/focus return/first result above450px; verify M11 submit/focus/live correction/zero invalidPOST.
3. Preserve each original M8/M11 acceptance clause in the evidence table: favorite aliases, AND tags, preserved search/sort when clearing, keyboard focus, first result above 450px, Add correction and no invalid POST. Reuse current filter/form helpers; fix only residual failures.
4. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
5. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LIB1 | search/filter/tag/favorite/empty/invalid Add fixtures | type rapidly, filter/back-forward, clear, submit and correct | one debounced read; URLs/state/focus/result position correct; invalid Add sends zeroPOST | existing library-filters/add-form plus targeted regressions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Competing URL/filter/debounce and invalid-submit branches in the existing library/Add owners | Keep one live request/filter/validation path; remove a proven alternate after consumers migrate. If current main already satisfies a row, record that evidence instead of adding machinery. | conditional | Request counts, back/forward URLs, focus restoration and zero invalid POST. |

## Non-goals

- No broad rewrite of already correct M8/M11 behavior.
- No removal of meaningful outage/conflict tests or provider IO on saved views.

## Test scenarios

- rapid typing gives one debounced read; AND tags; favorites/fav aliases; live URL and back/forward
- clear preserves search/sort; focus returns correctly; first result above 450px
- invalid Add submits zero POST; correction/focus/live messages; failed save preserves draft

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
