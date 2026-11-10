# SEC-02 — Make CSRF repair commit/CAS and refresh errors deterministic

- Stable key: `SEC-02`
- GitHub leaf: [#267](https://github.com/Vivekpsps3/vivek-monorepo/issues/267)
- Parents: [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286).
- Dependencies: `SEC-01`
- Conflict groups: `identity-session`, `identity-origin`, `web-session`, `account-ux`
- Verification profiles: `finance_back`, `server_back`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Concurrent repair/refresh cannot overwrite a winner with an unusable CSRF cookie, and failed refresh does not cause automatic repeated mutations.

Repair the token transaction once, emit cookies only for committed winning state, and centralize safe client failure classification.

## Requirements

- #121 Security decision CAS repair and commit-before-cookie.
- #121 Historical regression: refresh-cookie acceptance, no retry after failed refresh, generic network/5xx details.
- #128 auth/session-change behavior assigned to #121.

## Source paths

- `apps/server/identity/session.py`
- `apps/server/identity/routes.py`
- `apps/web/src/app/platform/session.service.ts`
- `apps/web/src/app/hub/username-change.component.ts`
- `apps/finance/backend/tests/test_api_auth.py`
- `apps/finance/frontend/src/auth-ux.test.mjs`

## Target paths

- `apps/server/identity/session.py`
- `apps/server/identity/routes.py`
- `apps/web/src/app/platform/`
- `apps/web/src/app/hub/username-change.component.ts`
- `apps/finance/backend/tests/`

## Steps

1. Trace the request transaction through response emission; pin existing missing/matching-cookie behavior before editing.
2. Use expected observed hash/revision in repair update; commit the winner before setting its cookie and ensure a losing response cannot publish an unrelated token.
3. Exercise refresh success/failure across tabs and preserve the deliberate current-browser session; make no retry after failed refresh observable by request count.
4. Consolidate safe network/5xx client error handling with explicit typed field/detail behavior; leave visible form focus/copy wiring to HUB-01.
5. Remove the obsolete independent repair/error branch once every affected caller uses the committed contract.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| A01 | A valid session with a missing/mismatched CSRF companion | repair completes successfully | database and emitted cookie agree before response and ordinary mutations work | response-boundary API test |
| A02 | Two repairs start from the same observed hash | both attempt CAS and return | the loser never overwrites the winner cookie with a token absent from committed state | controlled concurrent request test |
| A03 | Refresh returns network/5xx/auth failure | a protected mutation is attempted | no hidden retry occurs and UI gets safe bounded error text without raw server details | client HTTP request-count and auth-UX tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Independent CSRF repair and raw-detail-before-5xx client fallback | Replace with winning-state helper and one ordered error classifier. | required | Old branch no longer reachable; matching/missing/failed refresh assertions survive. |

## Non-goals

- Do not change the signing/AES-GCM protocol or move private plaintext server-side.
- Do not add a second ledger, state store, background daemon or generic framework.
- Do not claim external activation, deployment or merged completion without evidence.

## Test scenarios

- Repair partial/commit failure, missing and matching cookies
- Concurrent winner/loser, refresh retry count
- Network errors and 5xx string detail redaction

## Risks

- A losing repair must not emit an uncommitted token or retry a failed mutation; preserve session ownership while centralizing errors.

## Completion evidence

- Issue-specific acceptance matrix with test/artifact for every row, exact commands and source/base revision.
- Deletion ledger: removed vs moved vs necessary new production code, surviving consumers and compatibility proof.
- One reviewable PR closing this leaf only, with parent references and a fresh roadmap status note.
