# VER-02 — Detect orphan test files and prove intended project discovery

- Stable key: `VER-02`
- GitHub leaf: [#210](https://github.com/Vivekpsps3/vivek-monorepo/issues/210)
- Parents: [#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199), [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286). Use its branch if the amendment is not yet on main.
- Dependencies: none
- Conflict groups: `browser-config`, `ci-workflow`, `test-discovery`, `quality-docs`
- Verification profiles: `docs`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A suite-green claim names the user journeys actually executed and cannot hide a new spec behind a filename selector.

Add an explicit discovery guard around the existing test projects; leave actual Town fixture implementation to TOWN-01 and Profile repair to UX-01.

## Requirements

- TD-14 discovery contract only
- TD-13 spec ownership
- #199 actual test discovery and exclusion ownership
- #125 residual CI/test inclusion evidence

## Source paths

- `tests/e2e/config.ts`
- `playwright.config.ts`
- `tests/e2e/server.py`
- `apps/web/e2e/playwright.config.ts`
- `angular.json`
- `apps/karma.conf.js`

## Target paths

- `tests/e2e/config.ts`
- `playwright.config.ts`
- `scripts/`
- `tests/e2e/`
- `docs/QUALITY.md`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Record current discovered specs per project using the real --list output and compare with test files, not source-name assumptions. Assign every existing omitted or fixme journey to its owning packet with reason.
3. Add the smallest check for an unexpectedly orphaned new spec, an empty intended project and an exclusion with no reason/owner. Preserve legitimate viewport-specific and platform-specific cases separately from unimplemented whole journeys.
4. Use the existing wrapper/project definitions as authority and remove copied spec filename knowledge where a safe discovery rule can replace it. Coordinate actual Town activation after TOWN-01 and settings inclusion with UX-01; do not blanket-enable failing suites here.
5. Prove guard behavior with a disposable omitted-spec fixture and selected-but-not-run versus executed status reporting; wire the guard into the appropriate canonical local/CI check once.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | A new spec is added outside the active selector | discovery verification runs | the omission fails with project/path and no false green execution claim | negative orphan fixture |
| LOCAL2 | An intended project discovers zero tests | guard runs | it fails rather than reporting success | empty-project fixture |
| LOCAL3 | Existing Town/settings gaps remain pending their owning packets | report is produced | it records exact owner/dependency and never calls listed or skipped tests passed | discovery inventory checked against actual --list |
| LOCAL4 | TOWN-01 and UX-01 have merged | current project is listed and executed | their intended journeys are discovered without a second standalone project or duplicate browser run | current discovery plus executed test evidence |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Redundant hardcoded discovery selectors/copies replaced by one owner | Remove duplicate filename lists where possible while keeping explicit reviewed exclusions | required | before/after discovery diff proving all surviving behavior owners |

## Non-goals

- No second browser harness
- No retries/quarantine to hide real failures
- No implementation of Town fixtures or Profile behavior
- No treating --list as test execution

## Test scenarios

- new orphan file, empty project, explicit exclusion owner
- actual five-file Town baseline versus source files
- post-dependency actual Town/settings discovery

## Risks

- Discovery and fixture activation are different deliverables. If dependencies are not merged, close only the guard’s own acceptance and leave parent fixture rows open.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.
