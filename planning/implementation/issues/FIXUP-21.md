# FIXUP-21 — Give Treasury inspection one useful record and an explicit edit

- Stable key: `FIXUP-21`
- GitHub leaf: [#609](https://github.com/Vivekpsps3/vivek-monorepo/issues/609)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `ROOM-01`, `ROOM-02`
- Conflict groups: `finance-ui`, `finance-public-api`
- Verification profiles: `docs`, `finance_front`
- Priority: P1

## Outcome

Make selecting a drawer, holding or ledger row reveal the intended record and next action close to its origin.

## Requirements

In the browser Accounts hall opens Edit asset on the first drawer tap. Gallery repeats the current holding and transaction in inspector and later lists. At 390px first ledger row is around y2080. A ledger tap scrolls to the positions area through the shared position handler.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [ROOM-01 / #451](https://github.com/Vivekpsps3/vivek-monorepo/issues/451), [ROOM-02 / #452](https://github.com/Vivekpsps3/vivek-monorepo/issues/452).

## Source paths

- `apps/finance/frontend/src/app/accounts-hall/accounts-hall.component.html`
- `apps/finance/frontend/src/app/accounts-hall/accounts-hall.component.ts`
- `apps/finance/frontend/src/app/treasury-gallery/treasury-gallery.component.html`
- `apps/finance/frontend/src/app/treasury-gallery/treasury-gallery.component.ts`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Use a compact room selection/inspector flow with read-first account details and explicit Edit. Keep filters contextual or link exact prefiltered canonical Activity, with matching position and ledger focus.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-21-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | Inspect an account by touch or keyboard. Details appear in context and selecting or closing makes no write. Edit opens the current record editor, with focus return after Cancel, save or lock. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-21-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Choose a ledger item or holding from a rich fixture at 390px. Show the correct selected record and action near the trigger, preserve scroll/focus and same query on return, and keep record or editor ownership in Finance. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Remove repeated selected-record panels and the position-specific scroll for ledger selection. Keep advanced Activity filters reachable and coordinate overlap with ROOM-03. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-21.md`. Close only this leaf from its implementation PR.
