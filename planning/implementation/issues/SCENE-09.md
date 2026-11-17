# SCENE-09 — Derive Media and Travel keepsakes from canonical sources
- Stable key: `SCENE-09`
- GitHub leaf: [#447](https://github.com/Vivekpsps3/vivek-monorepo/issues/447)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#306](https://github.com/Vivekpsps3/vivek-monorepo/issues/306), [#314](https://github.com/Vivekpsps3/vivek-monorepo/issues/314), [#315](https://github.com/Vivekpsps3/vivek-monorepo/issues/315), [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81)
- Kind: `implementation`
- Dependencies: `PIX-01`, `TUX-10`, `MUX-02`
- Conflict groups: `town-models`, `private-routes`
- Verification profiles: `docs`, `web_front`, `server_back`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Use bounded source shelves and existing completed-kind allowlist/date normalization.

## Requirements

- Use bounded source shelves and existing completed-kind allowlist/date normalization.
- distinguish episodes, completions, planned trips and credit dates.
- do not copy a keepsake ledger.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [PIX-01 / #421](https://github.com/Vivekpsps3/vivek-monorepo/issues/421), [TUX-10 / #422](https://github.com/Vivekpsps3/vivek-monorepo/issues/422), [MUX-02 / #398](https://github.com/Vivekpsps3/vivek-monorepo/issues/398)
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
2. Use bounded source shelves and existing completed-kind allowlist/date normalization.
3. distinguish episodes, completions, planned trips and credit dates.
4. do not copy a keepsake ledger.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| SCENE-09-A1 | Named synthetic starting records and source states | Complete/redate/undo/delete a book or trip | correct source/date object appears, moves or retracts. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| SCENE-09-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | unavailable source preserves usable Town and makes no provider/N+1 reads. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| SCENE-09-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| SCENE-09-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-10-MEDIA | episode plus completed book/movie/TV/game with dates | complete/revisit/inspect source | World occurrence display moves into dated Town/Pixels rooms; preserve existing completed-kind allowlist,episode distinction,source/date and reversal. | API/source fixture and actual cross-app journey |
| PLACE-10-UNDO | completion reversed/deleted/redated | reload each scale | derived object retracts/moves; no copied title/reward persists or duplicate effect | source reversal tests |
| PLACE-10-LOAD | large history and unavailable Media | arrive/inspect bounded shelf | caps/coverage honest; no provider IO or N+1; Town remains usable | provider spy/request count and state screenshots |
| PLACE-11-BIOME | existing seed/latitude/hash vectors | render souvenir overlay | Illustrative scenery moves into Town; preserve still-consumed seed/latitude/hash vectors and disclose fiction versus actual saved destination. | golden vectors/request counts and visual review |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Complete/redate/undo/delete a book or trip: correct source/date object appears, moves or retracts.
- unavailable source preserves usable Town and makes no provider/N+1 reads.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/SCENE-09.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-02` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-02.md`.
- Retains its assigned rows from `PLACE-10` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-10.md`.
- Retains its assigned rows from `PLACE-11` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-11.md`.
