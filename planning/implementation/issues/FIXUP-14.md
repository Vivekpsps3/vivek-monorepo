# FIXUP-14 — Make Travel Memories a scannable, browsable trip collection

- Stable key: `FIXUP-14`
- GitHub leaf: [#592](https://github.com/Vivekpsps3/vivek-monorepo/issues/592)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `TUX-10`, `ROOM-05`
- Conflict groups: `travel-ui`
- Verification profiles: `docs`, `travel_front`
- Priority: P2

## Outcome

Let travelers recognize and open a saved memory quickly, with actual dates and provenance readable at a glance.

## Requirements

With two saved trips on a 390×844 phone, the first title starts at y835 after a paragraph and three-rule legend. Cards repeat dates, expose a raw source trip ID and give Open, Redate, Cancel and Delete peer treatment.

Reproduce on the audited revision with synthetic data. Use synthetic Portland and Leap harbor data and open /travel/memories. Find the first trip and inspect the management affordances.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [TUX-10 / #422](https://github.com/Vivekpsps3/vivek-monorepo/issues/422), [ROOM-05 / #455](https://github.com/Vivekpsps3/vivek-monorepo/issues/455).

## Source paths

- `apps/travel/frontend/src/memories.component.ts`
- `apps/travel/frontend/src/memories.component.css`
- `apps/travel/frontend/src/memories.mjs`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Lead with trip cards, dates and consistently placed destination/credit state. Put the full date rules in one disclosure and keep raw IDs out of primary reading.
3. Make Open trip primary. Place redate, cancel and delete in contextual management with existing confirmation and focus return.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-14-A1 | Two past trips, one missing a city and one with overlapping dates | Open Memories on phone or desktop and inspect/open a trip | First trip and open action are visible at arrival. Saved span, city and credit communicate actual state without repeated prose. | Seeded bounds and exact trip return |
| FIXUP-14-A2 | Planned, late-logged and credit-eligible trips | Try correction, cancellation/deletion and a failed save | Existing mutations, confirmation, owner bounds and one-read behavior survive. Missing or late facts remain accurate. | Failure/retry, focus and source tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Remove raw identifier paragraphs and repeated per-card semantic instructions once contextual details convey them. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Use synthetic Portland and Leap harbor data and open /travel/memories. Find the first trip and inspect the management affordances.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

Keep historical credit, correction and source identity rules intact. Harbor gallery and Pixels retain their rendering owners.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-14.md`. Close only this leaf with the implementation PR.
