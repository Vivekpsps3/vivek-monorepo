# FIN-03 — implementation evidence

- Leaf issue and parent(s): [#222](https://github.com/Vivekpsps3/vivek-monorepo/issues/222) FIN-03. Parent [#65](https://github.com/Vivekpsps3/vivek-monorepo/issues/65) stays open. Source scope is #65 item 3 (F18 / #73).
- Agent/context, branch/worktree: Cursor agent, branch `agent/fin-03`, worktree `/tmp/vivek-fin-03`.
- Base main SHA, current tested SHA: base `0ed83e95a3727acc4f512dd2ac77211d8a622407`. Product gates ran on `f41c7d3d00df6f17552390f54b8f35d18cdb0585`. This handoff edit is documentation only.
- Fresh-main/prerequisite/active-PR checks: no queue dependency. Open PR #319 was planning docs only and merged as `c252b4d` after this branch was cut. It does not edit Planning source. No other open PR touches `finance-planning`. Claim base remains `0ed83e95a3727acc4f512dd2ac77211d8a622407`.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| PLAN1 | Empty store: all six counts are 0 and `income_is_net` is false; Planning shows the existing empty state. Zero-value asset plus an inactive $9,000 job: the card shows `(1 asset, 0 debts)` and `$0.00 a year before taxes`, not the inactive paycheck. Two/three/four records, including zero amounts, inactive jobs, ended jobs, future jobs, inactive bills, inactive subscriptions, and inactive or staged holdings: counts are 2 assets, 3 debts, 2 holdings, 2 active jobs, 2 bills, 3 subscriptions. One of each with tax: singular parentheticals. Money totals still skip zero and inactive amounts. | PASS | `planning.service.spec.ts` (`counts zero source records`, `counts zero-value records`, `counts one current taxed job`) and `planning-facts.spec.ts` (empty, zero-value, many, singular). Finance Karma 788/788. |
| PLAN2 | Undated holdings keep `1 holding has no price date.` / `2 holdings have no price date.` and Check prices. A job with no taxes or deductions is `Yearly pay` plus `a year before taxes` and `Take-home: not set`. Taxes or deductions alone label `Take-home` and `$48,000.00 a year` with no "before taxes" and no "not set". Rendered facts and the saved-input alert do not contain `balance-sheet`, `active-job-income`, `active-recurring-schedules`, or `income_is_net`. A rejected profile save still shows `Couldn't save these inputs` inside the Saved inputs card. | PASS | `planning-copy.spec.ts` (`pluralizes source counts`, price-date warnings), `planning-facts.spec.ts` (many records also fails the save), existing `planning-saved-inputs-error.spec.ts` and `planning.component.spec.ts` failure paths, Playwright `planning-saved-inputs.spec.ts` inside `make e2e` (240 passed, 8 skipped). |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Template plural branch for undated price dates (`undated_portfolio_quotes === 1 ? 'holding has' : 'holdings have'`) and the facts-card getter that omitted source parentheticals | `planning.component.html`, `planning.component.ts` `factsCopy` | `PlanningService.clientInputs` counts once. `planningFactsCopy` / `dateWarnings` in `planning-copy.ts` phrase the preview. The template interpolates those strings. | Template branch removed. Component getter no longer assembles copy. Price warning, Add a date, and Check prices links remain. | `planning-facts.spec.ts` `expectFactsMatchPreview` compares each rendered line to `planningFactsCopy` and each warning to `dateWarnings`. `rg` finds no `undated_portfolio_quotes === 1` under `planning/`. |

- Candidate class and protected counterexamples: duplicate live policy for record counts and warning pluralization. Money totals, Monte Carlo math, the undated-price warning, and saved-input failure copy stay. Distinct Finance transaction views are untouched.
- Comparison base SHA and full replacement closure (including new files): `0ed83e95a3727acc4f512dd2ac77211d8a622407`. Closure is `planning.model.ts`, `planning.service.ts`, `planning-copy.ts`, `planning.component.ts`, `planning.component.html`, their specs, and `planning-facts.spec.ts`.
- Production added/deleted/moved: added 128, deleted 42, net +86. No file move. Comments name the count rule and the gross/net flag; they are not blank-only churn.
- Independent equivalent implementations before/after: the template pluralized price warnings and the component getter omitted the parenthetical. After, one counter and one phrase function.
- State/cache owners and public entry points before/after: unchanged. Counts are fields on the existing `PlanningInputsPreview` returned by `getInputs`. No new store.
- Remaining old symbol/path search: `rg 'undated_portfolio_quotes === 1'` under `apps/finance/frontend/src/app/planning` is empty. Internal source keys remain on the preview for the simulation and are not rendered.
- Follow-up change: a new facts line reads `planningFactsCopy`. A new source count is added in `clientInputs` and rendered from that preview.
- Tests/docs/generated changes separately: tests added 421, deleted 2, net +419 (`planning.service.spec.ts` +131, `planning-copy.spec.ts` +77/−2, `planning.component.spec.ts` +5, `planning-facts.spec.ts` 208). This evidence file is the documentation change. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: +86. The leaf adds the missing count contract and the gross/net qualification. The deleted template branch and the incomplete getter could not carry those facts. The extra lines are the typed counts, the parentheticals, and the "before taxes" / "Take-home: not set" split. Snapshot hashes gain a `records:` segment so a zero-value record changes snapshot identity; percentile math is unchanged.
- No behavior/data/meaningful assertion silently removed: position and balance warnings, Check prices, source sentences, spending-basis copy, and saved-input errors remain. A zero-value participating record now opens the facts card instead of the empty state. The empty state remains when every count and money total is zero.

## Verification

Commands ran from `/tmp/vivek-fin-03` with Node v24.22.2 (`/tmp/node-v24/bin/node`). `CHROME_BIN` was Playwright Chromium `chromium-1248`. `PLAYWRIGHT_BROWSERS_PATH=/home/vivek/.cache/ms-playwright`. `PYTHON` for Playwright was the existing repo virtualenv interpreter. Karma used port 9876, which was free. Playwright binds port 0.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch FIN-03` | Printed the six gates below. Not a test. |
| `make test-fast` | PASS. Doc paths, blame revisions, shared boundaries, finance UX F1, 53 unittest cases, e2e discovery, 15 node tests. |
| `make lint-web` | First run FAIL: `planning.service.spec.ts` `@typescript-eslint/no-explicit-any` 40 vs baseline 25. New fixtures were retyped without `any`. Rerun PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0. |
| `make typecheck-web` | PASS, including after the fixture retype. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 788/788. Statements 75.14%, branches 65.03%, functions 72.07%, lines 78.16%. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 653/653. Statements 82.41%, branches 68.65%, functions 81.92%, lines 85.93%. |
| `make e2e` | PASS, 240 passed, 8 skipped. The skips are the existing non-390 target-size cases. Includes `planning-saved-inputs.spec.ts` and the trustworthy-finance planning cases. |
| Python coverage, Media/Travel/Town Playwright | NOT RUN. No Python, Media, Travel, or Town files changed. |

A focused Karma run of the three Planning specs (21/21, coverage off) was iteration only. The table row above is the coverage gate.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/320 (`Closes #222`). Parent #65 is referenced and not closed.
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6786145705
- Merged/activation status: not merged. Not deployed.
- Remaining external prerequisites or approved scope decisions: none for this leaf. #65 stays open. `origin/main` also contains `c252b4d` (living-world planning docs, #319); this branch does not edit those files.
- Next actor: review this pull request. The integration owner reconciles roadmap #134 after merge.
