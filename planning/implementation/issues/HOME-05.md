# HOME-05 — Recover layout conflicts, Undo and Reset without losing a draft
- Stable key: `HOME-05`
- GitHub leaf: [#468](https://github.com/Vivekpsps3/vivek-monorepo/issues/468)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#312](https://github.com/Vivekpsps3/vivek-monorepo/issues/312)
- Kind: `implementation`
- Dependencies: `HOME-04`
- Conflict groups: `town-models`, `private-routes`
- Verification profiles: `docs`, `web_front`, `server_back`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Keep local draft when revision loses.

## Requirements

- Keep local draft when revision loses.
- offer reapply/cancel on current room.
- implement versioned Undo and confirmed Reset preview.
- preserve corrupt/unknown items.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [HOME-04 / #467](https://github.com/Vivekpsps3/vivek-monorepo/issues/467)
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
2. Keep local draft when revision loses.
3. offer reapply/cancel on current room.
4. implement versioned Undo and confirmed Reset preview.
5. preserve corrupt/unknown items.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| HOME-05-A1 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | Two-device conflict never silently overwrites either version. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| HOME-05-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | failed Undo/Reset leaves saved layout intact and focus returns to the chosen object or documented neighbor. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| HOME-05-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| HOME-05-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-08-LAYOUT | known anchors/items and two sessions | save/reload/Undo/reset/conflict | Expand fixed twelve anchors to bounded exterior anchors and four12x12 Home rooms; retain16KiB room-write cap,revision-safe Undo/reset/conflict and public/private data separation. | API/model and actual keyboard/browser flow |
| PLACE-08-RECOVER | unsupported/corrupt layout or failed/held save | preview, leave/switch owner, resolve response | data preserved; useful fallback and no stale draft publication | marker/held-response and recovery fixtures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Two-device conflict never silently overwrites either version.
- failed Undo/Reset leaves saved layout intact and focus returns to the chosen object or documented neighbor.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/HOME-05.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-08` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-08.md`.
