# MUX-09 — Style Now and Calendar without duplicating their saved queries
- Stable key: `MUX-09`
- GitHub leaf: [#405](https://github.com/Vivekpsps3/vivek-monorepo/issues/405)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `MUX-04`, `STYLE-03`
- Conflict groups: `media-collections`, `media-records`
- Verification profiles: `docs`, `media_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Keep Now for continuation and upcoming releases.

## Requirements

- Keep Now for continuation and upcoming releases.
- use the shared saved calendar data with explicit refresh.
- retain lifecycle, date precision and next-episode ownership.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [MUX-04 / #400](https://github.com/Vivekpsps3/vivek-monorepo/issues/400), [STYLE-03 / #384](https://github.com/Vivekpsps3/vivek-monorepo/issues/384)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/media/frontend/src`
- `apps/media/backend/services/records.py`

## Target paths

- `apps/media/frontend/src`
- `apps/media/backend/services/records.py`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Keep Now for continuation and upcoming releases.
3. use the shared saved calendar data with explicit refresh.
4. retain lifecycle, date precision and next-episode ownership.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| MUX-09-A1 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | Unknown-day film release remains a month/year band. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| MUX-09-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | provider outage leaves saved calendar and next-episode actions useful without duplicate source requests. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| MUX-09-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| MUX-09-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Unknown-day film release remains a month/year band.
- provider outage leaves saved calendar and next-episode actions useful without duplicate source requests.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/MUX-09.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
