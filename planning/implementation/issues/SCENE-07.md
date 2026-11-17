# SCENE-07 — Deliver the sole encrypted weekly reflection and one Hub link
- Stable key: `SCENE-07`
- GitHub leaf: [#445](https://github.com/Vivekpsps3/vivek-monorepo/issues/445)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#254](https://github.com/Vivekpsps3/vivek-monorepo/issues/254), [#317](https://github.com/Vivekpsps3/vivek-monorepo/issues/317), [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81), [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93)
- Kind: `implementation`
- Dependencies: `SCENE-06`, `NAV-03`
- Conflict groups: `health-store`, `health-ui`
- Verification profiles: `docs`, `web_front`, `finance_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Implement existing review collection/week schema and revision-safe Hall editor.

## Requirements

- Implement existing review collection/week schema and revision-safe Hall editor.
- optional explicit Obsidian reference stays a link.
- Hub opens same editor and copies no note text.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [SCENE-06 / #444](https://github.com/Vivekpsps3/vivek-monorepo/issues/444), [NAV-03 / #388](https://github.com/Vivekpsps3/vivek-monorepo/issues/388)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app/town/health`
- `apps/finance/frontend/src/public-api.ts`

## Target paths

- `apps/web/src/app/town/health`
- `apps/finance/frontend/src/public-api.ts`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Implement existing review collection/week schema and revision-safe Hall editor.
3. optional explicit Obsidian reference stays a link.
4. Hub opens same editor and copies no note text.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| SCENE-07-A1 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | ISO-year-boundary review save/edit/delete/restore preserves exact schema. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| SCENE-07-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | held note save then lock/owner change clears markers and gives no Town XP or Stamps. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| SCENE-07-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| SCENE-07-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| REVIEW1 | new/existing weeks including ISO year boundary and Unicode limits | save/edit/reload/delete/recent-navigate | week identity/limits/revisions correct; noextraTownXP | codec/API/browser lifecycle with exact stored schema |
| REVIEW2 | marker note/focus with held load/save and conflict | lock/switch owner/leave then resolve or retry | no old text/preview retained or republished; conflict preserves valid same-session draft | DOM/store/network/localStorage markers and held promise tests |
| REVIEW3 | completed review and backup bundle | export, restore into current account and open Hub pin | content restored only under current owner; Hub opens same editor with one link | all-collection recovery test and real route browser |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- ISO-year-boundary review save/edit/delete/restore preserves exact schema.
- held note save then lock/owner change clears markers and gives no Town XP or Stamps.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/SCENE-07.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `TOWN-06` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/TOWN-06.md`.
- Retains its assigned rows from `PLACE-13` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-13.md`.
