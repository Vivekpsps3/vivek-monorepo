# VER-03 — Replace obsolete behavior expectations and document honest coverage ownership

- Stable key: `VER-03`
- GitHub leaf: [#211](https://github.com/Vivekpsps3/vivek-monorepo/issues/211)
- Parents: [#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199), [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `town-api-tests`, `coverage-tools`, `quality-docs`
- Verification profiles: `server_back`, `docs`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A passing test validates the intended product rule rather than a stale historical requirement.

Retire speculative Town xfails and misleading coverage summaries through current-contract behavior evidence; keep every meaningful invariant covered.

## Requirements

- TD-15
- TD-16
- TD-38 evidence interpretation
- #199 meaningful branch/race coverage and current assertion ownership
- #81 date-window and ownership invariants

## Source paths

- `apps/server/tests/test_town_api_write.py`
- `apps/server/town/writes.py`
- `apps/server/town/clock.py`
- `apps/karma.conf.js`
- `pyproject.toml`
- `quality/coverage.txt`
- `docs/QUALITY.md`
- `apps/web/e2e/hub-pixels.spec.ts`

## Target paths

- `apps/server/tests/test_town_api_write.py`
- `scripts/coverage-gate.sh`
- `scripts/karma-coverage-summary.mjs`
- `docs/QUALITY.md`
- `planning/implementation/`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Map current coverage modes/source denominators and known xfails to actual live requirements. Keep root floors unchanged; state clearly that Karma covers loaded source and Python currently measures statements.
3. Resolve the two optional UTC-clamp xfails against the accepted local-day contract: do not invent a dead _server_day helper just to satisfy historical speculation. Replace/remove only with documented current date-window behavior tests that retain real timezone/trusted-clock protection.
4. Audit stale assertion references relevant to this queue; Profile404 and pointer-only Hub expectations stay owned by UX-01/UX-03. Link their surviving evidence rather than implementing those fixes here.
5. Add focused risky branch/race coverage missing from owned Town date/owner behavior and update summaries to distinguish threshold, historical measurement and current measured run. Remove misleading success prose and dead speculative test code.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | The current accepted Town local-day rule and trusted clock are exercised | valid boundary and invalid out-of-window check-ins are submitted | behavior matches the live contract and owner isolation remains intact | API tests for timezone/day/window and foreign-owner cases |
| LOCAL2 | Obsolete optional helper tests are removed or replaced | the PR is reviewed | each removed assertion has a documented disposition and surviving actual behavior check | assertion replacement ledger |
| LOCAL3 | Coverage results are emitted | a reader inspects summary | source denominator/mode and current floor are distinguishable from historical measurement | summary fixture and current gate output |
| LOCAL4 | Root thresholds or retries are compared with main | the patch is assessed | no meaningful floor/assertion is reduced and no real failure is relabelled passing | quality diff plus local gates |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Speculative strict-xfail tests requiring a nonexistent optional helper | Retire only after current behavior tests and explicit accepted-contract disposition exist | required | old→surviving assertion matrix |
| Coverage prose that presents historical or loaded-source totals as full-current proof | Replace with authoritative mode/denominator/floor facts | required | summary tests and docs diff |

## Non-goals

- No blanket branch-percentage target
- No floor reductions
- No fabricated security clamp or generic mutation framework
- No duplicate UX-01/UX-03 fixes

## Test scenarios

- LA/UTC day boundaries, valid zone conversion, current/yesterday/out-of-window
- foreign owner, absent source, trusted injected clock
- coverage summary mode/denominator and threshold reporting

## Risks

- Removing a failing/xfail assertion without equivalent current-contract proof would weaken safety. Optional old specification text is not authority to change live dates silently.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.
