# PTO-01 — implementation evidence

- Leaf issue and parent(s): [#230](https://github.com/Vivekpsps3/vivek-monorepo/issues/230) PTO-01. Parent [#110](https://github.com/Vivekpsps3/vivek-monorepo/issues/110) stays open.
- Agent/context, branch/worktree: Cursor Grok, `agent/pto-01`, `/tmp/vivek-pto-01`.
- Base main SHA, current tested SHA: base `0ed83e95a3727acc4f512dd2ac77211d8a622407`. Tests below ran on that base plus this leaf’s uncommitted tree. The committed tested revision is recorded in the handoff after the commit. `origin/main` later gained planning commit `c252b4d` (#319); it does not touch Travel and was not merged.
- Fresh-main/prerequisite/active-PR checks: PTO-01 has no dependencies. Open PR #319 is planning-only and does not edit the chart. No other open PR claimed `travel-pto-main` or `travel-pto-chart`.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| CHART1 | Zero/negative, one and two buckets, a single point, and rollover. Combined geometry and the Balance by month table use the `/pto/series` day and hour text. Circles vs squares, solid vs `6 4` dash, y ticks including 0, month/year ticks, the Today rule, separated end labels, and the below-zero band distinguish those states. | PASS | `node --test apps/travel/backend/static/tests/pto-chart.test.mjs` (10 tests, including “two buckets share one plot”, “negative balances”, “one bucket”, “single point”, “rollover caption”, and “table text is the API point, not hours divided again”). Karma `PtoChartComponent combined forecast` binds the same markers, dash class, zero line, band, and table. |
| CHART2 | Series failure shows `Couldn't load the balance chart.` and leaves the tiles and forms in place. Retry, a policy save, an entry save, and a return from Hours in a workday each refresh one chart from one series request. | PASS | Karma `keeps the forms when the chart fails and refreshes from one retry` counts one series GET on retry and one after policy save. Existing Karma entry save still expects one series GET. Playwright `a failed chart request leaves the forms usable and retries once` counts series requests 1 (failure), 2 (retry), 3 (policy save) and one `travel-pto-chart`. Playwright `hours in a workday save and change the days figure only` counts one series GET after returning to PTO. |
| CHART3 | 390 and 1280, both themes. The plot is 220px or 300px, the 1280 tile column stays 320px, the page does not overflow, and the table is the keyboard/screen-reader equivalent. SVG is `aria-hidden` and not in the tab order. | PASS | Playwright `one combined chart at the required height` at 390 and 1280, with axe serious/critical empty in light and dark. `apps/travel/e2e/axe.spec.js` still passes on `/travel/pto`. Karma sets the SVG height to 220px and 300px and finds no `tabindex` inside the SVG. |

Preserved copy, already on this base and not rewritten here: “Balance today” in the tile, semimonthly period “half-month” (`pto-model.test.mjs`, which this node run executed), “Pick PTO or Sick.” in `apps/travel/backend/schemas.py` (unchanged, so the Python suite was not re-run), and “What if I take time off? · {PTO\|Sick}”.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Two independent bucket chart render/fetch paths (`travel-pto-chart` twice, `chartGeometry` per bucket, separate negative copy) | `pto.component.ts` rendered one chart for `series.pto` and one for `series.sick`. The chart component and `pto-chart.test.mjs` called `chartGeometry`. | `combinedForecast` in `pto-chart.mjs`, one `travel-pto-chart`, and `PtoComponent.loadSeries` (one subscription, epoch cancellation) | Removed the second chart branch, the step-path `chartGeometry`, and the focusable point tooltip. The page still uses `GET /pto/series`. `apps/travel/frontend/src/travel.css` still has unused `.pto-chart*` rules; that stylesheet is outside this leaf. | Playwright expects exactly one `travel-pto-chart`. Node tests no longer import `chartGeometry`. A failed series no longer clears the board. |

- Candidate class and protected counterexamples: duplicate live presentation. Server balance math in `leave_math.py` and `leave.py` stays the only balance engine. Historical entries, policy forms, and trip costs were not edited.
- Comparison base SHA and full replacement closure: `0ed83e95a3727acc4f512dd2ac77211d8a622407`. Closure is the four production files below plus their tests. No new package or chart library.
- Production added/deleted/moved; comments/blank-only churn separately: git numstat versus the base, physical lines, comments not separated. `pto-chart.mjs` +357/−99, `pto-chart.component.ts` +182/−113, `pto-chart.d.mts` +64/−29, `pto.component.ts` +43/−62. Production +646/−303, net +343. The increase is the required combined geometry, table, captions, warnings, and the chart-only error/cancel path. `pto.component.ts` itself is net −19.
- Independent equivalent implementations before/after: 2 bucket chart renders (each calling `chartGeometry`) before; 1 `combinedForecast` after. Fetch owner stays one function, now cancelling the previous request instead of letting a late response replace the chart.
- State/cache owners and public entry points before/after: before, `series` plus two child tip signals. After, `series`, `chartPhase`, and `seriesEpoch` on the page, and one chart with no focus state. Public entry remains `travel-pto-chart` from the PTO page.
- Remaining old symbol/path search: `chartGeometry` is gone from `apps/travel`. `pto-chart-line` remains only in `travel.css`, which this leaf does not own.
- Follow-up change: presentation edits stay in `pto-chart.mjs` and `pto-chart.component.ts`. Exact balances stay in `leave_math.py`. Hours in a workday stays on the settings form. Policy draft validation stays PTO-02.
- Tests/docs/generated changes separately: tests +403/−133 (`pto-chart.test.mjs`, both chart/page Karma specs, `pto.spec.js`). This evidence file is the planning doc. `dist/` from `make build-frontends` is generated and not committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: net +343 production lines. This is a feature leaf. The added lines are the accessible combined plot and the chart-only failure path; they replace the second chart rather than wrapping it. No second balance calculation was added.
- No behavior/data/meaningful assertion silently removed: the old step-path and per-point tooltip assertions were replaced by line, marker, table, and request-count assertions. Tile “Balance today”, form drafts, and the entry/policy request counts remain.

## Verification

Local execution only. CI, merge, and deployment were not run.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-web` | PASS (eslint ratchets match baselines) |
| `make typecheck-web` | PASS |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS (62 tests) |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 653 SUCCESS. Statements 82.47% (5046/6118), branches 68.72% (1879/2734), functions 81.92% (1038/1267), lines 85.99% (4396/5112). |
| `make build-frontends` | PASS |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 151 passed. |

Not run: `make lint-python`, `make typecheck-python`, and `./scripts/coverage-gate.sh travel`, because no Python file changed. Screenshots from the earlier failing run were Playwright failure attachments, not committed images. The passing suite did not set `SCREENSHOT_DIR`.

## Handoff

- PR URL (leaf closure keyword only): filled after `gh pr create`. `Closes #230`. Parent #110 is referenced and not closed.
- Roadmap #134 append-only status-note URL: filled after the comment. The roadmap body was not edited.
- Merged/activation status (actual evidence, not assumption): not merged. Not deployed. Local verification only.
- Remaining external prerequisites or approved scope decisions: none for this leaf. #110 stays open for PTO-02 through PTO-05.
- Next actor: review the pull request. Do not merge from this leaf.

Issue / parent / local packet: PTO-01 / #230 / #110 / `planning/implementation/issues/PTO-01.md`.

Branch, worktree, base main SHA, current SHA: `agent/pto-01`, `/tmp/vivek-pto-01`, base `0ed83e95a3727acc4f512dd2ac77211d8a622407`.

Owned files and conflict groups: `travel-pto-main`, `travel-pto-chart`. Other agents’ worktrees were not edited.

Completed acceptance rows with direct evidence: CHART1, CHART2, CHART3 PASS, as in the table above.

Unfinished/failed rows and exact next action: none in this leaf.

Deletion ledger and current consumer migration: the PTO page is the only chart consumer. It now mounts one combined forecast.

Commands run, results, tested SHA; required checks still pending: see Verification. CI has not run.

PR and roadmap note URLs; actual merge/deployment/activation state: not merged, not deployed.

External prerequisites and next actor: reviewer. #110 remains the open parent ledger.

No unstated decision from the previous context is necessary to continue.
