# MERGE-03 — Remove the superseded standalone World presentation
- Stable key: `MERGE-03`
- GitHub leaf: [#487](https://github.com/Vivekpsps3/vivek-monorepo/issues/487)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#310](https://github.com/Vivekpsps3/vivek-monorepo/issues/310), [#318](https://github.com/Vivekpsps3/vivek-monorepo/issues/318)
- Kind: `implementation`
- Dependencies: `MERGE-02`, `SCENE-02`, `SCENE-09`, `ROOM-15`
- Conflict groups: `private-routes`, `town-ui`
- Verification profiles: `docs`, `web_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Inventory actual renderer/controller/route/generation consumers.

## Requirements

- Inventory actual renderer/controller/route/generation consumers.
- delete only replaced presentation and orphan paths.
- retain source normalization/migrations and needed deterministic terrain vectors.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [MERGE-02 / #486](https://github.com/Vivekpsps3/vivek-monorepo/issues/486), [SCENE-02 / #440](https://github.com/Vivekpsps3/vivek-monorepo/issues/440), [SCENE-09 / #447](https://github.com/Vivekpsps3/vivek-monorepo/issues/447), [ROOM-15 / #485](https://github.com/Vivekpsps3/vivek-monorepo/issues/485)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app`
- `apps/web/e2e`

## Target paths

- `apps/web/src/app`
- `apps/web/e2e`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Inventory actual renderer/controller/route/generation consumers.
3. delete only replaced presentation and orphan paths.
4. retain source normalization/migrations and needed deterministic terrain vectors.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| MERGE-03-A1 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | All old bookmarks and concept/history actions work through new owners. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| MERGE-03-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | report actual deleted/moved/added paths and surviving golden/date/list regressions without removing useful coverage. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| MERGE-03-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| MERGE-03-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-06-ENGINE | existing golden fixtures and old week URLs | render new interaction/presentation | Preserve golden vectors for every still-consumed deterministic generator; retire only proven no-caller standalone presentation after migrating all date/list/keyboard/source behavior. | purity/golden suite and first playable capture |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Standalone World renderer/controller/routes and proven no-caller presentation helpers | Remove after concept/date/source consumers migrate; preserve useful source normalizers and deterministic generation still consumed by Town. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- All old bookmarks and concept/history actions work through new owners.
- report actual deleted/moved/added paths and surviving golden/date/list regressions without removing useful coverage.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/MERGE-03.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-06` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-06.md`.
- Retains its assigned rows from `PLACE-14` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-14.md`.
