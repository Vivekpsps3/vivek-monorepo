# HUB-06 — Deliver scoped revocable Travel/Media calendar subscriptions

- Stable key: `HUB-06`
- GitHub leaf: [#248](https://github.com/Vivekpsps3/vivek-monorepo/issues/248)
- Parents: [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `HUB-03`, `CON-02`
- Conflict groups: `account-settings`, `calendar-feeds`, `schema-head`, `travel-summary`, `media-summary`
- Verification profiles: `web_front`, `server_back`, `travel_back`, `media_back`, `schema`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

An owner can subscribe to selected calendar data and revoke access without exposing Finance or Health.

An owner can subscribe to selected calendar data and revoke access without exposing Finance or Health.

## Requirements

- #93 scope7/#133 calendar feed plus Settings management; escaping,scope,revocation,owner,timezones,no-provider,redacted-logs acceptance.

## Source paths

- `apps/web/src/app/settings/settings.registry.ts`
- `apps/web/src/app/settings/account-section.component.ts`
- `apps/server/identity/models.py`
- `apps/travel/backend/routers/`
- `apps/media/backend/routers/journal.py`
- `apps/server/rate_limit.py`

## Target paths

- `apps/web/src/app/settings/`
- `apps/server/identity/`
- `apps/server/alembic/versions/`
- `apps/travel/backend/routers/`
- `apps/media/backend/routers/`
- `apps/server/tests/`
- `apps/web/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Define bounded read-only Travel/Media feed scopes and per-owner cryptographically random capabilities with hash-only storage, rotate/revoke and HTTPS-only URLs.
3. Add Settings create/rotate/revoke UI with clear anyone-with-URL disclosure and no public/private-feed URL in issue evidence.
4. Generate escaped valid ICS from owner-scoped DB-only queries, bounded windows, correct all-day/timezone semantics and safe conditional requests/rate limits.
5. Keep token values/URLs redacted in logs and no Finance/Health fields; reuse existing source projections rather than a feed-specific event store.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FEED1 | two owners with distinct scopes/tokens and calendar clients without session cookies | fetch selected feed then revoke/rotate or use foreign/invalid capability | only selected owner/scope reads work; old tokens fail; stored values are hashes only | API auth/DB/token-redaction fixtures |
| ICS1 | escaping,newlines,all-day,timezones/window boundary records | parse generated ICS and conditional requests | valid bounded events with correct dates, no provider IO and no Finance/Health payload | ICS parser/fixture and provider-spy tests |
| FEEDUI1 | Settings UI in both widths/themes | create/copy/rotate/revoke and fail an operation | disclosure/focus/draft/retry are correct without a permanent leaked link | browser fixture with synthetic capability only |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| potential separate feed/calendar ledger or duplicated source event assembly | reuse existing DB projections and one capability lifecycle | required | same source event fixtures and no extra persistent event copies |

## Non-goals

- No public all-user feed, cookie-only calendar URL, live notification, paid service or plaintext Finance data.

## Test scenarios

- scope/crossowner;rotate/revoke;hashonly;escapedICS;all-dayTZ;boundedwindows;conditional;ratelimit;redaction;noFinanceHealth

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
