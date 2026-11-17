# MERGE-02 — Redirect legacy World date and week links with useful return
- Stable key: `MERGE-02`
- GitHub leaf: [#486](https://github.com/Vivekpsps3/vivek-monorepo/issues/486)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#307](https://github.com/Vivekpsps3/vivek-monorepo/issues/307), [#310](https://github.com/Vivekpsps3/vivek-monorepo/issues/310)
- Kind: `implementation`
- Dependencies: `MERGE-01`, `SCENE-10`, `PIX-02`, `ROOM-15`
- Conflict groups: `private-routes`, `town-ui`
- Verification profiles: `docs`, `web_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Map day to exact Pixels day plus Town context and week to its Monday.

## Requirements

- Map day to exact Pixels day plus Town context and week to its Monday.
- preserve reload/Back/Forward and Life return semantics.
- no private data in links.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [MERGE-01 / #484](https://github.com/Vivekpsps3/vivek-monorepo/issues/484), [SCENE-10 / #448](https://github.com/Vivekpsps3/vivek-monorepo/issues/448), [PIX-02 / #423](https://github.com/Vivekpsps3/vivek-monorepo/issues/423), [ROOM-15 / #485](https://github.com/Vivekpsps3/vivek-monorepo/issues/485)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app`
- `apps/web/e2e`

## Target paths

- `apps/web/src/app`
- `apps/web/e2e`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Map day to exact Pixels day plus Town context and week to its Monday.
3. preserve reload/Back/Forward and Life return semantics.
4. no private data in links.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| MERGE-02-A1 | Named synthetic starting records and source states | Open old day/week/invalid/conflicting links across Feb29/DST/year | safe canonical destination and no loops. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| MERGE-02-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | returning selects the original room/day or documented fallback. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| MERGE-02-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| MERGE-02-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-03-DATE | Feb29, Sunday/ISO boundaries, DST and mismatched client/server day | parse legacy/conflicting/invalid links | stable safe context; no date semantics conflation or redirect loop | pure date/URL vectors |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Open old day/week/invalid/conflicting links across Feb29/DST/year: safe canonical destination and no loops.
- returning selects the original room/day or documented fallback.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/MERGE-02.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-03` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-03.md`.
- Retains its assigned rows from `PLACE-06` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-06.md`.
