# TUX-10 — Expose bounded named trip memories and honest source dates
- Stable key: `TUX-10`
- GitHub leaf: [#422](https://github.com/Vivekpsps3/vivek-monorepo/issues/422)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#315](https://github.com/Vivekpsps3/vivek-monorepo/issues/315)
- Kind: `implementation`
- Dependencies: `TUX-06`, `PIX-01`
- Conflict groups: `travel-forms`, `travel-ui`
- Verification profiles: `docs`, `travel_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Use saved trip spans/destinations for terminal/Pixels memory inspection.

## Requirements

- Use saved trip spans/destinations for terminal/Pixels memory inspection.
- distinguish planned/completed and Town credit date.
- retract derived souvenirs on source changes.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [TUX-06 / #411](https://github.com/Vivekpsps3/vivek-monorepo/issues/411), [PIX-01 / #421](https://github.com/Vivekpsps3/vivek-monorepo/issues/421)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/travel/frontend/src`
- `apps/travel/backend/routers`

## Target paths

- `apps/travel/frontend/src`
- `apps/travel/backend/routers`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Use saved trip spans/destinations for terminal/Pixels memory inspection.
3. distinguish planned/completed and Town credit date.
4. retract derived souvenirs on source changes.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| TUX-10-A1 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | Late-logged overlapping trips show actual spans and separately explained credit dates. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| TUX-10-A2 | Named synthetic starting records and source states | cancel/delete/redate trip | every derived memory updates without copied trip ledger. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| TUX-10-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| TUX-10-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-11-TRIP | planned/completed/late-logged and overlapping trips | visit/inspect on each scale | actual span, source and eligibility explain intentional Town/World/Pixels differences | source-date fixture matrix and cross-app browser |
| PLACE-11-CHANGE | trip edit/cancel/delete and missing destination | reload and inspect | derived souvenir retracts/updates; honest fallback and no made-up place | reversal/fallback tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Late-logged overlapping trips show actual spans and separately explained credit dates.
- cancel/delete/redate trip: every derived memory updates without copied trip ledger.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/TUX-10.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-11` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-11.md`.
