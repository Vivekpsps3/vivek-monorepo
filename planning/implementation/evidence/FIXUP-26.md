# FIXUP-26 — Open Finance Planning tools at their results and inputs

- Leaf issue and parent(s): [#614](https://github.com/Vivekpsps3/vivek-monorepo/issues/614) under [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent/context, branch/worktree: branch `agent/fixup-26`, worktree `/tmp/vivek-fixup-26`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/614#issuecomment-7225818840). No subagents. The shared checkout was not edited. Town, Travel, Media, server, accounts hall, and treasury gallery files were not edited.
- Base main SHA `3d83c2671a02d32d69214c587cdf0a61ee031935`. Tested SHA `4ebf2adcadd1ae08193dc5b12f861363007d7c07`.
- Fresh-main/prerequisite/active-PR checks: fetched `origin/main` before the worktree. FUX-06 (#395, PR #530, `620fcb87`) is an ancestor. The compact tool index, six direct routes, legacy redirects, and the projected-result note are still on this tree. `PlanningHub` stays removed. GAME-08 and FIXUP-24 merged to `origin/main` while this leaf was open. Their files were not edited here.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIXUP-26-A1 | Synthetic checking 2500, card 400, and VOO 3 shares. Open Retirement, Simulation, Savings, Debt, Projection, and Stock research at 390×844 and 1280×800 in light and night, with reduced motion. The first control or answer is inside the initial viewport: Spending basis, Horizon, Goal name, saved-liability select, projection answer, and Ticker. Keyboard focus lands on each editable control. The phone journey still taps Savings. Legacy query and path redirects still resolve. Return to Planning still shows the tool index. A 320px Retirement page does not grow the document wider than the viewport. | PASS | `planning-tools.spec.ts` direct-tool viewport journey, plus the existing reload, phone, keyboard, and `navigation.spec.ts` legacy cases in `make e2e`. |
| FIXUP-26-A2 | The same vault has no bills or subscriptions. Retirement shows the spending prompt and does not show FI target, Portfolio gap, or zero years. Switching to manual without an amount stays missing. Entering 0 shows “Using the $0 yearly spending you entered.” and the FI target. Entering 40000 shows a 1,000,000 target and keeps that amount after opening Savings and returning. A holding with no price date, and a failed VOO quote, keeps the date warning beside a known target from an active rent schedule. A failed planning-input refresh keeps the last target and offers Retry loading current facts. | PASS | `planning-tools.spec.ts` missing, zero, known, and stale journeys. `planning-readiness.spec.ts` and `planning.component.spec.ts` cover the same baselines, including a failed refresh. |

Overview stays a tool index with the facts card. Deep routes keep one compact index after the active tool so `aria-current` and vault route readiness still see it. Facts on a deep route sit in “Your current facts”, opened when a date warns or a refresh fails.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Full tool index and full facts panel above an open Planning tool | Retirement, Simulation, Savings, Debt, Projection, and Stock research rendered the index and the facts before the chosen control | Overview keeps the index and the open facts card. Each deep route leads with its input or result. A compact index follows the tool. Facts move into `details.planning-disclosure`. | Moved. The index is not inside a closed disclosure. Spending basis, saved inputs, and the simulation workbench stay expanded. | Viewport spec checks the first control. `planning-facts.spec.ts` still reads the facts card title. `trustworthy-finance.spec.ts` still uses Spending basis and saved inputs. |
| A missing spending baseline presented as a $0 FI target, $0 gap, and zero years | Retirement results used effective spending of 0 when no schedule and no entered amount existed | `spendingBaseline` distinguishes missing, explicit zero, and known. Missing hides the results grid and disables Run. `runSimulation()` itself stays callable. Entered zero and the existing FI math stay. | Replaced the missing-path presentation. Did not change `calculateFireTarget` or `yearsToFire`. | Retirement readiness specs and the Playwright missing/zero/known journey. |

- Candidate class and protected counterexamples: replacement of the repeated index and facts above the active tool, and an honest missing-spending state. Empty vault copy, lock clearing drafts, legacy routes, and projected-result labeling stay.
- Comparison base SHA `3d83c2671a02d32d69214c587cdf0a61ee031935`. Closure is the Planning component, quick tools, spending-selection draft, Projection template order, and Stock research template order. No new production file.
- Production added/deleted: 509 lines added and 298 removed across nine production files. Net +211. Much of the Planning template diff is reorder. The added lines are the readiness prompt, the facts disclosure, and the spending-selection draft. This is a usability repair, not a simplification claim.
- Independent equivalent implementations before/after: one Planning component and one quick-tools retirement card. Projection and Stock research still own their own pages.
- State/cache owners and public entry points before/after: tool routes stay in `PLANNING_DESTINATIONS`. Spending selection is a separate session section from the simulation draft and clears with the other Planning drafts on lock. Money and date math stay in the existing helpers.
- Remaining old symbol/path search: the tool index and “Your current facts” remain. They no longer lead a deep route. `queue.json`, the completion registry, and CI were not edited.
- Follow-up change: none in this leaf.
- Tests/docs/generated changes separately: tests add 367 lines. This evidence file is the documentation change. No bundle is committed.
- Net production delta and exception: +211 production lines for the readiness state and the moved disclosures. No reviewed boundary exception.
- No behavior/data/meaningful assertion silently removed: explicit zero, known amounts, stale dates, failed refresh, legacy routes, and the projected-result note stay. A missing baseline no longer reads as a factual zero projection.

## Verification

Commands ran from `/tmp/vivek-fixup-26` on the tree committed as `4ebf2adcadd1ae08193dc5b12f861363007d7c07`, before this evidence file. `make test-fast` used `PATH="/tmp/vivek-fixup-26/.venv/bin:$PATH"` because system `python3` has no alembic. Karma used `CHROME_BIN` and Playwright used the installed Chromium at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The diff has no Python product file.

The first `make e2e` timed out in `treasury-gallery.spec.ts` at 1280 light while waiting for `window.scrollY` to settle. That file was not edited. The same test passed alone, and the recorded `make e2e` is the full rerun, which includes that case.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch FIXUP-26` | Prints `make test-fast`, `make lint-web`, `make typecheck-web`, Finance Karma, root Karma, and `make e2e`. |
| `make test-fast` | PASS. Doc paths OK. Planning validation PASS (120 active packets, 25 parents, 99 completed packets). 135 unittest tests OK. Node script tests 21 pass. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. |
| `make typecheck-web` | PASS. Web, Finance, packages, and site. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 567 SUCCESS. Statements 65.8% (8658/13158), branches 53.27% (4070/7639), functions 62.47% (2083/3334), lines 69.35% (7641/11018). |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 749 SUCCESS. Statements 77.95% (12472/15998), branches 65.93% (5643/8559), functions 80.18% (2723/3396), lines 83.25% (10860/13045). |
| `make e2e` | PASS on the rerun. 308 passed, 5 skipped (2.4m). The first run was 307 passed, 5 skipped, and 1 treasury-gallery timeout. |

## Handoff

- PR URL (leaf closure keyword only): recorded when the pull request opens. The body is only `Closes #614`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: none. Projection and Stock research templates were reordered so their answer and ticker lead. Those pages are Planning destinations and are not owned by the other open leaves.
- Next actor: review and merge this leaf only. #277 remains open.
