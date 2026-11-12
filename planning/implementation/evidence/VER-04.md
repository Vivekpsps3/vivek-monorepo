# VER-04 — implementation evidence

- Leaf issue and parent(s): [#212](https://github.com/Vivekpsps3/vivek-monorepo/issues/212). Parents [#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199) and [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125) stay open.
- Agent/context, branch/worktree: VER-04 implementer, branch `agent/ver-04`, worktree `/tmp/vivek-ver-04`.
- Base main SHA, current tested SHA: base `04a5dac19356b3a6e6871a920b34fce0b843d08d`. Product commit `48d9c035a7aa8ca3af0b052da90126a805297fab`. Gates below ran on that diff before the commit; this handoff URL line is the only later edit.
- Fresh-main/prerequisite/active-PR checks: `HEAD` matched `origin/main` at `04a5dac19356b3a6e6871a920b34fce0b843d08d`. Ancestors already on main: VER-01 #209 squash `9aa01242fbb6dc6cd5040a4e39babff2c0c187b1`, VER-02 #210 squash `ab365b629ec9bd0d4969b76908bd542f36467a81`, VER-03 #211 squash `71d293aa6b9323b4bf9007c4db28b90540b6acd5`. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/212#issuecomment-6811862581

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | `LOCAL1: verify-fast owns each gate once and the release manifest is not a second command` in `scripts/verification-ownership.test.mjs`. `make test-fast` names `scripts/test-release-manifest.mjs` once. `verify-fast` calls `test-fast`, `test-backend`, and `test-frontend` once and does not call `make test`. `plan.py launch VER-04` prints `make test-fast` once and does not print a second manifest command. CI `make test-fast` is the one workflow owner; `.github/workflows/ci.yml` was not given a second step. | PASS | `make test-fast` (21 node tests, 0 fail; unittest 98 OK). Launch output lists `make test-fast` once. |
| LOCAL2 | Same machine, source base `04a5dac`, Chrome headless via `CHROME_BIN`. Warm site Karma: `npm test --prefix apps/site` 3.81s then 3.57s; `npm run test:site` 3.58s then 3.51s. Both 15 SUCCESS. Coverage statements 92.17% (106/115), branches 64.7% (22/34), functions 83.33% (20/24), lines 93.2% (96/103). The prefix hop is the removed repeat. `make test-fast` before the manifest was owned: 15.93s, 15 node tests. After: 21.52s, 21 node tests. The increase is the new ownership, isolation, and manifest failure-path tests. Assertions and coverage floors were not dropped. Finance Karma was not timed. | PASS | Same-machine table in this file. Site runs used Karma port 10001 only for timing; `apps/karma.conf.js` was reverted and is not in the diff. |
| LOCAL3 | `LOCAL3: concurrent workers keep isolated databases and sessions, and a failure is not retried`. Two travel `tests/e2e/server.py --suite travel --port 0` processes at once: different origins, different `site.db` directories, both `synthetic` on `GET /api/auth/me`. POST legacy username changes only the first process. Killing the first leaves the second `/travel/api/health` ok. A nested failing `node --test` exits non-zero twice (`# fail 1`, one `not ok`, no retry). Invalid `--suite nope` exits non-zero twice. `config.ts` workers 4, retries 0. `playwright.config.ts` retries 0. | PASS | The LOCAL3 test inside `make test-fast`. |
| LOCAL4 | `LOCAL4: release and deploy still match job and step names, and trust stays read-only`. Job `Unified Site Release`, step `Seeded schema rehearsals`, deploy jq `| last // ""` (a later failure beats an earlier success). Workflow `contents: read` with no `contents: write`. Deploy `contents: read` and `actions: read`, `environment: production`, `monorepo-prod`. Fork fallback stays `ubuntu-latest`; trusted same-repo and push stay `monorepo-ci` / `monorepo-ci-release`. Playwright copies `/opt/ci-dist` when the bundle exists, fails closed on a self-hosted miss, and runs `make build-frontends` only on the non-self-hosted miss. `make docker-build`, `make test-suite-routes`, and `make db-validate-seeded` passed. | PASS | LOCAL4 test inside `make test-fast`, plus the three ops commands below. |

`performance stays a separate uninstrumented server gate and coverage floors stay put` locks `coverage-gate.sh` (`-m "not perf"`, `--cov-fail-under`) and `perf-gate.sh` (`-m perf`, no `--cov`). Floors stay finance 83.28, travel 80.41, media 70.60, server 61.53. Pytest collect of `test_town_perf.py`: `-m perf` includes `test_get_town_p50_stays_under_600ms`; `-m "not perf"` collects nothing (exit 5).

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Makefile `npm test --prefix` for Finance and site Karma. That hop re-invoked the same `ng test` CI already runs via `npm run test:finance` and `npm run test:site`. | `make test-frontend` only. `apps/finance/frontend/package.json` and `apps/site/package.json` still forward `npm test --prefix` to those root scripts. AGENTS.md, QUALITY.md, and DEVELOPMENT.md still document the prefix form. | `npm run test:finance`, `npm run test:site`, and `npm run test:web` in `make test-frontend`. | Makefile invocations moved to the root scripts. Package forwarding scripts retained so the documented prefix commands still work. `test-frontend-quick` stays a non-gate and still sets `SUITE_KARMA_COVERAGE=0`. | LOCAL1 asserts the Makefile has no `npm test --prefix` and names each `npm run test:*` once. Warm site timings above: same 15 SUCCESS and the same coverage. |
| `package.json` script `test:release-manifest` (`node scripts/test-release-manifest.mjs`) and the ops profile line `node scripts/test-release-manifest.mjs`. No other caller. Direct `node file.mjs` and `node --test file.mjs` both execute the `node:test` cases once; a second npm script was a second entry, not a different check. | `package.json` and `planning/implementation/verification.json` `ops`. | One `node --test` argument inside `make test-fast`, which CI Backend already runs. | Script key removed. Ops profile line removed so `plan.py launch VER-04` does not schedule a second run. The fixture file remains and now includes the missing-bundle failure repeated once. | LOCAL1. Direct `node scripts/test-release-manifest.mjs` after the rewrite: 2 pass, 0.18s. Launch prints `make test-fast` once and does not print `test-release-manifest`. |

- Candidate class and protected counterexamples: duplicate project invocation and a forwarding script with no distinct behavior. Not removed: finance/site package.json `test` wrappers (documented prefix commands and QUALITY.md, which this leaf does not edit); Playwright domain configs and `make e2e` (targeted finance browser run after `build-frontends`) versus `npm run e2e` (all projects, no build); the Playwright self-hosted missing-bundle failure and the non-self-hosted `make build-frontends` fallback; eslint-world-engine (baseline 0) even though its path sits inside the finance eslint scope; identity modules in the finance coverage denominator; perf as a separate uninstrumented server gate.
- Comparison base SHA and full replacement closure (including new files): `04a5dac19356b3a6e6871a920b34fce0b843d08d`. Closure: `Makefile`, `package.json`, `docs/VERIFICATION.md`, `planning/implementation/verification.json`, `scripts/test-release-manifest.mjs`, `scripts/verification-ownership.test.mjs`, this file. `ci.yml`, `scripts/coverage-gate.sh`, `scripts/perf-gate.sh`, `tests/e2e/*`, `quality/coverage.txt`, and `apps/karma.conf.js` were read and left unchanged.
- Production added/deleted/moved; comments/blank-only churn separately: Makefile recipe edits +6/−5 (two Karma lines moved to the existing root scripts; one node `--test` line gained the manifest and ownership files; verify-fast comment names the manifest and the non-gate). `package.json` −1 script line. No application module was added or moved.
- Independent equivalent implementations before/after: one canonical local path, `make verify-fast`. `make test` stays the test-only subset and reaches the manifest only through `test-fast`. The release writer is still `scripts/write-release-manifest.mjs`.
- State/cache owners and public entry points before/after: each Playwright worker still starts `tests/e2e/server.py --port 0` with its own sqlite directory and synthetic session. CI still builds the frontend once and copies `/opt/ci-dist/${GITHUB_SHA}/web` on the self-hosted runner. Deploy still requires the last `Seeded schema rehearsals` conclusion.
- Remaining old symbol/path search, including config and discovery: `test:release-manifest` is gone from `package.json`. `node scripts/test-release-manifest.mjs` remains a valid direct run of the same two tests; it is not a scheduled gate. `npm test --prefix` remains in the finance and site package.json files and in docs this leaf does not own.
- Follow-up change: which production files and independent policy owners now need editing: a new required script check is added to the `make test-fast` `node --test` line and to LOCAL1. QUALITY.md still describes the prefix wrappers; they still work, so no QUALITY.md edit was required. Parents #199 and #125 stay open.
- Tests/docs/generated changes separately: `scripts/test-release-manifest.mjs` +58/−38. `scripts/verification-ownership.test.mjs` +368. `docs/VERIFICATION.md` +1/−1. `planning/implementation/verification.json` +1/−1. This evidence file is the new planning doc. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: Makefile and package.json are entrypoints, not application code. Net package.json is one removed script. The Makefile grew by one line because the node list and the verify-fast comment grew. That is the ownership wire, not a feature. Coverage floors, lint baselines (ruff 101, mypy 87, eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0, suppressions 6), retries, and instrumentation were not lowered.
- No behavior/data/meaningful assertion silently removed: the production and development manifest cases still run, and a missing bundle now fails twice with `ENOENT`. Karma suites, coverage gates, and the seeded adopt/upgrade rehearsal still run. `test-frontend-quick` remains available and is not a gate.

## Verification

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch VER-04` | prints `make test-fast` once, then `make lint-python`, `make typecheck-python`, `make docker-build`, `make test-suite-routes`, `make db-validate-seeded`. No standalone manifest command. |
| `make test-fast` | PASS. First product diff 21.52s, unittest 98 OK, node 21 pass, duration_ms 4545.91. CI Backend on `9b285c0` failed: the runner printed spec `ℹ fail 1` instead of TAP `# fail 1`. The nested check now uses `--test-reporter=tap` and still requires one failure and no retry. Re-run after the pin: PASS, 23.74s, unittest 98 OK, node 21 pass, 0 fail, duration_ms 5550.66817. |
| `node scripts/test-release-manifest.mjs` | PASS. 2 pass, 0.18s. Direct run still executes once. Not a second scheduled gate. |
| `make lint-python` | PASS. 226 files formatted. ruff 101. suppressions 6. |
| `make typecheck-python` | PASS. mypy 87. |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0, engine-purity 1 pass. |
| `npx tsc -p packages/tsconfig.json --noEmit` | PASS. |
| `make docker-build` | PASS. 90.32s. Image `personal-site:development`. Writer printed release `32cd30d0298d7bba5ea57a2d308b0a6c13a3b8d79e3f831a505743fbd30ddfe7`. |
| `make test-suite-routes` | PASS. 5.38s. `Unified checks passed`. |
| `make db-validate-seeded` | PASS. 60.09s. Adopt and upgrade. `upgrade schema diff is empty`. Event `seeded_rehearsals`. |

`apps/karma.conf.js` has no port edit. Karma was timed only for LOCAL2 and was not a required gate for this diff: no spec, screen, or coverage floor changed. The timed site runs used port 10001 and that edit was reverted before commit. No suite was skipped, relabelled, or given a lower gate.

Same-machine LOCAL2 table (this host, base `04a5dac`, warm Karma cache):

| Invocation | Wall clock | Assertions |
| --- | --- | --- |
| Warm `npm test --prefix apps/site` | 3.81s, then 3.57s | 15 SUCCESS, coverage 92.17/64.7/83.33/93.2 |
| Warm `npm run test:site` | 3.58s, then 3.51s | 15 SUCCESS, same coverage |
| `make test-fast` before manifest ownership | 15.93s | 15 node tests, unittest 98 OK |
| `make test-fast` after | 21.52s | 21 node tests, unittest 98 OK |
| Standalone manifest before node:test conversion | 0.11s | writer checks passed |
| Direct manifest after conversion | 0.18s | 2 pass |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/355 (`Closes #212` only)
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6812207655
- Merged/activation status (actual evidence, not assumption): PR #355 is open on `agent/ver-04`. Not squash-merged and not deployed. Local gates above passed.
- Remaining external prerequisites or approved scope decisions: finance and site `npm test` wrappers stay because documented prefix commands still call them. Playwright rebuild fallback and perf separation stay. Parents #199 and #125 stay open.
- Next actor: push `HEAD:agent/ver-04`, open the PR, append the #134 note, watch Backend, Frontend, Unified Site Release, and Playwright, then squash-merge. Record the squash SHA on #212 and #134. Do not close #199.
