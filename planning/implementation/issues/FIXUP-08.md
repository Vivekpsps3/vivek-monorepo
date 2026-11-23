# FIXUP-08 — Show one useful trail through a Pixels day

- Stable key: `FIXUP-08`
- GitHub leaf: [#586](https://github.com/Vivekpsps3/vivek-monorepo/issues/586)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `PIX-02`, `SCENE-09`, `SCENE-10`
- Conflict groups: `private-routes`, `town-ui`
- Verification profiles: `docs`, `web_front`
- Priority: P1

## Outcome

Lead with what happened that day and make exact sources and factual date distinctions easy to find.

## Requirements

On a phone day with one habit, one trip and one learning annotation, Pixels repeats the data in a summary, source panels, Dated facts, and a Keepsakes shelf 3300px down. Portland appears as the Travel record and again under ‘Not souvenirs’. The view exposes raw occurrence IDs and repeats date-credit explanations.

Reproduce on the audited revision with synthetic data. Open /pixels/day?date=2026-08-15&year=2026 with pixels-facts. Follow the document from the first named record to the repeated trip and concept sections.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [PIX-02 / #423](https://github.com/Vivekpsps3/vivek-monorepo/issues/423), [SCENE-09 / #447](https://github.com/Vivekpsps3/vivek-monorepo/issues/447), [SCENE-10 / #448](https://github.com/Vivekpsps3/vivek-monorepo/issues/448).

## Source paths

- `apps/web/src/app/pixels/day-page.component.html`
- `apps/web/src/app/pixels/day-detail.component.html`
- `apps/web/src/app/pixels/memory-preview.component.html`
- `apps/web/src/app/town/keepsake-shelf.component.html`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Compose one ordered day from the existing projections. Present each occurrence once and attach an actual keepsake or source-date distinction where it adds information.
3. Keep independent source states and a concise provenance disclosure. Keep concept corrections reachable with the canonical migration. Give PHOTO-04 and NOTE-04 a single place for their records and status.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-08-A1 | Day with habit, trip, concept, watch and applicable keepsake | Read the day and open each exact source | The first named fact and its source action appear in the initial 390×844 viewport. Each occurrence has one primary representation, with dates distinguishing span, completion and Town credit. | Seeded capture and canonical journey for each source |
| FIXUP-08-A2 | Locked, unavailable, empty, truncated and disconnected sources | Open and return from source, unlock or change date | Source states remain independent, scores stay equal, and Year/Life context survives. | Held-response, lock, score/date and Back checks |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Remove repeated summary, Dated facts/keepsake renderings of the same occurrence, raw IDs from primary reading and repeated date-rule text. Preserve standalone Keepsakes. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Open /pixels/day?date=2026-08-15&year=2026 with pixels-facts. Follow the document from the first named record to the repeated trip and concept sections.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

Coordinate with MERGE-01, ROOM-15, PHOTO-04 and NOTE-04. Preserve concept editing and fallback pending canonical migration.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-08.md`. Close only this leaf with the implementation PR.
