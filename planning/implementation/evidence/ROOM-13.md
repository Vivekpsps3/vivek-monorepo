# ROOM-13 — implementation evidence

- Leaf issue and parent(s): [#463](https://github.com/Vivekpsps3/vivek-monorepo/issues/463) ROOM-13. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#256](https://github.com/Vivekpsps3/vivek-monorepo/issues/256), [#258](https://github.com/Vivekpsps3/vivek-monorepo/issues/258), and [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90) remain open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) remains open. #277 remains open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/room-13`; `/tmp/vivek-room-13`. The shared checkout was not edited. Town files outside `apps/web/src/app/town/health/`, Media, Travel, and server code were not edited. `apps/finance/frontend/src/public-api.ts` is unchanged. `apps/web/src/app/town/AGENTS.md` was left unchanged because another agent owns Town files outside health.
- Base main SHA, current tested SHA: work started from `64a9a2a28679ffa66caa3282ba5a9ce105fb79ae` (ROOM-12, pull request #572). Product and tests are `873e8301f4efca4cdad9fae4e67b80e8b8231837`. The gates below ran on that tree. This note only records that SHA.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441), HEAL-02 (#428), and HEAL-04 (#430) are merged ancestors. `git fetch origin main` before the product commit left `origin/main` at `64a9a2a28679ffa66caa3282ba5a9ce105fb79ae`. Pixel scores were not changed. Stations read `HealthStoreService` through the existing measurement editor. No second store and no new crypto protocol.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ROOM-13-A1 | Synthetic weight `hlt_SyntheticWeightEntryAB` (80 kg, 2026-10-28) plus an older 75 kg row, resting heart rate 62 bpm, blood pressure 118/76, sleep 7.25 h, and an Omega marker lab. Selecting each station and saving through the existing editor updates that row’s canonical history (weight 70 kg, heart rate 64 bpm, blood pressure 120/80, sleep 7.5 h) and leaves the other rows in place. Reception then shows those latest lines. | PASS | `health-room.component.spec.ts` corrects each vital from its station. `apps/web/e2e/health-entry.spec.ts` corrects vitals from clinic stations at 1280 light and 390 dark. Browser journey below. |
| ROOM-13-A2 | Switching pounds and kilograms rewrites the visible weight and the unit sentence. The stored ciphertext and revision stay equal across that switch, both before and after a real correction. Zoom does not write `scale`, `x`, or `y`. | PASS | The same unit spec and Town Playwright test compare vault snapshots. `health-history.spec.ts` still expects the sparkline to keep stored kilograms. |
| ROOM-13-LIFE | An empty sleep station opens Add sleep. A failed save keeps 7.25 hours and “Could not save this entry. Try again.” A held weight correction of 150 lb is dropped when the owner changes: the loading room hides 150, 176.4, and the date, and the new snapshot does not store `lbToKg(150)`. | PASS | `health-room.component.spec.ts` opens the measurement editor from an empty station and drops a late correction. The create path types the measured date before save. |
| ROOM-13-VIEW | 390×844 touch and 1280×800 keyboard, light and night (`suite-theme` light and dark), reduced motion. Locked clinic copy has no digit in visible text or input values, including a selected sleep station. Targets are at least 44 px. Axe serious and critical violations on `app-health-room` are empty. Transition duration is 0 s. After a correction, focus returns to the updated Edit button. A locked clinic does not render the gym floor. | PASS | `clinic-room.spec.ts` geometry and digit-free copy. `health-room.component.spec.ts` locked visit. Town Playwright and the browser journey below. |

Fixtures are synthetic. No real measurement, workout, transaction, or credential is used. Health digits stay off the locked room. Station copy does not give medical advice. The selected vital’s existing series, sparkline, and editor move into the inspector so `data-health-latest`, `data-health-series`, and `data-health-sparkline` stay unique. Labs and checkups stay in the ready list.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| The flat vital list inside the Clinic ready panel. No prior clinic scene. | Health room clinic route and `health-entry.spec.ts`. | `HealthStoreService` still owns `health_stats`. `buildClinicSeries` still derives latest, sparkline, and the 100-row window. | Nothing deleted. The unselected vital articles stay in Measurements. The selected vital article renders in the station inspector. Labs, checkups, and the add buttons stay. | `git show --stat 873e8301` adds the clinic scene and does not remove the store, the edit ids, or the lab folders. |

- Candidate class and protected counterexamples: vault crypto, `public-api.ts`, Pixel scores, and the Town files outside health stay.
- Comparison base SHA and full replacement closure (including new files): `64a9a2a28679ffa66caa3282ba5a9ce105fb79ae` through product `873e8301f4efca4cdad9fae4e67b80e8b8231837`. New production files: `clinic-room.ts`, `clinic-room.component.ts`, `.html`, and `.css`.
- Production added/deleted/moved; comments/blank-only churn separately: production +763/−29, net +734. Guidance is `FEATURES.md`, +1/−1, and is not in that production count. Blank-only lines are not split out.
- Independent equivalent implementations before/after: 0 / 1 clinic scene. 1 / 1 clinic history projector. 1 / 1 health store. The gym scene stays separate.
- State/cache owners and public entry points before/after: the durable clinic selection is the `object` query on `/town/clinic`. Camera zoom and pan stay in component memory. Lock or an owner change clears private rows and drafts through `dropPrivate`. `object` is not added to the vault return query, so unlock return stays entry-only.
- Remaining old symbol/path search, including config and discovery: `public-api.ts` has no diff. The health barrel `index.ts` still exports only `loadTownHealthStages`. Town e2e discovery still lists 18 files.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited. Labs and checkups remain ROOM-14.
- Tests/docs/generated changes separately: tests +474/−4. This evidence file is docs. No generated bundle is committed. `make build-frontends` and the build inside `make e2e` exited 0. Release `98aeead77007d8e71cd4913153bd2db0920e0fcbf8842056a3c6a77dad3c901f`. The initial bundle stays over the 650 kB warning budget at 680.38 kB. The budget was not raised. The health room chunk is 149.14 kB. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +734 production lines. This is the reception and four vital stations, their inspectors, and the wiring that reuses the measurement editor. The positive delta is the feature.
- No behavior/data/meaningful assertion silently removed: confirmed. Locked clinic copy stays digit-free, including “Finance is locked. Unlock to see measurements.” An unselected clinic still lists every vital. A display-unit change still does not write the vault.

## Verification

Commands ran in `/tmp/vivek-room-13` on `873e8301f4efca4cdad9fae4e67b80e8b8231837`. `make test-fast` and `make e2e` used `PATH="/tmp/vivek-room-13/.venv/bin:$PATH"`. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` set to that same Chrome. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The leaf diff has no Python product file.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch ROOM-13` | Printed the commands below. It did not edit the queue. |
| `make test-fast` | PASS. Boundaries OK. 135 Python tests OK. 21 Node script tests pass. Town e2e files are listed (18) and not executed by this gate. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 521 SUCCESS. Statements 63.39% (7777/12267), branches 49.49% (3444/6958), functions 59.31% (1856/3129), lines 66.83% (6867/10275). |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 642 SUCCESS. Statements 77.43% (10171/13135), branches 65.22% (4558/6988), functions 79.45% (2158/2716), lines 82.47% (8836/10713). |
| `make build-frontends` | PASS. Release hash above. Initial total 680.38 kB. Health room chunk 149.14 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 182 passed (3.0m). |
| `npx playwright test --project=suite` | PASS. 61 passed (2.0m). |
| `make e2e` | PASS. 281 passed, 5 skipped (2.4m). |
| `/tmp/room-13-browser` Playwright, not part of the launch list | PASS. 2 passed (12.4s). 390×844 light and 1280×800 dark, reduced motion, locked sleep station and a weight correction. Screenshots stayed in `/tmp/room-13-browser/shots` and are not committed. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/574. The body is only the leaf keyword for #463.
- Roadmap #134 append-only status-note URL: not added yet. The issue body will not be edited.
- Merged/activation status (actual evidence, not assumption): not merged when this sentence is written.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review of the stations stays separate from these passing checks.
- Next actor: wait for required checks, then merge.
