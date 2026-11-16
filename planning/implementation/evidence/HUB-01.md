# HUB-01 — implementation evidence

- Leaf: [#243](https://github.com/Vivekpsps3/vivek-monorepo/issues/243); parent [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93) remains open.
- Codex context, branch `agent/hub-01`, isolated worktree `/tmp/vivek-hub-01`.
- Starting main: `2af4f04c4a47ea6831504f5431ce5c316a6e6b98`. Integrated fresh main `a10e8cc` (security queue reconciliation) into implementation `c1eaf2b`; tested integration revision `082adf51a1bea2f92a3c2caf27a4162f9e505aae`. The integration changes planning records only; application/test source is identical.
- [Scoped claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/243#issuecomment-6923086591). Fresh leaf/parent/#128 and open PR reads found no competing claim or PR. Original checkout's uncommitted World work was not edited, reset, stashed or staged.
- Dependencies verified on current main, with retained source: UX-01 #280 (`98c8d90`) Profile direct routes; SEC-05 #362 (`c461fe7`) recovery export; SEC-06 #365 (`a399061`) recovery restore; SEC-04 #377 (`2af4f04`) passphrase rotation. All are ancestors and now registered in the completion archive. Existing security, session and Finance owners remain authoritative.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| ACCOUNT1 | Web component tests exercise linked local errors, first-invalid focus, clearing on correction, safe status copy, integer/date Retry-After, preserved username 403 refresh-once and no-loop cases, and actual verify/username headers. `tests/e2e/account.spec.ts` executes keyboard login/signup at 390/1280 in light/dark with axe, autocomplete and hint/error links; HTTP-date/integer 429, 403, 503/network, typed 422, real request timeout, signup progress, invite-code validation and enrollment preview/retry. Existing real-account username cases preserve signing, legacy email login, rename/reload, CSRF retry count, expiration, wrong passphrase, taken name and passphrase clearing. | PASS |
| ACCOUNT2 | `account-settings.spec.ts` creates an actual account, submits/corrects/saves the name by keyboard, follows both CSV links and observes `transactions.csv`/`holdings.csv` downloads, returns through history, reaches all three working passphrase/recovery headings, passes axe, signs out two same-origin tabs with exactly one logout request, observes `/auth/me` 401 and rejects a direct Settings return. Existing rotation/export/restore browser cases exercise the linked operations themselves. | PASS |
| ACCOUNT3 | Historical source-to-proof matrix below, deletion ledger and retained runtime tests. No second signup, username or passphrase form was introduced. | PASS |

## Historical #128 account/runtime reconciliation

| Historical finding | Current disposition and proof |
| --- | --- |
| Signup idle live region | Persistent form status region announces policy/idle and enrollment states. Component/browser cases observe the same region while idle, submitting and returning after failure. |
| Signup progress | Existing `signupProgress` and owned timers retained. Component fake-clock test exercises 5s/30s during held local setup and destroys timers; browser holds actual signup HTTP, observes immediate/5s progress and separately proves the existing 12s HTTP deadline restores the form. No timeout or retry gate was increased. |
| Invite username validation/description/hint | Self-signup and invite-code signup use `usernameForStorage` plus a linked shared hint and field error. Admin enrollment is deliberately static: the server/admin already chose the identity; valid preview displays it, malformed identity cannot expose a submit/passphrase form. Browser covers both, including preview 429/503 and retry. This supersedes an editable enrollment username, not its validation or identity disclosure. |
| Static invite copy | One inline identity paragraph and passphrase hint; repeated bottom-of-form conditional copy removed. Invalid/expired links have safe copy; transport failures have safe network/rate-limit copy and an actual retry action. |
| Runtime/browser, UI and auth-ux test wiring | Already present in Makefile test/verify-fast and `.github/workflows/ci.yml` before this leaf. Executed runtime/UI/auth-ux and the retained Travel/Media week/format Node cases: 33 pass. No parallel test runner added. |
| Configurable week start | Existing `packages/browser/runtime/week.mjs` reads the shared `suite-week-start` value and supports Sunday/Monday (0/1). Existing Travel week and Media format cases execute both. Preserved this supported contract without adding options or a second preference owner. |
| Account naming/error UX | Same login/signup/username controls now share bounded safe copy and server field locations; original status-specific username 403/401/409 behavior and supported legacy email sign-in remain covered. |

Manual VoiceOver/Safari and physical touch-device verification are not claimed. Automated keyboard, phone/desktop, light/dark and axe are executed proof, not substitutes for those manual platforms.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition/proof |
| --- | --- | --- | --- |
| `LoginComponent.errorMessage`, `SignupComponent.errorMessage`, independent username status/detail mapper and raw name-error rendering | Login, first-account setup, signup/enrollment, username changes and Settings name | App-local `platform/auth/account-error.ts`, with real consumers in each existing form | Deleted duplicate parsers/raw transport-detail rendering. Known locally generated sign-in failures use explicit `AccountFormError`; arbitrary Error/network/5xx text stays private. One copy/Retry-After policy, no cross-app error framework. |
| Verify catch converting HTTP errors to plain Error | Passwordless sign-in | Original HTTP response reaches the shared form mapper | Deleted the catch/flattening path. Real-signature unit test proves verify 429 retains Retry-After and 503 does not expose server detail or unlock. |
| Duplicated login/bootstrap completion handlers and opaque `canSubmit` | Existing login form | One promise completion path and field-specific validation in that component | Deleted the duplicate completion branch and boolean-only failure explanation. Forms remain submit-to-explain and support current/new-password autocomplete. |
| Repeated signup validation/copy and unreachable invite submit states | Existing signup/enrollment form | Same component, canonical username policy and per-control hints | Removed free-standing duplicate username regex, bottom copy branches and obsolete aria-disabled submit branch. Enrollment now requires a validated preview and owns a real preview retry. Local validation remains before cryptographic/API work. |
| Dead export/security placeholders | None on current main: SEC-04/05/06 had already supplied the working security/recovery route | Existing Finance Settings/passphrase/recovery controls | No invented deletion. Retained the actual security link and added discoverable links to existing CSV owners; Sessions calls existing `SessionService.logout`, without a session list or duplicate passphrase/export implementation. |

- Classification: feature plus safety repair. This is not a net deletion/simplification claim.
- Complete production closure against integrated main `a10e8cc`: 12 TS/template files, **1,142 → 1,278 physical lines; +351/-215, net +136**, moved 0. Added lines include 15 blank and 3 comment-like lines; deleted lines include 6 blank and 2 comment-like lines. Formatting/blank/comment churn is included, not sold as executable deletion. New code supplies field linkage/focus, polite/idle states, safe retry handling, preview validation/retry and real Settings actions.
- Tests: **+345/-9**, including two new browser files, the shared copy tests and stronger existing assertions. App guidance: +3. ESLint ratchet: three rows/four existing `no-explicit-any` findings removed; no floor or accepted-debt count increased. No generated bundles, lockfiles or binary screenshots committed.
- Independent account copy implementations: login/signup/username plus name raw-error exposure → one shared copy policy. Login/bootstrap async completion paths: 2 → 1. Username rule uses the existing `@vivek/auth` owner; the server/service boundaries retain defensive validation. No new persistent cache, session store, vault protocol, lock transport or framework.
- State owners/public actions stay with existing forms, SessionService and Finance public routes. One existing enrollment preview action becomes retryable; progress timers still belong to SignupComponent and are disposed on completion/destruction. New focus paths ignore destroyed views.
- Consumer search: no component `private errorMessage`, `typedFieldDetail`, or `throw new Error(typeof detail...)` in the replaced account paths. `usernameChangeMessage` remains a thin consumed compatibility wrapper over the single mapper; known local username diagnostic overrides remain typed, status-specific and covered.
- A follow-up status-copy change edits `account-error.ts`; account validation/interaction edits its existing form; logout behavior edits SessionService; CSV/recovery behavior stays with Finance. Supported legacy username login, passphrase proof privacy, 403 refresh-once, owner/session guards, encrypted exports/restore and all meaningful counterexamples remain.

## Verification

Node `/tmp/node24/bin/node` v24.11.1; untracked worktree symlinks reuse original `node_modules` and `.venv`. Commands use the virtualenv and Node in PATH. Chrome is `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` through `CHROME_BIN`/`PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Server coverage has its own `/tmp/hub01-server.coverage`. No retries or skips were added.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS: doc/planning/boundary checks, 111 script tests, 21 Node tests; discovery is listing only. Final evidence-path run passed. |
| `make lint-web` | PASS: all existing ratchets and engine-purity case, with only removed debt shrunk. |
| `make typecheck-web` | PASS: all seven TypeScript configurations. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 394 tests; 77.15% lines. |
| `make lint-python` | PASS: 239 files formatted, Ruff 91/suppressions 6 match existing baselines. |
| `make typecheck-python` | PASS: mypy 82 matches existing baseline. |
| `./scripts/coverage-gate.sh server` | PASS: 357 tests, 74.27%, floor 61.53%. |
| `make build-frontends` | PASS: production bundle and release manifest. Existing unrelated unused-import warnings retained. |
| `node --test packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs apps/travel/backend/static/tests/week.test.mjs apps/media/backend/static/tests/format.test.mjs` | PASS: 33 cases, including Sunday/Monday compatibility. |
| `npx playwright test --project=suite` | PASS: 41 tests, including all ten new account stories. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS: 109 tests, with a stable completed bundle. |
| `npx playwright test --config apps/finance/frontend/playwright.config.ts` (the browser command in `make e2e`, after the passed production build) | PASS: 208 tests, 5 existing unrelated viewport/platform skips. All eight serial username cases and the new Settings CSV/logout case executed. |
| `git diff --check` | PASS, including evidence. |

Earlier failures are not counted as passes: new status selectors initially also matched the toast region (now scoped to the account form); a browser 30s expectation encountered the intentional 12s HTTP deadline (30s local setup moved to an actual component-timer test; browser deadline assertion added); the existing username browser hint asserted superseded copy (now asserts linked shared hint plus autocomplete). One web run loaded a lazy chunk while `make e2e` rebuilt the shared bundle; trace recorded chunk/version.json 404s. Builds and consuming browser runs are now sequenced; the entire web suite is rerun without modifying its assertions, timing or retry policy. Initial Finance serial followers were not run after its old-hint failure; the final complete run executed all eight username cases and passed. The initial `make e2e` invocation failed that superseded assertion; its production build passed, and the corrected full underlying browser command above passed after the build, without rebuilding underneath another suite.

## Handoff

- PR: [#379](https://github.com/Vivekpsps3/vivek-monorepo/pull/379), opened after local checks passed; uses `Closes #243` and `Refs #93` only.
- Roadmap #134 [scoped note](https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6923571646); leaf [delivery note](https://github.com/Vivekpsps3/vivek-monorepo/issues/243#issuecomment-6923571115).
- Actual state: implementation complete and all required local checks passed; PR open and mergeable, CI pending. Current main integrated. Not merged or deployed.
- Owned conflict groups: `account-settings`, `auth-forms`, `private-shell`; no competing PR at latest fresh check. No global queue or parent body regenerated.
- Next actor/action: review PR #379 and its CI. Merge/deployment requires user authorization. No external prerequisite, scope decision or implementation work remains. This final handoff update changes evidence only; tested application/test source remains `082adf5`.
