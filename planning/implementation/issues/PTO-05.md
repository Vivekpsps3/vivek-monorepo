# PTO-05 — Add explicit scheduled accrual without changing daily-prorated defaults

- Stable key: `PTO-05`
- GitHub leaf: [#234](https://github.com/Vivekpsps3/vivek-monorepo/issues/234)
- Parents: [#110](https://github.com/Vivekpsps3/vivek-monorepo/issues/110)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286). Use its branch if the amendment is not yet on main.
- Dependencies: `PTO-02`, `PTO-04`
- Conflict groups: `travel-leave-math`, `travel-leave-api`, `schema-head`, `travel-pto-main`
- Verification profiles: `travel_front`, `travel_back`, `server_back`, `schema`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A policy can opt into posted accrual on a clear schedule while all existing balances keep their established semantics.

A policy can opt into posted accrual on a clear schedule while all existing balances keep their established semantics.

## Requirements

- #110 scope6 and accrual cadence/cap/date/version/migration acceptance.

## Source paths

- `apps/travel/backend/services/leave_math.py`
- `apps/travel/backend/models.py`
- `apps/travel/backend/schemas.py`
- `apps/travel/frontend/src/pto.component.ts`
- `apps/server/alembic/versions/`

## Target paths

- `apps/travel/backend/services/leave_math.py`
- `apps/travel/backend/models.py`
- `apps/travel/backend/schemas.py`
- `apps/travel/backend/routers/leave.py`
- `apps/travel/frontend/src/pto.component.ts`
- `apps/server/alembic/versions/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Add additive versioned accrual_mode and explicit first-posting anchor; retain daily-prorated default for existing and new policies.
3. Implement scheduled posting only in the existing exact Fraction/Decimal policy math, with cadence anchor, half-month/month-end/leap rules, caps and same-day event order.
4. Mode changes show impact preview and require confirmation; prevent duplicate posting or retrospective reinterpretation.
5. Create one new migration with preservation/preflight/compatibility evidence; never edit applied revisions. Remove duplicated cadence branches exposed by the explicit mode.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| ACCR1 | legacy/default policies and opted-in scheduled policies across every cadence | project cap/negative/zero balances over month-end/leap/year/day boundaries | legacy points unchanged; scheduled postings occur exactly once on documented anchors/order | exact math boundary vectors and API series parity |
| ACCR2 | mode change affecting balance | preview, cancel or confirm and reload | no change on cancel; confirmed version/anchor persist with shown effect and no silent backfill | browser impact and saved payload assertions |
| ACCR3 | existing synthetic database containing policies and allocations | upgrade new revision and serve compatible record versions | all rows preserved, one head and old semantics unchanged | schema drift/seeded rehearsal/preservation evidence |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| implicit cadence heuristics and component-side scheduled balance calculations | one explicit mode-driven server policy owner; delete duplicate math branches | required | golden default fixtures unchanged and no component duplicate algorithm |

## Non-goals

- No retrospective change to existing balances or silent default migration.

## Test scenarios

- daily defaults; anchors; every cadence; semimonthly/month-end/leap;caps;order;negative;mode preview;upgrade

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
