# FIXUP-24 — Make Travel trip detail start at the selected day

- Stable key: `FIXUP-24`
- GitHub leaf: [#612](https://github.com/Vivekpsps3/vivek-monorepo/issues/612)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `TUX-06`, `ROOM-05`, `NAV-02`
- Conflict groups: `travel-ui`, `travel-forms`
- Verification profiles: `docs`, `travel_front`
- Priority: P1

## Outcome

Make a trip’s chosen day, saved records and next reasonable action one coherent itinerary.

## Requirements

A direct nine-day trip link naming Nov 23 opens at the top with five earlier lodging panels. The named day starts around y2230 on phone and y1903 on desktop. Choosing Edit activity opens a dialog called Add activity. A lower reminder form saves a row roughly 1,780px above its control while focus remains below.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [TUX-06 / #411](https://github.com/Vivekpsps3/vivek-monorepo/issues/411), [ROOM-05 / #455](https://github.com/Vivekpsps3/vivek-monorepo/issues/455), [NAV-02 / #387](https://github.com/Vivekpsps3/vivek-monorepo/issues/387).

## Source paths

- `apps/travel/frontend/src/trip.component.html`
- `apps/travel/frontend/src/trip.component.ts`
- `apps/travel/frontend/src/trip-reminders.component.ts`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Prioritize the exact requested or next useful day and one contextual add path. Keep full agenda and range context through day navigation. Move reminder capture and outcome together. Title edits accurately and provide named loading/failure states.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-24-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | Open a rich booked trip and a draft at 390 and 1280px with a day in the URL. That day and a useful next action are visible on arrival. Browse days, edit a real event and return to its exact date and focus. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-24-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Add/edit a reminder and observe its result or validation near the authoring control. A held or failed load has a meaningful status and Retry. Preserve authoritative time zones, PTO, Finance linkage and no invented dates. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Remove repeated lodging-only action blocks in the default itinerary and redundant detached reminder entry after equivalent entry and listing are reachable. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-24.md`. Close only this leaf from its implementation PR.
