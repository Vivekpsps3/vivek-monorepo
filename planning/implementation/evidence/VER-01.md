# VER-01 — implementation evidence

- Leaf issue and parent(s): [#209](https://github.com/Vivekpsps3/vivek-monorepo/issues/209), parent [#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199) (not closed)
- Agent/context, branch/worktree: VER-01 implementer, branch `agent/ver-01`, worktree `/tmp/vivek-ver-01`
- Base main SHA, current tested SHA: `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. Gates below ran on that base plus this change before the evidence commit; the tested code SHA is filled in the handoff after that commit.
- Fresh-main/prerequisite/active-PR checks: `origin/main` was `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. TYPE-01 #218 / PR #338 `e3ff785e1e65315425fd24fc733b88bdf0337857` is an ancestor. No dependency leaves. Open PRs #342 (DEL-04) and #343 (PTO-04) do not edit these files. Issue #209 had no earlier claim.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | `packages/browser/runtime/date.mjs` is production and matches both an ESLint scope and `packages/tsconfig.json`. A syntax error inserted at `apps/media/frontend/src/ver01-ownership-probe.mjs` fails ESLint and `tsc -p apps/web/tsconfig.app.json`. A syntax error inserted at `ver01-ownership-probe.d.mts` fails that same tsc project. | PASS | `InventoryTests.test_local1_shipped_mjs_is_owned_and_inserted_violation_fails` inside `make test-fast` (98 tests OK) |
| LOCAL2 | An MJS path outside the declared TypeScript/ESLint owners fails with that path and `missing eslint, typecheck`. `packages/time/today.py` fails the same helper when `packages` is not a Python target. | PASS | `InventoryTests.test_local2_unowned_production_module_names_the_path_and_missing_owner` |
| LOCAL3 | Vendor, generated `.d.ts`, tests, Playwright config, and Alembic `versions/` classify by those reasons. `apps/travel/frontend/src/new-helper.mjs`, `apps/finance/backend/versions/new.py`, and `vendor-notes.mjs` stay production. The vendor file is not reported as a gap. | PASS | `InventoryTests.test_local3_vendor_generated_and_tests_are_excluded_without_hiding_neighbors` |
| LOCAL4 | A new `no-unused-vars` finding on a new path is an allowance increase and `guard_update` refuses it. Committed baselines do not rise against `origin/main`. Live counts match the baselines (ruff 101, mypy 87, eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0, suppressions 6). | PASS | `InventoryTests.test_local4_new_finding_is_an_allowance_increase` and `scripts/quality_ratchet.py check-base TOOL origin/main` for every TOOLS key |

`InventoryTests.test_live_shipped_sources_have_owners` walks `apps/`, `packages/`, and `scripts/` and requires every production file to match those owners.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Hardcoded ESLint directory append inside `eslint_findings` (finance cwd also added web, travel, and media) | `make lint-web` via the eslint-finance tool | `ESLINT_SCOPES` in `scripts/quality_ratchet.py`, which the inventory reads | removed the extra branch; same directories remain on eslint-finance | eslint-finance still 469 findings, matching the baseline and `origin/main` |
| QUALITY.md sentence that named only `packages/browser`, `packages/auth`, and `packages/ui` as the typecheck set | readers of `docs/QUALITY.md` | `typecheck-web` projects, their `include`/`files`, and `scripts/source_inventory.py` | prose list replaced; intentional `allowJs` / `checkJs: false` stays in the tsconfigs | live inventory reports no unowned shipped file |

- Candidate class and protected counterexamples: stale inclusion prose and a second path list. Not a product removal. Finance service, public API, search, trip/PTO behavior, Media detail, records, Town, and backup scripts were not edited. `packages/time/today.py` only reorders imports and uses the equivalent timezone ternary so ruff can own `packages/` without a new finding.
- Comparison base SHA and full replacement closure (including new files): `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. Closure: `scripts/source_inventory.py`, `scripts/test_source_inventory.py`, `scripts/quality_ratchet.py`, `scripts/test_quality_ratchet.py`, `eslint.config.js`, `apps/web/tsconfig.app.json`, `packages/tsconfig.json`, `packages/time/today.py`, `docs/QUALITY.md`, `scripts/AGENTS.md`, this file.
- Production added/deleted/moved; comments/blank-only churn separately: new inventory script 379 lines. `quality_ratchet.py` +49/−24. `eslint.config.js` +38. Web tsconfig +17/−6. Packages tsconfig +18/−2. `today.py` +2/−5, behavior preserved. No move.
- Independent equivalent implementations before/after: two inclusion stories (ratchet special case plus the package-name sentence) become one scope table, the tsconfig includes, and the inventory.
- State/cache owners and public entry points before/after: unchanged. `allowJs` is on only for the web app and packages projects that include shipped JS. Root `tsconfig.json` stays strict without `allowJs`. `checkJs` stays false. `angular.json` already points the web build at `apps/web/tsconfig.app.json`.
- Remaining old symbol/path search, including config and discovery: `eslint_findings` no longer takes a cwd/prefix and appends directories. The package-name parenthetical is gone from QUALITY.md.
- Follow-up change: which production files and independent policy owners now need editing: a new shipped file is owned when it matches `ESLINT_SCOPES` (and `eslint.config.js`) and a `typecheck-web` include, or `PYTHON_TARGETS` for Python. A file outside those globs fails `scripts/source_inventory.py`.
- Tests/docs/generated changes separately: tests `scripts/test_source_inventory.py` 202 lines and `scripts/test_quality_ratchet.py` +15. Docs `docs/QUALITY.md` +4/−4 and `scripts/AGENTS.md` +1. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: positive. The new inventory is the safety check this leaf exists to add. It is not claimed as a line-count simplification. Baselines, coverage floors, and lint gates were not lowered. `today.py` is the small compatibility edit that keeps the ruff allowance flat when `packages` becomes an explicit target.
- No behavior/data/meaningful assertion silently removed: ratchet comparison, suppression markers, and engine-purity tests still run. TYPE-01's finance ESLint baseline is unchanged at 469.

## Verification

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch VER-01` | printed `make test-fast`, `make lint-python`, `make typecheck-python`, `./scripts/coverage-gate.sh server` |
| `make test-fast` | PASS. Doc paths OK. Planning validation 94 packets. Unittest 98 OK, including the LOCAL inventory tests. Node script tests 15 pass, 0 fail. |
| `make lint-python` | PASS. 218 files already formatted. ruff 101. suppressions 6. |
| `make typecheck-python` | PASS. mypy 87. |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Engine purity 1 pass. |
| `make typecheck-web` | PASS. All seven `tsc -p` projects, including the expanded web and packages programs. |
| `quality_ratchet.py check-base TOOL origin/main` for all seven tools | PASS. Each allowance is within `origin/main`. |
| `./scripts/coverage-gate.sh server` | PASS. 874 passed, 2 xfailed. Total 79.02% against floor 61.53%. Floor not changed. |
| `npm run build` | PASS. Application bundle generation complete. Pre-existing NG8113 unused-import warnings only. |

Karma and Playwright were not run locally. This change does not alter a screen, route, or component. CI still runs those jobs. No suite was skipped, relabelled, or given a lower gate.

## Handoff

- PR URL (leaf closure keyword only): not opened yet
- Roadmap #134 append-only status-note URL: not posted yet
- Merged/activation status (actual evidence, not assumption): not merged, not deployed
- Remaining external prerequisites or approved scope decisions: `checkJs` stays false so strict implicit-any on existing MJS helpers is not a new typing program. Handwritten `.d.mts` files are in the typecheck includes. pyproject `files` still lists `apps` and `scripts`; CI mypy/ruff ownership is `PYTHON_TARGETS`, which also includes `packages`.
- Next actor: open the PR with `Closes #209`, comment on #134, watch CI, squash-merge, then record the squash SHA here if this handoff is still the latest note.
