# MED-04 — Render Related only on demand through the existing endpoint

- Stable key: `MED-04`
- GitHub leaf: [#238](https://github.com/Vivekpsps3/vivek-monorepo/issues/238)
- Parents: [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286).
- Dependencies: `MED-03`
- Conflict groups: `media-detail-form`
- Verification profiles: `media_front`, `media_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Related items load when they become relevant, with safe links and local recovery instead of speculative requests.

## Requirements

- #85 scope2/M6; request-count/lazy/no-artist/max12/dedup/error acceptance.

## Source paths

- `apps/media/frontend/src/related.mjs`
- `apps/media/frontend/src/related.d.mts`
- `apps/media/frontend/src/detail.component.ts`
- `apps/media/frontend/src/detail.component.html`
- `apps/media/backend/routers/journal.py`

## Target paths

- `apps/media/frontend/src/detail.component.ts`
- `apps/media/frontend/src/detail.component.html`
- `apps/media/frontend/src/media.css`
- `apps/media/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Connect one sentinel observer to the current Related endpoint; distant content makes zero initial requests and artist detail never requests Related.
3. Render at most12 safe deduplicated cards from existing helper, linking Add with encoded titles; empty response hides section.
4. Give local error/Retry and bounded duplicate suppression; dispose observer/cancel obsolete route requests and delete alternate eager request hooks.
5. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
6. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| REL1 | Related sentinel initially below viewport and an artist record | open detail then scroll sentinel into view repeatedly | zero early/artist requests and one eligible lazy request; bounded12 deduped results | intercepted request counts and safe-link DOM assertions |
| REL2 | provider failure and navigation away during request | retry or release a stale response | error stays local, retry is bounded and old route cannot publish cards | held-response browser and observer disposal test |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| eager Related requests or repeated per-render subscriptions | one route-owned lazy observer/request path | required | request counts prove no prefetch/duplicate subscriptions |

## Non-goals

- No provider prefetch, competing related client or external unapproved origins.

## Test scenarios

- distant sentinel;repeat visibility;artist;empty;duplicates;unsafe URL/title encoding;failure/retry;routecancel

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.

## Dependency rationale

Preserve the merged detail editor and drafts. Backend Related uses the existing endpoint and bounded transport; the Pixels/Health helper is not a required Media API.
