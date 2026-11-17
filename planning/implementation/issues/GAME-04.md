# GAME-04 — Ship the six authored Town chapters and their keepsakes
- Stable key: `GAME-04`
- GitHub leaf: [#479](https://github.com/Vivekpsps3/vivek-monorepo/issues/479)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `GAME-03`, `HOME-04`, `ROOM-04`, `ROOM-06`, `GAME-10`
- Conflict groups: `town-models`, `private-routes`
- Verification profiles: `docs`, `web_front`, `server_back`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Implement the exact chapter table, three steps each, once-only 10 Stamps and named postcard/seal.

## Requirements

- Implement the exact chapter table, three steps each, once-only 10 Stamps and named postcard/seal.
- source samples labeled.
- no mandatory attendance.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [GAME-03 / #472](https://github.com/Vivekpsps3/vivek-monorepo/issues/472), [HOME-04 / #467](https://github.com/Vivekpsps3/vivek-monorepo/issues/467), [ROOM-04 / #454](https://github.com/Vivekpsps3/vivek-monorepo/issues/454), [ROOM-06 / #456](https://github.com/Vivekpsps3/vivek-monorepo/issues/456), [GAME-10 / #478](https://github.com/Vivekpsps3/vivek-monorepo/issues/478)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app`
- `apps/server/town`
- `apps/server/pixels`

## Target paths

- `apps/web/src/app`
- `apps/server/town`
- `apps/server/pixels`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Implement the exact chapter table, three steps each, once-only 10 Stamps and named postcard/seal.
3. source samples labeled.
4. no mandatory attendance.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| GAME-04-A1 | Named synthetic starting records and source states | Finish each chapter with empty and populated accounts | exact reward once and keepsake appears. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| GAME-04-A2 | Named synthetic starting records and source states | reenter after long absence | no expired task, lost reward or penalty. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| GAME-04-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| GAME-04-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Finish each chapter with empty and populated accounts: exact reward once and keepsake appears.
- reenter after long absence: no expired task, lost reward or penalty.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/GAME-04.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
