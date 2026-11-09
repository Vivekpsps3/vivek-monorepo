# HUB-01 — Finish coherent account/sign-in/invite/settings UX with real data links

- Stable key: `HUB-01`
- GitHub leaf: [#243](https://github.com/Vivekpsps3/vivek-monorepo/issues/243)
- Parents: [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `UX-01`, `SEC-04`, `SEC-05`, `SEC-06`
- Conflict groups: `account-settings`, `auth-forms`, `private-shell`
- Verification profiles: `web_front`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

An owner can understand account errors, sign out this browser and find supported exports/security controls from Settings.

An owner can understand account errors, sign out this browser and find supported exports/security controls from Settings.

## Requirements

- #93 scope1/account UX, scope2/Sessions/Your data, Account UX from #128; username/login/Retry-After/invite/signup runtime acceptance; source #128 https://github.com/Vivekpsps3/vivek-monorepo/issues/128.

## Source paths

- `apps/web/src/app/hub/username-change.component.ts`
- `apps/web/src/app/platform/auth/login.component.ts`
- `apps/web/src/app/platform/auth/signup.component.ts`
- `apps/web/src/app/platform/auth/username-change.ts`
- `apps/web/src/app/settings/account-section.component.ts`
- `apps/web/src/app/settings/finance-section.component.ts`

## Target paths

- `apps/web/src/app/hub/username-change.component.ts`
- `apps/web/src/app/hub/username-change.component.html`
- `apps/web/src/app/platform/auth/`
- `apps/web/src/app/settings/`
- `tests/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Reconcile current username/login/invite/signup acceptance into a single itemized evidence list; keep protocol/origin/security internals with #121.
3. Use existing account forms to provide integer/HTTP-date Retry-After, polite error live regions, linked hints/field errors, first-invalid focus, autocomplete, safe generic network/5xx and preserved403 handling.
4. Complete signup idle/progress announcements, invite username/static copy and runtime auth-ux wiring; preserve supported week-start setting without introducing unsupported choices.
5. Make Sessions sign out the current browser and Your data expose existing CSV plus completed encrypted export/passphrase routes; no disabled/dead placeholder forms or invented session management. Remove duplicate obsolete account error/mapping/copy paths.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| ACCOUNT1 | username/login/invite/signup validation,403,429 integer/date and5xx/network fixtures | submit/correct/retry by keyboard | linked errors/hints and progress/live regions are correct; safe copy, focus and Retry-After match current contract | account unit/auth-ux and actual suite browser stories |
| ACCOUNT2 | signed-in Settings and completed supported export/security features | open Your data/security links then sign out current browser | links reach real working routes and sign-out clears current session; no unsupported cross-device session UI | route/focus/logout browser plus request count |
| ACCOUNT3 | each assigned historical #128 account/runtime finding | run the current observable trigger | all findings have evidence or explicit supersession and no duplicate form/error implementation remains | source→test matrix and deleted-path consumer search |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| duplicate account-form error/copy helpers and legacy dead export/security placeholders | use current shared mapping and link real owned routes, delete obsolete branches | required | one visible flow per action; safe5xx and actual link tests |

## Non-goals

- No multi-session UI without server contract or duplicate passphrase form.
- No auth/crypto protocol rewrite in a UX packet.

## Test scenarios

- RetryAfterinteger/date;403;5xx/network;firstinvalid;autocomplete;signupidleprogress;invite;currentlogout;CSV/encryptedlinks

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
