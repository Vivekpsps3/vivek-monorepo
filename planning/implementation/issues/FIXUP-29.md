# FIXUP-29 — Make repeated set logging the Gym editor’s main flow

- Stable key: `FIXUP-29`
- GitHub leaf: [#617](https://github.com/Vivekpsps3/vivek-monorepo/issues/617)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `FIT-03`, `FIT-04`, `FIT-07`
- Conflict groups: `health-ui`
- Verification profiles: `docs`, `web_front`
- Priority: P1

## Outcome

Make logging and correcting the next set quick while someone is exercising.

## Requirements

Blank Add session defaults to Completed and shows both Save and Complete session. At 390px first Load begins near y1089 and Reps y1230. Add set leaves focus on the button below the expanding list while the next load input is above the visible dialog. Saved set rows show reorder/remove but no direct numeric correction.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [FIT-03 / #433](https://github.com/Vivekpsps3/vivek-monorepo/issues/433), [FIT-04 / #434](https://github.com/Vivekpsps3/vivek-monorepo/issues/434), [FIT-07 / #438](https://github.com/Vivekpsps3/vivek-monorepo/issues/438).

## Source paths

- `apps/web/src/app/town/health/health-workout-dialog.component.html`
- `apps/web/src/app/town/health/health-workout-dialog.component.ts`
- `apps/web/src/app/town/health/health-workout-dialog.component.css`
- `apps/web/src/app/town/health/workout.ts`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Keep the selected exercise’s set input and main action visible. On a successful set move focus to the next useful field. Give existing sets an in-place or explicit edit. Use clear save-draft and finish actions with a truthful starting state.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-29-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | On phone and keyboard log three sets across strength/time-distance inputs, correct one and reorder. The next input remains visible and focused where appropriate. Counts, units, revision identities and recorded completion stay accurate. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-29-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Save and resume a draft, finish intentionally, and retry a failed/conflicting update. Cancel, lock, owner change, no fictitious records and existing routine/history semantics remain intact. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Remove competing completion controls and repeated row-management affordances from routine logging; retain deliberate edit, reorder and removal access. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-29.md`. Close only this leaf from its implementation PR.
