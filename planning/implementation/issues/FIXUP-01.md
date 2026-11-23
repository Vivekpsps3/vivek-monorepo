# FIXUP-01 — Connect Health to the Hub, suite switcher, and Quick add

- Stable key: `FIXUP-01`
- GitHub leaf: [#579](https://github.com/Vivekpsps3/vivek-monorepo/issues/579)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `NAV-01`, `NAV-03`, `HEAL-01`, `FIT-03`, `HEAL-05`
- Conflict groups: `private-routes`, `private-shell`, `hub-main`, `suite-shortcuts`, `health-ui`
- Verification profiles: `docs`, `web_front`
- Priority: P0

## Outcome

Give Health a working direct destination and let common Health tasks start from the same Hub used for other practical actions.

## Requirements

At 390×844, the Hub renders Health as a non-interactive ‘Unavailable’ tile. The same account can open /town/clinic and /town/gym directly. The switcher has no Health group, and Quick add offers only trip, Media and transaction actions.

Reproduce on the audited revision with synthetic data. Open /hub, inspect Health, open the switcher and Quick add, then load /town/clinic and /town/gym.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [NAV-01 / #386](https://github.com/Vivekpsps3/vivek-monorepo/issues/386), [NAV-03 / #388](https://github.com/Vivekpsps3/vivek-monorepo/issues/388), [HEAL-01 / #427](https://github.com/Vivekpsps3/vivek-monorepo/issues/427), [FIT-03 / #433](https://github.com/Vivekpsps3/vivek-monorepo/issues/433), [HEAL-05 / #436](https://github.com/Vivekpsps3/vivek-monorepo/issues/436).

## Source paths

- `apps/web/src/app/hub/hub-destinations.component.ts`
- `apps/web/src/app/hub/quick-add.component.ts`
- `apps/web/src/app/private-layout.component.ts`
- `apps/web/src/app/town/health/health-room.component.ts`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Choose an existing room as the Health tile's default. Expose Clinic and Gym as explicit switcher destinations with consistent active-place labels.
3. Route Record a measurement and Start or resume a workout to the existing editor owners. Preserve the allowlisted intent through vault setup/unlock and reuse the existing draft.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-01-A1 | First visit or established account | Choose Health from Hub or either room from the phone switcher | Health is a real pinnable link. Each room is reachable from another app in at most two actions and the current place identifies Health. | 390 and 1280 navigation and pin/reset |
| FIXUP-01-A2 | Vault absent, locked or ready | Choose either Health Quick add action by touch or keyboard | The intended editor opens or resumes through the existing gate, returns to the originating Hub, and exposes no private values before unlock. | Setup/unlock, Cancel, reload and lock browser checks |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Remove the static Health-unavailable shortcut and its Health-specific exclusion from pins. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Open /hub, inspect Health, open the switcher and Quick add, then load /town/clinic and /town/gym.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

Keep entry intents owner-safe and allowlisted. Coordinate Health-room edits with ROOM-14 and FIT-07.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-01.md`. Close only this leaf with the implementation PR.
