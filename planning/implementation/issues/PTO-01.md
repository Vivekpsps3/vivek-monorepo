# PTO-01 — Replace separate bucket charts with one accessible combined forecast

- Stable key: `PTO-01`
- GitHub leaf: [#230](https://github.com/Vivekpsps3/vivek-monorepo/issues/230)
- Parents: [#110](https://github.com/Vivekpsps3/vivek-monorepo/issues/110)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `SAFE-05`
- Conflict groups: `travel-pto-main`, `travel-pto-chart`
- Verification profiles: `travel_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

PTO and Sick history/projection can be understood together, including negative balances and missing sources.

PTO and Sick history/projection can be understood together, including negative balances and missing sources.

## Requirements

- #110 scope2 and3; combined chart/table geometry, independent retry and final copy/layout acceptance.
- TD-22: this combined chart is the presentation boundary. Policy draft validation stays PTO-02, and exact balances stay server-owned. Moving the template into another file is not completion.

## Source paths

- `apps/travel/frontend/src/pto-chart.component.ts`
- `apps/travel/frontend/src/pto-chart.mjs`
- `apps/travel/frontend/src/pto.component.ts`
- `apps/travel/frontend/src/pto-chart.component.spec.ts`
- `apps/travel/backend/routers/leave.py`

## Target paths

- `apps/travel/frontend/src/pto-chart.component.ts`
- `apps/travel/frontend/src/pto-chart.mjs`
- `apps/travel/frontend/src/pto-chart.d.mts`
- `apps/travel/frontend/src/pto.component.ts`
- `apps/travel/backend/static/tests/pto-chart.test.mjs`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Replace two independent bucket charts with one combined projection consuming existing /pto/series points; remove duplicated chart fetch/render state while leaving forms/tiles independent.
3. Use PTO circles/accent and Sick squares/series2,2.5px lines, solid history/dashed projection meeting at Today,4–5 y ticks including0, sensible month/year ticks, Today rule, collision-free end labels and below-zero band.
4. Provide Balance by month equivalent table and correct single-bucket/no-bucket/single-point/rolled horizon behavior using pure geometry helpers and bound SVG only.
5. Fetch after policy/entry/hours-per-workday changes; chart-only failure shows exact retry copy and does not hide working forms. Set220px at390 and300px beside320px tiles at1280; apply Balance today/half-month/Pick PTO or Sick/bucket What-if copy.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| CHART1 | zero/negative, one/two buckets, single point and rollover vectors | render combined plot and equivalent table | values equal API points and line/symbol/tick/Today/labels distinguish states without color alone | pure geometry fixtures, table comparison and screenshots |
| CHART2 | working tiles/forms and failed series request | retry chart then edit policy/entry/hours-per-day | exact local error appears; forms remain usable and one relevant refreshed chart is shown | held-request browser/HTTP count evidence |
| CHART3 | 390/1280 in both themes | keyboard/read equivalent data and inspect plot | required dimensions, no overlap/overflow and axe-clean meaningful table | responsive browser and existing node/Karma tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| two independent bucket chart render/fetch paths | one combined projection and single bounded chart request owner | required | old duplicate chart markup/state removed; one point contract/table |

## Non-goals

- No innerHTML, new chart library or component-owned balance math.

## Test scenarios

- negative/zero/single bucket/point; cap; rollover; exact copy; chart-only outage; hours-per-day refresh

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
