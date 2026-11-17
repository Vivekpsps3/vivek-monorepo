# ROOM-10 — Connect tracked games and Town games inside the Arcade
- Stable key: `ROOM-10`
- GitHub leaf: [#460](https://github.com/Vivekpsps3/vivek-monorepo/issues/460)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#314](https://github.com/Vivekpsps3/vivek-monorepo/issues/314)
- Kind: `implementation`
- Dependencies: `SCENE-03`, `MUX-06`
- Conflict groups: `media-collections`, `media-records`
- Verification profiles: `docs`, `media_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Author game collection cabinets and two clearly named play tables.

## Requirements

- Author game collection cabinets and two clearly named play tables.
- tracked catalog opens Media detail while game tables open gameplay.
- mark unopened cabinets truthfully.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [SCENE-03 / #441](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [MUX-06 / #402](https://github.com/Vivekpsps3/vivek-monorepo/issues/402)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/media/frontend/src`
- `apps/media/backend/services/records.py`

## Target paths

- `apps/media/frontend/src`
- `apps/media/backend/services/records.py`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Author game collection cabinets and two clearly named play tables.
3. tracked catalog opens Media detail while game tables open gameplay.
4. mark unopened cabinets truthfully.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| ROOM-10-A1 | Named synthetic starting records and source states | Inspect tracked game and start minigame | actions affect their own owner only. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| ROOM-10-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | locked/empty collection still leaves authored play objects usable. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| ROOM-10-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| ROOM-10-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Inspect tracked game and start minigame: actions affect their own owner only.
- locked/empty collection still leaves authored play objects usable.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/ROOM-10.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-10` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-10.md`.
