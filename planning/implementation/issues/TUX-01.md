# TUX-01 — Verify advance-flight schedule coverage and select the adapter contract
- Stable key: `TUX-01`
- GitHub leaf: [#406](https://github.com/Vivekpsps3/vivek-monorepo/issues/406)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `discovery`
- Dependencies: none
- Conflict groups: `planning-discovery`
- Verification profiles: `docs`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Inspect official endpoint/entitlement and actual configurable version.

## Requirements

- Inspect official endpoint/entitlement and actual configurable version.
- specify future, near-departure and historical coverage, fields and cost/config limits.
- amend the following adapter scope with evidence, not guessed scraping.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. No new leaf prerequisite.
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `planning/product-revamp`
- `docs`

## Target paths

- `planning/product-revamp`
- `docs`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Inspect official endpoint/entitlement and actual configurable version.
3. specify future, near-departure and historical coverage, fields and cost/config limits.
4. amend the following adapter scope with evidence, not guessed scraping.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| TUX-01-A1 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | A date months ahead has documented supported or explicit unsupported behavior. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| TUX-01-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | missing account/key is recorded as external configuration, not claimed as a failed or successful production integration. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- A date months ahead has documented supported or explicit unsupported behavior.
- missing account/key is recorded as external configuration, not claimed as a failed or successful production integration.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/TUX-01.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
