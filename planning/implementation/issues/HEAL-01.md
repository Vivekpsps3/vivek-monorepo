# HEAL-01 — Mount the private Health entry shell with shared units and field errors
- Stable key: `HEAL-01`
- GitHub leaf: [#427](https://github.com/Vivekpsps3/vivek-monorepo/issues/427)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#256](https://github.com/Vivekpsps3/vivek-monorepo/issues/256), [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90)
- Kind: `implementation`
- Dependencies: `STYLE-02`, `NAV-02`
- Conflict groups: `health-store`, `health-ui`
- Verification profiles: `docs`, `web_front`, `finance_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Use existing encrypted store and canonical unit functions.

## Requirements

- Use existing encrypted store and canonical unit functions.
- deliver Clinic/Gym locked/setup/unlock routing and one shared entry dialog shell.
- preserve 8s unavailable/retry and corrupt-row notice.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [STYLE-02 / #383](https://github.com/Vivekpsps3/vivek-monorepo/issues/383), [NAV-02 / #387](https://github.com/Vivekpsps3/vivek-monorepo/issues/387)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app/town/health`
- `apps/finance/frontend/src/public-api.ts`

## Target paths

- `apps/web/src/app/town/health`
- `apps/finance/frontend/src/public-api.ts`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Use existing encrypted store and canonical unit functions.
3. deliver Clinic/Gym locked/setup/unlock routing and one shared entry dialog shell.
4. preserve 8s unavailable/retry and corrupt-row notice.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| HEAL-01-A1 | Named synthetic starting records and source states | Enter a deep-linked locked measurement then unlock | same route returns without digits before unlock. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| HEAL-01-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | failed field validation focuses the linked field and preserves same-session draft. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| HEAL-01-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| HEAL-01-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| CLINIC2 | locked/new vault,corrupt/slow/error rows and conflict | open deep link/unlock/setup,retry or correct dialog | return-to-origin,8s/local retry/corrupt notice/draft/errors/focus behave as intended | route/load/dialog browser and promise-gate tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Enter a deep-linked locked measurement then unlock: same route returns without digits before unlock.
- failed field validation focuses the linked field and preserves same-session draft.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/HEAL-01.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `HEALTH-01` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/HEALTH-01.md`.
