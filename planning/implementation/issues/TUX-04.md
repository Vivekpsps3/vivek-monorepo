# TUX-04 — Create trips from flight number and date with review
- Stable key: `TUX-04`
- GitHub leaf: [#409](https://github.com/Vivekpsps3/vivek-monorepo/issues/409)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `TUX-02`, `TUX-03`, `NAV-02`, `STYLE-02`
- Conflict groups: `travel-forms`, `travel-ui`
- Verification profiles: `docs`, `travel_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Start flight-first before destination typing.

## Requirements

- Start flight-first before destination typing.
- preview inferred fields and choose candidate/new/existing trip.
- retain manual entry and editable overrides.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [TUX-02 / #407](https://github.com/Vivekpsps3/vivek-monorepo/issues/407), [TUX-03 / #408](https://github.com/Vivekpsps3/vivek-monorepo/issues/408), [NAV-02 / #387](https://github.com/Vivekpsps3/vivek-monorepo/issues/387), [STYLE-02 / #383](https://github.com/Vivekpsps3/vivek-monorepo/issues/383)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/travel/frontend/src`
- `apps/travel/backend/routers`

## Target paths

- `apps/travel/frontend/src`
- `apps/travel/backend/routers`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Start flight-first before destination typing.
3. preview inferred fields and choose candidate/new/existing trip.
4. retain manual entry and editable overrides.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| TUX-04-A1 | Named synthetic starting records and source states | Enter one flight/date | route/local times are proposed and reviewed. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| TUX-04-A2 | Named synthetic starting records and source states | visit settings for a key then return | draft survives and no incomplete trip is silently finalized. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| TUX-04-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| TUX-04-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Enter one flight/date: route/local times are proposed and reviewed.
- visit settings for a key then return: draft survives and no incomplete trip is silently finalized.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/TUX-04.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
