# MED-10 — Resolve retained Media runtime race, cache and no-op findings

- Stable key: `MED-10`
- GitHub leaf: [#285](https://github.com/Vivekpsps3/vivek-monorepo/issues/285)
- Parents: [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286). Use its branch if the amendment is not yet on main.
- Dependencies: `MED-01`
- Conflict groups: `media-detail-form`, `media-runtime`, `media-records`
- Verification profiles: `media_front`, `media_back`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Late failures, preflight deadlines and redundant review saves do not disturb the current user state.

Prove each retained #128 Media runtime finding on current main and remove only its obsolete path.

## Requirements

- #85 scope7; all retained #128 Media QA previously owned by MED-06 MQA1: third-item late failure, Monday composer, preflight timeout, toast retirement, sticky_status cache and duplicate-review no-op.

## Source paths

- `apps/media/frontend/src/detail.component.ts`
- `apps/media/frontend/src/drafts.service.ts`
- `apps/media/backend/services/records.py`
- `apps/media/e2e/detail-races.spec.ts`

## Target paths

- `apps/media/frontend/src/detail.component.ts`
- `apps/media/frontend/src/drafts.service.ts`
- `apps/media/backend/services/records.py`
- `apps/media/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Build retained #128 evidence table for third-item late failure suppression, Monday composer header, preflight timeout, toast retirement, dead sticky_status cache and duplicate-review no-op; fix residuals at their owner and remove obsolete cache/branches.
3. For each retained finding, identify the current trigger, state owner, existing test and disposition before changing code. Hold responses deterministically; require request/write counts for duplicate-review no-op. Do not invent a replacement cache, new retry layer or source-string-only proof.
4. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
5. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| MQA1 | each retained #128 finding | execute current trigger with held failures/timeouts | every finding has passing current evidence or explicit supersession; no stale cache or duplicate-review write remains | QA source→test ledger and no-op/request-count assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| dead sticky_status cache and obsolete duplicate review/failure/toast pathways | remove verified unused state and route remaining behavior through current owners | required | consumer search plus named surviving behavior tests |

## Non-goals

- No broad rewrite of already correct M8/M11 behavior.
- No removal of meaningful outage/conflict tests or provider IO on saved views.

## Test scenarios

- third item selected before an old failure resolves; Monday-start composer; held preflight timeout
- no obsolete toast/cache state; duplicate identical review is zero write/no-op; owner and draft preservation

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
