# FIXUP-20 — Make the Town Treasury door open its actual rooms

- Stable key: `FIXUP-20`
- GitHub leaf: [#608](https://github.com/Vivekpsps3/vivek-monorepo/issues/608)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `SCENE-02`, `NAV-02`, `ROOM-01`, `ROOM-02`
- Conflict groups: `private-routes`, `town-ui`, `finance-ui`, `finance-public-api`
- Verification profiles: `docs`, `web_front`, `finance_front`
- Priority: P1

## Outcome

Make the Civic Treasury a predictable door into its Finance-owned rooms while retaining progression and privacy.

## Requirements

Treasury’s exterior click target depends on budget maturity and sends ready, no-plan and no-data states to Finance Home, Planning or Activity. The real Accounts hall and Gallery live behind Finance Accounts. The locked path returns to Town after unlock instead of opening the intended room.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [SCENE-02 / #440](https://github.com/Vivekpsps3/vivek-monorepo/issues/440), [NAV-02 / #387](https://github.com/Vivekpsps3/vivek-monorepo/issues/387), [ROOM-01 / #451](https://github.com/Vivekpsps3/vivek-monorepo/issues/451), [ROOM-02 / #452](https://github.com/Vivekpsps3/vivek-monorepo/issues/452).

## Source paths

- `apps/web/src/app/town/weeks-kept.ts`
- `apps/web/src/app/town/town-exterior.ts`
- `apps/web/src/app/town/town-exterior.component.ts`
- `apps/finance/frontend/src/app/hubs/have-hub.component.ts`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Use one coherent Treasury entrance and safe gate handoff. Budget-week state guides explanation or visual stage and has a contextual planning action inside the room.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-20-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | Use the exterior click and accessible picker with vault missing, locked, ready and budget data absent. The same functional destination is offered, unlock restores that intended destination, and the exterior shows no private amounts. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-20-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Open a real account or gallery selection and return to the Civic building with useful focus. Direct Finance navigation and legacy action routes still work. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Remove budget-maturity route substitution for the actual door and its generic post-unlock destination. Keep progression rules and canonical Finance owners. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-20.md`. Close only this leaf from its implementation PR.
