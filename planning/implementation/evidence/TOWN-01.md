# TOWN-01 — implementation evidence

- Leaf issue and parent(s): [#249](https://github.com/Vivekpsps3/vivek-monorepo/issues/249) TOWN-01. Parent [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81) stays open.
- Agent/context, branch/worktree: Cursor Grok, `agent/town-01`, `/tmp/vivek-town-01`.
- Base main SHA, current tested SHA: base `08be484ba3b3535dbcb500749245f2e75ee1f2e4`. Commands below ran on that base plus the Town seed, allowlist, and spec edits in this commit, before the commit. System Node is 20.20.2; the commands used Node 24.22.1. Python was the repo `.venv` (3.12.3). Chromium was `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`.
- Fresh-main/prerequisite/active-PR checks: the worktree started at `08be484ba3b3535dbcb500749245f2e75ee1f2e4`. VER-02 is on this base (orphan specs fail the fast check). UX-02 is on this base (PR #288): Town and World each have one `main` and one page heading, and Town's header is inside `main`. PR #193 is already merged. The claim comment is already on #249. The activated specs assert that landmark. Town and World styles were not changed.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| HARNESS1 | `seed=town`, `seed=town-empty`, and user 2's `Other's habit` on both. Server clock starts at `2026-10-29T19:00:00Z` and the browser zone is `America/Los_Angeles`. Reset restores that instant. DST check-in uses `2026-11-01T19:00:00Z` and keeps calendar day `2026-11-01`. The signed-in DOM does not contain `Other's habit` or `Other User`. | PASS | `npx playwright test --config apps/web/e2e/playwright.config.ts` JSON stats `expected: 67, skipped: 0, unexpected: 0, flaky: 0`. Town files: `town.spec.ts` 6, `town-checkin.spec.ts` 5, `town-dialogs.spec.ts` 4, all passed, none skipped. |
| HARNESS2 | Four workers (indexes 0–3) each start the existing ephemeral server on port 0 with its own temp database and session. Finance, Travel, Media, Town, and suite stay selected. | PASS | Same run used workers 0, 1, 2, and 3 and passed. Discovery guard: finance 34 files, travel 20, media 13, town 8, suite 4, status `listed-not-executed`. Root `--list` JSON: `expected: 0, skipped: 554` across finance 247, travel 144, media 72, town 67, suite 24. Listing was not treated as execution. |
| HARNESS3 | The three legacy files are in `townTestMatch`. `test.fixme` is gone from those files. `--list` discovers the same 67 cases the run executes. | PASS | Town config `--list` JSON: `expected: 0, skipped: 67`. Execution JSON: `expected: 67, skipped: 0, unexpected: 0`. Executed Town cases: 15. Zero `test.fixme` in `apps/web/e2e/town.spec.ts`, `town-checkin.spec.ts`, and `town-dialogs.spec.ts`. |

Journeys that executed: founding from the empty seed, check-in and Undo, one level-up toast, reduced motion, visibility refetch across the local date, a real `day_out_of_window` toast, history's yesterday mark, archive keeping the town XP line, cadence pending copy, locked-lot tab order, layout and contrast, and the second-owner privacy checks. `pixels-settings.spec.ts` stays not-run for UX-01 (#259).

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| `test.fixme` on the three Town files, and the TOWN-01 rows in `ownedExclusions` | `apps/web/e2e/town.spec.ts`, `town-checkin.spec.ts`, `town-dialogs.spec.ts`; `tests/e2e/discovery.mjs` | the same specs, selected by `townTestMatch` | removed the exemptions and the three exclusion rows | HARNESS3 executed counts; discovery notes only the UX-01 settings file |
| Dormant "waiting for TH1" fixture comments | the three specs | `tests/e2e/server.py` `seed_town` and the existing `/e2e/town/clock` | comments removed after the seeds and clock passed | HARNESS1 |
| Duplicate fixed-port Town server | none on this base; `tests/e2e/server.py` already binds the owning socket with port 0 | `tests/e2e/fixtures.ts` worker plus that socket | not reintroduced | workers 0–3 passed without a shared port, database, or session |

- Candidate class and protected counterexamples: duplicate live setup that had already moved to the worker socket, plus stale exemptions. Pixels, World, Finance, Travel, and Media projects stay selected. The Finance external-server debug path in the shared fixture stays; it is not a Town server.
- Comparison base SHA and full replacement closure: `08be484ba3b3535dbcb500749245f2e75ee1f2e4`. Closure: `tests/e2e/server.py`, `tests/e2e/discovery.mjs`, the three Town specs, `scripts/check-e2e-discovery.test.mjs`, `docs/QUALITY.md`, this evidence file.
- Production added/deleted/moved: 0 / 0 / 0. No application source changed. Comments and blank lines in the fixture are not production.
- Independent equivalent implementations before/after: one worker-owned server before and after. Town seeds were missing; they now live on the existing reset route. The three-file exemption is gone.
- State/cache owners and public entry points before/after: one ephemeral database, session, and clock box per server process. `/e2e/reset` and `/e2e/town/clock` stay the entry points. Reset on the town suite restores `2026-10-29T19:00:00Z`.
- Remaining old symbol/path search: no `test.fixme` in the three Town files. `ownedExclusions` still names only `pixels-settings.spec.ts`.
- Follow-up change: UX-01 still owns `apps/web/e2e/pixels-settings.spec.ts`. Parent #81 stays open.
- Tests/docs/generated changes separately: `tests/e2e/server.py` +94/−20, the three specs +80/−24, `tests/e2e/discovery.mjs` +3/−23, `scripts/check-e2e-discovery.test.mjs` +12/−14, `docs/QUALITY.md` +2/−2. Generated bundles and Playwright output are not committed.
- Net production delta: 0. The fixture growth is the seed the journeys require. It is not a second harness.
- No behavior/data/meaningful assertion silently removed: layout, contrast, focus, streak, yesterday, archive XP, cadence copy, and toast assertions remain. Locators that no longer matched one element now target the buildings list, the lot, or the Today check button. The founding title is the empty-state text; the page heading is the single `h1` inside `main`, which is the UX-02 landmark.

## Verification

Local execution only. CI, merge, and deployment had not run when these commands finished.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Discovery guard ok. Town lists 8 files. Only `pixels-settings.spec.ts` is not-run. 15 node tests passed. |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0, matching baseline. Engine purity passed. |
| `make typecheck-web` | PASS. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 645 SUCCESS. Statements 81.72% (5045/6173), branches 68.27% (1894/2774), functions 80.98% (1031/1273), lines 85.27% (4396/5155). |
| `make build-frontends` | PASS. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. JSON `expected: 67, skipped: 0, unexpected: 0, flaky: 0`. Workers 0–3. |
| `npx playwright test --project=suite` | PASS. 24 passed. |
| `make lint-python` | PASS. 212 files formatted. Ruff 101 and suppressions 0 match baseline. |
| `make typecheck-python` | PASS. mypy 87 findings match baseline. |
| `./scripts/coverage-gate.sh server` | PASS. 874 passed, 2 xfailed. Total coverage 80.63% (floor 61.53%). |

Town config `--list` JSON was `expected: 0, skipped: 67` and was not counted as a run. Root `--list` JSON was `expected: 0, skipped: 554`.

## Handoff

- PR URL (leaf closure keyword only): filled in the commit that follows `gh pr create`. `Closes #249`. Parent #81 is referenced and not closed.
- Roadmap #134 append-only status-note URL: added after the squash lands. The roadmap body was not edited.
- Merged/activation status: not merged at the time of the local commands. Not deployed.
- Remaining external prerequisites or approved scope decisions: none for this leaf. #81 stays open. UX-01 still owns the settings spec.
- Next actor: merge the pull request after `origin/main` is current, then remove this worktree.

Issue / parent / local packet: TOWN-01 / #249 / #81 / `planning/implementation/issues/TOWN-01.md`.

Branch, worktree, base main SHA, current SHA: `agent/town-01`, `/tmp/vivek-town-01`, base `08be484ba3b3535dbcb500749245f2e75ee1f2e4`.

Owned files and conflict groups: `browser-fixture-core`, `town-browser`, `test-discovery`. World controller source, Media providers, Finance vault API, and Finance recurring editors were not edited.

Completed acceptance rows with direct evidence: HARNESS1, HARNESS2, and HARNESS3 PASS, as in the table above. Executed Town tests: 15. Zero `test.fixme` remains on the three Town files.

Unfinished/failed rows and exact next action: none in this leaf.

Deletion ledger and current consumer migration: the three files now run through the existing worker fixture. The fixed-port path stays absent. `pixels-settings.spec.ts` stays excluded for UX-01.

Commands run, results, tested SHA; required checks still pending: see Verification. Every required local command passed.

PR and roadmap note URLs; actual merge/deployment/activation state: pull request not opened yet. Not merged. Not deployed.

External prerequisites and next actor: open the pull request, merge `origin/main` if it moved, squash-merge, then append the #134 note and remove `/tmp/vivek-town-01`.

No unstated decision from the previous context is necessary to continue.
