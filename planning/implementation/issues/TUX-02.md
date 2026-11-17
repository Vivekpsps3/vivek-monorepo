# TUX-02 — Support bounded advance-flight lookup with preserved overrides
- Stable key: `TUX-02`
- GitHub leaf: [#407](https://github.com/Vivekpsps3/vivek-monorepo/issues/407)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `TUX-01`
- Conflict groups: `travel-provider`
- Verification profiles: `docs`, `travel_back`, `server_back`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Extend existing flight owner with the selected schedule endpoint.

## Requirements

- Extend existing flight owner with the selected schedule endpoint.
- preserve flight/date/route occurrence and codeshares.
- use one end-to-end budget and distinct errors.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [TUX-01 / #406](https://github.com/Vivekpsps3/vivek-monorepo/issues/406)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/travel/backend/services/flights.py`
- `apps/travel/backend/routers/integrations.py`

## Target paths

- `apps/travel/backend/services/flights.py`
- `apps/travel/backend/routers/integrations.py`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Extend existing flight owner with the selected schedule endpoint.
3. preserve flight/date/route occurrence and codeshares.
4. use one end-to-end budget and distinct errors.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| TUX-02-A1 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | Future schedule then operational refresh resolves one leg occurrence without duplicate save. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| TUX-02-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | no key, unsupported date, ambiguity, throttle and timeout have different safe remedies. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| TUX-02-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Future schedule then operational refresh resolves one leg occurrence without duplicate save.
- no key, unsupported date, ambiguity, throttle and timeout have different safe remedies.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/TUX-02.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
