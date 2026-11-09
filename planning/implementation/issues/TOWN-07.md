# TOWN-07 — Enforce Town relational ownership with one preserving migration

- Stable key: `TOWN-07`
- GitHub leaf: [#255](https://github.com/Vivekpsps3/vivek-monorepo/issues/255)
- Parents: [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286). Use its branch if the amendment is not yet on main.
- Dependencies: `TOWN-02`
- Conflict groups: `schema-head`, `town-models`, `town-writes`
- Verification profiles: `server_back`, `schema`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

The database refuses invalid or cross-owner Town child rows while existing habits/history and account deletion continue to work.

The database refuses invalid or cross-owner Town child rows while existing habits/history and account deletion continue to work.

## Requirements

- #81 delivery9/#120 composite ownership/invariants/index/migration acceptance; original #120 https://github.com/Vivekpsps3/vivek-monorepo/issues/120.
- TD-27: this leaf is the composite ownership migration. Use one additive revision, invalid-data preflight and the existing account-deletion tests. Do not edit an applied migration.

## Source paths

- `apps/server/town/models.py`
- `apps/server/town/writes.py`
- `apps/server/schema.py`
- `apps/server/alembic/versions/`
- `apps/server/tests/test_schema_migrations.py`
- `apps/server/identity/admin.py`

## Target paths

- `apps/server/town/models.py`
- `apps/server/alembic/versions/`
- `apps/server/tests/`
- `apps/server/schema.py`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Reconcile actual accepted stored styles/cadence/slot/name/key representation and preflight invalid existing data without deleting or coercing it.
3. Add one new revision with unique parent(id,user_id), composite child ownership FKs for checkins/cadences, RESTRICT habit deletion with children and cadence user_id index.
4. Add only known finite CHECK invariants: stylesforge/garden/cottage,per_week1–7,slot0–5,bounded nonempty name/key; preserve ordered child deletion/account cascade behavior.
5. Retire redundant application-only guards only if DB constraints and public error compatibility fully cover them; leave meaningful authorization checks in place.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| OWNDB1 | existing multi-owner Town data and attempted foreign child/invalid values | upgrade then insert/mutate through SQL/API | valid history preserved; cross-owner and finite invalid states rejected; normal APIs remain scoped | migration/integrity/API constraint fixtures |
| OWNDB2 | habit with history and account deletion | attempt habit delete then delete account normally | RESTRICT prevents unsupported orphaning; account delete removes ordered owner rows correctly | FK/account deletion tests |
| MIG1 | seeded current and compatible schemas | run drift/head/upgrade/rehearsal | onehead, no applied revisions edited, rows/digests preserved and preflight fails without destructive cleanup | seeded preservation report and required schema gates |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| duplicate unenforced ownership declarations or redundant guard branches | replace metadata with actual constraints; remove only proven duplicate checks, retaining auth | required | DB rejects invalid relation while public error/authorization tests survive |

## Non-goals

- No historical date/XP changes, destructive cleanup or incompatible cascade.

## Test scenarios

- foreigncheckin/cadence;validrepresentation;checklimits;RESTRICT;accountdelete;invalidpreflight;upgradepreservation

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
