# FIXUP-04 — Keep Reading Hall and Hall object actions beside the scene

- Stable key: `FIXUP-04`
- GitHub leaf: [#582](https://github.com/Vivekpsps3/vivek-monorepo/issues/582)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `SCENE-03`, `SCENE-06`, `ROOM-06`
- Conflict groups: `town-ui`, `private-routes`
- Verification profiles: `docs`, `web_front`
- Priority: P1

## Outcome

Make selecting an object and using its action feel like a single interaction.

## Requirements

At 390×844, Reading Hall’s inspector begins around y760 and Hall’s rules inspector around y812 after the scene and persistent controls. Desktop Reading Hall shows the intended adjacent view. It exposes Town in the breadcrumb, Back to Town, and Town in the global shell at once.

Reproduce on the audited revision with synthetic data. In /town/hall and /town/library, choose objects by tapping the scene and using the keyboard picker. Open a record or setting and return.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [SCENE-03 / #441](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [SCENE-06 / #444](https://github.com/Vivekpsps3/vivek-monorepo/issues/444), [ROOM-06 / #456](https://github.com/Vivekpsps3/vivek-monorepo/issues/456).

## Source paths

- `apps/web/src/app/town/library-room.component.html`
- `apps/web/src/app/town/library-room.component.ts`
- `apps/web/src/app/town/hall-room.component.html`
- `apps/web/src/app/town/hall-room.component.ts`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Keep desktop inspection beside the scene. Surface the selected action in an accessible phone sheet with clear close and predictable scroll/focus return.
3. Use one room-level exit that preserves district/object. Keep object controls touch and keyboard usable and consolidate persistent camera instructions.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-04-A1 | Reading Hall with a saved book and Hall with progress | Select a purposeful object by touch at 390×844 | The title and primary action appear in the current viewport in one tap. Close returns to the object or its picker. | Visible-area check, Escape and focus/pan restoration |
| FIXUP-04-A2 | Keyboard and direct reload | Open a record or Hall setting and use explicit or browser return | The same room, object and useful focus restore without triggering a write. | Actual record/settings return and 320px stress |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Replace the always-rendered small-screen empty inspector and duplicate room exits. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- In /town/hall and /town/library, choose objects by tapping the scene and using the keyboard picker. Open a record or setting and return.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

SCENE-07 and ROOM-15 add real Hall/Library objects. Preserve their outcomes and coordinate edits.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-04.md`. Close only this leaf with the implementation PR.
