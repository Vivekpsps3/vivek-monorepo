# NOTE-02 — Connect a read-only selected Obsidian projection safely
- Stable key: `NOTE-02`
- GitHub leaf: [#419](https://github.com/Vivekpsps3/vivek-monorepo/issues/419)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `NOTE-01`, `NAV-04`
- Conflict groups: `notes-connection`, `vault-collections`
- Verification profiles: `docs`, `web_front`, `server_back`, `finance_front`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Implement the surveyed HTTPS bridge/read-only export/browser-import transport.

## Requirements

- Implement the surveyed HTTPS bridge/read-only export/browser-import transport.
- use existing vault protection for excerpts/credentials.
- include exclude/disconnect/retry and safe Markdown handling.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [NOTE-01 / #418](https://github.com/Vivekpsps3/vivek-monorepo/issues/418), [NAV-04 / #389](https://github.com/Vivekpsps3/vivek-monorepo/issues/389)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/web/src/app`
- `apps/server`

## Target paths

- `apps/web/src/app`
- `apps/server`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Implement the surveyed HTTPS bridge/read-only export/browser-import transport.
3. use existing vault protection for excerpts/credentials.
4. include exclude/disconnect/retry and safe Markdown handling.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| NOTE-02-A1 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | Excluded folders and untrusted markup never render. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| NOTE-02-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | disconnect/lock/owner change during read clears excerpts and ignores late data without writing to original notes. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| NOTE-02-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |
| NOTE-02-VIEW | 390×844 and 1280×800, light/night, keyboard/touch and reduced motion | Perform this leaf's real primary and correction actions | Labels, 44px targets, focus/return, data truth and practical navigation work; authored style is reviewed separately from test success. | Actual browser journey, axe/contrast checks and review captures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Excluded folders and untrusted markup never render.
- disconnect/lock/owner change during read clears excerpts and ignores late data without writing to original notes.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/NOTE-02.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
