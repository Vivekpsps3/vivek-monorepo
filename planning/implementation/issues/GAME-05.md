# GAME-05 — Give residents reachable dialogue and persistent relationship ranks
- Stable key: `GAME-05`
- GitHub leaf: [#473](https://github.com/Vivekpsps3/vivek-monorepo/issues/473)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#316](https://github.com/Vivekpsps3/vivek-monorepo/issues/316)
- Kind: `implementation`
- Dependencies: `GAME-01`, `SCENE-03`
- Conflict groups: `town-models`, `private-routes`
- Verification profiles: `docs`, `web_front`, `server_back`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Support six residents, five authored conversation identities each and 0-5 nondecaying ranks.

## Requirements

- Support six residents, five authored conversation identities each and 0-5 nondecaying ranks.
- one-time welcome gives 2 Stamps.
- directory bypasses ambient schedule.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [GAME-01 / #465](https://github.com/Vivekpsps3/vivek-monorepo/issues/465), [SCENE-03 / #441](https://github.com/Vivekpsps3/vivek-monorepo/issues/441)
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
2. Support six residents, five authored conversation identities each and 0-5 nondecaying ranks.
3. one-time welcome gives 2 Stamps.
4. directory bypasses ambient schedule.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| GAME-05-A1 | Named synthetic starting records and source states | Talk twice or replay conversation | one rank/welcome reward only. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| GAME-05-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | offscreen resident remains reachable and no private life value is inserted into dialogue/state. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| GAME-05-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| GAME-05-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-12-CAST | known public facts and quiet/return visits | inspect each resident | specific truthful purpose, no invented events/private details and no task gate | catalog-condition tests and rendered vignettes |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Talk twice or replay conversation: one rank/welcome reward only.
- offscreen resident remains reachable and no private life value is inserted into dialogue/state.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/GAME-05.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-12` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-12.md`.
