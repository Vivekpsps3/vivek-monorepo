# ROOM-04 — Book and inspect a real journey in the terminal hall
- Stable key: `ROOM-04`
- GitHub leaf: [#454](https://github.com/Vivekpsps3/vivek-monorepo/issues/454)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `SCENE-03`, `TUX-04`, `TUX-06`
- Conflict groups: `travel-forms`, `travel-ui`
- Verification profiles: `docs`, `travel_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Author departure board, booking desk and itinerary table.

## Requirements

- Author departure board, booking desk and itinerary table.
- open actual flight/trip/day actions.
- retain draft return and useful empty manual/flight choices.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [SCENE-03 / #441](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [TUX-04 / #409](https://github.com/Vivekpsps3/vivek-monorepo/issues/409), [TUX-06 / #411](https://github.com/Vivekpsps3/vivek-monorepo/issues/411)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/travel/frontend/src`
- `apps/travel/backend/routers`

## Target paths

- `apps/travel/frontend/src`
- `apps/travel/backend/routers`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Author departure board, booking desk and itinerary table.
3. open actual flight/trip/day actions.
4. retain draft return and useful empty manual/flight choices.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| ROOM-04-A1 | Named synthetic starting records and source states | Enter Terminal with no trips | start flight-first capture. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| ROOM-04-A2 | Named synthetic starting records and source states | select a saved departure and return from editor | exact leg/day/context restore without new trip copies. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| ROOM-04-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| ROOM-04-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Enter Terminal with no trips: start flight-first capture.
- select a saved departure and return from editor: exact leg/day/context restore without new trip copies.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/ROOM-04.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
