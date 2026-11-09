# HUB-02 — Lead the Hub with one compact Up next projection and shared source responses

- Stable key: `HUB-02`
- GitHub leaf: [#244](https://github.com/Vivekpsps3/vivek-monorepo/issues/244)
- Parents: [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `SAFE-04`, `SAFE-05`, `UX-03`, `TOWN-02`
- Conflict groups: `hub-main`, `travel-summary`, `media-summary`, `finance-public-api`
- Verification profiles: `web_front`, `travel_back`, `media_back`, `finance_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

The workspace shows actionable upcoming activity with independent recovery, without duplicate source requests or private Finance payloads.

The workspace shows actionable upcoming activity with independent recovery, without duplicate source requests or private Finance payloads.

## Requirements

- #93 scope3 common card state/greeting portion and scope4 Up next; UX-7 Hub hierarchy; retained #93/#103 state/request/performance acceptance.

## Source paths

- `apps/web/src/app/hub/hub.component.ts`
- `apps/web/src/app/hub/hub.component.html`
- `apps/web/src/app/hub/hub-load.ts`
- `apps/web/src/app/hub/town-hub-card.ts`
- `apps/travel/backend/app.py`
- `apps/media/backend/routers/journal.py`

## Target paths

- `apps/web/src/app/hub/`
- `apps/travel/backend/routers/`
- `apps/media/backend/routers/journal.py`
- `apps/finance/frontend/src/public-api.ts`
- `apps/web/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Use a small typed list of app-owned adapters/state contracts, not a plugin framework; preserve enabled Town card and existing Pixels strip.
3. Travel summary accepts validated optional timezone and owner-scoped14-day/overdue up_next; Media calendar saved reads remain DB-only; Finance returns integer bills-due count only in the browser.
4. Share each source response between card and compact agenda; keep independent timeout/retry/stale/loading/expired handling and abort old owner work.
5. Implement reminder Done/Undo with complete replacement ReminderIn payload and failure rollback; condense empty/locked panels so upcoming action leads without hiding source recovery.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| NEXT1 | Travel/media events near14-day,overdue,month/timezone boundaries and locked Finance | load Hub then toggle source filters or retry one source | correct owner events and only a count-only Finance row; shared responses avoid duplicate reads | API date/owner fixtures and request-count browser |
| NEXT2 | one failed/slow source plus usable others and pending reminder toggle | fail/undo/retry and switch owner during work | others remain usable; stale/source errors are honest; complete payload/rollback/Undo and late drop correct | held-response tests and serialized request bodies |
| HSTATE1 | empty/ready/stale/expired Town/Pixels/Finance cards | inspect both widths/themes and keyboard next actions | common state/44px/XP semantics hold, no duplicate Town card or dominant blank panel | root unit/browser/axe plus compact before/after captures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| separate card-versus-agenda reads/state reducers and oversized duplicate summaries | one source response and smallest shared state adapter per owner; delete duplicate loads/flags | required | request counts and same overlapping event fixtures |
| inactive or duplicate app-card ordering/disabled Town seams | preserve real current cards and remove obsolete branch | required | one enabled Town/Pixels card and stable route tests |

## Non-goals

- No server Finance names/amounts/IDs, new Hub ledger or general event bus.

## Test scenarios

- 14day/overdue;timezone;one-sourceoutage;stale;count-onlyFinance;full ReminderIn;Undo;ownerchange;single requests

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
