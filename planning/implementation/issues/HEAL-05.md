# HEAL-05 — Prove all private Health routes clear and recover through the vault
- Stable key: `HEAL-05`
- GitHub leaf: [#436](https://github.com/Vivekpsps3/vivek-monorepo/issues/436)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#256](https://github.com/Vivekpsps3/vivek-monorepo/issues/256), [#257](https://github.com/Vivekpsps3/vivek-monorepo/issues/257), [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90)
- Kind: `implementation`
- Dependencies: `HEAL-04`, `FIT-05`
- Conflict groups: `health-store`, `health-ui`
- Verification profiles: `docs`, `web_front`, `finance_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Exercise existing and new encrypted Health collections through lock, owner change, delayed reads/writes and export/restore.

## Requirements

- Exercise existing and new encrypted Health collections through lock, owner change, delayed reads/writes and export/restore.
- repair only concrete uncovered lifecycle defects.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [HEAL-04 / #430](https://github.com/Vivekpsps3/vivek-monorepo/issues/430), [FIT-05 / #435](https://github.com/Vivekpsps3/vivek-monorepo/issues/435)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app/town/health`
- `apps/finance/frontend/src/public-api.ts`

## Target paths

- `apps/web/src/app/town/health`
- `apps/finance/frontend/src/public-api.ts`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Exercise existing and new encrypted Health collections through lock, owner change, delayed reads/writes and export/restore.
3. repair only concrete uncovered lifecycle defects.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| HEAL-05-A1 | Named synthetic starting records and source states | Hold a lab/session read then lock/switch owner and resolve | no marker returns. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| HEAL-05-A2 | Named synthetic starting records and source states | export/restore all supported records under a new account | data remains correct and existing encrypted formats supported. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| HEAL-05-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| HEAL-05-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| CLINIC3 | marker lab/name during held decrypt/save | lock/switch owner/leave then release and export/restore | no retained digits/text or plaintext network/storage; restored allowed records work under current owner | marker and all-collection recovery/browser evidence |
| GYMPRIVATE | other-record marker and held read/write | lock/switch owner/leave or backuprestore | no private values/crypto initially locked or stale publication; allowed records restore | marker/import/module-load and recovery tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Hold a lab/session read then lock/switch owner and resolve: no marker returns.
- export/restore all supported records under a new account: data remains correct and existing encrypted formats supported.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/HEAL-05.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `HEALTH-01` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/HEALTH-01.md`.
- Retains its assigned rows from `HEALTH-02` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/HEALTH-02.md`.
