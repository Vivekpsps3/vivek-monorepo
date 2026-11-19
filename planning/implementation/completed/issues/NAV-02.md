# NAV-02 — Preserve source context through editors, unlock and browser history
- Stable key: `NAV-02`
- GitHub leaf: [#387](https://github.com/Vivekpsps3/vivek-monorepo/issues/387)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#307](https://github.com/Vivekpsps3/vivek-monorepo/issues/307), [#317](https://github.com/Vivekpsps3/vivek-monorepo/issues/317), [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93)
- Kind: `implementation`
- Dependencies: `NAV-01`
- Conflict groups: `private-routes`, `town-ui`
- Verification profiles: `docs`, `web_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Adopt one validated return-context policy in actual Finance, Media and Pixels consumers.

## Requirements

- Adopt one validated return-context policy in actual Finance, Media and Pixels consumers.
- carry route/date/collection/page/scroll without private values.
- keep safe fallback for direct links.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [NAV-01 / #386](https://github.com/Vivekpsps3/vivek-monorepo/issues/386)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app`
- `apps/web/e2e`

## Target paths

- `apps/web/src/app`
- `apps/web/e2e`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Adopt one validated return-context policy in actual Finance, Media and Pixels consumers.
3. carry route/date/collection/page/scroll without private values.
4. keep safe fallback for direct links.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| NAV-02-A1 | Named synthetic starting records and source states | Open a filtered artist item then Back | expanded artist, page and scroll return. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| NAV-02-A2 | Named synthetic starting records and source states | open a locked dated record then unlock | exact date/source returns without redirect loop or private URL fields. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| NAV-02-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| NAV-02-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| PLACE-03-FOCUS | keyboard and touch selection with filters/scroll | open and close detail, navigate away/back | correct invoking or nearby focus; no private URL values and no frame history spam | actual browser focus/history assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Open a filtered artist item then Back: expanded artist, page and scroll return.
- open a locked dated record then unlock: exact date/source returns without redirect loop or private URL fields.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/NAV-02.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `PLACE-03` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-03.md`.
- Retains its assigned rows from `PLACE-13` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/PLACE-13.md`.
