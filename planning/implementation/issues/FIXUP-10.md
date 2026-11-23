# FIXUP-10 — Make the Town harbor door open Terminal with a real return

- Stable key: `FIXUP-10`
- GitHub leaf: [#588](https://github.com/Vivekpsps3/vivek-monorepo/issues/588)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `SCENE-02`, `NAV-02`, `ROOM-04`, `ROOM-05`
- Conflict groups: `town-ui`, `private-routes`, `travel-forms`, `travel-ui`
- Verification profiles: `docs`, `web_front`, `travel_front`
- Priority: P0

## Outcome

Enter Terminal directly from the Town harbor and return to the harbor from Terminal.

## Requirements

The Town harbor is labeled Inn and its door points to /travel even though /travel/terminal now has departures, bookings, itinerary, map and gallery. Terminal’s explicit exit always points to Trips.

Reproduce on the audited revision with synthetic data. Open Town’s harbor building, then use Travel’s Terminal section. Compare the first landing and explicit exit with a direct Terminal visit.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [SCENE-02 / #440](https://github.com/Vivekpsps3/vivek-monorepo/issues/440), [NAV-02 / #387](https://github.com/Vivekpsps3/vivek-monorepo/issues/387), [ROOM-04 / #454](https://github.com/Vivekpsps3/vivek-monorepo/issues/454), [ROOM-05 / #455](https://github.com/Vivekpsps3/vivek-monorepo/issues/455).

## Source paths

- `apps/web/src/app/town/town-exterior.ts`
- `apps/web/src/app/town/town-exterior.component.ts`
- `apps/travel/frontend/src/terminal-hall.component.html`
- `apps/travel/frontend/src/terminal-hall.component.ts`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Label and route the functional entrance consistently with Terminal. Use the existing Travel-owned route and preserve the historical Inn progression meaning.
3. Use existing return context for the Town exit and restore district/door selection. Keep Trips as the fallback for direct and Travel-origin links.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-10-A1 | Town at Harbor using touch, mouse or keyboard | Enter a Terminal room and use explicit exit or browser Back | The first landing is the canonical Terminal. Return restores Harbor/current focus and uses existing unfinished-flight protections. | Real cross-app journey with three input paths |
| FIXUP-10-A2 | Direct link or Travel navigation | Open Terminal, inspect a saved trip/day and exit | Direct access, exact room/trip/date and Trips fallback stay usable. | Direct/refresh and return-context checks |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Replace the generic Trips launcher in the harbor door and the unconditional Trips exit for Town-origin Terminal sessions. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Open Town’s harbor building, then use Travel’s Terminal section. Compare the first landing and explicit exit with a direct Terminal visit.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

Keep Inn progression, existing trip IDs and date state. Coordinate Town navigation with FIXUP-02 and FIXUP-03.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-10.md`. Close only this leaf with the implementation PR.
