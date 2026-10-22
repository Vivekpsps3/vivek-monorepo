# Quality gates

`make test` runs the fast checks, the four Python coverage gates, and both Karma suites. Lint and type checking are separate so a formatting or type failure is not hidden inside the test log.

```bash
make lint          # Ruff format check, Ruff, ESLint, and inline suppressions
make typecheck     # mypy and tsc --noEmit
make e2e           # production finance bundle at /finance/, then Playwright
make lint-baseline # rewrite quality/*.txt after a finding count shrinks
make coverage-pin  # rewrite quality/coverage.txt from a fresh measurement
```

Dev tools are locked in `requirements-dev.txt` (hashed; compiled from `requirements-dev.in`). `make install` installs that lock with `--require-hashes`. The production image installs only `apps/server/requirements.lock`. The image-building CI job does not install the dev lock. `pip-audit` is in the dev lock and runs in the finance backend job, against `apps/server/requirements.lock`.

## Ratchet

`scripts/quality_ratchet.py` records `path<TAB>rule<TAB>count` in `quality/`. CI fails when a live count rises, and when a recorded count is higher than the current one. A fix has to drop the baseline entry (`make lint-baseline`) instead of leaving a stale allowance.

`update` refuses a higher count unless `--allow-increase` is passed. On a pull request, CI compares each committed baseline with the same file on the base branch (`check-base`) and fails if this branch allows more than the base. The tool list comes from `quality_ratchet.py list`, so a new `TOOLS` key is covered without editing the workflow. `check-tools` fails when a key that exists on the base ref was renamed or removed here. The base ref is passed in the environment, and the job does not fetch with `--depth=1`, so blame and merge-base still see full history. A missing baseline is an error when that tool is already in `TOOLS` on the base. It is a `::warning::` when this script, or that tool, is new there. The workflow listens for `labeled` and `unlabeled` as well as the default pull-request events, and the allowance step writes whether the `ratchet-increase` label is present. That label sets `RATCHET_ALLOW_INCREASE` and is the reviewed way to accept a higher allowance. Do not add file-wide suppressions to quiet a noisy rule.

ESLint counts warnings as well as errors and passes `--report-unused-disable-directives`. A parse error, including an unused `eslint-disable`, fails the run instead of being absorbed. The `suppressions` tool counts a `# noqa` comment (any case, including `# ruff: noqa` and `# flake8: noqa`). The `#` is required, so the word `noqa` inside a string is not a suppression. It also counts `# type: ignore`, any `# mypy:` inline option (including `ignore-errors` and `disable-error-code`), `eslint-disable`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `# pragma: no cover`, and `istanbul` / `c8` / `v8` `ignore` in `apps/`, `scripts/`, and `packages/`. `apps/site/flask` is skipped, same as the other Python gates. Alembic `versions/` directories are skipped by that path, not because the directory is named `versions`.

Current baselines:

| Tool | Findings left |
| --- | ---: |
| Ruff | 167 |
| mypy | 384 |
| ESLint, finance | 481 |
| ESLint, site | 9 |
| ESLint, packages | 0 |
| Inline suppressions | 0 |

Counting warnings did not move the ESLint totals: the current findings are all errors. `transactions.component.spec.ts` stays at 19 `@typescript-eslint/no-explicit-any`. The two route-action fixtures from the spending flatten are typed `ImportReceipt`s. The return-path specs in `after-auth.spec.ts` stub the router with `jasmine.SpyObj<Router>`, so that file no longer adds an `any`.

The leftover Ruff findings are import order, pyupgrade, and simplify rules, plus `RUF012` on test doubles. The leftover mypy findings are mostly SQLAlchemy `Column` inference. The leftover ESLint findings are `no-explicit-any`, `prefer-inject`, and a handful of template rules. New code still has to stay inside those counts.

## Python

Ruff lints and formats `apps/` and `scripts/` at line length 100. Selected rules are `E`, `W`, `F`, `I`, `B`, `UP`, `SIM`, and `RUF`. Ignored on purpose:

- `E501`, because the formatter owns wrapping.
- `B008`, because FastAPI uses `Depends` and `Query` in argument defaults.
- `RUF001` and `RUF002`, because titles and prose use en dashes.
- `E402` in `apps/finance/backend/alembic/env.py` and `apps/server/alembic/env.py`, because those files insert the repo root on `sys.path` before importing models. The server file is the one PR #5 adds; the ignore is already in place.

`apps/site/flask` is the old chat backend. It is not deployed and not in CI, so Ruff, mypy, coverage, and the suppression scan skip it. Applied Alembic revisions are also skipped by the formatter.

