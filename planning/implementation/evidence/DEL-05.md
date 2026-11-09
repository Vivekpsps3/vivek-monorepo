# DEL-05 — implementation evidence

- Leaf issue and parent(s): [#217](https://github.com/Vivekpsps3/vivek-monorepo/issues/217) DEL-05. Parents [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200) and [#196](https://github.com/Vivekpsps3/vivek-monorepo/issues/196) stay open.
- Agent/context, branch/worktree: Cursor agent, branch `agent/del-05`, worktree `/home/vivek/Deployments/worktrees/vivek-del-05`.
- Base main SHA, current tested SHA: base `29e131821d138bba224e02d5d61b77e23247e08a`. Tested implementation `c736b9fddf6d507ca1aa8cc16e365afe320edd7a`. The pull-request head is the commit that adds this evidence file on `agent/del-05`.
- Fresh-main/prerequisite/active-PR checks: no queue dependency. `origin/main` at the base above already contains merged PR #193. No other open PR claimed `shared-controls`, `root-styles`, or `finance-recurring-editors`. FIN-02 (#221) was not edited. `packages/ui/src/public-api.ts` was not edited.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | Bill name, category, amount, and due day use `ui-field`. Subscription name and amount already used `ui-field` and now drop the local invalid-border copy. Bill rules still require category and a 1–31 due day. Subscription rules still require only name and a positive amount, and an empty category stays optional. | PASS | `fixed-expenses.component.spec.ts`, `subscriptions.component.spec.ts`, Playwright `del-05-field-errors.spec.ts` |
| LOCAL2 | Invalid submit focuses the error summary. The summary button focuses that invalid control. `aria-describedby` points at the `ui-field` error, including the warning marker. Correcting the field clears `aria-invalid` and `data-field-invalid`. A failed save leaves the dialog open with the draft and focuses the save alert. Retry saves. Escape closes and the next open has no leftover summary. | PASS | Same Karma specs, plus the Playwright spec on the recurring editors (invalid submit, correction, failed-save draft, Escape) |
| LOCAL3 | At 390×844 the subscription Save control stays at least 44px and inside the viewport, including after scrolling the dialog. At 1280 the same control stays usable. Dark theme keeps the invalid border on `--danger` at rest and on hover. 200% page zoom keeps Save usable without horizontal overflow. | PASS | Playwright `del-05-field-errors.spec.ts` (2.0s, passed). Phone screenshot during the prior timeout showed Name "Stream", corrected Amount "8", and a visible Save/Cancel footer. |
| LOCAL4 | Hover selectors in `controls.css` and `styles.css` no longer match `[aria-invalid="true"]`, so they cannot outrank the single danger-border rule in `controls.css`. The layered `styles.css` invalid-border copy is gone. Subscription `#subscription-form` and `.ui-field__control` border overrides are gone. `ui-field` keeps only a zero-specificity fallback. Finance invalid-border and focus-ring Playwright checks still pass. | PASS | Source diff plus Finance Playwright, including `suite-v2-a11y.spec.ts` "invalid field border wins over the base rule" at 1280 light and dark |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Bill template `aria-invalid`, `aria-describedby`, `data-field-invalid`, and hand-written `.ui-field__error` paragraphs | `fixed-expenses.component.html` | `packages/ui/src/ui-field` | Removed. Bills now pass `[error]` into `ui-field`. | Karma and Playwright linked-error assertions |
| Subscription invalid, hover, disabled, and `.ui-field__control` border copies, plus the 768px font-size restatement | `subscriptions.component.css` | `packages/ui/controls.css` | Removed. A min-width/max-width layout rule remains and does not set `border-color`. | CSS diff; hover keeps `--danger` in the Playwright spec |
| Layered `input/select/textarea[aria-invalid]` border in `apps/web/src/styles.css` | Every page that loads root styles | `packages/ui/controls.css` | Removed. Layered hover now also excludes invalid controls. | Diff; existing invalid-border Playwright check still passes |
| `data-field-invalid` copied onto each bill input | Bill template and `focusFirstInvalid` | `UiFieldComponent` sets and clears it with `aria-invalid` | Moved into the existing field component (2 lines). Templates no longer set it. | `ui-field-describedby.spec.ts` |

- Production added/deleted/moved: added 42, deleted 94, net −52. Nothing was moved to a new file. The 2-line `data-field-invalid` update and `clearValidation()` (reset `saveError`, `fieldErrors`, and `formSubmitted` when a dialog opens or closes) are the retained additions.
- Tests/docs/generated changes separately: tests added 429 lines and deleted 0 (`fixed-expenses.component.spec.ts` 153, `subscriptions.component.spec.ts` 133, `del-05-field-errors.spec.ts` 140, `ui-field-describedby.spec.ts` +3). This evidence file is the only documentation change. No generated files were committed.
- Remaining necessary overhead and why: `clearValidation()` so a closed dialog does not show the previous submit's errors. A failed save does not close the dialog, so the draft and the save alert remain. Domain validators, optional subscription fields, and each draft model stay in the feature components. `form-validation.ts` was already the focus/summary helper and did not need a new API. `ui-field`'s `:where()` danger border stays as a fallback when `controls.css` is absent; it does not beat the shared rule.
- No behavior/data/meaningful assertion silently removed: bill category and due-day rules, subscription amount rules, summary focus, failed-save copy, and Escape-to-close remain. Checkbox and radio controls were already outside the shared invalid-border rule; the deleted layered copy had been the only extra border for those types, and no checkbox in this repo sets `aria-invalid`.

## Verification

Commands below ran in this worktree. Finance, site, and web Karma used `CHROME_BIN` pointing at the local Playwright Chromium because this machine has no system Chrome. Playwright used `PLAYWRIGHT_BROWSERS_PATH=/home/vivek/.cache/ms-playwright` because the sandbox path had no browser.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-web` | PASS (eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0). Re-run after the new specs: same counts. |
| `make typecheck-web` | PASS |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 755 of 755. Statements 74.73%, branches 64.31%, functions 71.55%, lines 77.84%. |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 15 of 15 |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 631 of 631 |
| `node --test packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` with `/usr/bin/node` v20.20.2 | FAIL. `calendar-format.test.mjs` imports `packages/browser/src/format.ts`, which Node 20 will not load. This is the local runtime, not an assertion. CI uses Node 24. |
| same command with Node v24.11.1 (`/tmp/node24/bin/node`) | PASS, 18 tests |
| `make e2e` | PASS, 239 passed, 8 skipped. Skips are the existing `test.skip(width !== 390)` target-size cases in `suite-v2-a11y.spec.ts`. Includes `del-05-field-errors.spec.ts`. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS, 72 passed |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS, 144 passed |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS, 28 passed |
| `npx playwright test --project=suite` | PASS, 24 passed |
| `make lint-python`, `make typecheck-python`, Python coverage gates | NOT RUN. No Python files changed. |

## Handoff

- PR URL (leaf closure keyword only): opened with `Closes #217`. Parents are referenced and not closed.
- Roadmap #134 append-only status-note URL: posted after the pull request exists.
- Merged/activation status (actual evidence, not assumption): not merged, not deployed.
- Remaining external prerequisites or approved scope decisions: none for this leaf. #200 and #196 stay open.
- Next actor: reviewer. Do not merge from this change set unless the owner asks.
