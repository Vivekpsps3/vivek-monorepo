# TOWN-04 — Close every retained Town interaction finding and mutation survivor

- Stable key: `TOWN-04`
- GitHub leaf: [#252](https://github.com/Vivekpsps3/vivek-monorepo/issues/252)
- Parents: [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `TOWN-01`, `TOWN-03`
- Conflict groups: `town-main`, `town-dialogs`, `town-today`, `town-browser`
- Verification profiles: `web_front`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Town check-in/history/edit/Undo interactions are understandable and safe across keyboard, touch and both themes.

Town check-in/history/edit/Undo interactions are understandable and safe across keyboard, touch and both themes.

## Requirements

- #81 delivery6; #115 all20 historical findings and31 mutation survivors https://github.com/Vivekpsps3/vivek-monorepo/issues/115; all corresponding #81 responsive/a11y/error acceptance.

## Source paths

- `apps/web/src/app/town/town-today.component.ts`
- `apps/web/src/app/town/town-today.component.html`
- `apps/web/src/app/town/history-dialog.component.ts`
- `apps/web/src/app/town/history-dialog.component.html`
- `apps/web/src/app/town/habit-dialog.component.ts`
- `apps/web/src/app/town/town-lot.component.ts`
- `apps/server/town/writes.py`

## Target paths

- `apps/web/src/app/town/town-today.component.ts`
- `apps/web/src/app/town/history-dialog.component.ts`
- `apps/web/src/app/town/habit-dialog.component.ts`
- `apps/web/src/app/town/town-lot.component.ts`
- `apps/web/src/app/town/town-today.component.html`
- `apps/web/src/app/town/history-dialog.component.html`
- `apps/web/src/app/town/habit-dialog.component.html`
- `apps/web/src/app/town/town-lot.component.css`
- `apps/web/e2e/`
- `apps/server/tests/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Read preserved #115 source/comments and enumerate every20finding/31survivor into a current trigger/invariant/test/disposition matrix before implementation.
3. Fix genuine residuals: done/rest/missed/pending history legend with shape/patterns;≥3:1 glyph/control contrast across states/themes/hover; Mark yesterday disabled/guarded during load/failure/in-flight/duplicate intent.
4. Finish readable linked field errors, focus return, Undo reannouncement, responsive lot labels and meaningful accessible building names.
5. Reuse current menu/dialog/toast/confirmation primitives and remove repeated special-case state only after its callers migrate. Obsolete findings require current evidence, not duplicate rewrites.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| TQA1 | the full20finding/31survivor source inventory | run each actual current trigger or demonstrate explicit supersession | every item has an exact invariant and passing surviving test; none is silently dropped | complete source-ID→test/disposition matrix |
| TQA2 | check/history/edit under loading/failure/held POST and Undo | use pointer/keyboard and repeat yesterday action | no duplicatePOST; disabled states/errors/focus/reannouncement/legend correct | unit/API and actual Town browser interactions |
| TQA3 | 390/1280,light/dark,hover/focus and relevant lot states | inspect/control Town and dialogs | contrast/shapes/labels/44px/no-overflow/axe hold | contrast measurements and responsive screenshots/browser |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| stale interaction workaround branches and duplicated per-dialog state | reuse existing current primitives and delete obsolete branch after behavioral migration | required | named surviving tests and consumer/removal ledger |

## Non-goals

- No threshold reduction, blanket mutation-score claim or helper-only acceptance.

## Test scenarios

- all20/31;legendpatterns;contrast3:1;MarkYesterdayload/error/double;field errors;focus;Undo;lotlabels

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
