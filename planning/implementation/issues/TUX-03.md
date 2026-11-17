# TUX-03 — Persist incomplete trip drafts without inventing return dates
- Stable key: `TUX-03`
- GitHub leaf: [#408](https://github.com/Vivekpsps3/vivek-monorepo/issues/408)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: none
- Conflict groups: `schema-head`, `travel-records`
- Verification profiles: `docs`, `travel_back`, `server_back`, `schema`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Add an explicit draft lifecycle for partially known trips.

## Requirements

- Add an explicit draft lifecycle for partially known trips.
- preserve existing complete trips and PTO semantics.
- distinguish inferred proposals from confirmed fields.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. No new leaf prerequisite.
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/travel/backend`
- `apps/server/alembic/versions`

## Target paths

- `apps/travel/backend`
- `apps/server/alembic/versions`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Add an explicit draft lifecycle for partially known trips.
3. preserve existing complete trips and PTO semantics.
4. distinguish inferred proposals from confirmed fields.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| TUX-03-A1 | Named synthetic starting records and source states | Save a single outbound leg with unknown return | no made-up return or PTO charge. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| TUX-03-A2 | Named synthetic starting records and source states | upgrade existing trips | all dates, children, costs and allocations remain unchanged. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| TUX-03-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Save a single outbound leg with unknown return: no made-up return or PTO charge.
- upgrade existing trips: all dates, children, costs and allocations remain unchanged.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/TUX-03.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
