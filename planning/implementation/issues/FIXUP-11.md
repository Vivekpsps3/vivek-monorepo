# FIXUP-11 — Put Health unlock and the next practical action above the scene

- Stable key: `FIXUP-11`
- GitHub leaf: [#589](https://github.com/Vivekpsps3/vivek-monorepo/issues/589)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `FIXUP-01`, `HEAL-05`, `ROOM-11`, `ROOM-12`, `ROOM-13`
- Conflict groups: `health-ui`, `town-ui`
- Verification profiles: `docs`, `web_front`
- Priority: P0

## Outcome

Expose an immediate way to unlock, log a measurement or start/resume a workout and keep the scenes explorable.

## Requirements

On a phone with no vault, Clinic shows a facade and five station controls before setup, with duplicate setup text. In unlocked Clinic, Measurements begins at y977 and Add weight at y1307. The unlocked Gym Workouts heading starts at y3450, below two scenes, progress and trophies.

Reproduce on the audited revision with synthetic data. Open /town/clinic and /town/gym with no vault, a locked synthetic vault and an unlocked vault with a measurement and a PR at 390×844.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [FIXUP-01 / #579](https://github.com/Vivekpsps3/vivek-monorepo/issues/579), [HEAL-05 / #436](https://github.com/Vivekpsps3/vivek-monorepo/issues/436), [ROOM-11 / #461](https://github.com/Vivekpsps3/vivek-monorepo/issues/461), [ROOM-12 / #462](https://github.com/Vivekpsps3/vivek-monorepo/issues/462), [ROOM-13 / #463](https://github.com/Vivekpsps3/vivek-monorepo/issues/463).

## Source paths

- `apps/web/src/app/town/health/health-room.component.html`
- `apps/web/src/app/town/health/health-room.component.ts`
- `apps/web/src/app/town/health/clinic-room.component.html`
- `apps/web/src/app/town/health/gym-floor.component.html`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Promote the current gate or direct create/resume into the first screen. Present one neutral preview and one accurate vault message per gated state.
3. Keep scene, history and trophies reachable by deliberate local navigation. Route direct and scene interactions to the same existing editor and draft.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-11-A1 | Vault absent, locked or source unavailable | Open either room directly or from Town | The correct setup, unlock or retry control is within the first phone viewport. It returns to the exact destination. Neutral scenery contains no private markers. | Privacy/return browser checks with two synthetic owners |
| FIXUP-11-A2 | Unlocked Clinic and Gym with and without a draft | Record a measurement or start/resume a workout, then return | The direct action is visible before scroll and invokes the same editor as the object. Save-error draft and focus behavior survive. | Touch/keyboard create/resume, lock/recovery and bounds |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Remove duplicated gate copy and redundant adjacent launch prompts that lead to the same editor. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Open /town/clinic and /town/gym with no vault, a locked synthetic vault and an unlocked vault with a measurement and a PR at 390×844.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

Preserve encryption and immediate lock clearing. Coordinate with FIXUP-01, ROOM-14 and FIT-07.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-11.md`. Close only this leaf with the implementation PR.
