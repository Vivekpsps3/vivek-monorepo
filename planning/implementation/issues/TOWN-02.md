# TOWN-02 — Replace passive credit stub with bounded authoritative Media/Travel queries

- Stable key: `TOWN-02`
- GitHub leaf: [#250](https://github.com/Vivekpsps3/vivek-monorepo/issues/250)
- Parents: [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `TOWN-01`, `MED-01`
- Conflict groups: `town-read-service`, `media-records`, `travel-reminders-api`, `town-today`
- Verification profiles: `server_back`, `media_back`, `travel_back`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Town grows from real owner Media/Travel activity, retracts reversed actions and labels source status honestly.

## Requirements

- #81 delivery2/PassiveDays, delivery3/completion timestamps; acceptance owner/founding/LA/source/caps/600ms; UX-8 source labels.

## Source paths

- `apps/server/town/service.py`
- `apps/server/town/engine.py`
- `apps/server/town/constants.py`
- `apps/media/backend/services/records.py`
- `apps/travel/backend/routers/trips.py`
- `apps/web/src/app/town/town-today.component.ts`
- `apps/web/src/app/town/town-today.component.html`

## Target paths

- `apps/server/town/service.py`
- `apps/media/backend/services/records.py`
- `apps/travel/backend/routers/trips.py`
- `apps/web/src/app/town/town-today.component.ts`
- `apps/web/src/app/town/town-today.component.html`
- `apps/server/tests/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Implement grouped bounded per-source PassiveDays queries: watched episodes require watched_on, completed movie/tv/book/game require completed_on, reminders join owner trip and request timezone.
3. Credit booked/done trip on end_date+1 only if logged by its end; planning trips never credit and no source credits before Town founding.
4. Ensure existing completion writes set/clear timestamps without changing response keys/contracts; derive credits so Undo/delete/toggle retract instead of accumulate.
5. Retain library10/day, reminder15/day and separate completed-trip30XP; source unavailability excludes its XP while usable Town remains. Name Media/Travel beside Today auto credit rows, replacing indistinguishable Auto labels.
6. Remove empty-success stub and copied per-source tally logic; measure existing three-year600ms p50 fixture without lowering its gate.
7. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
8. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PASSIVE1 | owner1/owner2 completed and incomplete Media/reminder/trip records around founding/LA day | load Town then complete/Undo/delete/toggle sources | only eligible owner/date records credit once, correct caps and natural reversal | API/pure grouped-query vectors and actual source→Town browser |
| PASSIVE2 | one source unavailable versus genuinely empty | load Today/buildings | source named and status honest; unavailable XP excluded without breaking usable Town | source-failure fixtures and rendered labels |
| PASSIVE3 | three years representative passive history | run existing performance fixture serially without coverage | p50 stays below600ms and queries stay grouped/bounded | recorded measurements and query counts |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| PassiveDays empty maps reporting both sources available | replace stub with real owner-scoped projections; delete stub/obsolete TB3 comments | required | source actions visibly change correct buildings and availability |
| per-row duplicated source tally queries and ambiguous Auto display branches | group per source and use named source projection | required | bounded query count and clear source DOM labels |

## Non-goals

- No new response keys or universal source score.
- No Finance/Health data in server Town XP.

## Test scenarios

- ownerforeignreminder;founding;LA/UTC;watched/completedtimestamps;planning/booked/done/latelog;cap;Undo/delete;sourceoutage;600ms

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.

## Living World scope boundary — 2026-11-11

Retain every passive-credit/date/cap/query/reversal requirement. PLACE-02 consumes these facts and explains intentional source-count differences; PLACE-10/11 add derived keepsakes without a new credit ledger. See [scope reconciliation](../../living-world/scope.md) and [parent #304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). This is planned extension scope; it neither closes nor enlarges this packet's retained implementation acceptance.
