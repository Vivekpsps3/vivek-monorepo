# FIT-01 — Register versioned private workout exercises, routines and sessions
- Stable key: `FIT-01`
- GitHub leaf: [#431](https://github.com/Vivekpsps3/vivek-monorepo/issues/431)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90)
- Kind: `implementation`
- Dependencies: `HEAL-01`
- Conflict groups: `vault-collections`, `health-store`
- Verification profiles: `docs`, `web_front`, `finance_front`, `finance_back`, `server_back`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Add one bounded encrypted workout collection through current policy/recovery.

## Requirements

- Add one bounded encrypted workout collection through current policy/recovery.
- define explicit kinds and canonical units.
- preserve existing health_prs and no new plaintext endpoint.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [HEAL-01 / #427](https://github.com/Vivekpsps3/vivek-monorepo/issues/427)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app/town/health`
- `apps/finance/backend`

## Target paths

- `apps/web/src/app/town/health`
- `apps/finance/backend`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Add one bounded encrypted workout collection through current policy/recovery.
3. define explicit kinds and canonical units.
4. preserve existing health_prs and no new plaintext endpoint.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIT-01-A1 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | Existing PR/stat backup restores unchanged with new records. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| FIT-01-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | invalid/oversized workout record fails with editable draft and no partial/cross-owner write. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| FIT-01-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| FIT-01-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Existing PR/stat backup restores unchanged with new records.
- invalid/oversized workout record fails with editable draft and no partial/cross-owner write.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/FIT-01.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
