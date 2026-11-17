# HOME-01 — Persist bounded room layouts with owner and revision checks
- Stable key: `HOME-01`
- GitHub leaf: [#466](https://github.com/Vivekpsps3/vivek-monorepo/issues/466)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#312](https://github.com/Vivekpsps3/vivek-monorepo/issues/312), [#313](https://github.com/Vivekpsps3/vivek-monorepo/issues/313)
- Kind: `implementation`
- Dependencies: `TOWN-07`, `SCENE-03`, `GAME-01`
- Conflict groups: `schema-head`, `town-writes`
- Verification profiles: `docs`, `server_back`, `schema`, `web_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Add room-sized cosmetic layout records with existing owned writes and preserving migration.

## Requirements

- Add room-sized cosmetic layout records with existing owned writes and preserving migration.
- enforce cell/anchor/item caps and entitlements.
- private references stay out of public layout.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [TOWN-07 / #255](https://github.com/Vivekpsps3/vivek-monorepo/issues/255), [SCENE-03 / #441](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [GAME-01 / #465](https://github.com/Vivekpsps3/vivek-monorepo/issues/465)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/server/town`
- `apps/server/alembic/versions`
- `apps/web/src/app/town`

## Target paths

- `apps/server/town`
- `apps/server/alembic/versions`
- `apps/web/src/app/town`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Add room-sized cosmetic layout records with existing owned writes and preserving migration.
3. enforce cell/anchor/item caps and entitlements.
4. private references stay out of public layout.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| HOME-01-A1 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | Foreign owner, oversized/malformed payload or unknown revision cannot overwrite data. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| HOME-01-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | upgrade/delete account preserves other domains and supported unknown layout records. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| HOME-01-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| HOME-01-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-08-MIG | existing rows and foreign owner/malformed payload | upgrade, mutate and delete account | records preserved; foreign writes/invalid IDs rejected; single head | migration rehearsal and auth/CSRF tests |
| PLACE-09-PRIVATE | Finance/Health locked versus unlocked | inspect catalog/save choice | only public Town eligibility and catalog IDs persist; no private-derived marker | payload/storage/DOM privacy assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Foreign owner, oversized/malformed payload or unknown revision cannot overwrite data.
- upgrade/delete account preserves other domains and supported unknown layout records.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/HOME-01.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-08` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-08.md`.
- Retains its assigned rows from `PLACE-09` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-09.md`.
