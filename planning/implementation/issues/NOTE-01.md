# NOTE-01 — Survey Obsidian vault access, sync and date conventions
- Stable key: `NOTE-01`
- GitHub leaf: [#418](https://github.com/Vivekpsps3/vivek-monorepo/issues/418)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `discovery`
- Dependencies: none
- Conflict groups: `planning-discovery`
- Verification profiles: `docs`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Determine read-only bridge/export/import capability on the owner's devices.

## Requirements

- Determine read-only bridge/export/import capability on the owner's devices.
- document selected folders/frontmatter and note-date precedence.
- keep Obsidian authoritative.
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
2. Determine read-only bridge/export/import capability on the owner's devices.
3. document selected folders/frontmatter and note-date precedence.
4. keep Obsidian authoritative.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| NOTE-01-A1 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | A local-only vault is not assumed readable by the hosted app. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| NOTE-01-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | daily-note filename/frontmatter, missing note and undated note have deterministic separate outcomes. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- A local-only vault is not assumed readable by the hosted app.
- daily-note filename/frontmatter, missing note and undated note have deterministic separate outcomes.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/NOTE-01.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
