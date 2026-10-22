# Quality gates

`make test` runs the fast checks, the four Python coverage gates, and both Karma suites. Lint and type checking are separate so a formatting or type failure is not hidden inside the test log.

```bash
make lint          # Ruff format check, Ruff, and ESLint
make typecheck     # mypy and tsc --noEmit
make e2e           # production finance bundle, then Playwright
make lint-baseline # rewrite quality/*.txt after a finding count shrinks
```

Dev tools are in `requirements-dev.txt` (`pytest`, `pytest-cov`, `ruff`, `mypy`). `make install` installs them into `.venv`. The production image installs only `apps/server/requirements.lock`.

## Ratchet

`scripts/quality_ratchet.py` records `path<TAB>rule<TAB>count` in `quality/`. CI fails when a count rises, and when a recorded count is higher than the current one. A fix has to drop the baseline entry (`make lint-baseline`) instead of leaving a stale allowance. Do not add file-wide suppressions to quiet a noisy rule.

Current baselines, after the cleanups in this change:

| Tool | Findings left |
| --- | ---: |
| Ruff | 156 |
| mypy | 368 |
| ESLint, finance | 483 |
| ESLint, site | 9 |
| ESLint, packages | 0 |

The leftover Ruff findings are import order, pyupgrade, and simplify rules, plus `RUF012` on test doubles. The leftover mypy findings are mostly SQLAlchemy `Column` inference. The leftover ESLint findings are `no-explicit-any`, `prefer-inject`, and a handful of template rules. New code still has to stay inside those counts.

## Python

Ruff lints and formats `apps/` and `scripts/` at line length 100. Selected rules are `E`, `W`, `F`, `I`, `B`, `UP`, `SIM`, and `RUF`. Ignored on purpose:

- `E501`, because the formatter owns wrapping.
- `B008`, because FastAPI uses `Depends` and `Query` in argument defaults.
- `RUF001` and `RUF002`, because titles and prose use en dashes.
- `E402` in `apps/finance/backend/alembic/env.py`, because that file inserts the repo root on `sys.path` before importing models.

`apps/site/flask` is the old chat backend. It is not deployed and not in CI, so Ruff, mypy, and coverage skip it. Applied Alembic revisions are also skipped by the formatter.

mypy runs on Python 3.12 with `check_untyped_defs` and `ignore_missing_imports`. `disallow_untyped_defs` is off; turning it on would be a new baseline, not a cleanup.

The formatting-only commit is `0fcae8021f783f836160bcd8f6a86ad1a98eacbe`, listed in `.git-blame-ignore-revs`.

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## TypeScript

Both Angular apps already compile with `strict`. `make typecheck` runs `tsc --noEmit` for each app (application and spec configs) and for `packages/tsconfig.json` (`packages/browser`, `packages/auth`, `packages/ui`). `noUncheckedIndexedAccess` is not enabled.

ESLint 9 with `angular-eslint` and `typescript-eslint` covers both apps. The packages config lives in `packages/eslint.config.js` because ESLint 9 will not lint files outside the config directory. It loads the finance app's installed plugins. `packages/` has no findings. `no-undef` is off for TypeScript files. Unused names that start with `_` are allowed.

Prettier is not configured. The tree has no formatter today, and formatting both apps would be a review of its own. Adopt it in a follow-up, in one commit, and add that commit to `.git-blame-ignore-revs`.

## Coverage

`scripts/coverage-gate.sh` runs pytest with `pytest-cov`. Tests and Alembic are omitted. The floor is the greatest integer the unrounded total still meets, and a total equal to the floor passes. The text report rounds to a whole percent (`precision = 0`), so Media prints as 71% while the measured total is 70.51%. The gate follows the unrounded total. pytest-cov can print `FAIL Required test coverage` without changing its exit code when that rounding hides the miss, and the script treats that line as a failure. Each CI job appends the table to the GitHub step summary.

| Suite | Statements | Missed | Unrounded | Floor |
| --- | ---: | ---: | ---: | ---: |
| Finance | 1933 | 340 | 82.41% | 82% |
| Travel | 2090 | 389 | 81.39% | 81% |
| Media | 2336 | 689 | 70.51% | 70% |
| Server | 480 | 378 | 21.25% | 21% |

Server coverage is low because auth, checks, database, main, and monitor have no tests. The floor still counts those modules. Omitting them would make the gate look healthier than the package is.

Karma uses Chrome Headless with `--no-sandbox` and writes `coverage-summary.json`. `scripts/karma-coverage-summary.mjs` appends the totals to the GitHub step summary. Thresholds are the measured totals, truncated:

| App | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| Finance | 61 | 53 | 56 | 63 |
| Site | 62 | 48 | 56 | 64 |

## Playwright

`make e2e` builds the finance app with the production configuration, writes the release manifest, and serves `dist/finance-app/browser` at `http://127.0.0.1:4173`. Unlock continues to `/hub`; the specs then open the route they assert. `scripts/serve-spa.mjs` returns `index.html` for unknown paths. The production container is different: the image build passes `--base-href /finance/`, and the five specs assert `/` and `/login` with mocked `/api/` routes. Serving the same production compilation at `/` is what those specs can run against. The container route check stays `make docker-build && make test-suite-routes` (`python -m apps.server.checks`).

Traces and screenshots are kept on failure (`trace: retain-on-failure`, retries stay 0). CI uploads `test-results` and `playwright-report` when the job fails. `npm run e2e` in `apps/finance/frontend` still uses `ng serve`.
