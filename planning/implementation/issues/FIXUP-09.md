# FIXUP-09 — Make flight, calendar, and manual trip planning deliberate choices

- Stable key: `FIXUP-09`
- GitHub leaf: [#587](https://github.com/Vivekpsps3/vivek-monorepo/issues/587)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `TUX-03`, `TUX-04`, `TUX-05`, `TUX-07`
- Conflict groups: `travel-forms`, `travel-ui`
- Verification profiles: `docs`, `travel_front`
- Priority: P1

## Outcome

Let travelers choose their starting information immediately and see the next relevant action.

## Requirements

On /travel/trips/new at 390×844, Flight starts at y322, Calendar at y1014 and the manual fields further down. The screen stacks three workflows and their instructions. A person with a destination and dates scrolls past two unrelated paths.

Reproduce on the audited revision with synthetic data. Choose Plan a trip, then try to enter known dates manually or import a calendar file before touching the flight fields.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [TUX-03 / #408](https://github.com/Vivekpsps3/vivek-monorepo/issues/408), [TUX-04 / #409](https://github.com/Vivekpsps3/vivek-monorepo/issues/409), [TUX-05 / #410](https://github.com/Vivekpsps3/vivek-monorepo/issues/410), [TUX-07 / #412](https://github.com/Vivekpsps3/vivek-monorepo/issues/412).

## Source paths

- `apps/travel/frontend/src/new-trip.component.ts`
- `apps/travel/frontend/src/flight-start.component.ts`
- `apps/travel/frontend/src/public-api.ts`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Show Flight/date, Calendar booking and Manual as three named choices near the title, with one working form at a time. A mode-specific entry such as Terminal booking opens that mode directly.
3. Keep one draft owner. Switching mode, viewing settings or recovering failed saves preserves applicable input and previews.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-09-A1 | Three starting intents at 390×844 and 1280×800 | Choose a mode by touch/keyboard and submit a valid fixture | All choices are visible at arrival. A mode shows its first input immediately, flight/calendar confirm a proposal, and manual opens direct dates and destination. | Executed manual, outbound-only and calendar preview journeys |
| FIXUP-09-A2 | Missing provider, bad calendar file, mode change or failed write | Correct, switch, return or cancel | Relevant drafts survive recoverable failure. No hidden fields, blank/guessed date or invented PTO writes occur. Dedupe and request bounds are preserved. | Provider fixture, write assertions and focus |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Remove the always-stacked unrelated forms and repeated instructions from the active mode once mode choice and inline help cover them. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Choose Plan a trip, then try to enter known dates manually or import a calendar file before touching the flight fields.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

Keep the shared FlightAware editor and provider handling. Real credential activation is external to this leaf.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-09.md`. Close only this leaf with the implementation PR.
