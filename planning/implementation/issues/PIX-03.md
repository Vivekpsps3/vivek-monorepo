# PIX-03 — Style Year and Life as an orientable memory atlas
- Stable key: `PIX-03`
- GitHub leaf: [#426](https://github.com/Vivekpsps3/vivek-monorepo/issues/426)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#311](https://github.com/Vivekpsps3/vivek-monorepo/issues/311)
- Kind: `implementation`
- Dependencies: `PIX-02`, `STYLE-03`
- Conflict groups: `private-routes`, `town-ui`
- Verification profiles: `docs`, `web_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Preserve grid/table, app/activity modes, birthday privacy and factual coverage.

## Requirements

- Preserve grid/table, app/activity modes, birthday privacy and factual coverage.
- add compact memory previews without bulk thumbnail loads.
- keep selected span/date focus.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [PIX-02 / #423](https://github.com/Vivekpsps3/vivek-monorepo/issues/423), [STYLE-03 / #384](https://github.com/Vivekpsps3/vivek-monorepo/issues/384)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app`
- `apps/web/e2e`

## Target paths

- `apps/web/src/app`
- `apps/web/e2e`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Preserve grid/table, app/activity modes, birthday privacy and factual coverage.
3. add compact memory previews without bulk thumbnail loads.
4. keep selected span/date focus.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PIX-03-A1 | Named synthetic starting records and source states | Navigate Year/Life/grid/table at Feb29 and Sunday/ISO boundaries | dates/spans agree. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| PIX-03-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | partial history and future days never imply a death date or unlived time. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| PIX-03-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| PIX-03-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-07-ATLAS | F1/F2 selected days/spans | scan/select/visit from grid and table | readable composition and exact facts/routes; original score/app modes preserved | date/score vectors and browser grid/table journeys |
| PLACE-07-COVER | pre-account, partial, locked/unavailable and future records | inspect Year/Life | coverage and uncertainty visible; no lifespan/death or unrecorded-life judgment | copy/state assertions and art review |
| PLACE-07-PRIV | birthday hidden and two owners | refresh/switch view/visit/back | age privacy, spans, selected context and focus survive correctly | birthday/Feb29/owner regressions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Navigate Year/Life/grid/table at Feb29 and Sunday/ISO boundaries: dates/spans agree.
- partial history and future days never imply a death date or unlived time.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/PIX-03.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-07` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-07.md`.
