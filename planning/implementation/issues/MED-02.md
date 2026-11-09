# MED-02 — Mount the existing tag editor and preserve unrelated detail drafts

- Stable key: `MED-02`
- GitHub leaf: [#236](https://github.com/Vivekpsps3/vivek-monorepo/issues/236)
- Parents: [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `MED-01`
- Conflict groups: `media-detail-form`
- Verification profiles: `media_front`, `media_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Media tags can be added, removed, saved and recovered by keyboard without accidentally submitting notes or ratings.

Media tags can be added, removed, saved and recovered by keyboard without accidentally submitting notes or ratings.

## Requirements

- #85 scope1/M5; Unicode/cap/rollback/Enter and focus acceptance; original #85 source https://github.com/Vivekpsps3/vivek-monorepo/issues/85.

## Source paths

- `apps/media/frontend/src/tag-model.mjs`
- `apps/media/frontend/src/tag-model.d.mts`
- `apps/media/frontend/src/detail.component.ts`
- `apps/media/frontend/src/detail.component.html`
- `apps/media/frontend/src/drafts.service.ts`

## Target paths

- `apps/media/frontend/src/detail.component.ts`
- `apps/media/frontend/src/detail.component.html`
- `apps/media/frontend/src/media.css`
- `apps/media/backend/static/tests/`
- `apps/media/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Adopt the existing tag normalization/model through one chip input; Enter adds, empty Backspace removes last and per-chip remove returns focus sensibly.
3. Keep trim/collapse, case-insensitive duplicate preserving original spelling, maximum40 Unicode code points/tag and20tags; server/current Unicode behavior remains authoritative.
4. Save through the existing entry mutation/draft path; isolate tag Enter from unrelated form submission and restore edits on failure.
5. Delete plain duplicate tag parsing/input and tag-only alternate save state after actual adoption.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| TAG1 | tags with Unicode, extra spaces, case duplicates,40/41 code points and20/21 entries | add/remove/save/reload with keyboard | normalization/caps correct and original spelling retained; focus moves sensibly | pure model/Node plus actual tag editing browser |
| TAG2 | unsaved rating/note and tag change | press Enter in tag input then fail tag save | no unrelated submit occurs; draft and tag input recover without lost note/rating | POST count/body and failure draft assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| tag parsing/persistence paths beside existing tag-model and entry draft save | one model and current entry mutation; remove old plain/duplicate handler | required | all tag mutations share surviving normalizer; one intended save |

## Non-goals

- No new tagging API/store or change to Unicode matching policy.

## Test scenarios

- Unicode length; duplicate/cap;Enter/Backspace/remove focus;save-failure rollback;unrelated draft

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
