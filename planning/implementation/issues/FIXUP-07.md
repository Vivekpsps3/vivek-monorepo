# FIXUP-07 — Make the Pixels Life atlas readable and orientable on phones

- Stable key: `FIXUP-07`
- GitHub leaf: [#585](https://github.com/Vivekpsps3/vivek-monorepo/issues/585)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `PIX-03`
- Conflict groups: `private-routes`, `town-ui`
- Verification profiles: `docs`, `web_front`
- Priority: P1

## Outcome

Make this week, a chosen decade and an exact day easy to locate.

## Requirements

Life repeats ‘Recorded activity, without judgement’, places multiple explanatory paragraphs before the poster and shows its earliest decades first. The selected week heading starts around y1216 on phone. A quiet week shows ‘0 activitys’.

Reproduce on the audited revision with synthetic data. Use pixels-facts with a saved birthday. Open /pixels/life at phone width and find the active week and a way to move through time.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [PIX-03 / #426](https://github.com/Vivekpsps3/vivek-monorepo/issues/426).

## Source paths

- `apps/web/src/app/pixels/life-page.component.html`
- `apps/web/src/app/pixels/life-page.component.ts`
- `apps/web/src/app/pixels/life-poster.component.html`
- `apps/web/src/app/pixels/life-week.component.ts`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Present selected span, useful time controls and the atlas in the first viewport. Keep a reliable jump to this week and a deliberate touch/list path for small cells.
3. Keep semantics and keyboard instructions in one contextual help block. Fix the activity plural and retain recorded, unknown, future and birthday privacy meanings.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-07-A1 | Birthday saved, long history, quiet and active weeks | Open Life, jump to this week and select a past week by touch/keyboard | Selected range and its non-color state are clear. The table and poster choose the same span and counts, with no page overflow. | 390, 320 and desktop captures and table parity |
| FIXUP-07-A2 | Partial span, leap date and hidden birthday age | Open a day and return or refresh | Week/day boundaries, selection, focus and privacy survive. 0/1/many labels are grammatical and scores are identical. | Score/date vectors and actual Day return |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Remove the duplicate tagline and repeated prefatory text. Replace the plural path that emits ‘activitys’. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Use pixels-facts with a saved birthday. Open /pixels/life at phone width and find the active week and a way to move through time.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

Life, Sunday and ISO weeks can start differently. Preserve their canonical boundaries and text alternatives.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-07.md`. Close only this leaf with the implementation PR.
