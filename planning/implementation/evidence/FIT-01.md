# FIT-01 — implementation evidence

- Leaf issue and parent(s): [#431](https://github.com/Vivekpsps3/vivek-monorepo/issues/431) FIT-01. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90), and roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stay open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/fit-01`; `/tmp/vivek-fit-01`. The shared checkout was not edited. Travel (`/tmp/vivek-tux-10`) and the Town scene (`/tmp/vivek-scene-01`) were not edited.
- Base main SHA, current tested SHA: base `d3f526bae4e38346cbf29452be89b1e6c7b8356e` (HEAL-04 merge, pull request #549). `git fetch origin main` on 2026-11-20 still returned that SHA before these commands. The implementation and these command results are `1f4a1f2bec40da3aba260f20e8d353568559b9f2`. This sentence names that commit; the follow-up only edits this evidence file.
- Fresh-main/prerequisite/active-PR checks: HEAL-01 is present on that base as the Health entry shell, `HealthStoreService`, clinic and gym routes, and `planning/implementation/evidence/HEAL-01.md`. Issue #427 is already closed. At claim time the open pull requests were #550 (`agent/tux-10`) and #551 (`agent/scene-01`). Neither touches `health_workouts`, vault collection policy, or the Health store. #431 was open.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIT-01-A1 | A stat and personal-record backup restores those ciphertexts with `health_workouts` count 0. A backup that also contains a workout restores that ciphertext with them. Another owner's snapshot stays equal. The gym journey saves a session, deletes it, replace-restores the backup, and compares ciphertext bytes. | PASS | `test_fit01_existing_backup_restores_prs_stats_and_workouts_unchanged` in `test_vault_restore.py`. `apps/web/e2e/health-entry.spec.ts` at 1280×800 and 390×844. |
| FIT-01-A2 | An empty name stays focused and writes nothing. A 40,000-character note stays in the draft, shows the size message, and does not upsert. The store rejects that note, a 201st custom exercise, and a 21-set record before encrypt. A late or other-owner response writes no workout row. | PASS | `workout.spec.ts`, `health-store.service.spec.ts`, `health-room.component.spec.ts`, and the same Town Playwright journey. |
| FIT-01-LIFE | Escape keeps the typed name and returns focus to Add session. A failed upsert keeps the draft. An owner change while an upsert is held clears the draft and publishes no workout. Lock and room change clear the private draft. Clinic text does not show the workout name. | PASS | `health-room.component.spec.ts` escape, failed save, and held upsert. Town Playwright escape, empty-name return, and locked gym text. |
| FIT-01-VIEW | 1280×800 light keyboard and 390×844 night touch, reduced motion. Name, load, reps, Save, and Cancel are at least 44 px. The session label matches the stored kilograms after the pounds display, and the kilogram control does not rewrite ciphertext. Axe serious and critical violations on the room are empty. | PASS | `apps/web/e2e/health-entry.spec.ts` both viewports, including vault snapshots and axe. |

Kinds are exercise, routine, and session. Canonical units are kilograms, metres, and seconds. Display preferences do not rewrite stored values. Sessions keep an exercise-type and name snapshot. `health_prs` ciphertext and revision stay unchanged when a workout is saved or rejected. Schema version stays 2. There is no second store, no new crypto protocol, and no plaintext workout endpoint. Finance treats `health_workouts` as foreign. The public health barrel stays stage-only.

Fixtures are synthetic. Names used here are “Synthetic press”, “Synthetic plan”, and `WORKOUT_DRAFT_MARKER`. Existing Health fixtures still say “Squat”. No personal workout, name, or vault material was added to tests, logs, or the issue.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior workout collection, editor, or plaintext workout endpoint. | None. Gym listed personal records from `health_prs` only. | `health_workouts` on the existing Health owner subset and recovery union. `HealthStoreService` and the gym room. | Nothing was deleted. Personal records stay in `health_prs`. The new records use the same vault upsert, list, and restore staging. | `git diff d3f526bae4e38346cbf29452be89b1e6c7b8356e` adds the collection name to the existing policy, store, and gym room. `test_vault_health_collections.py` still wipes stats, personal records, and workouts together. |

- Candidate class and protected counterexamples: feature. No prior workout implementation, so none was deleted. Preserved: `health_prs` behavior, corrupt-row retention, schema version 2, expected revisions, the Health recovery union (no third list), and the HEAL clinic and gym journeys.
- Comparison base SHA and full replacement closure (including new files): `d3f526bae4e38346cbf29452be89b1e6c7b8356e`. New production files are `workout.ts` and `health-workout-dialog.component.ts`, `.html`, and `.css`. Changed production files are `encrypted_storage.py`, `encrypted-store.persistence.ts`, the health room component, template, and CSS, `health-store.service.ts`, `health-validate.ts`, and `health.constants.ts`.
- Production added/deleted/moved; comments/blank-only churn separately: production numstat is +1049/−19, net +1030. That is `workout.ts` +462, the dialog +304, the room +158/−4, the store +106/−12, constants +14, validation +3/−2, the Finance foreign name +1, and the server owner set +1/−1. Blank-only lines are not split out.
- Independent equivalent implementations before/after: 1 / 1 encrypted Health store. 1 / 1 recovery membership (finance union health). 0 / 1 workout collection. 0 / 1 workout editor.
- State/cache owners and public entry points before/after: `HealthStoreService` still owns `health_stats` and `health_prs`, and now lists `health_workouts`, at schema version 2. The workout draft lives on the gym room and clears on lock, owner change, session clear, destroy, and a successful save that the user did not edit again. `openVaultRecords` is unchanged. The public stage barrel does not export workout records.
- Remaining old symbol/path search, including config and discovery: `rg` for a workout route or a second health store finds this collection only. Town e2e discovery still lists 14 files. `health-entry.spec.ts` stays inside the Town project. No passphrase UI was added under `apps/web/src/app/town/`.
- Follow-up change: which production files and independent policy owners now need editing: none in this leaf. FIT-02 owns resume and revision conflict. No queue, parent ledger, or `quality/coverage.txt` pin was edited.
- Tests/docs/generated changes separately: tests +813/−15, net +798, including Town Playwright +229, the room spec +177/−1, the store spec +152/−4, `workout.spec.ts` +145, and the restore test +65. Docs are `FEATURES.md` +1/−1, Town `AGENTS.md` +3/−5 (294 words), and this evidence file. No generated bundle is committed. `make build-frontends` exited 0. Release `6e4d894501c1ae2dd70c2b6f16c104ac1123aa93638f674a4207531c1d828e0a`. `make e2e` rebuilt that same release id. The existing initial-bundle warning remains (678.88 kB against the 650 kB warning budget). The budget was not raised.
- Net production delta and specific reviewed safety/compatibility exception if positive: +1030 production lines. This is the feature: one encrypted collection, three kinds, validation, recovery, and the gym registration screen. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Existing clinic, personal-record, corrupt-row, and history journeys in `apps/web/e2e/health-entry.spec.ts` passed with the new test. The five skipped Finance Playwright tests are existing Finance specs this leaf does not change.

## Verification

Commands ran in `/tmp/vivek-fit-01` against the working tree that became `1f4a1f2bec40da3aba260f20e8d353568559b9f2`. Python commands used `PATH="/tmp/vivek-fit-01/.venv/bin:$PATH"` because the Makefile calls `python3` and the worktree `.venv` is a symlink to the shared virtualenv. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` is a symlink to the shared install. Neither the symlink nor the virtualenv is committed.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-fit-01/.venv/bin:$PATH" make test-fast` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS. Doc paths OK. Town AGENTS.md was 294 words on that commit. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. Town e2e discovery listed 14 files. Suite discovery listed 12. Finance 49, travel 32, and media 27 were listed and not executed. Shared boundaries OK. |
| `make lint-web` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. No baseline was raised. |
| `make typecheck-web` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS. `tsc --noEmit` for web app, web spec, finance app, finance spec, packages, site app, and site spec. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS. 508 SUCCESS. Statements 75.34% (7562/10036). Branches 61.86% (3180/5140). Functions 76.18% (1513/1986). Lines 80.13% (6567/8195). |
| `PATH="/tmp/vivek-fit-01/.venv/bin:$PATH" make build-frontends` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS. Output `/tmp/vivek-fit-01/dist/web`. Release `6e4d894501c1ae2dd70c2b6f16c104ac1123aa93638f674a4207531c1d828e0a`. Initial total 678.88 kB. Exit 0. The 650 kB warning was not treated as a failure and the budget was not raised. |
| `PATH="/tmp/vivek-fit-01/.venv/bin:$PATH" npx playwright test --config apps/web/e2e/playwright.config.ts` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS. 143 passed (2.8m), including the workout save, restore, and oversized-record journey at both viewports. |
| `PATH="/tmp/vivek-fit-01/.venv/bin:$PATH" npx playwright test --project=suite` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS on the isolated rerun. 61 passed (46.8s). An earlier run beside the other gates failed two Settings calendar cases (`urls[1]` was undefined). That spec is unchanged. The isolated rerun passed. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS. 521 SUCCESS. Statements 63.39% (7777/12267). Branches 49.51% (3445/6958). Functions 59.31% (1856/3129). Lines 66.83% (6867/10275). |
| `PATH="/tmp/vivek-fit-01/.venv/bin:$PATH" make e2e` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS. Rebuilt the frontends to the same release id, then Finance Playwright: 281 passed, 5 skipped (2.8m). The skips are existing Finance specs. |
| `PATH="/tmp/vivek-fit-01/.venv/bin:$PATH" make lint-python` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS after formatting the two Python test files that the first check named. 260 files already formatted. Ruff 90 findings match the baseline. Suppressions 6 match the baseline. No baseline was raised. |
| `PATH="/tmp/vivek-fit-01/.venv/bin:$PATH" make typecheck-python` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS. mypy: 79 findings match the baseline. |
| `PATH="/tmp/vivek-fit-01/.venv/bin:$PATH" ./scripts/coverage-gate.sh finance` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS. 160 passed. Total coverage 81.41% (3153 statements, 586 missed). Floor 81.03%. `quality/coverage.txt` still records 82.03 and was not edited. An isolated rerun measured the same 81.41%. |
| `PATH="/tmp/vivek-fit-01/.venv/bin:$PATH" ./scripts/coverage-gate.sh server` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS. 432 passed, 1 skipped. Total coverage 86.11% (floor 61.53%). The perf gate then passed 1 test. The suggested pin was not applied. |
| `python3 scripts/check_collection_policy.py` | `1f4a1f2bec40da3aba260f20e8d353568559b9f2` | PASS. Collection policy parity passed. |

Travel Playwright, Media Playwright, site Karma, Travel coverage, and Media coverage were not run. The diff does not change those screens. `python3 planning/implementation/plan.py launch FIT-01` was run from this worktree before the product edit. Its docs, web_front, finance_front, finance_back, and server_back profiles are the commands in the table.

`origin/main` moved to `58b055a920e34ee0533fff4205585d9be9fb66f4` (SCENE-01, pull request #551) before push. That merge kept the Reading Hall paragraph and added the gym sentences. `./scripts/check-doc-paths.sh` then passed with Town AGENTS.md at 300 words. No Town scene file was edited by this leaf.

## Handoff

- PR URL (leaf closure keyword only): not opened yet.
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: #304, #90, #134, and #277 stay open. This leaf does not deploy.
- Next actor: open the pull request, wait for green required checks, then merge with a merge commit.
