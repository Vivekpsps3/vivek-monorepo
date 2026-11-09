# MED-06 — Finish compact Media detail presentation and preserve progress drafts

- Stable key: `MED-06`
- GitHub leaf: [#240](https://github.com/Vivekpsps3/vivek-monorepo/issues/240)
- Parents: [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286). Use its branch if the amendment is not yet on main.
- Dependencies: `MED-02`, `MED-03`, `MED-04`
- Conflict groups: `media-detail-form`, `media-library`, `media-add`, `media-runtime`
- Verification profiles: `media_front`, `media_back`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Media detail presentation is compact, accessible and preserves note/rating drafts during progress changes.

Media detail presentation is compact, accessible and preserves note/rating drafts during progress changes.

## Requirements

- #85 scope4/M9; UX-7 Media form density. Library/Add acceptance moves intact to MED-09; retained #128 runtime QA moves intact to MED-10.

## Source paths

- `apps/media/frontend/src/detail.component.ts`
- `apps/media/frontend/src/detail.component.html`
- `apps/media/frontend/src/detail-meta.mjs`
- `apps/media/frontend/src/drafts.service.ts`
- `apps/media/e2e/detail-races.spec.ts`

## Target paths

- `apps/media/frontend/src/detail.component.ts`
- `apps/media/frontend/src/detail.component.html`
- `apps/media/frontend/src/media.css`
- `apps/media/e2e/`
- `apps/media/backend/static/tests/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Finish2:3 artwork/fallback kind icon/first letter, typed metadata chips, formatted episode dates/pressed44px controls and compact danger-ghost removal using current metadata helpers.
3. Use kind-specific progressive disclosure to reduce generic phone form length without discarding note/rating drafts; next-episode success/failure/Undo preserves them.
4. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
5. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| DET1 | missing artwork, metadata/episode states and unsaved note/rating | view/detail edit, mark-next then fail/Undo | fallback/layout/pressed/date/44px details correct and drafts survive every progress path | detail/next-episode/race browser and pure metadata fixtures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| repeated metadata/date/fallback calculations and unnecessary always-visible generic controls | use existing detail-meta/display helpers with focused disclosure; delete old alternate branches | required | same authoritative values/drafts and shorter interaction path proven in screenshots |

## Non-goals

- No broad rewrite of already correct M8/M11 behavior.
- No removal of meaningful outage/conflict tests or provider IO on saved views.

## Test scenarios

- artwork/metadata fallback; kind-specific disclosure; progress success/failure/Undo; note/rating draft preservation; keyboard/theme/phone

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.

## Dependency rationale

Use the merged detail tag/rating/Related editor so presentation preserves their actual draft and focus behavior. Popular discovery supplies no required detail API.
