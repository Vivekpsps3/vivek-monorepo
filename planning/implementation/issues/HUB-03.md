# HUB-03 — Expand the existing Up next read model into the navigable Hub agenda

- Stable key: `HUB-03`
- GitHub leaf: [#245](https://github.com/Vivekpsps3/vivek-monorepo/issues/245)
- Parents: [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `HUB-02`, `CON-02`
- Conflict groups: `hub-main`, `hub-agenda`, `private-routes`, `travel-summary`, `media-summary`
- Verification profiles: `web_front`, `travel_back`, `media_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

An owner can explore upcoming and recent Travel/Media activity through one accessible agenda and mini-month.

## Requirements

- #93 scope5/#133 Timeline; filters/date-window/history/authoritative dates and compact overlap/no-duplicate-request acceptance.

## Source paths

- `apps/web/src/app/hub/hub.component.ts`
- `apps/web/src/app/hub/hub-load.ts`
- `apps/web/src/app/routes.ts`
- `apps/web/routes.json`
- `apps/travel/backend/routers/`
- `apps/media/backend/routers/journal.py`

## Target paths

- `apps/web/src/app/hub/`
- `apps/web/src/app/routes.ts`
- `apps/web/routes.json`
- `apps/travel/backend/routers/`
- `apps/media/backend/routers/journal.py`
- `apps/web/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Mount /hub/agenda using the same typed source adapters as compact Up next; add mini-month/list, source filters and previous/next date-window navigation.
3. Add only necessary additive owner-scoped bounded window parameters/endpoints, preserving existing summary defaults; support recent history only from authoritative source dates and explicitly omit unsupported event kinds.
4. Keep date/filters in URL and browser history; Finance remains browser-only count row with no names/amounts/IDs in URL/server.
5. Delete separate agenda request/state/projection logic that duplicates compact Hub; preserve keyboard/table/list alternatives and source-local retries.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| AGENDA1 | overlapping compact/expanded windows with present,future and recent history events | navigate windows/filter/back-forward/reload | same authoritative events agree and source filters/date survive; unsupported history is not invented | API window fixtures plus actual route/history browser |
| AGENDA2 | one source fails and Finance is locked/unlocked | retry or navigate while request held | usable sources stay visible, no duplicate shared requests and private Finance material never enters URL/network | request counts, markers and state assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| standalone Timeline/agenda store and duplicated Up next projection | reuse existing adapter/read model and delete parallel request/state path | required | same overlap fixtures and single-source request ownership |

## Non-goals

- No competing application/event store or inferred historical timestamps.

## Test scenarios

- windowbounds;recenthistoryavailable/absent;minimonth;filtersURL;backforward;one-sourcefailure;noFinanceURL

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
