# FIXUP-32 — Use one set of actionable Clinic lab and checkup rows

- Stable key: `FIXUP-32`
- GitHub leaf: [#620](https://github.com/Vivekpsps3/vivek-monorepo/issues/620)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `ROOM-14`, `HEAL-05`
- Conflict groups: `health-ui`
- Verification profiles: `docs`, `web_front`
- Priority: P1

## Outcome

Let a user scan and correct the actual result row while preserving clinical context and privacy.

## Requirements

On a 390px Clinic archive with two readings for one marker, the chart starts near y749, first result near y1025 and first Edit near y1449. The same observations appear in chart data, a range table and a separate actionable list. A checkup note repeats in Latest, chart text, table and actions.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [ROOM-14 / #464](https://github.com/Vivekpsps3/vivek-monorepo/issues/464), [HEAL-05 / #436](https://github.com/Vivekpsps3/vivek-monorepo/issues/436).

## Source paths

- `apps/web/src/app/town/health/health-room.component.html`
- `apps/web/src/app/town/health/health-room.component.ts`
- `apps/web/e2e/health-entry.spec.ts`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Keep one latest or trend summary where useful and one authoritative date/value/range/flag row with its own record actions. Use that list as the chart’s readable alternative where appropriate.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-32-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | Open a mixed lab or checkup archive on 390/1280. Select a marker/date, find its unit and range status, and edit that record from the same row. Preserve stable ordering and selection through paging and return. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-32-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Force invalid range, revision conflict, vault lock and reopen. Correction is accurate and private. Preserve distinct ranges, stored units, record identities, lock clearing and meaningful chart parity. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Remove duplicate displayed values and parallel action lists after the canonical rows carry the same supported inspection/edit functions. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-32.md`. Close only this leaf from its implementation PR.
