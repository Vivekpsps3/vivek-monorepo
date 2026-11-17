# HOME-04 — Place, rotate and recolor room objects through preview and Save
- Stable key: `HOME-04`
- GitHub leaf: [#467](https://github.com/Vivekpsps3/vivek-monorepo/issues/467)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#312](https://github.com/Vivekpsps3/vivek-monorepo/issues/312), [#313](https://github.com/Vivekpsps3/vivek-monorepo/issues/313)
- Kind: `implementation`
- Dependencies: `HOME-01`, `HOME-03`
- Conflict groups: `town-models`, `private-routes`
- Verification profiles: `docs`, `web_front`, `server_back`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Implement inventory-to-cell/anchor preview with footprint validation and immutable entrances.

## Requirements

- Implement inventory-to-cell/anchor preview with footprint validation and immutable entrances.
- pointer drag optional.
- Save/Cancel uses sole room owner and revision.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [HOME-01 / #466](https://github.com/Vivekpsps3/vivek-monorepo/issues/466), [HOME-03 / #450](https://github.com/Vivekpsps3/vivek-monorepo/issues/450)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app`
- `apps/server/town`
- `apps/server/pixels`

## Target paths

- `apps/web/src/app`
- `apps/server/town`
- `apps/server/pixels`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Implement inventory-to-cell/anchor preview with footprint validation and immutable entrances.
3. pointer drag optional.
4. Save/Cancel uses sole room owner and revision.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| HOME-04-A1 | Named synthetic starting records and source states | Place by keyboard/tap without drag, rotate a supported piece, cancel invalid overlap then save | only intended layout persists. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| HOME-04-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | practical doorway/object remains reachable. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| HOME-04-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| HOME-04-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-09-CHOICE | just-before/at/after milestone and maximum level | reach threshold, choose/preview/save/reload | Preserve all three existing milestone identities,nine options and canonical thresholds; add separately specified game-only Stamp shop without changing life XP. | threshold vectors and actual choice flow |
| PLACE-09-REVERSE | source/XP correction removes eligibility | refresh and restore facts later | stored choice preserved but not rendered as earned; no duplicate reward endpoint | reversal/restoration model/browser tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Place by keyboard/tap without drag, rotate a supported piece, cancel invalid overlap then save: only intended layout persists.
- practical doorway/object remains reachable.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/HOME-04.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-08` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-08.md`.
- Retains its assigned rows from `PLACE-09` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-09.md`.
