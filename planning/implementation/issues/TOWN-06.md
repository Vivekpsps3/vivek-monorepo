# TOWN-06 — Deliver encrypted weekly reflection and one Hub link through the existing vault

- Stable key: `TOWN-06`
- GitHub leaf: [#254](https://github.com/Vivekpsps3/vivek-monorepo/issues/254)
- Parents: [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81), [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `TOWN-05`, `SAFE-03`, `SAFE-04`, `CON-03`, `SEC-05`, `SEC-06`
- Conflict groups: `town-hall`, `town-reviews`, `vault-collections`, `hub-main`, `private-routes`
- Verification profiles: `web_front`, `finance_front`, `finance_back`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

An owner can record, revisit and delete a private weekly reflection without exposing its text when locked.

An owner can record, revisit and delete a private weekly reflection without exposing its text when locked.

## Requirements

- #81 delivery8/encrypted Sunday Review; #93 weekly reflection decision/Hub pin; selected #133 reflection source https://github.com/Vivekpsps3/vivek-monorepo/issues/133.

## Source paths

- `apps/web/src/app/town/health/health-store.service.ts`
- `apps/finance/frontend/src/public-api.ts`
- `apps/finance/backend/services/encrypted_storage.py`
- `apps/web/src/app/hub/hub.component.ts`
- `apps/web/src/app/routes.ts`
- `apps/web/routes.json`

## Target paths

- `apps/web/src/app/town/`
- `apps/web/src/app/hub/`
- `apps/web/src/app/routes.ts`
- `apps/web/routes.json`
- `apps/finance/backend/services/encrypted_storage.py`
- `apps/web/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Use one versioned allowlisted town_reviews collection keyed by ISO Monday week, owner-bound revision-aware existing vault operations; no separate review store outside Town.
3. Build mounted Hall review page with up to3focus items≤120Unicode code points each, one note≤2000, save/edit/delete and recent weeks; contextual Sunday finish prompt is only UI.
4. Add a single current-week Hub link/pin opening this editor, preserving Hub count-only Finance policy; avoid another Hub form.
5. On lock/logout/owner change/route leave clear retained text/previews/pending work; obsolete decrypt/save cannot publish, and export/restore includes reviews.
6. Reuse safe record/dialog/error primitives and delete any duplicate temporary reflection cache, editor or backend plaintext model.
7. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
8. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| REVIEW1 | new/existing weeks including ISO year boundary and Unicode limits | save/edit/reload/delete/recent-navigate | week identity/limits/revisions correct; noextraTownXP | codec/API/browser lifecycle with exact stored schema |
| REVIEW2 | marker note/focus with held load/save and conflict | lock/switch owner/leave then resolve or retry | no old text/preview retained or republished; conflict preserves valid same-session draft | DOM/store/network/localStorage markers and held promise tests |
| REVIEW3 | completed review and backup bundle | export, restore into current account and open Hub pin | content restored only under current owner; Hub opens same editor with one link | all-collection recovery test and real route browser |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| separate Hub review form/cache or plaintext review endpoint | one Town-owned encrypted editor/collection with Hub link only | required | no duplicated reflection store; marker privacy and source consumer map |

## Non-goals

- No notification service, plaintext reflection backend, second editor/store or new XP award.

## Test scenarios

- ISOMonday/yearboundary;3/120/2000Unicode;save/edit/delete/recent;Sundayprompt;revisionconflict;lockrace;backuprestore;noXP

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
