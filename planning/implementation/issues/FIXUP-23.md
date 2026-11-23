# FIXUP-23 — Keep Memory Shelves playable after every keyboard match

- Stable key: `FIXUP-23`
- GitHub leaf: [#611](https://github.com/Vivekpsps3/vivek-monorepo/issues/611)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `GAME-10`
- Conflict groups: `private-routes`, `town-ui`
- Verification profiles: `docs`, `web_front`
- Priority: P0

## Outcome

Let a keyboard player finish the game without leaving or re-entering the board after a pair.

## Requirements

On the deterministic layout, match shelves 1 and 12 by keyboard. The matched second shelf remains the sole tabindex=0 and is disabled. Focus drops to BODY, ArrowRight does nothing, and there are zero eligible tile tab stops.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [GAME-10 / #478](https://github.com/Vivekpsps3/vivek-monorepo/issues/478).

## Source paths

- `apps/web/src/app/town/memory-shelves.component.ts`
- `apps/web/src/app/town/memory-shelves.component.html`
- `apps/web/e2e/town-memory.spec.ts`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Choose the next eligible shelf on a successful match and a useful action when the board ends. Handle loaded/resumed matches using the same focus decision. Keep concise first-use instructions near the board.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-23-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | From the first Tab into an ordinary round, use only arrow and activation keys until all six matches finish. Between matches there is exactly one eligible tile tab stop and visible focus. Finish exposes a logical exit or restart. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-23-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Pause/resume, reload a partial round, and play by phone touch. Same moves, seed/score and reward boundaries survive. Screen readers get matching state and a usable next action. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Remove focus references to matched/disabled tiles and expose debug seed details only where needed for reproducibility. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-23.md`. Close only this leaf from its implementation PR.
