# MED-05 — Finish explicit Popular discovery through the existing service

- Stable key: `MED-05`
- GitHub leaf: [#239](https://github.com/Vivekpsps3/vivek-monorepo/issues/239)
- Parents: [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `MED-01`
- Conflict groups: `media-discovery`, `media-provider-transport`
- Verification profiles: `media_front`, `media_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Popular movies load only after a user chooses, and adding a discovered result safely becomes Open saved item.

## Requirements

- #85 scope5/M10; zero-before-click, max20, concurrency, cache-back and error acceptance.

## Source paths

- `apps/media/frontend/src/popular-movies.service.ts`
- `apps/media/frontend/src/popular.mjs`
- `apps/media/frontend/src/search.component.ts`
- `apps/media/frontend/src/add.component.ts`
- `apps/media/backend/routers/journal.py`

## Target paths

- `apps/media/frontend/src/search.component.ts`
- `apps/media/frontend/src/popular-movies.service.ts`
- `apps/media/frontend/src/media.css`
- `apps/media/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Mount an explicit Popular button using current service; no requests until click, skeletons while pending and at most20 sanitized results with allowed artwork/fallback.
3. Connect existing provider Add to saved identity and Open saved item; prevent duplicate adds under concurrent activation.
4. Reuse cached result on back navigation and supply useful empty/error/Retry; remove competing provider fetch/cache flags from the discovery component.
5. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
6. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| POP1 | discovery opened with request interceptors | wait, click Popular then navigate back | zero pre-click requests; one explicit load, bounded20 cards, cached return | request counters, card bound and browser history |
| POP2 | one result already saved or two simultaneous Add intents | activate Add and retry after failure | one owner entry is saved and action becomes Open saved item; no lost recovery | API identity/concurrency and browser action assertions |
| POP3 | empty or failed Popular response | retry using keyboard | localized useful state and correct loading/focus without unsafe artwork | state and URL allowlist tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| unmounted Popular helper plus any competing component provider cache/fetch logic | one current service consumed by explicit UI; delete redundant requests/state | required | single request owner, cached back path, actual mounted consumer |

## Non-goals

- No automatic discovery fetch or new provider client.

## Test scenarios

- zero initial;loading;max20;unsafe artwork;empty;retry;already saved;concurrentadd;back cache

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
