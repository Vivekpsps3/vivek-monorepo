# TRIP-02 — Finish one keyboard-accessible trip itinerary and day strip

- Stable key: `TRIP-02`
- GitHub leaf: [#226](https://github.com/Vivekpsps3/vivek-monorepo/issues/226)
- Parents: [#84](https://github.com/Vivekpsps3/vivek-monorepo/issues/84)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `TRIP-01`
- Conflict groups: `travel-trip-main`, `travel-itinerary`
- Verification profiles: `travel_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A traveller can select a day, understand its chronological plans and add a plan on a free day.

A traveller can select a day, understand its chronological plans and add a plan on a free day.

## Requirements

- #84 scope3/T4; timeline ordering, overnight/missing times, selected date and all strip keys acceptance.
- TD-23: itinerary and day selection are the orchestration seam. Row editors keep their own validators and the shared dialog lifecycle. Finance totals stay in the client-only registry.

## Source paths

- `apps/travel/frontend/src/trip.component.ts`
- `apps/travel/frontend/src/trip.component.html`
- `apps/travel/frontend/src/trip-header.mjs`
- `apps/travel/frontend/src/travel.models.ts`

## Target paths

- `apps/travel/frontend/src/trip.component.ts`
- `apps/travel/frontend/src/trip.component.html`
- `apps/travel/frontend/src/trip-header.mjs`
- `apps/travel/frontend/src/travel.css`
- `apps/travel/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Build the day-strip and itinerary from existing trip items with one pure chronological projection; explicit unscheduled/out-of-range groups preserve incomplete records.
3. Provide weekday labels, busy/free accessible names, roving arrows/Home/End and Enter selecting/focusing the day content.
4. Handle departure/arrival and linked parking, next-day red-eye arrivals, activities and ties deterministically; persist/deep-link selected date using non-sensitive route state.
5. At390 use itinerary row menus and remove redundant transport/parking presentation; retain useful desktop sections and existing Undo.
6. Free day opens Add a plan prefilled with that actual local trip date.
7. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
8. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| DAY1 | mixed timed/untimed/out-of-range transport/parking/activity fixtures including red-eye arrival | render/select each trip day | chronology is deterministic with explicit unscheduled groups and next-day arrival placement | pure itinerary vectors plus populated browser story |
| DAY2 | keyboard focus on day strip | press arrows/Home/End/Enter then open free-day action | one roving tab stop selects the intended day and form receives that date | keyboard focus and submitted date assertions |
| DAY3 | selected day URL at390 and1280 | reload/back-forward and compare sections | selection survives, phone has no duplicate sections/overflow and desktop retains required detail | responsive browser/axe/URL evidence |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| parallel timeline and redundant phone transport/parking lists | one itinerary projection with distinct responsive presentation | required | each record appears once in phone itinerary; desktop existing details preserved |
| component-local date sorting/grouping repeated across handlers | one typed pure projection consumed by strip and rows | required | shared projection fixture proves both consumers |

## Non-goals

- No second trip model or event store.
- No provider fetch to render itinerary.

## Test scenarios

- red-eye; no times; ties; out-of-range; free day; selected URL; keys; responsive Undo

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
