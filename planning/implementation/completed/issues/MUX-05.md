# MUX-05 — Build readable book shelves and reading actions
- Stable key: `MUX-05`
- GitHub leaf: [#401](https://github.com/Vivekpsps3/vivek-monorepo/issues/401)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `MUX-01`, `STYLE-03`
- Conflict groups: `media-collections`, `media-records`
- Verification profiles: `docs`, `media_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Organize current/read/to-read books with cover/spine and text views.

## Requirements

- Organize current/read/to-read books with cover/spine and text views.
- expose progress editing and canonical notes.
- only group authors/series when identity supports it.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [MUX-01 / #397](https://github.com/Vivekpsps3/vivek-monorepo/issues/397), [STYLE-03 / #384](https://github.com/Vivekpsps3/vivek-monorepo/issues/384)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/media/frontend/src`
- `apps/media/backend/services/records.py`

## Target paths

- `apps/media/frontend/src`
- `apps/media/backend/services/records.py`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Organize current/read/to-read books with cover/spine and text views.
3. expose progress editing and canonical notes.
4. only group authors/series when identity supports it.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| MUX-05-A1 | Named synthetic starting records and source states | Update a current book and return to shelf | progress and scroll persist. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| MUX-05-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | absent cover or unlinked author leaves a useful labeled book rather than a broken shelf. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| MUX-05-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| MUX-05-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Update a current book and return to shelf: progress and scroll persist.
- absent cover or unlinked author leaves a useful labeled book rather than a broken shelf.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/MUX-05.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
