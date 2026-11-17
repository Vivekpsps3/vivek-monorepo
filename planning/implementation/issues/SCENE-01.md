# SCENE-01 — Compose scene objects with shared visible and selectable bounds
- Stable key: `SCENE-01`
- GitHub leaf: [#439](https://github.com/Vivekpsps3/vivek-monorepo/issues/439)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#308](https://github.com/Vivekpsps3/vivek-monorepo/issues/308), [#310](https://github.com/Vivekpsps3/vivek-monorepo/issues/310), [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81)
- Kind: `implementation`
- Dependencies: `STYLE-04`
- Conflict groups: `private-routes`, `town-ui`
- Verification profiles: `docs`, `web_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Build the actual Town object list/layers on current owners.

## Requirements

- Build the actual Town object list/layers on current owners.
- share geometry between render and selection.
- support pointer cancel, tap-versus-pan and keyboard object list.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [STYLE-04 / #385](https://github.com/Vivekpsps3/vivek-monorepo/issues/385)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app`
- `apps/web/e2e`

## Target paths

- `apps/web/src/app`
- `apps/web/e2e`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Build the actual Town object list/layers on current owners.
3. share geometry between render and selection.
4. support pointer cancel, tap-versus-pan and keyboard object list.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| SCENE-01-A1 | Named synthetic starting records and source states | Resize/pan/zoom then select overlapping objects | frontmost intended object opens. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| SCENE-01-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | drag/cancel never triggers a mutation and keyboard reaches the same objects. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| SCENE-01-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| SCENE-01-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-06-OBJECT | overlapping objects at resized/panned camera positions | tap versus drag, cancel or keyboard-inspect | correct object opens; drag never activates; source/date and focus agree | transform vectors and actual pointer/keyboard tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Resize/pan/zoom then select overlapping objects: frontmost intended object opens.
- drag/cancel never triggers a mutation and keyboard reaches the same objects.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/SCENE-01.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-04` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-04.md`.
- Retains its assigned rows from `PLACE-06` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-06.md`.
