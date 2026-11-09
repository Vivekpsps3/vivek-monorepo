# MED-06 — Finish Media detail presentation and reconcile all retained library/Add/runtime QA

- Stable key: `MED-06`
- GitHub leaf: [#240](https://github.com/Vivekpsps3/vivek-monorepo/issues/240)
- Parents: [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `MED-02`, `MED-03`, `MED-04`, `MED-05`
- Conflict groups: `media-detail-form`, `media-library`, `media-add`, `media-runtime`
- Verification profiles: `media_front`, `media_back`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Media detail and existing library/Add journeys are coherent, compact and recoverable, with no historical QA left unowned.

Media detail and existing library/Add journeys are coherent, compact and recoverable, with no historical QA left unowned.

## Requirements

- #85 scope4/M9, scope6/M8/M11, scope7/#128 legacy QA; UX-7 Media form density; original sources #86 https://github.com/Vivekpsps3/vivek-monorepo/issues/86 and #128 https://github.com/Vivekpsps3/vivek-monorepo/issues/128.

## Source paths

- `apps/media/frontend/src/detail.component.ts`
- `apps/media/frontend/src/detail.component.html`
- `apps/media/frontend/src/detail-meta.mjs`
- `apps/media/frontend/src/library.component.ts`
- `apps/media/frontend/src/add.component.ts`
- `apps/media/frontend/src/drafts.service.ts`
- `apps/media/e2e/detail-races.spec.ts`
- `apps/media/e2e/library-filters.spec.ts`

## Target paths

- `apps/media/frontend/src/detail.component.ts`
- `apps/media/frontend/src/detail.component.html`
- `apps/media/frontend/src/media.css`
- `apps/media/frontend/src/library.component.ts`
- `apps/media/frontend/src/add.component.ts`
- `apps/media/e2e/`
- `apps/media/backend/static/tests/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Finish2:3 artwork/fallback kind icon/first letter, typed metadata chips, formatted episode dates/pressed44px controls and compact danger-ghost removal using current metadata helpers.
3. Use kind-specific progressive disclosure to reduce generic phone form length without discarding note/rating drafts; next-episode success/failure/Undo preserves them.
4. Verify M8 library single debounced request/live URL filters/AND tags/search-sort-preserving clear/fav aliases/focus return/first result above450px; verify M11 submit/focus/live correction/zero invalidPOST.
5. Build retained #128 evidence table for third-item late failure suppression, Monday composer header, preflight timeout, toast retirement, dead sticky_status cache and duplicate-review no-op; fix residuals at their owner and remove obsolete cache/branches.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| DET1 | missing artwork, metadata/episode states and unsaved note/rating | view/detail edit, mark-next then fail/Undo | fallback/layout/pressed/date/44px details correct and drafts survive every progress path | detail/next-episode/race browser and pure metadata fixtures |
| LIB1 | search/filter/tag/favorite/empty/invalid Add fixtures | type rapidly, filter/back-forward, clear, submit and correct | one debounced read; URLs/state/focus/result position correct; invalid Add sends zeroPOST | existing library-filters/add-form plus targeted regressions |
| MQA1 | each retained #128 finding | execute current trigger with held failures/timeouts | every finding has passing current evidence or explicit supersession; no stale cache or duplicate-review write remains | QA source→test ledger and no-op/request-count assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| dead sticky_status cache and obsolete duplicate review/failure/toast pathways | remove verified unused state and route remaining behavior through current owners | required | consumer search plus named surviving behavior tests |
| repeated metadata/date/fallback calculations and unnecessary always-visible generic controls | use existing detail-meta/display helpers with focused disclosure; delete old alternate branches | required | same authoritative values/drafts and shorter interaction path proven in screenshots |

## Non-goals

- No broad rewrite of already correct M8/M11 behavior.
- No removal of meaningful outage/conflict tests or provider IO on saved views.

## Test scenarios

- M3/M4 preserved;M8 filters;M9fallback;M11invalidpost;third latefailure;Mondayheader;preflight;toast;stickycache;duplicate review

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
