# FIXUP-03 — Compose Town as a connected isometric coastal map

- Stable key: `FIXUP-03`
- GitHub leaf: [#581](https://github.com/Vivekpsps3/vivek-monorepo/issues/581)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `FIXUP-02`, `STYLE-04`, `SCENE-01`, `SCENE-02`, `SCENE-08`
- Conflict groups: `town-ui`, `private-routes`
- Verification profiles: `docs`, `web_front`
- Priority: P1

## Outcome

Give the exterior a connected coastal silhouette, distinct district landmarks and dependable direct building selection.

## Requirements

Desktop Town reads as separate rectangular color plates with flat or front-facing sprites. On phone, captions crop to ‘Trea…’, ‘Libr…’, ‘The…’, ‘Musi…’ and ‘Arca…’. Reading Hall already shows the intended depth, shadow and coherent palette.

Reproduce on the audited revision with synthetic data. Compare seeded /town at phone and desktop with /town/library and the Town concept sheet. Frame Culture and compare building silhouettes with selectable bounds.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [FIXUP-02 / #580](https://github.com/Vivekpsps3/vivek-monorepo/issues/580), [STYLE-04 / #385](https://github.com/Vivekpsps3/vivek-monorepo/issues/385), [SCENE-01 / #439](https://github.com/Vivekpsps3/vivek-monorepo/issues/439), [SCENE-02 / #440](https://github.com/Vivekpsps3/vivek-monorepo/issues/440), [SCENE-08 / #446](https://github.com/Vivekpsps3/vivek-monorepo/issues/446).

## Source paths

- `apps/web/src/app/town/town-exterior.ts`
- `apps/web/src/app/town/town-exterior.component.html`
- `apps/web/src/app/town/town-exterior.component.css`
- `apps/web/public/town/exterior`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Author a connected base with streets, shoreline, grounded buildings and readable foreground layering. Harmonize exterior sprite variants while retaining real stages.
3. Show full place names in the framed view and on selection/focus. Keep paint, camera and pick bounds tied to the existing scene owner.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-03-A1 | New or established Town, light and night | Orient in the overview and frame a district at 390×844 and 1280×800 | Districts connect visually, entrances read as places, and selected/focused names are whole. | Comparable captures and separate owner visual review |
| FIXUP-03-A2 | Near overlapping objects at multiple zoom levels | Tap, drag, and select from the keyboard picker | The intended top visible building owns the tap, drag opens nothing, and both entry paths reach the same action. | Hit tests, touch/keyboard and existing scene budgets |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Replace disconnected district plates and permanent truncated captions where the composition and focus labels cover them. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Compare seeded /town at phone and desktop with /town/library and the Town concept sheet. Frame Culture and compare building silhouettes with selectable bounds.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

Keep private data off exterior art and retain QA-04 frame/art limits. Home and game content stay with their existing packets.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-03.md`. Close only this leaf with the implementation PR.
