# MED-03 — Replace numeric Media rating input with one accessible 0–10 editor

- Stable key: `MED-03`
- GitHub leaf: [#237](https://github.com/Vivekpsps3/vivek-monorepo/issues/237)
- Parents: [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `MED-02`
- Conflict groups: `media-detail-form`
- Verification profiles: `media_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Ratings are easy to choose or clear while legacy half ratings and unsaved drafts remain intact.

## Requirements

- #85 scope3/M7; legacy-half, null, keyboard, layout and unsaved-leave acceptance.

## Source paths

- `apps/media/frontend/src/rating-model.mjs`
- `apps/media/frontend/src/rating-model.d.mts`
- `apps/media/frontend/src/detail.component.ts`
- `apps/media/frontend/src/detail.component.html`
- `apps/media/e2e/rating.spec.ts`

## Target paths

- `apps/media/frontend/src/detail.component.ts`
- `apps/media/frontend/src/detail.component.html`
- `apps/media/frontend/src/media.css`
- `apps/media/e2e/rating.spec.ts`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Use the existing rating model and shared segmented/radio behavior for integer0–10 selection with out-of-10 accessible names and arrow keys.
3. Provide clear-to-null; preserve existing7.5-like values with an explanatory note until the owner explicitly chooses, never round on render/save.
4. Use two rows at390 and one at1280; maintain existing note/rating draft protection and persistence. Remove the superseded number input/parallel interpretation.
5. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
6. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| RATE1 | null,0,10 and saved7.5 records | open, keyboard select or clear, save/reload | integer/null writes are exact and half value is unchanged until explicit choice | model fixtures and rating browser payload assertions |
| RATE2 | unsaved detail draft at390/1280 in both themes | arrow through ratings then attempt leave/cancel | focus and accessible names work, row layout fits and unsaved protection retains draft | keyboard/width/axe and leave-confirmation evidence |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| numeric rating input and duplicated coercion/rounding branches | replace with one model-backed rating editor | required | old control absent; legacy-half roundtrip unchanged |

## Non-goals

- No new rating scale or silent half-rating migration.

## Test scenarios

- null/zero/ten/legacy-half;arrows;clear;two rows/one row;failedsave;unsavedleave

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
