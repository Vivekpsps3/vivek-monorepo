# DEL-02 — implementation evidence

- Leaf: [#214](https://github.com/Vivekpsps3/vivek-monorepo/issues/214); parents [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200) and [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121).
- Branch/worktree: `agent/del-02-eligibility`, `/tmp/vivek-del-02`.
- Base main: `41f701fb25a92e71f98b88300bb0c5c6f751cdaf` (2026-11-15). Tested implementation: `219e414` (all production and test files). Later commits update evidence only.
- Fresh main matches that base. No overlapping open PRs or previous #214 claims were present. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/214#issuecomment-6899110297).
- Explicit support disposition, 2026-11-15: the owner selected **“Retire old-account migration; password-only accounts lose that enrollment route”** after reviewing the live browser/fixture callers and the alternative to retain them. Retirement is authorized; it is not inferred from the obsolete historical startup claim.

## Acceptance

| Row | Current proof/test | Result |
| --- | --- | --- |
| LOCAL1 | Baseline `LoginComponent.submit` and `AuthService.login/enrollPasswordless` called both endpoints; Finance fixtures used migration login and manually promoted sessions. Unified `schema.assert_ready` checks revisions, not enrollment. The explicit support decision above makes retirement eligible. | PASS |
| LOCAL2 | `test_password_only_migration_routes_are_retired_without_mutating_accounts` submits valid old credentials and a valid enrollment payload: both endpoints return 404, issue no cookie and leave the account/hash untouched. OpenAPI omits both routes. Existing invitation/bootstrap/signup/login/wrap/reset/revocation tests retain their assertions. | PASS |
| LOCAL3 | No vault crypto, persistence, AAD, wrap, schema or migration history changes. Finance Karma includes old-ciphertext decryption, localStorage DEK adoption, legacy blind indexes and revision/key-preserving schema-1 rewrites. Auth fixtures include old-KDF login/rewrap. Historical guard and unified adoption fixtures remain. | PASS |
| LOCAL4 | Initial investigation retained the paths until the owner selected retirement. This release ends only old-password enrollment, preserves stored accounts/data and rejects existing migration-only sessions across Finance, Travel and Media. | PASS with explicit support decision |

## Deletion and compatibility

| Candidate | Previous consumers | Removed / retained and surviving owner | Proof |
| --- | --- | --- | --- |
| `routes.login_migrate`, `LoginRequest`, `verify_password`, `hash_password`, password argument to `create_user` | Login form, AuthService and Finance fixture helpers | Deleted handlers/schema and runtime password verification/creation. Identity's existing P-256 challenge login remains the session issuer. General test users seed synthetic signing keys and sign real challenges; they do not create vaults implicitly. | Auth/API and local-dev suites; whole-tree retired-symbol search |
| `routes.enroll_passwordless`, `PasswordlessEnrollRequest`, `get_current_migration_user`, `complete_migration_session`, migration flags in session creation/access override | Same login workflow; test enrollment setup | Deleted the enrollment handler/schema, promotion helper and permissive access override. Invitation/bootstrap/signup remain the enrollment owners. Existing historical-email username test now seeds an already-enrolled account and preserves its mailbox/rename/conflict assertions. | Invitation/bootstrap/signup and username tests; 404 coverage |
| `AuthService.login/enrollPasswordless`, LoginComponent legacy form/state/validation/submit branch; obsolete rate-limit path | Shared login UI and its API calls | Deleted the entire browser workflow and old endpoint limiter entry. Current login and configured signup controls remain in their existing owners. | Unit test covers open and closed signup policy, legacy email-shaped usernames still use vault login; browser sign-in checks absent migration controls |
| Stored `User.password_hash`, `UserSession.migration_only`, applied revisions and historical guard | Existing databases, sessions and migration fixtures | Retained. Old migration-only sessions remain 403; no schema migration or purge. Current sessions cannot promote an old restricted session through the deleted route. | Restricted-session test probes Finance, Travel and Media, then asserts failed enrollment leaves the restriction set |
| v1/v2 ciphertext, legacy browser DEK/index rewrite, signing wraps | Persisted encrypted records and enrolled accounts | Retained unchanged in Finance crypto/persistence and identity wrap owners. | Full Finance coverage/Karma and existing recovery/auth fixtures |

Compared with the base, the complete production closure is **+20 / −246 physical lines, net −226**. Tests are **+106 / −133**, including removed superseded successful-migration assertions, current challenge-login caller migration and explicit retired-route coverage. These figures include the reindentation of the surviving login branch; no production file moves, new production helper, generated output or minification is claimed. Comments/blanks removed belong to the retired methods; the new model comment documents why the stored session restriction remains. Documentation/guidance/baseline changes are counted separately by `git diff --numstat`; this evidence is documentation.

Public endpoints decrease by two; browser sign-in modes decrease from passwordless plus migration to passwordless only. Runtime stores/cache owners are unchanged. Future login work edits the existing LoginComponent/AuthService and identity challenge flow without a second password-enrollment workflow. No money/date/domain formula, supported ciphertext or meaningful surviving regression assertion is removed. Two ESLint `any` allowances and one mypy allowance disappear with the retired implementation; no gate or coverage floor is lowered. Argon2 remains installed for the historical-password regression fixture; no dependency-lock change is included.

Remaining retired URL references under apps/packages/scripts/tests/docs are deliberate 404/absence assertions and lifecycle documentation; no production route or browser caller remains. Immutable migration records and fields are protected counterexamples, not dead-code candidates.

## Parent readiness audit

`plan.py list --live --parent 200` returned only DEL-02. Fresh GitHub PR reads and `git merge-base --is-ancestor <merge SHA> origin/main` confirm that MED-01 (#282), DEL-01 (#287), DEL-05 (#289), MED-07 (#291), DEL-03 (#292), MED-11 (#299), PTO-01 (#326), MED-08 (#328), TYPE-01 (#338), DEL-04 (#342), FIN-04 (#357), DEL-06 (#359) and REF-01 (#370) are merged ancestors. TRIP-02 is merged in #302 (`9e1f582`). The TD owner map also covers the Finance import and Travel requirements through FIN-04, PTO-01 and TRIP-02; their own evidence remains authoritative. This leaf does not rewrite global queue metadata or close either parent. #200 can be reconciled after this leaf merges; deployment is a separate state.

## Verification

Toolchain: project `.venv` Python 3.12, Node v24.22.2 via `/tmp/node-v24/bin`, and Playwright Chromium at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` (`CHROME_BIN` / `PLAYWRIGHT_CHROMIUM_EXECUTABLE`). Uncommitted dependency symlinks reuse the installed tools.

| Command | Result |
| --- | --- |
| Focused pre-retirement auth/username/legacy guard/unified schema fixtures | PASS: 70 tests on baseline source |
| Focused post-retirement auth/API/local-dev/username/OpenAPI/server composition | PASS: 75 tests after fixture fixes below |
| `make test-fast` | PASS: doc paths, planner fixtures, boundaries, 111 Python script cases and 21 Node gate tests |
| `make lint-python` | PASS: 236 formatted files; Ruff 91 and suppression 6 baselines unchanged |
| `make typecheck-python` | PASS: mypy 82, only the obsolete route allowance removed |
| `./scripts/coverage-gate.sh finance` | PASS: 139 tests, 81.99% against unchanged 81.03% floor |
| `./scripts/coverage-gate.sh server` | PASS: 356 tests, 74.63% against unchanged 61.53% floor; separate performance test PASS, Town p50 132.79ms |
| `make lint-web` | PASS: Finance ESLint baseline shrinks by two; other baselines unchanged; engine purity passes |
| `make typecheck-web` | PASS: all seven TypeScript projects |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 493 tests; all existing coverage floors pass |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 371 tests; all existing coverage floors pass |
| `make build-frontends` | PASS: production bundle, public prerenders and release manifest |
| `make e2e` | PASS, exit 0: rebuilt production bundle, 198 passed and 5 existing conditional skips, zero failures |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS, exit 0: 97 passed, zero retries |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS, exit 0: 95 passed |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS, exit 0: 143 passed |
| `npx playwright test --project=suite` | PASS, exit 0: 31 passed |

Resolved attempts: the first fast gate used system Python and failed importing Alembic; using project `.venv/bin` on PATH passes. The first post-retirement focused run exposed two local-dev fixture origin failures and an exhausted login bucket in the server composition validation case. The sign-in helper now binds both challenge steps to the configured test origin; the composition test validates its next independent malformed-body request after clearing the bucket whose 429 it already asserted. The same assertions then pass. The first type gate found a nullable ORM lookup in the new test and the obsolete route allowance; the fixture now asserts the stored account exists, and only the stale allowance was removed. ESLint similarly required shrinking the two deleted `any` allowances. None of these attempts is relabelled as a pass.

## Handoff

- PR / scoped roadmap note: local gates complete; publication links will be recorded after opening. Leaf closure keyword only, parents referenced.
- Actual merge/deployment: neither performed.
- External support prerequisite: resolved by the explicit retirement decision above.
- Next actor/action: publish the complete PR closing #214 and append the scoped #134 note. Merge requires owner authorization. #200 remains open until merged acceptance is reconciled; no deployment is inferred.