mypy runs on Python 3.12 with `check_untyped_defs` and `ignore_missing_imports`. `disallow_untyped_defs` is off; turning it on would be a new baseline, not a cleanup.

The formatting-only commits listed in `.git-blame-ignore-revs` are `0fcae8021f783f836160bcd8f6a86ad1a98eacbe`, `2c41a00fecfabaefd4acab7229f613f7951a1d2a` (the auth-hardening reformat after merging main), and `0ccfa2cb0696d2c6c278fa21093cdeb3828fb9de` (the reformat after merging the schema, media, and CSP work). Later formatting commits are appended. CI checks that every listed SHA is still an ancestor of `HEAD`, which holds when main is merged in rather than rebased. Do not drop a SHA that is still an ancestor.

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## TypeScript

Both Angular apps already compile with `strict`. `make typecheck` runs `tsc --noEmit` for each app (application and spec configs) and for `packages/tsconfig.json` (`packages/browser`, `packages/auth`, `packages/ui`). `noUncheckedIndexedAccess` is not enabled.

ESLint 9 with `angular-eslint` and `typescript-eslint` covers both apps. The packages config lives in `packages/eslint.config.js` because ESLint 9 will not lint files outside the config directory. It loads the finance app's installed plugins. `packages/` has no findings. `no-undef` is off for TypeScript files. Unused names that start with `_` are allowed.

Prettier is not configured. The tree has no formatter today, and formatting both apps would be a review of its own. Adopt it in a follow-up, in one commit, and add that commit to `.git-blame-ignore-revs`.

## Coverage

`scripts/coverage-gate.sh` runs pytest with `pytest-cov` at `precision = 2`, so `--cov-fail-under` decides on the displayed total. Tests and Alembic are omitted. `quality/coverage.txt` stores the measured total and a floor about 1 percentage point below it. The gate fails when coverage drops under the floor. A gain does not fail; the job prints a `::notice::` with a suggested floor, and `make coverage-pin` rewrites the file from a fresh measurement. Each CI job appends the table to the GitHub step summary. The summary step exits cleanly when a job failed before writing `coverage/`.

| Suite | Statements | Missed | Measured | Floor |
| --- | ---: | ---: | ---: | ---: |
| Finance | 2265 | 354 | 84.37% | 83.37% |
| Travel | 2092 | 389 | 81.41% | 80.41% |
| Media | 2377 | 675 | 71.60% | 70.60% |
| Server | 1254 | 483 | 61.48% | 60.48% |

Server coverage rose once migrations, schema, redirects, and the security-header middleware gained tests. Auth, checks, database, main, and monitor are still untested, and the floor still counts those modules. Omitting them would make the gate look healthier than the package is.

Karma uses Chrome Headless with `--no-sandbox` and writes `coverage-summary.json`. `scripts/karma-coverage-summary.mjs` appends the totals to the GitHub step summary. Karma only instruments files the specs actually load, so these totals are not whole-app coverage. Measured totals are finance 61.46 / 53.32 / 57.12 / 63.53 and site 62.72 / 48.48 / 56 / 64. Thresholds sit about 1 point below those totals:

| App | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| Finance | 60 | 52 | 56 | 62 |
| Site | 61 | 47 | 55 | 63 |

## Playwright

`make e2e` builds the finance app with `--base-href /finance/`, writes the release manifest, and serves `dist/finance-app/browser` at `http://127.0.0.1:4173/finance/`. That is the same prefix the production image uses, so a broken base href fails this job. `SuiteLocationStrategy` keeps `/auth` and `/hub` outside the prefix, and `scripts/serve-spa.mjs` serves the shell for those paths. Extensionless routes fall back to `index.html`. A missing `.js` or `.css` file is a 404, and a bad percent-escape is a 400.

`syntheticVault` unlocks to `/hub` and then opens the requested route. `/login` is not treated as a successful unlock. Legacy links that rewrite the query pass the final URL (`/spending?t=imports` becomes `/spending?t=activity&receipts=1`). Navigation waits for that URL and for the route heading, because `pushState` updates the address before Angular has routed. The receipt-undo spec waits for the Undo button. The imports route already opens the disclosure, and clicking the summary toggles it shut.

`npm run e2e` in `apps/finance/frontend` still uses `ng serve` at `/`. The container route check stays `make docker-build && make test-suite-routes` (`python -m apps.server.checks`).

Traces and screenshots are kept on failure (`trace: retain-on-failure`, retries stay 0). CI uploads `test-results` and `playwright-report` when the job fails. Playwright's browser download is cached on the `@playwright/test` version and shared by the e2e job and the image job. A cache hit installs operating-system dependencies only.
