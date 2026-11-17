# FUX-07 — Make imports, receipts and recovery discoverable in context
- Stable key: `FUX-07`
- GitHub leaf: [#396](https://github.com/Vivekpsps3/vivek-monorepo/issues/396)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `NAV-04`, `STYLE-02`
- Conflict groups: `finance-ui`, `finance-public-api`
- Verification profiles: `docs`, `finance_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Connect contextual bank/brokerage imports with one import-history/recovery surface.

## Requirements

- Connect contextual bank/brokerage imports with one import-history/recovery surface.
- retain preview, dedupe, staging/resume, receipts and Undo.
- carry current security/export actions.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [NAV-04 / #389](https://github.com/Vivekpsps3/vivek-monorepo/issues/389), [STYLE-02 / #383](https://github.com/Vivekpsps3/vivek-monorepo/issues/383)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/finance/frontend/src/app`
- `apps/finance/frontend/src/public-api.ts`

## Target paths

- `apps/finance/frontend/src/app`
- `apps/finance/frontend/src/public-api.ts`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Connect contextual bank/brokerage imports with one import-history/recovery surface.
3. retain preview, dedupe, staging/resume, receipts and Undo.
4. carry current security/export actions.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FUX-07-A1 | Named synthetic starting records and source states | Interrupt and resume a Fidelity import | existing positions remain until verified replacement. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| FUX-07-A2 | Named synthetic starting records and source states | retry a bank import or restore | same authoritative engine and collection/recovery guarantees apply. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| FUX-07-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| FUX-07-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Interrupt and resume a Fidelity import: existing positions remain until verified replacement.
- retry a bank import or restore: same authoritative engine and collection/recovery guarantees apply.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/FUX-07.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
