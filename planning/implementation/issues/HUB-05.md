# HUB-05 — Finish Quick add, shortcut help and owner-appropriate workspace affordances

- Stable key: `HUB-05`
- GitHub leaf: [#247](https://github.com/Vivekpsps3/vivek-monorepo/issues/247)
- Parents: [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `HUB-02`, `HUB-04`
- Conflict groups: `private-shell`, `hub-main`, `suite-shortcuts`
- Verification profiles: `web_front`, `server_back`, `finance_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Common workflows can start quickly by keyboard or touch without duplicating their forms or revealing admin diagnostics to users.

Common workflows can start quickly by keyboard or touch without duplicating their forms or revealing admin diagnostics to users.

## Requirements

- #93 scope3 greeting,touchtargets,Quick add,N/? shortcuts/help/search,admin-only health chip; acceptance manual transaction date; weekly review link is owned by TOWN-06.

## Source paths

- `apps/web/src/app/hub/hub.component.ts`
- `apps/web/src/app/private-layout.component.ts`
- `apps/web/src/app/private-layout.component.html`
- `packages/ui/src/user-menu-content.ts`
- `apps/web/src/app/platform/session.service.ts`

## Target paths

- `apps/web/src/app/hub/`
- `apps/web/src/app/private-layout.component.ts`
- `apps/web/src/app/private-layout.component.html`
- `apps/web/e2e/`
- `tests/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Route Quick add to existing app-owned creation workflows; preserve selected/default manual transaction date and session/locked behavior.
3. Implement N/? shortcuts and help including existing search, with editable-field/modal guards, explicit focus return and touch actions.
4. Provide greeting and admin-only service health chip using current authorized data; do not build a second diagnostic endpoint or duplicate app forms.
5. Delete duplicated shortcut/global listener or quick-add draft state after routing to existing owners.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| QUICK1 | keyboard user on Hub and editable input/modal contexts | press N,?,Ctrl/Meta-K and activate touch Quick add | intended help/workflow opens only when appropriate, focus returns and transaction date is correct | shortcut/browser focus and create-date payload tests |
| CHIP1 | admin versus normal owner and failed health data | view workspace | only admin sees authorized health chip; normal app use remains unaffected by outage | owner-role unit/API/browser fixtures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| copied quick-add forms/state and duplicate global keyboard listeners | reuse existing creation routes/commands and one shortcut owner | required | same actual app editor receives action; no parallel draft store |

## Non-goals

- No command-bar revival, duplicate form, notification service or global app state framework.

## Test scenarios

- N/?/search;typingguards;dialogguards;focusreturn;manualdate;roles;healthoutage

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
