# DISC-02 — Produce a bounded Cards design/data-flow PR without building the app

- Stable key: `DISC-02`
- GitHub leaf: [#265](https://github.com/Vivekpsps3/vivek-monorepo/issues/265)
- Parents: [#195](https://github.com/Vivekpsps3/vivek-monorepo/issues/195)
- Kind: `discovery`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `planning-discovery`
- Verification profiles: `docs`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A future Finance agent has one coherent card/benefit workflow with explicit facts and reuse instead of another financial ledger.

## Requirements

- Parent#195 complete proposal, all v1 ideas/privacy/architectural constraints and open questions remain preserved; this leaf owns discovery disposition only.

## Source paths

- `planning/technical-debt/feature-addition-playbook.md`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN_GUIDE.md`
- `apps/finance/frontend/src/public-api.ts`

## Target paths

- `planning/implementation/`
- `planning/README.md`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Choose gallery+attention-list emphasis, navigation inside Finance and precise statement/benefit/renewal concepts; keep debt balance distinct and unknown values honest.
3. Write a concrete user journey, small screen/wireframe description, typed conceptual records/source links, reuse-versus-new decision table and excluded scope. No production app code, routes, migrations, endpoints or dependencies.
4. Map every parent requirement to selected-first-version, later-candidate or explicit unresolved owner decision with reason; do not silently cancel committed scope or treat this proposal as approved implementation.
5. Specify future PR-sized leaf boundaries, lifecycle/recovery/owner/date/unit tests and actual likely consumer paths. Record which existing UI/store mechanisms would be reused and which duplicate prototype machinery must never be added.
6. Submit design/data-flow documents as one reviewable PR; closing this discovery leaf means the decision artifact exists, not that the proposed app shipped.
7. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
8. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| DISCOVERY1 | full parent proposal and current code contracts | review design/data-flow PR | every proposal clause is accounted for, concrete core journey and privacy/recovery facts are explicit, unresolved product choices are labelled | requirement-to-design disposition table and independent review |
| DISCOVERY2 | repository before/after discovery | inspect diff and dependency graph | only planning artifacts changed; no speculative runtime framework, new package or unapproved app implementation | diff/path check and docs verification |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| speculative unused scaffold/prototype layers or duplicate conceptual ledgers | do not create them; if an earlier prototype is present, inventory and propose removal rather than silently shipping it | conditional | design reuse/removal table, no runtime diff |

## Non-goals

- No app implementation/activation, image upload, banking connection, new XP ledger or framework.

## Test scenarios

- allparentclausesmapped;owner/data-plane;reuse;smallv1;unresolveddecisions;no-runtime-change

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.

This leaf authorizes a design and data-flow pull request. It does not authorize building the app.
