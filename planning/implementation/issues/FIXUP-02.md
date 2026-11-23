# FIXUP-02 — Put Town exploration and Today on the phone’s first screen

- Stable key: `FIXUP-02`
- GitHub leaf: [#580](https://github.com/Vivekpsps3/vivek-monorepo/issues/580)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `SCENE-02`, `SCENE-04`, `SCENE-05`, `SCENE-08`
- Conflict groups: `town-ui`, `private-routes`
- Verification profiles: `docs`, `web_front`
- Priority: P0

## Outcome

Arrive with a visible place to explore and an immediate way to check in.

## Requirements

On the 390×844 Town fixture, the map begins at y599 and Today at y1886. On an unfounded Town, the map begins at y1111 and Today at y2338. The first screen spends space on a broad XP meter, repeated place labels, onboarding and season explanation.

Reproduce on the audited revision with synthetic data. Load /town with town and town-empty fixtures without scrolling. Compare 390×844 and 1280×800.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [SCENE-02 / #440](https://github.com/Vivekpsps3/vivek-monorepo/issues/440), [SCENE-04 / #442](https://github.com/Vivekpsps3/vivek-monorepo/issues/442), [SCENE-05 / #443](https://github.com/Vivekpsps3/vivek-monorepo/issues/443), [SCENE-08 / #446](https://github.com/Vivekpsps3/vivek-monorepo/issues/446).

## Source paths

- `apps/web/src/app/town/town.component.html`
- `apps/web/src/app/town/town-exterior.component.html`
- `apps/web/src/app/town/town-exterior.component.css`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Give phone Town a visible district composition, a named building picker and a Today control in the first viewport. Make Today a compact accessible drawer with real check-in actions.
3. Make first-habit onboarding compact. Move season/audio controls behind their existing appearance surface or a compact scene control. Keep desktop Today adjacent to the map.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-02-A1 | New and established Town at 390×844 | Open Town and use touch or keyboard | A legible scene, building selector and Today are visible together. An existing habit can be checked in with at most two intentional actions from arrival. | Viewport bounds, exact write, confirmed feedback and Undo |
| FIXUP-02-A2 | Unfounded Town, 320px, 200% text or desktop | Open and dismiss Today, then found or explore | Focus returns to the opener, real rooms stay reachable, and history, archive and first habit remain discoverable. | Empty/seeded captures and keyboard order |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Replace the full-width founding block and redundant always-visible season/date explanation in the primary arrival. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Load /town with town and town-empty fixtures without scrolling. Compare 390×844 and 1280×800.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

Today must preserve scene selection and camera. Coordinate with FIXUP-03 and the Home work.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-02.md`. Close only this leaf with the implementation PR.
