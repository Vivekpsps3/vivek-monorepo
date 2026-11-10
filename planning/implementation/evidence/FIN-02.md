# FIN-02 — implementation evidence

- Leaf issue and parent(s): [#221](https://github.com/Vivekpsps3/vivek-monorepo/issues/221) FIN-02. Parent [#65](https://github.com/Vivekpsps3/vivek-monorepo/issues/65) stays open.
- Agent/context, branch/worktree: Cursor agent, branch `agent/fin-02`, worktree `/tmp/vivek-fin-02`.
- Base main SHA, current tested SHA: base `08be484ba3b3535dbcb500749245f2e75ee1f2e4` (includes DEL-05 / PR #289 and PR #193). Local gates ran on the tree committed as `58c0b866400a9cbbb90fff3b16956942d99ba738`. Pull request: https://github.com/Vivekpsps3/vivek-monorepo/pull/295.
- Fresh-main/prerequisite/active-PR checks: no queue dependency. DEL-05 is in the base: bills and subscriptions still use `ui-field` for error text, `aria-invalid`, `aria-describedby`, and `data-field-invalid`. `controls.css` still owns the danger border; this change does not edit it. No edit to the vault public API or the Health store.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| REC1 | Each editor at 390×844 and 1280×800, light and dark. Scroll the job body, correct an invalid field, keep a failed-save draft, Escape, and Cancel. Cancel and Save stay in the viewport at 44px. | PASS | Playwright `apps/finance/frontend/e2e/fin-02-recurring-editors.spec.ts` inside `make e2e` (240 passed, 8 skipped). The skips are the existing non-390 target-size cases. |
| REC2 | Legacy monthly, weekly, biweekly, and semimonthly pay, including half-cent inputs `1.005`, `0.005`, and `0.015`, convert through `fromDollars` / `roundHalfAwayFromZero` / `toDollars`. Annual base, tax, deduction, and paycheck cents match before and after save. Cent-aligned `$100.01` also matches `estimatedPaycheckNet`. Hourly `15.505` at 37.5 hours stays hourly. The rendered job editor saves and reopens one monthly record at `$1,200.12` / `$120.12` / `$0.12`. | PASS | `pay-schedule.spec.ts` and `income-editor.component.spec.ts` (Finance Karma 762/762). Playwright save/reopen asserts `pay_frequency: annual`, `base_pay: 1200.12`, `annual_taxes: 120.12`, `annual_deductions: 0.12`. |
| REC3 | A job with a role and note, a bill with due day, autopay, account, and note, and a subscription with category, account, and note open More options. Cancel keeps the stored record. The job shows one "How often are you paid?" control plus Yearly/Hourly, and no Pay frequency or Paycheck schedule control. The subscription keeps Next bill date and has no Autopay or Due day field. | PASS | Same Karma specs and the Playwright spec. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Pay frequency select (annual/monthly/semimonthly/biweekly/weekly/hourly) beside the paycheck schedule | `income.component.html` / `income.component.ts` `payFrequencyOptions`, `basePayLabel`, `payPeriodLabel` | `pay-schedule.ts` Yearly/Hourly choice plus one "How often are you paid?" / "Next payday" schedule | Editor branches removed. Stored legacy cadences still annualize in `job-compensation.util.ts` until a save rewrites them to annual or hourly. The list keeps a display label so an unread row is not a raw token. | DOM asserts no "Pay frequency" or "Paycheck schedule"; cents snapshots match |
| Copied dialog overflow, width, and footer rules; subscription `.modal-actions`; `setOptionalOpen` and `addTaxes` DOM openers | Income, bills, and subscriptions CSS/TS | `apps/finance/frontend/src/app/shared/recurring-editor.css` with the existing `.form-actions` class. `ui-dialog` still owns the sheet shell. | Three footer/scroll copies and both DOM openers removed. Details use `[open]`. | All three templates use `recurring-editor` / `.form-actions`. Playwright scrolls `[data-editor-body]` while Save stays visible. |

- Candidate class and protected counterexamples: duplicate live policy for the editor footer and the two pay-entry controls. Money meaning is preserved by the cents helper, not by keeping both inputs. Subscriptions do not gain Autopay or Due day. Bill category and due-day rules stay. DEL-05 field wiring stays.
- Comparison base SHA and full replacement closure: `08be484ba3b3535dbcb500749245f2e75ee1f2e4`. Closure is the three editors, `pay-schedule.ts`, `recurring-editor.css`, their specs, and `fin-02-recurring-editors.spec.ts`.
- Production added/deleted/moved: added 585, deleted 249, net +336. New files: `pay-schedule.ts` 207, `recurring-editor.css` 83. No move. Comments in the cents helper explain half-away rounding; they are not blank-only churn.
- Independent equivalent implementations before/after: two pay-entry controls and three footer/scroll copies before; one schedule and one shared sheet after.
- State/cache owners and public entry points before/after: unchanged. Job, bill, and subscription records stay in the encrypted collections. No vault public API change.
- Remaining old symbol/path search: `modal-actions` remains on assets only. `pay_frequency` values `monthly` / `weekly` / `biweekly` / `semimonthly` remain on stored rows and in `salaryPeriodsPerYear` so unread records keep their annual totals. The editor no longer offers those units.
- Follow-up change: a new recurring editor includes `recurring-editor.css` and `.form-actions`. Pay math for legacy rows goes through `pay-schedule.ts` when the job editor opens.
- Tests/docs/generated changes separately: tests added 509, deleted 1, net +508 (`pay-schedule.spec.ts` 114, income editor spec +96/−1, bill spec +30, subscription spec +30, Playwright spec 239). This evidence file is the documentation change. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: +336. The cents normalizer is required so fractional-cent legacy cadences stay equal under `fromDollars` / `roundHalfAwayFromZero` / `toDollars`, including when per-period withholding is blank and the stored annual withholding is the amount. The shared sheet is required so the body scrolls and Cancel/Save stay on screen; the deleted copies only restated dialog width and did not pin the footer. Both have the three editors as consumers. This is not a form framework.
- No behavior/data/meaningful assertion silently removed: failed-save draft, error summary focus, Escape, bill due day, and subscription renew date remain. A yearly/hourly toggle can move a half cent when an annual amount does not divide evenly by the week; opening a legacy cadence and saving without that toggle does not.

## Verification

Commands ran from `/tmp/vivek-fin-02` with Node v24.11.1 (`/tmp/node24/bin/node`). System Node is v20.20.2 and was not used for the gates. `CHROME_BIN` was Playwright Chromium `chromium-1248`. `PLAYWRIGHT_BROWSERS_PATH=/home/vivek/.cache/ms-playwright`.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-web` | PASS (eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0) |
| `make typecheck-web` | PASS |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 762/762. Statements 74.8%, branches 64.47%, functions 71.65%, lines 77.88%. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 645/645. Statements 81.72%, branches 68.27%, functions 80.98%, lines 85.27%. |
| `make e2e` | PASS, 240 passed, 8 skipped. Includes `fin-02-recurring-editors.spec.ts`. |
| Python coverage, Media/Travel/Town Playwright | NOT RUN. No Python, Media, Travel, or Town files changed. |

Browser exercise, not a screenshot-only check: the Playwright spec opens all three editors at 390×844 and 1280×800 in both themes, scrolls a long job form, corrects an error, retains a failed-save draft, opens More options for existing values, and uses Escape and Cancel. A failed run's screenshot showed the job sheet scrolled to Notes with Save and Cancel still in view.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/295 (`Closes #221`). Parent #65 is referenced and not closed.
- Roadmap #134 append-only status-note URL: posted after the squash merge.
- Merged/activation status: not merged at the time these local gates passed.
- Remaining external prerequisites or approved scope decisions: none for this leaf. #65 stays open.
- Next actor: merge this pull request, then the integration owner reconciles roadmap #134 from the status comment.
