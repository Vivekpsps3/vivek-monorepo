# DEL-05 — Delete duplicate control/form styling and reuse real interaction behavior

- Stable key: `DEL-05`
- GitHub leaf: [#217](https://github.com/Vivekpsps3/vivek-monorepo/issues/217)
- Parents: [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200), [#196](https://github.com/Vivekpsps3/vivek-monorepo/issues/196)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `shared-controls`, `root-styles`, `finance-recurring-editors`
- Verification profiles: `shared_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A control/form fix has one owner and new editors can adopt it without copied focus/error/footer code.

Consolidate a bounded repeated field/action-row/footer interaction across existing consumers and remove old CSS/behavior overrides.

## Requirements

- TD-24
- TD-25
- #200 small reusable interactions with actual migrated consumers
- #196 retain theme/keyboard/zoom hierarchy acceptance

## Source paths

- `packages/ui/controls.css`
- `packages/ui/src/ui-field/ui-field.component.ts`
- `packages/ui/src/ui-field/ui-field.component.css`
- `apps/web/src/styles.css`
- `apps/finance/frontend/src/app/shared/form-validation.ts`
- `apps/finance/frontend/src/app/fixed-expenses/`
- `apps/finance/frontend/src/app/subscriptions/`

## Target paths

- `packages/ui/controls.css`
- `packages/ui/src/ui-field/`
- `apps/web/src/styles.css`
- `apps/finance/frontend/src/app/shared/form-validation.ts`
- `apps/finance/frontend/src/app/fixed-expenses/`
- `apps/finance/frontend/src/app/subscriptions/`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Select one visibly repeated pattern present in at least two current forms: field error linkage/first-invalid focus or sticky action footer/control styles. Inventory actual selector/layer/behavior conflicts before changing shared rules.
3. Adopt the existing shared control/validation helper where semantics match; add only the smallest missing primitive. Keep each domain’s validators/optional fields/draft model separate.
4. Migrate both real consumers and delete superseded local control/style/error/focus implementations in the same PR. Resolve specificity/layer order deliberately rather than adding a stronger override at the end.
5. Compare before/after phone/desktop/theme/zoom/dialog-scroll states and production CSS/TS totals across shared and migrated owners. Preserve accessible touch/focus/error semantics and draft recovery.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | The same owned field/action pattern appears in two forms | a shared behavior/style change is applied | both forms use one implementation with their distinct domain rules | consumer assertions plus removed local copies |
| LOCAL2 | A user submits invalid data then corrects it | keyboard/dialog workflow runs | linked errors and first-invalid focus work and the draft survives failure | behavior tests rather than source-selector-only checks |
| LOCAL3 | A narrow viewport, dark theme, 200% zoom or long scroll is used | controls/footer render | required actions stay visible/usable without clipping or focus loss | 390/1280 theme/zoom/scroll browser evidence |
| LOCAL4 | Shared styles are compared with app overrides | cleanup lands | obsolete competing selectors are removed and no unrelated screen changes unexpectedly | before/after screenshots and full shared regression checks |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Selected repeated local control/form CSS and focus/error/footer mechanics in at least two consumers | Remove copies after adopting one existing/minimal shared owner | required | two migrated consumers, CSS specificity audit and net production reduction |
| Overrides added only to defeat another obsolete override | Delete the superseded cascade rather than stacking a third rule | conditional | computed-style/browser proof |

## Non-goals

- No universal schema-driven form framework
- No new visual kit/theme
- No flattening domain validators into generic UI
- No using overflow clipping as usability proof

## Test scenarios

- invalid submit/correction, error live region, focus return, Escape
- failed-save draft and busy/retry handling
- phone/desktop light/dark, zoom, sticky footer after scroll

## Risks

- Broad global CSS can affect every app; serialize this packet against recurring/editor work. If actual patterns differ, preserve adapters and choose a truly repeated pattern rather than force reuse.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.
