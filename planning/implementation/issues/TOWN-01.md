# TOWN-01 — Activate the actual Town browser journeys using existing isolated fixtures

- Stable key: `TOWN-01`
- GitHub leaf: [#249](https://github.com/Vivekpsps3/vivek-monorepo/issues/249)
- Parents: [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `UX-02`, `VER-02`
- Conflict groups: `browser-fixture-core`, `town-browser`, `test-discovery`
- Verification profiles: `web_front`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Town habit, dialog and history behavior really runs in local/CI browser coverage with deterministic owners and dates.

Town habit, dialog and history behavior really runs in local/CI browser coverage with deterministic owners and dates.

## Requirements

- #81 delivery1/TH1 and harness acceptance; #115 retained browser inventory https://github.com/Vivekpsps3/vivek-monorepo/issues/115; actual execution rather than test.fixme/list-only evidence.

## Source paths

- `tests/e2e/config.ts`
- `tests/e2e/server.py`
- `tests/e2e/fixtures.ts`
- `apps/web/e2e/town.spec.ts`
- `apps/web/e2e/town-checkin.spec.ts`
- `apps/web/e2e/town-dialogs.spec.ts`

## Target paths

- `tests/e2e/server.py`
- `tests/e2e/config.ts`
- `apps/web/e2e/town.spec.ts`
- `apps/web/e2e/town-checkin.spec.ts`
- `apps/web/e2e/town-dialogs.spec.ts`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Reuse current Town domain/wrapper, worker-owned ephemeral server/DB/session and existing clock endpoint; add town,town-empty and seeded second-owner reset fixtures.
3. Use deterministic LA server/client clock and source-owned fixture setup, then select the three legacy Town files in the actual project.
4. Enable test.fixme only after fixture and current behavior work; fix stale expectations with current intended contracts, not weaker mocks or removed assertions.
5. Execute founding/check-in/Undo/history/archive/dialog/error/focus/privacy stories and preserve every existing Finance/Travel/Media/Pixels/World project.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| HARNESS1 | fresh isolated Town workers with both named seeds and second owner | reset, set LA clock and execute selected Town journeys | reproducible records/day/session; foreign names/data never enter owner DOM | actual Playwright run with selected-file list and owner markers |
| HARNESS2 | two simultaneous Town workers and existing projects | run fixture resets/requests independently | no port/DB/session/output collision and all required existing projects remain selected | parallel worker run and discovery inventory |
| HARNESS3 | legacy three fixme files | list and run the project after activation | each intended case executes; zero fixme exemption remains for those journeys | machine-readable discovered/executed test counts and exit result |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| legacy dormant Town fixture assumptions, duplicate fixed-port server setup and test.fixme exclusions | reuse current shared worker fixture and delete obsolete setup/exclusions after behavior passes | required | actual executed tests and no fixed-port duplicate process |

## Non-goals

- No new harness/wrapper, retries or assertion reductions.
- No claiming listed tests have executed.

## Test scenarios

- town/town-empty/second-owner;LA clock/DST;two workers;founding;checkinUndo;history/archive;errors/focus

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
