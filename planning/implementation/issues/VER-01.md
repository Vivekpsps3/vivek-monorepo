# VER-01 — Make shipped-source lint and type ownership explicit

- Stable key: `VER-01`
- GitHub leaf: [#209](https://github.com/Vivekpsps3/vivek-monorepo/issues/209)
- Parents: [#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286). Use its branch if the amendment is not yet on main.
- Dependencies: none
- Conflict groups: `quality-tools`, `root-typescript-config`, `eslint-config`, `quality-docs`
- Verification profiles: `docs`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A new shipped JS/MJS/TS/helper file cannot silently avoid lint/type ownership while CI passes.

Close tool inclusion gaps with a small source inventory check and expanded existing tool targets, without adding a new quality platform.

## Requirements

- TD-13
- TD-35 tool ownership only; risky consumer typing belongs TYPE-01
- #199 shipped-source inventory and negative unowned-source check

## Source paths

- `scripts/quality_ratchet.py`
- `scripts/test_quality_ratchet.py`
- `eslint.config.js`
- `tsconfig.json`
- `packages/tsconfig.json`
- `apps/web/tsconfig.app.json`
- `angular.json`

## Target paths

- `scripts/quality_ratchet.py`
- `scripts/test_quality_ratchet.py`
- `eslint.config.js`
- `packages/tsconfig.json`
- `scripts/`
- `docs/QUALITY.md`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Enumerate actual shipped Python/TS/JS/MJS/templates and current lint/type/build owners; classify generated/declaration/vendor/config/test sources separately. Base it on resolved production entries, not every tracked markdown or cache file.
3. Extend the existing ESLint/typecheck/checkJs targets only for real uncovered shipped sources and support code; use correct environments and current ratchet rules. Do not replace all tool configs with a new orchestration framework.
4. Add a negative fixture for a new shipped-but-unowned source module and a positive fixture for intentional generated/vendor exclusions. Detect orphan production candidates explicitly instead of silently trusting app import traversal.
5. Delete stale hardcoded inclusion/comment summaries superseded by the inventory and update docs to name authoritative config/baseline files. Keep tool exemptions explicit with reason and owner.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | A real shipped MJS helper is included | lint/type verification runs | its applicable syntax/contracts are analyzed and an inserted violation fails | tool target and negative fixture |
| LOCAL2 | A new production module is omitted from every declared tool owner | inventory check runs | it fails with its path and missing owner | unowned-source fixture |
| LOCAL3 | Generated declarations/vendor/test files are deliberately excluded from production analysis | inventory runs | they are classified by explicit reason without blanket directory suppression hiding new code | positive exclusion fixtures |
| LOCAL4 | Existing warnings are migrated between tools/paths | ratchets run against main | no allowance silently rises and fixed findings shrink baselines | quality-ratchet base comparison plus actual commands |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Obsolete manually maintained prose/inclusion copies contradicted by current config | Replace with one inventory or authoritative config reference, retaining intentional environments | required | before/after owner table with no unowned shipped file |

## Non-goals

- No repo-wide TS/MJS conversion
- No global strictness or formatter migration
- No weakening current lint/suppression gates
- No declaring all unimported files safe to delete

## Test scenarios

- actual TS/template/MJS support coverage
- source owner omission and intentional vendor exclusion
- unchanged tool baseline policy and parser errors

## Risks

- A low count can mean fewer files analyzed. Increasing target coverage may reveal existing debt; use reviewed current ratchets and fix actual failures rather than broad suppression.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.
