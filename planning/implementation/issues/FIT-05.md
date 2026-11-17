# FIT-05 — Combine session-derived bests with editable legacy PRs
- Stable key: `FIT-05`
- GitHub leaf: [#435](https://github.com/Vivekpsps3/vivek-monorepo/issues/435)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#257](https://github.com/Vivekpsps3/vivek-monorepo/issues/257), [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90)
- Kind: `implementation`
- Dependencies: `FIT-03`, `STYLE-03`
- Conflict groups: `health-store`, `health-ui`
- Verification profiles: `docs`, `web_front`, `finance_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Use one derived Health progress projection for completed supported sets and manual lift/run/other PRs.

## Requirements

- Use one derived Health progress projection for completed supported sets and manual lift/run/other PRs.
- never materialize duplicate PR rows.
- retain e1RM/pace and previous-best rollback.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [FIT-03 / #433](https://github.com/Vivekpsps3/vivek-monorepo/issues/433), [STYLE-03 / #384](https://github.com/Vivekpsps3/vivek-monorepo/issues/384)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app/town/health`
- `apps/finance/frontend/src/public-api.ts`

## Target paths

- `apps/web/src/app/town/health`
- `apps/finance/frontend/src/public-api.ts`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Use one derived Health progress projection for completed supported sets and manual lift/run/other PRs.
3. never materialize duplicate PR rows.
4. retain e1RM/pace and previous-best rollback.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIT-05-A1 | Named synthetic starting records and source states | Delete current best or uncomplete its set | previous valid result returns. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| FIT-05-A2 | Named synthetic starting records and source states | edit a legacy manual PR | original semantics/logged date survive and units do not rewrite persisted values. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| FIT-05-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| FIT-05-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |
| GYM1 | lift/run/other history with current and previous best and recent dates | add/edit/delete current best and switch display units | derived pace/e1RM/best/NewPR/trophies correct, previous best returns and raw records/revisions are invariant | math fixtures and complete Gym browser |
| GYM2 | datebounds,immutablelogged_on,409 and failed save | submit/correct/retry and delete with confirmation | linked errors/draft/focus survive; invalid date not saved and logged_on unchanged | validator/API payload/dialog tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Delete current best or uncomplete its set: previous valid result returns.
- edit a legacy manual PR: original semantics/logged date survive and units do not rewrite persisted values.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/FIT-05.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.

## Retained scope

- Retains its assigned rows from `HEALTH-02` in `planning/product-revamp/requirements.json`; the original packet is preserved under `planning/implementation/scopes/HEALTH-02.md`.
