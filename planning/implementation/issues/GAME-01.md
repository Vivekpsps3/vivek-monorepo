# GAME-01 — Implement the game-only Stamp wallet and entitlement contract
- Stable key: `GAME-01`
- GitHub leaf: [#465](https://github.com/Vivekpsps3/vivek-monorepo/issues/465)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#313](https://github.com/Vivekpsps3/vivek-monorepo/issues/313)
- Kind: `implementation`
- Dependencies: none
- Conflict groups: `schema-head`, `town-writes`
- Verification profiles: `docs`, `server_back`, `schema`, `web_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Use Town-owned transaction/reward receipts with owner/unique grant identity and atomic spend/refund.

## Requirements

- Use Town-owned transaction/reward receipts with owner/unique grant identity and atomic spend/refund.
- start zero and never ingest private life metrics.
- name market/quest/minigame consumers.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. No new leaf prerequisite.
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/server/town`
- `apps/server/alembic/versions`
- `apps/web/src/app/town`

## Target paths

- `apps/server/town`
- `apps/server/alembic/versions`
- `apps/web/src/app/town`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Use Town-owned transaction/reward receipts with owner/unique grant identity and atomic spend/refund.
3. start zero and never ingest private life metrics.
4. name market/quest/minigame consumers.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| GAME-01-A1 | Named synthetic starting records and source states | Retry or race two 10-Stamp rewards/purchases | once-only receipt and no negative balance. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| GAME-01-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | another owner's receipt/item is unreadable and unsupported data survives migration. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| GAME-01-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| GAME-01-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Retry or race two 10-Stamp rewards/purchases: once-only receipt and no negative balance.
- another owner's receipt/item is unreadable and unsupported data survives migration.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/GAME-01.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-09` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-09.md`.
