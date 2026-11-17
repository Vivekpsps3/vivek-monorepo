# GAME-12 — Grant capped minigame rewards from validated play receipts
- Stable key: `GAME-12`
- GitHub leaf: [#481](https://github.com/Vivekpsps3/vivek-monorepo/issues/481)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `GAME-01`, `GAME-10`, `GAME-11`
- Conflict groups: `town-models`, `private-routes`
- Verification profiles: `docs`, `web_front`, `server_back`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Bind game run nonce/seed/completion to an owner-scoped once-only receipt.

## Requirements

- Bind game run nonce/seed/completion to an owner-scoped once-only receipt.
- grant 5 for first valid win per game per Town civil day, cap10/day.
- no reward for replay.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [GAME-01 / #465](https://github.com/Vivekpsps3/vivek-monorepo/issues/465), [GAME-10 / #478](https://github.com/Vivekpsps3/vivek-monorepo/issues/478), [GAME-11 / #480](https://github.com/Vivekpsps3/vivek-monorepo/issues/480)
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
2. Bind game run nonce/seed/completion to an owner-scoped once-only receipt.
3. grant 5 for first valid win per game per Town civil day, cap10/day.
4. no reward for replay.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| GAME-12-A1 | Named synthetic starting records and source states | Retry finish or cross midnight/client timezone | exactly correct once-only reward. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| GAME-12-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | edited/foreign/incomplete receipt fails without balance change and later play remains available. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| GAME-12-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| GAME-12-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Retry finish or cross midnight/client timezone: exactly correct once-only reward.
- edited/foreign/incomplete receipt fails without balance change and later play remains available.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/GAME-12.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
