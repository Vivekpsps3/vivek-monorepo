# HEALTH-02 — Build complete Gym PR editing and apply all settled badge names

- Stable key: `HEALTH-02`
- GitHub leaf: [#257](https://github.com/Vivekpsps3/vivek-monorepo/issues/257)
- Parents: [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `HEALTH-01`
- Conflict groups: `health-gym`, `health-units-dialog`, `health-store`, `private-routes`
- Verification profiles: `web_front`, `finance_front`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

An owner can record personal records, inspect derived bests/trophies and correct history without exposing private values.

An owner can record personal records, inspect derived bests/trophies and correct history without exposing private values.

## Requirements

- #90 implementation1/Gym half,4/Gym,5/Gym dialogs,approved20badge mapping; #88 Gym and #127 copy https://github.com/Vivekpsps3/vivek-monorepo/issues/88 https://github.com/Vivekpsps3/vivek-monorepo/issues/127.

## Source paths

- `apps/web/src/app/town/health/health.constants.ts`
- `apps/web/src/app/town/health/health-math.ts`
- `apps/web/src/app/town/health/health-validate.ts`
- `apps/web/src/app/town/health/health-store.service.ts`
- `apps/web/src/app/town/health/health.types.ts`
- `apps/web/src/app/routes.ts`
- `apps/web/routes.json`

## Target paths

- `apps/web/src/app/town/health/`
- `apps/web/src/app/town/`
- `apps/web/src/app/routes.ts`
- `apps/web/routes.json`
- `apps/web/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Mount /town/gym and adopt Clinic’s unit preference/dialog mechanics with Gym-owned typed fields/validators; same loading/8sRetry/corrupt/locked/next contract.
3. Show lift best-set/e1RM,run distance/time/pace,other-record tables,NewPRlast7days and existing trophy criteria; derive e1RM/pace and never persist them.
4. Support add/edit/delete lift/run/other; measured date1900-01-01 through localtoday, logged_on immutable, conflict recoverable and deleting current PR reveals previous best.
5. Replace all15 placeholder display strings with the settled20badge mapping in parent90 exactly, retaining IDs/thresholds and existing known names; no invention/art blocker.
6. Prove marker/privacy/lock/owner/route disposal and backup compatibility using current encrypted collections.
7. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
8. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| GYM1 | lift/run/other history with current and previous best and recent dates | add/edit/delete current best and switch display units | derived pace/e1RM/best/NewPR/trophies correct, previous best returns and raw records/revisions are invariant | math fixtures and complete Gym browser |
| GYM2 | datebounds,immutablelogged_on,409 and failed save | submit/correct/retry and delete with confirmation | linked errors/draft/focus survive; invalid date not saved and logged_on unchanged | validator/API payload/dialog tests |
| BADGE1 | each approved badgeID and its threshold fixture | render awards | exact approved display names, no internal placeholders, thresholds unchanged | all20ID/name assertions and award browser |
| GYMPRIVATE | other-record marker and held read/write | lock/switch owner/leave or backuprestore | no private values/crypto initially locked or stale publication; allowed records restore | marker/import/module-load and recovery tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| 15 Health badge name placeholders and elapsed waiting-for-design comments | apply parent90 settled names while preserving stable IDs | required | all20mapping fixtures; no internal ID shown |
| Gym-local copied units/dialog/derivedPR persistence logic | reuse Clinic shared mechanics and existing pure derived math; delete duplicates | required | one units preference/shell and no stored e1RM/pace |

## Non-goals

- No new badge thresholds/award model, stored derived metrics, health API or generic form framework.

## Test scenarios

- lift/run/other;dates;bestrollback;newPR7days;20badges;immutablelogged;conflict;units;markers;lockedmodule

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
