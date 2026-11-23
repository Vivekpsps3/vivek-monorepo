# FIXUP-28 — Give Pixels Year an easy exact-date path and usable table

- Stable key: `FIXUP-28`
- GitHub leaf: [#616](https://github.com/Vivekpsps3/vivek-monorepo/issues/616)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `PIX-02`, `PIX-03`
- Conflict groups: `private-routes`, `town-ui`
- Verification profiles: `docs`, `web_front`
- Priority: P1

## Outcome

Let a user reach an exact date by touch or keyboard without picking through tiny cells or tabbing through an entire year.

## Requirements

A Year cell is 25×25 at 390px and 19×19 at 320px, with a horizontally larger visual calendar. The table makes 365 rows sequential Tab stops and uses Enter-only row activation. At phone width the visual layout and ARIA orientation differ.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [PIX-02 / #423](https://github.com/Vivekpsps3/vivek-monorepo/issues/423), [PIX-03 / #426](https://github.com/Vivekpsps3/vivek-monorepo/issues/426).

## Source paths

- `apps/web/src/app/pixels/year-page.component.html`
- `apps/web/src/app/pixels/year-page.component.ts`
- `apps/web/src/app/pixels/year-grid.component.ts`
- `apps/web/src/app/pixels/year-table.component.html`
- `apps/web/src/app/pixels/year-table.component.ts`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Keep the dense overview. Provide one clearly labeled month/date path into the same selected day. Give the table intentional calendar semantics and efficient, native keyboard actions with visible focus. Align grid instructions and orientation with actual display.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-28-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | Use touch at 320 and 390px to reach a leap date, a recent date and a day in a previous month. Selection and exact Day return preserve the year, date, filters and useful focus. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-28-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | From the keyboard enter grid/table, reach a date using documented keys and open it via the accessible activation. No full-year sequential Tab trap. Counts, state disclosure, table parity and scoring remain identical. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Remove redundant tabbable row shims and mismatched orientation instructions after the table and shared date selection cover them. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-28.md`. Close only this leaf from its implementation PR.
