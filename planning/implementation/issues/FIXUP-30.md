# FIXUP-30 — Give Home a composed browse state and a deliberate edit mode

- Stable key: `FIXUP-30`
- GitHub leaf: [#618](https://github.com/Vivekpsps3/vivek-monorepo/issues/618)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `HOME-02`, `HOME-03`, `HOME-04`, `HOME-05`
- Conflict groups: `town-ui`, `private-routes`
- Verification profiles: `docs`, `web_front`
- Priority: P1

## Outcome

Make a room inviting to visit and give decorating a deliberate mode with clear controls.

## Requirements

Home currently leads with a full top-down 12×12 placement grid even while browsing. At 390px the floor occupies roughly y343–800, the inspector begins around y1117, and a useful Home action is outside the first screen. The approved Home is an authored 2.5D room with purposeful objects.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [HOME-02 / #449](https://github.com/Vivekpsps3/vivek-monorepo/issues/449), [HOME-03 / #450](https://github.com/Vivekpsps3/vivek-monorepo/issues/450), [HOME-04 / #467](https://github.com/Vivekpsps3/vivek-monorepo/issues/467), [HOME-05 / #468](https://github.com/Vivekpsps3/vivek-monorepo/issues/468).

## Source paths

- `apps/web/src/app/town/home-room.component.html`
- `apps/web/src/app/town/home-room.component.css`
- `apps/web/src/app/town/home-room.component.ts`
- `apps/web/src/app/town/home-rooms.ts`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Give each room a coherent scene with readable furnishings, purposeful first action and settled door placement. Reserve grid, coordinates and edit chrome for editing. Use current asset bounds and Home placement owner.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-30-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | Visit all rooms at 390/1280 in light/night using the same saved layout. Their distinguishing objects and visit/edit action are easy to find. Touch, mouse and keyboard reach the same primary objects. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-30-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Enter edit, position a starter and save or cancel. Confirmed placement redraws in the same scene and preserves placement, collision, focus, revision, Undo and failure behavior. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Remove the permanent debug-like floor grid and repeated coordinate help in browse mode. Keep the grid and plain-text actions available during editing. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-30.md`. Close only this leaf from its implementation PR.
