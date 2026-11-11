# PTO-02 — implementation evidence

- Leaf issue and parent(s): [#231](https://github.com/Vivekpsps3/vivek-monorepo/issues/231) PTO-02. Parent [#110](https://github.com/Vivekpsps3/vivek-monorepo/issues/110) stays open.
- Agent/context, branch/worktree: Cursor Grok implementer, `agent/pto-02`, `/tmp/vivek-pto-02`.
- Base main SHA, current tested SHA: base `a7e16c6fa5bd5543514081e0834022fe38dcd1d1`. Local gates below passed on this change set immediately before the commit that adds this file.
- Fresh-main/prerequisite/active-PR checks: #231 was open with no prior claim. PTO-03 #232 is closed by PR #329 (`a8c7d919cc132e4e2f255382ac7ef0e22d43beae`). PTO-01 #326 is merged. No open PR shared `travel-pto-main` or `travel-settings`.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| POL1 | UA1–UA12 and UB1–UB12, including comma input, quarter-hour blur, and untouched grandfathered hours. Days lead. Only an edited hour is quarter-rounded. | PASS | Matrix below. `node --test apps/travel/backend/static/tests/*.test.mjs` (63 pass). Karma `keeps a grandfathered hour and rounds only the edited field`. Playwright `edited hours round and an untouched value stays exact` at 390 and 1280. API `test_comma_decimal_stays_exact_and_is_not_quarter_rounded`. |
| POL2 | A 422 keeps the draft and focuses the field. A 502 retry resends the original body after a later edit. A preview computed for the previous saved policy is not shown after that policy changes. | PASS | Karma `maps a 422 onto the field and drops a preview whose policy changed` and `keeps the original policy body when retry follows a later edit`. Playwright `save failure keeps the draft and retry resends it` asserts both bodies equal `40` after the field is changed to `99`, and asserts You earn is focused on the Sick 422. |
| POL3 | First-run Sick dismissal persists. Unsaved policy and entry drafts block navigation. At 390 the cadence wraps, targets are at least 44px, and focus returns to Edit. Settings comma input refreshes the PTO days figure without changing stored hours. | PASS | Playwright `first-run card dismisses and reports a failed dismiss`, `keyboard order, arrow keys, 44px targets, and the cadence wrap` at 390, and `hours in a workday save and change the days figure only` (`7,5` blurs to `7.5`, days become `13.33`, hours stay `100`). `drafts.spec.js` unsaved-policy cases passed in the same Playwright run. |

### UA / UB matrix

| ID | Proof this run | Result |
| --- | --- | --- |
| UA1 | `pto-model.test.mjs` “balances lead with days and trim zeros” (`12.5 days · 100 h`, `13.33 days · 100 h`, `5 days · 40 h`, minus). Playwright hours test shows both day strings. | PASS |
| UA2 | Model hard-limit test and Playwright `hard limits, a server 422, a blank cap, and a soft warning`. API limit copy remains in `test_pto_buckets.py`, executed by the coverage gate. | PASS |
| UA3 | Model soft-warning test (`2001` → `250.13` days, `401` monthly). Playwright shows the helper without `aria-invalid` and still saves. | PASS |
| UA4 | Model “edited hours round on quarter ties…”. `12,3` / `12.3` / `12.125` → `12.25`; stored `12.3` and `10000` stay exact. Karma and Playwright save `12.3` unchanged and `12.25` for the edited accrual. | PASS |
| UA5 | Playwright retry bodies match and focus returns to Edit PTO. Karma retry sends the pre-edit body. Success toasts stay “PTO policy saved.” / “Sick policy saved.” | PASS |
| UA6 | Playwright `entries, chips, client errors, and add retry` (default PTO, Sick hint, Sick save, `PTO · Trip`). | PASS |
| UA7 | Playwright first-run dismiss, failed dismiss toast, reload persistence, and “Sick: not set up · Set up”. | PASS |
| UA8 | Playwright `empty, loading, and load error` (`aria-busy`, “Couldn't load PTO”, Retry, empty copy, PTO form open). | PASS |
| UA9 | Playwright keyboard order, arrow keys, 44px segments, and the 390 cadence wrap (3 + 2) with no horizontal scroll. | PASS |
| UA10 | Playwright rejects `7.125` and `25`, blurs `7,5` to `7.5`, and shows `13.33 days · 100 h` after one series refetch. Karma `canonicalizes a comma` and `keeps a stored workday that a new edit would reject` (`7,125` stored as `7.125` is not rewritten). | PASS |
| UA11 | Model preview key changes with hours per day, saved policy, and entries. Playwright hides the preview when the last day or the saved policy changes, and sends the selected bucket. Karma drops the preview after a successful policy save and keeps it across a 422. | PASS |
| UA12 | Playwright `axe.spec.js` and `one combined chart at the required height` (light and dark, 390 and 1280) passed in the 155-test run. Draft and screenshot specs in that run also passed. | PASS |
| UB1–UB6 | `pto-chart.test.mjs` cases for two buckets, ticks, labels, Today, the below-zero band, and captions. Re-run here; chart code was not edited. | PASS |
| UB7–UB8, UB12 | Playwright combined-chart height, table, `aria-hidden`, and axe at 390 and 1280. | PASS |
| UB9 | Playwright hours-in-a-workday return refetches one series. | PASS |
| UB10 | Playwright failed-chart retry then policy save redraws one chart (series count 3). Karma chart failure test still expects one series GET after policy save. | PASS |
| UB11 | Contrast coverage stays in the existing chart/token tests. No chart component edit and no new hard-coded chart hex. | PASS |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Float `roundQuarter` / `roundingNote` and `Number` hour parsing in `pto-model.mjs` | `blurHours` and the policy form | `parseHours` plus `quarterText` / `commitHour` | Removed the float quarter helpers. Edited hours round there; an equal stored value is returned unchanged. | Model, Karma, and Playwright fixtures above. `rg` finds no `roundQuarter` or `roundingNote`. |
| Duplicate `field_errors` readers | `fieldMap` in `pto.component.ts` and the inline settings reader | `fieldErrorMap` | Both forms call the model helper. | Karma 422 test and settings 422 path still map `hours_per_day`. |
| Preview cache keyed only to dates, days, and bucket | `forecast` / `forecastFor` | Same signals, one `previewKey` that also includes hours per day, the saved bucket policy, and entries | A response whose key no longer matches is dropped, and `adopt` clears a stale cache. | Karma and Playwright preview cases. |

- Candidate class and protected counterexamples: duplicate live policy. Server balance walk in `leave_math.py` stays the only projection. No accrual mode was added or converted. Historical entries and trip costs were not edited.
- Comparison base SHA and full replacement closure: `a7e16c6fa5bd5543514081e0834022fe38dcd1d1`. Closure is the four production files below, `pto-model.d.mts`, and the tests listed in the numstat. `schemas.py` needed no change: `LeavePolicyIn` already passes raw strings into `validate_policy_body`.
- Production added/deleted/moved; comments/blank-only churn separately: `git diff --numstat` against the base. `leave_math.py` +9/−2, `pto-model.mjs` +157/−61, `pto.component.ts` +64/−31, `settings.component.ts` +14/−8, `pto-model.d.mts` +27/−5. Production about +271/−107, net +164. The increase is decimal parsing, the shared field-error map, and the preview dependency key.
- Independent equivalent implementations before/after: two hour-rounding paths (float `roundQuarter` and ad hoc blur) before, one `commitHour` after. Two `field_errors` mappers before, one `fieldErrorMap` after. One preview cache before and after; its key now includes the saved inputs the preview actually uses.
- State/cache owners and public entry points before/after: `forecast` and `forecastFor` remain the only preview cache. Policy drafts, `edited`, and `fieldErrors` remain on the PTO page. Settings still owns the workday draft and now normalizes it through `blurHoursPerDay`.
- Remaining old symbol/path search, including config and discovery: `roundQuarter`, `roundingNote`, and `fieldMap` are gone under `apps/travel`. `parse_hour_token` is still the server gate; a single comma is a decimal point and the server does not quarter-round.
- Follow-up change: policy draft behavior stays in `pto-model.mjs`, `pto.component.ts`, and `settings.component.ts`. Exact balances stay in `leave_math.py`. Chart geometry stays PTO-01. Remove Sick stays PTO-04. Scheduled accrual stays PTO-05.
- Tests/docs/generated changes separately: tests +230/−6 (`pto-model.test.mjs`, `test_pto_buckets.py`, both Karma specs, `pto.spec.js`). This evidence file is the planning doc. `dist/` from `make build-frontends` is generated and not committed. The Karma port edit in `apps/karma.conf.js` was reverted before commit.
- Net production delta and specific reviewed safety/compatibility exception if positive: net about +164 production lines. This is a feature leaf. The added lines are the decimal parser and the preview dependency key so a comma or an edited blur cannot change an untouched grandfathered hour, and a stale preview cannot publish. No second projection calculator was added.
- No behavior/data/meaningful assertion silently removed: existing limit, soft-warning, chart, draft, and retry assertions still pass. Quarter rounding applies only when the edited value is not the stored value.

## Verification

Local execution only. CI, merge, and deployment were not run.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-web` | PASS (eslint ratchets match baselines) |
| `make typecheck-web` | PASS |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS (63 tests) |
| `CHROME_BIN=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 680 SUCCESS. Statements 82.6% (5132/6213), branches 68.68% (1928/2807), functions 82.39% (1053/1278), lines 86.1% (4456/5175). Karma listened on port 9922; that line was removed before commit. |
| `make build-frontends` | PASS |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$CHROME_BIN npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 155 passed. |
| `make lint-python` | PASS (Ruff format, Ruff, suppressions match baselines) |
| `make typecheck-python` | PASS (mypy baseline unchanged) |
| `./scripts/coverage-gate.sh travel` | PASS. 201 passed. Total coverage 88.14% (floor 80.41%). |

## Handoff

- PR URL (leaf closure keyword only): not opened yet. Will use `Closes #231` and reference #110 without a closing keyword.
- Roadmap #134 append-only status-note URL: not posted yet.
- Merged/activation status (actual evidence, not assumption): not merged. Not deployed. Local verification only.
- Remaining external prerequisites or approved scope decisions: none for this leaf. #110 stays open for PTO-04 and PTO-05.
- Next actor: open the pull request, watch CI, and squash-merge only after Backend, Frontend, Unified Site Release, and Playwright are green.

Issue / parent / local packet: PTO-02 / #231 / #110 / `planning/implementation/issues/PTO-02.md`.

Branch, worktree, base main SHA, current SHA: `agent/pto-02`, `/tmp/vivek-pto-02`, base `a7e16c6fa5bd5543514081e0834022fe38dcd1d1`. The commit that contains this file is the tested revision.

Owned files and conflict groups: `travel-pto-main`, `travel-settings`. Other agents’ worktrees were not edited.

Completed acceptance rows with direct evidence: POL1, POL2, POL3, and the deletion row PASS, as in the tables above.

Unfinished/failed rows and exact next action: none locally. CI has not run.

Deletion ledger and current consumer migration: the PTO page and Settings are the callers of `commitHour`, `blurHoursPerDay`, and `fieldErrorMap`. The float quarter helpers and the component-local field map are gone.

Commands run, results, tested SHA; required checks still pending: see Verification. CI has not run.

PR and roadmap note URLs; actual merge/deployment/activation state: not opened, not merged, not deployed.

External prerequisites and next actor: open the PR. #110 remains the open parent ledger.

No unstated decision from the previous context is necessary to continue.
