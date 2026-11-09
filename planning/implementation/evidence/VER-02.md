# VER-02 — implementation evidence

- Leaf issue and parent(s): [VER-02](../issues/VER-02.md) / [#210](https://github.com/Vivekpsps3/vivek-monorepo/issues/210). Parents [#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199) and [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125) stay open.
- Agent/context, branch/worktree: Cursor Grok, `agent/ver-02`, `/home/vivek/Deployments/worktrees/vivek-ver-02`
- Base main SHA, current tested SHA: base `63bc975ede08967e61c50f78b25176b07dc07d18`. Tested code SHA `b3325eb29c409b49ed8f7fe28cec1b74b79e7771`. Branch HEAD after the evidence and URL record is the commit that last touches this file. That docs change does not alter the tested code.
- Fresh-main/prerequisite/active-PR checks: `origin/main` is `63bc975ede08967e61c50f78b25176b07dc07d18`. VER-02 has no queue dependency. PR #193 is merged at `495d698aedac5c544119c30c9405c810f8038cba` and is an ancestor of this base. No open pull requests. [#210](https://github.com/Vivekpsps3/vivek-monorepo/issues/210) already had the claim comment for this branch. [#249](https://github.com/Vivekpsps3/vivek-monorepo/issues/249) (TOWN-01) and [#259](https://github.com/Vivekpsps3/vivek-monorepo/issues/259) (UX-01) are open.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | Disposable `apps/web/e2e/orphan-journey.spec.ts` beside a selected `pixels-year.spec.ts`, with the Town allowlist and no exclusion entry | PASS | `node --test scripts/check-e2e-discovery.test.mjs` fails the guard with `orphan spec outside active selector: project=town path=apps/web/e2e/orphan-journey.spec.ts`. The report does not say passed. |
| LOCAL2 | Empty intended project `vacant` with test directory `apps/vacant/e2e` | PASS | Same test file. Guard fails with `intended project vacant discovered zero tests`. |
| LOCAL3 | Town/settings gaps keep owners. A fixture exclusion with an empty owner fails. | PASS | Live guard output names TOWN-01 `#249` for `town.spec.ts`, `town-checkin.spec.ts`, and `town-dialogs.spec.ts`, and UX-01 `#259` for `pixels-settings.spec.ts`, each `not-run`. `--list` on the root config, before and after the change, omits those four files and selects the same 75 files. List stats were `expected: 0`, `skipped: 514`, `unexpected: 0`. That skipped count means listed and not executed. An ownerless exclusion fixture fails with `exclusion has no owner`. |
| LOCAL4 | TOWN-01 and UX-01 have merged, and their journeys are discovered and executed on the current projects | NOT RUN | [#249](https://github.com/Vivekpsps3/vivek-monorepo/issues/249) and [#259](https://github.com/Vivekpsps3/vivek-monorepo/issues/259) are open and not merged. Those four specs stay outside the Town allowlist. This leaf does not mark LOCAL4 passed. |

`--list` inventory at base and at `b3325eb29c409b49ed8f7fe28cec1b74b79e7771` (file sets identical, drift 0):

| Project | Files | Listed tests | Status in this leaf |
| --- | ---: | ---: | --- |
| finance | 33 | 246 | listed-not-executed |
| travel | 20 | 144 | listed-not-executed |
| media | 13 | 72 | listed-not-executed |
| town | 5 | 28 | executed by `npx playwright test --config apps/web/e2e/playwright.config.ts` (28 passed). The five files are `hub-pixels.spec.ts`, `pixels-detail.spec.ts`, `pixels-life.spec.ts`, `pixels-year.spec.ts`, `world.spec.ts`. |
| suite | 4 | 24 | executed by `npx playwright test --project=suite` (24 passed) |

Owned omissions, absent from both `--list` and the executed runs:

| Path | Owner | Issue | Status |
| --- | --- | --- | --- |
| `apps/web/e2e/town.spec.ts` | TOWN-01 | #249 | not-run |
| `apps/web/e2e/town-checkin.spec.ts` | TOWN-01 | #249 | not-run |
| `apps/web/e2e/town-dialogs.spec.ts` | TOWN-01 | #249 | not-run |
| `apps/web/e2e/pixels-settings.spec.ts` | UX-01 | #259 | not-run |

Phone and desktop skips inside selected Finance files (`activity.spec.ts`, `suite-v2-a11y.spec.ts`) stay in those selected files. Travel `native.spec.js` and Media `native.spec.ts` stay selected. They are not whole-journey exclusions.

The guard reads [tests/e2e/discovery.mjs](../../../tests/e2e/discovery.mjs) directly. It does not start Playwright, so `make test-fast` still runs in the backend CI job that does not `npm ci`. A local root `--list` was compared with the guard's file counts and matched. `--list` is discovery inventory, not execution.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Town filename allowlist in `tests/e2e/config.ts` | `domainConfig('town')`, root `playwright.config.ts` | `townTestMatch` in `tests/e2e/discovery.mjs` | Moved. One regex remains. | Root `--list` town file set unchanged (5 files). |
| Per-domain `testDir` strings and the copied suite directory in `playwright.config.ts` | Root project list and `domainConfig` | `intendedProjects` in `tests/e2e/discovery.mjs` | Moved. Root config maps that list. | `--list` paths, timeouts, and retries unchanged. Suite still has no project timeout override (root 60s). Retries stay 0. |
| Implicit omission of the four Town/settings specs | None. They were simply unmatched. | `ownedExclusions` in `tests/e2e/discovery.mjs` | Retained as explicit owned exclusions. | Guard prints `not-run` with owner and issue. |

- Production added/deleted/moved: application runtime 0 / 0 / 0.
- Tests/docs/generated changes separately: harness `tests/e2e/config.ts` +4/−5, `playwright.config.ts` +19/−8, new `tests/e2e/discovery.mjs` 49 lines (the moved allowlist plus the exclusion records). Guard `scripts/check-e2e-discovery.mjs` 139 lines. Fixture tests `scripts/check-e2e-discovery.test.mjs` 137 lines. `Makefile` +2/−1. `docs/QUALITY.md` +2. This evidence file is documentation. Generated 0.
- Remaining necessary overhead and why: the guard and the four owned exclusion records are the safety check. The line increase is that check, not a second browser harness.
- No behavior/data/meaningful assertion silently removed: the selected Playwright file set is unchanged. The four omitted journeys were not enabled. Profile routes and Town fixtures were not edited. Retries stay 0.

## Verification

Commands ran on the tested code SHA above, from `/home/vivek/Deployments/worktrees/vivek-ver-02`. Chrome was used only for Karma and Playwright: `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` set to that path.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-web` | PASS |
| `make typecheck-web` | PASS |
| `CHROME_BIN=... npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS (630 SUCCESS) |
| `make build-frontends` | PASS |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$CHROME_BIN npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS (28 passed, 50.9s) |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$CHROME_BIN npx playwright test --project=suite` | PASS (24 passed, 46.0s) |
| Finance, Travel, and Media Playwright execution | NOT RUN. This leaf's web profile does not execute them. The guard and `--list` only listed them. |
| LOCAL4 execution of Town fixtures and Profile settings | NOT RUN. TOWN-01 and UX-01 are not merged. |

`make test-fast` is the single canonical wiring. The backend CI job already runs that target. No workflow step and no second Playwright project were added.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/281 (`Closes #210`). Parents #199 and #125 are referenced and stay open.
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6733190883. The issue body was not edited.
- Merged/activation status (actual evidence, not assumption): not merged. Not deployed. Not activated.
- Remaining external prerequisites or approved scope decisions: TOWN-01 (#249) and UX-01 (#259) must merge before LOCAL4 can run. Until then the four owned specs stay `not-run`.
- Next actor: reviewer for the VER-02 pull request. After merge, TOWN-01 and UX-01 select their specs and delete the matching exclusion records in the same change.

Issue / parent / local packet: VER-02, parents #199 and #125, packet `planning/implementation/issues/VER-02.md`.

Branch, worktree, base main SHA, current SHA: `agent/ver-02`, `/home/vivek/Deployments/worktrees/vivek-ver-02`, base `63bc975ede08967e61c50f78b25176b07dc07d18`, tested code `b3325eb29c409b49ed8f7fe28cec1b74b79e7771`.

Owned files and conflict groups; other active PRs checked: `browser-config`, `ci-workflow`, `test-discovery`. No open PR touched them. CI workflow file was not edited.

Completed acceptance rows with direct evidence: LOCAL1, LOCAL2, and LOCAL3 PASS, as the table above.

Unfinished/failed rows and exact next action: LOCAL4 is NOT RUN. Next action is TOWN-01 and UX-01 merging their own fixture and Profile work, then selecting the four specs and removing those exclusion rows.

Deletion ledger and current consumer migration: one Town allowlist and one project table in `tests/e2e/discovery.mjs`. `domainConfig` and the root Playwright config consume that table. The guard consumes it. No second selector remains.

Commands run, results, tested SHA; required checks still pending: see the verification table. All commands required for this leaf passed. LOCAL4 and Finance/Travel/Media browser execution were not required to pass and were not run.

PR and roadmap note URLs; actual merge/deployment/activation state: https://github.com/Vivekpsps3/vivek-monorepo/pull/281 and https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6733190883. Not merged. Not deployed.

External prerequisites and next actor: TOWN-01 and UX-01. Reviewer, then those leaf owners.

No unstated decision from the previous context is necessary to continue.
