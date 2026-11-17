# SCENE-10 — Visit an exact past date in Town and return to Pixels
- Stable key: `SCENE-10`
- GitHub leaf: [#448](https://github.com/Vivekpsps3/vivek-monorepo/issues/448)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#307](https://github.com/Vivekpsps3/vivek-monorepo/issues/307), [#310](https://github.com/Vivekpsps3/vivek-monorepo/issues/310), [#317](https://github.com/Vivekpsps3/vivek-monorepo/issues/317), [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81)
- Kind: `implementation`
- Dependencies: `SCENE-03`, `PIX-02`
- Conflict groups: `private-routes`, `town-ui`
- Verification profiles: `docs`, `web_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Use bounded dated facts and one validated selection context.

## Requirements

- Use bounded dated facts and one validated selection context.
- show historical source facts separately from current cosmetic layout.
- no invented historic balance/room state.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [SCENE-03 / #441](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [PIX-02 / #423](https://github.com/Vivekpsps3/vivek-monorepo/issues/423)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app`
- `apps/web/e2e`

## Target paths

- `apps/web/src/app`
- `apps/web/e2e`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Use bounded dated facts and one validated selection context.
3. show historical source facts separately from current cosmetic layout.
4. no invented historic balance/room state.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| SCENE-10-A1 | Named synthetic starting records and source states | Visit selected Year day or Life span then Back/Forward/reload | exact origin returns. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| SCENE-10-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | unrecorded/future/unavailable days stay distinct and no camera history spam occurs. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| SCENE-10-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| SCENE-10-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-03-ROUND | selected Year day and birthday-relative Life span | visit World and return/back/forward/reload | World destination becomes dated Town/Pixels; preserve exact Year day/Life span,return/back/reload and canonical fallback. | browser round trip and reload tests |
| PLACE-06-QUIET | unrecorded/future/unavailable/recorded days | toggle activity overlay and inspect | honest distinct states; no implication of failure/rest and no hidden source objects | state fixtures and visual review |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Visit selected Year day or Life span then Back/Forward/reload: exact origin returns.
- unrecorded/future/unavailable days stay distinct and no camera history spam occurs.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/SCENE-10.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-03` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-03.md`.
- Retains its assigned rows from `PLACE-06` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-06.md`.
- Retains its assigned rows from `PLACE-13` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-13.md`.
