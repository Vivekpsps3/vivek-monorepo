# MUX-02 — Group saved music by canonical artist identity without duplicate membership
- Stable key: `MUX-02`
- GitHub leaf: [#398](https://github.com/Vivekpsps3/vivek-monorepo/issues/398)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: none
- Conflict groups: `media-library-api`, `media-records`
- Verification profiles: `docs`, `media_back`, `server_back`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Extend bounded saved-only SQL grouping for album-first and song-first saves.

## Requirements

- Extend bounded saved-only SQL grouping for album-first and song-first saves.
- keep follows independent.
- handle compilations, collaborations and unknown/manual credits without title-only merges.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. No new leaf prerequisite.
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/media/backend/services/records.py`
- `apps/media/backend/routers/journal.py`

## Target paths

- `apps/media/backend/services/records.py`
- `apps/media/backend/routers/journal.py`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Extend bounded saved-only SQL grouping for album-first and song-first saves.
3. keep follows independent.
4. handle compilations, collaborations and unknown/manual credits without title-only merges.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| MUX-02-A1 | Named synthetic starting records and source states | Save one linked album then expand its artist | one canonical membership and one representation per selected collection context. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| MUX-02-A2 | Named synthetic starting records and source states | save album before following artist | grouped navigation works without following or saving the discography. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| MUX-02-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Save one linked album then expand its artist: one canonical membership and one representation per selected collection context.
- save album before following artist: grouped navigation works without following or saving the discography.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/MUX-02.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
