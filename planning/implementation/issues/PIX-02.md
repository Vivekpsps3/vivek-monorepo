# PIX-02 — Build a named daily-memory view with exact source actions
- Stable key: `PIX-02`
- GitHub leaf: [#423](https://github.com/Vivekpsps3/vivek-monorepo/issues/423)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#306](https://github.com/Vivekpsps3/vivek-monorepo/issues/306), [#311](https://github.com/Vivekpsps3/vivek-monorepo/issues/311), [#317](https://github.com/Vivekpsps3/vivek-monorepo/issues/317)
- Kind: `implementation`
- Dependencies: `PIX-01`, `NAV-02`, `STYLE-03`
- Conflict groups: `private-routes`, `town-ui`
- Verification profiles: `docs`, `web_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Replace count-only explanations with named saved records and trip/day details.

## Requirements

- Replace count-only explanations with named saved records and trip/day details.
- add a canonical day route and source slots.
- distinguish empty, absent, expired, unavailable and locked.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [PIX-01 / #421](https://github.com/Vivekpsps3/vivek-monorepo/issues/421), [NAV-02 / #387](https://github.com/Vivekpsps3/vivek-monorepo/issues/387), [STYLE-03 / #384](https://github.com/Vivekpsps3/vivek-monorepo/issues/384)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app`
- `apps/web/e2e`

## Target paths

- `apps/web/src/app`
- `apps/web/e2e`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Replace count-only explanations with named saved records and trip/day details.
3. add a canonical day route and source slots.
4. distinguish empty, absent, expired, unavailable and locked.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PIX-02-A1 | Named synthetic starting records and source states | Open a leap-day record then unlock/back/reload | exact day and originating Year/Life span restore. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| PIX-02-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | a failed Finance join says unavailable rather than falsely no data. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| PIX-02-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| PIX-02-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-13-RECAP | partial/empty/rich range and review available/unavailable | open recap and optional review action | facts/coverage honest; no private note copy or invented narrative/dead link | network/DOM marker assertions and range fixture |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Open a leap-day record then unlock/back/reload: exact day and originating Year/Life span restore.
- a failed Finance join says unavailable rather than falsely no data.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/PIX-02.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-02` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-02.md`.
- Retains its assigned rows from `PLACE-07` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-07.md`.
- Retains its assigned rows from `PLACE-13` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-13.md`.
