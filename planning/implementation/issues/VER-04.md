# VER-04 — Remove duplicate verification work and include forgotten canonical checks

- Stable key: `VER-04`
- GitHub leaf: [#212](https://github.com/Vivekpsps3/vivek-monorepo/issues/212)
- Parents: [#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199), [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `VER-01`, `VER-02`
- Conflict groups: `ci-workflow`, `makefile`, `browser-config`, `quality-tools`
- Verification profiles: `ops`, `docs`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Agents can obtain trustworthy local evidence with fewer redundant installs/builds/test invocations.

Measure current entry points, remove repeated work and make every existing gate run once, including standalone release-manifest coverage.

## Requirements

- TD-00 timing baseline
- TD-32
- TD-38 check-cost evidence
- #199 canonical full versus affected verification
- #125 residual CI/runtime wiring

## Source paths

- `Makefile`
- `package.json`
- `.github/workflows/ci.yml`
- `scripts/test-release-manifest.mjs`
- `scripts/coverage-gate.sh`
- `tests/e2e/config.ts`
- `tests/e2e/fixtures.ts`
- `planning/test-speed-and-stability.md`

## Target paths

- `Makefile`
- `package.json`
- `.github/workflows/ci.yml`
- `scripts/`
- `docs/QUALITY.md`
- `docs/DEVELOPMENT.md`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare current overlapping open PRs before assuming the reviewed source is current. Preserve unrelated edits.
2. Measure actual lint/types/fast/Python/Karma/Node/build/browser commands on the same source/machine and record which work is repeated or omitted. Do not invent timings from old reports.
3. Build one gate→entrypoint ownership table and wire standalone required checks such as release-manifest fixtures into the canonical path exactly once. Keep fast iteration commands clearly non-gates.
4. Remove demonstrated redundant installs/builds/lint or duplicate project invocation, keeping current isolated server/database/session fixtures, zero retries and required release rehearsal names. Coordinate active workflow edits explicitly.
5. Run the resulting canonical commands and produce before/after timings plus an assertion/suite ownership diff. Preserve a convenient targeted command per packet without using it to replace applicable full gates before PR.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | Canonical verification runs | each required gate is traced | every required check runs once with an explicit owner and no omitted standalone check | execution log and gate ownership table |
| LOCAL2 | The old and new source are compared under equivalent resources | timings are recorded | savings come from removed repeated work, not skipped assertions/instrumentation | same-machine before/after table |
| LOCAL3 | Browser workers run concurrently | tests execute | each keeps an isolated server/database/session and no retry masks failure | fixture and repeated failure-path checks |
| LOCAL4 | CI release/deploy contracts consume job/step names | workflow changes run | named release/rehearsal requirements and existing trust restrictions stay intact | workflow tests and release contract evidence |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Demonstrated duplicate builds/installs/lint/project executions | Delete redundant invocations while preserving every gate and artifact dependency | required | before/after execution ownership and timings |
| Unnecessary forwarding script layers with no distinct behavior | Collapse only verified duplicates into the canonical existing entrypoint | conditional | consumer/command compatibility evidence |

## Non-goals

- No new task runner
- No test-runner migration
- No lowered coverage, retries, broad skips or disabled instrumentation
- No runner privilege expansion

## Test scenarios

- actual canonical local run plus meaningful failure propagation
- release manifest fixture and production bundle ownership
- shared artifact handoff and provider/performance serial exceptions

## Risks

- Tests and independent release rehearsals may legitimately repeat some behavior. Deleting them needs equivalent proof, not a matching test title. External runner changes require explicit operational evidence.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.
