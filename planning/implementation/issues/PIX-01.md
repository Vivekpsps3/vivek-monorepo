# PIX-01 — Expose stable dated facts and learning annotations without changing scores
- Stable key: `PIX-01`
- GitHub leaf: [#421](https://github.com/Vivekpsps3/vivek-monorepo/issues/421)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#306](https://github.com/Vivekpsps3/vivek-monorepo/issues/306)
- Kind: `implementation`
- Dependencies: none
- Conflict groups: `town-models`, `private-routes`
- Verification profiles: `docs`, `web_front`, `server_back`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Use existing source normalization and bounded windows.

## Requirements

- Use existing source normalization and bounded windows.
- carry source occurrence IDs, dates and coverage.
- preserve original Pixel scoring and concept understanding semantics.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. No new leaf prerequisite.
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
2. Use existing source normalization and bounded windows.
3. carry source occurrence IDs, dates and coverage.
4. preserve original Pixel scoring and concept understanding semantics.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PIX-01-A1 | Named synthetic starting records and source states | Archive/delete/redate a concept understanding | dated annotation retracts while original score vectors stay identical. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| PIX-01-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | rich/two-owner/held sources remain bounded and isolated. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| PIX-01-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| PIX-01-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-02-FACT | F1 and overlapping/truncated source history | load/select a day | each fact has stable identity and provenance; intentional XP/count/artifact differences are explained | API/model vectors and cross-view fixture matrix |
| PLACE-02-LEARN | understood, archived and deleted concepts | load Pixels and reverse/delete understanding | annotation agrees with World; original Pixels scores stay byte-for-byte equivalent | score regression vectors and actual browser annotation |
| PLACE-02-BOUND | rich history, two owners and held source responses | select/change/leave/lock | bounded queries and request counts; no foreign or obsolete publication; independent failures survive | held-response/request-count and owner tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Archive/delete/redate a concept understanding: dated annotation retracts while original score vectors stay identical.
- rich/two-owner/held sources remain bounded and isolated.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/PIX-01.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-02` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-02.md`.
