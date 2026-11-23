# FIXUP-25 — Put setup and requesting time off first in PTO

- Stable key: `FIXUP-25`
- GitHub leaf: [#613](https://github.com/Vivekpsps3/vivek-monorepo/issues/613)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `TUX-08`
- Conflict groups: `travel-ui`, `travel-forms`
- Verification profiles: `docs`, `travel_front`
- Priority: P1

## Outcome

Give an unconfigured user one clear PTO setup path and a configured user a balance and a direct way to book time.

## Requirements

On an unconfigured phone account the first bright action is Set up Sick at y308. PTO looks like a static message around y433 and its first setup field is around y1983, beneath an unconfigured Add time off form. With a policy, the optional Sick prompt still precedes Add time off at y1445.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [TUX-08 / #413](https://github.com/Vivekpsps3/vivek-monorepo/issues/413).

## Source paths

- `apps/travel/frontend/src/pto.component.ts`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Lead with Setup PTO or Add time off according to the source state. Make policy, Sick and forecasts deliberate secondary sections. Use one entry per edit intent with feedback beside the real action.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-25-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | At 390×844 without a policy, setup is actionable in the first viewport and lands on its first input. With a policy, current balance and Add time off lead. Sick remains independently reachable. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-25-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Enter half-days, review forecast and planned trips, and correct a policy or failed add. Existing day math, carry/caps, conflict feedback and a chart failure’s independent recovery remain correct. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Remove the initial emphasis on optional Sick, repetitive edit affordances, and gated form content that looks actionable before PTO exists. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-25.md`. Close only this leaf from its implementation PR.
