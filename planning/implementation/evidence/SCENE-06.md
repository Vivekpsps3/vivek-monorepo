# SCENE-06 — implementation evidence

- Leaf issue and parent(s): [#444](https://github.com/Vivekpsps3/vivek-monorepo/issues/444) SCENE-06. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#253](https://github.com/Vivekpsps3/vivek-monorepo/issues/253), and [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81) remain open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) remains open. #277 remains open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/scene-06`; `/tmp/vivek-scene-06`. The shared checkout was not edited. This leaf did not edit Health, Finance, Travel, Media, or server code. ROOM-11 arrived through the merge below.
- Base main SHA, current tested SHA: work started from `bcffbb260ec23b464dfb80f6f91f434ccd218fab` (SCENE-10, pull request #569). Product and tests are `e9ace8e5662dd32cf20893dd5d56026ae4a0d182`. The branch then merged `087344d41e933ae6a9f6f6342b9ed4d884b5e36a` (ROOM-11, pull request #570) as `86982114`. Launch gates ran on the working tree that became `e9ace8e5`. After the merge, doc paths, web lint, web typecheck, and the production build passed on `86982114`. This note only records those SHAs.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441) and SCENE-04 (#442) are merged ancestors. `git fetch origin main` before the merge left `origin/main` at `087344d41e933ae6a9f6f6342b9ed4d884b5e36a`. Town keeps the existing y-down frame. Pixel scores were not changed. The Hall does not call `level()` or `levelProgress()`.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| SCENE-06-A1 | Seed `town`, clock `2026-10-29T19:00:00Z`, timezone America/Los_Angeles. Archive "Walk 30 minutes", open Hall, and reload. Thresholds stay the canonical tables. History for the archived walk and Edit for "Read 20 pages" stay. | PASS | `apps/web/e2e/town-hall.spec.ts` at 390×844 night and 1280×800 light, including `page.reload()`. |
| SCENE-06-A2 | Another user's habit "Other's habit" stays out of the Hall. Rules name treasury weeks and say balances stay in Finance. Health measurements stay in the Clinic and Gym. Hall API calls are only `/api/town` or `/api/auth`. `returnPath` keeps `object` in `rules`, `progress`, or `archive` and drops record ids and balances. | PASS | `town-hall.spec.ts` request list and text assertions. `hall-rules.spec.ts` rejects `$`, `kg`, `mmHg`, and `bpm`. `return-context.spec.ts`. |
| SCENE-06-LIFE | An owner change drops a held town payload, including a habit named with a private-looking balance, and ignores it after destroy. A failed save and a failed reload keep the typed habit name. A new owner removes that draft. An unfinished drag restores the camera. | PASS | `hall-room.component.spec.ts` held response, failed save, and drag. |
| SCENE-06-VIEW | 390×844 touch and 1280×800 keyboard, light and night, reduced motion. History target is at least 44px. Focus returns from history and from Back to Town. Axe serious and critical violations on `app-town-hall` are empty. Running animations are none. No horizontal scroll. | PASS | `town-hall.spec.ts` viewport matrix, axe include `app-town-hall`, and the focus test. |
| HALL1 | Rules and progress print existing constants and API fields. Level 9 with 1 XP and next 100 stays Level 9. Edit and History open the existing habit and history dialogs. A 503 save keeps the typed name and the unavailable message. | PASS | `hall-rules.spec.ts` and the browser edit/history path in `town-hall.spec.ts`. |

The seeded town shows the API lines, including town level and habit level, and does not recompute them. Public rules still render when the first town load fails. The inspector stays in the page so a phone can scroll the rules. Seasons and the weekly reflection are not in this leaf.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior Hall page. The exterior Hall control was `select` at `bcffbb26`. | Exterior landmark list and `town-exterior.spec.ts`. | Same Hall building, now `control: 'link'` with `href` `/town/hall`. Habit and history dialogs stay the editors. | Nothing deleted. The control migrated from select to link. No second progress model was added. | `town-exterior.spec.ts`. `town-hall.spec.ts` "Back to Town returns focus to the Hall link". |

- Candidate class and protected counterexamples: Town y-down frame, Pixel scores, Health store, and Finance balances stay. The Hall does not import the health store or a finance API.
- Comparison base SHA and full replacement closure (including new files): `bcffbb260ec23b464dfb80f6f91f434ccd218fab` through product `e9ace8e5`. New production files: `hall-rules.ts`, `hall-room.assets.ts`, `hall-room.component.ts`, `.html`, `.css`, and `apps/web/public/town/hall/{room,rules,progress,archive}.svg`.
- Production added/deleted/moved; comments/blank-only churn separately: production +755/−9, net +746. Route documents `routes.json` and `route-examples.json` are +8/−1 and are not in that production count. Town `AGENTS.md` and `docs/QUALITY.md` are +5/−5 and are not in that production count. Blank-only lines are not split out.
- Independent equivalent implementations before/after: 0 / 1 Hall page. 1 / 1 Town constant table. 1 / 1 habit dialog. 1 / 1 history dialog. 1 / 1 scene frame.
- State/cache owners and public entry points before/after: `/town/hall` is the route. `object`, `edit`, and `history` are the URL. Town data still comes from `TownApiService.getTown()`. Saves still use `patchHabit`. Camera state stays in the room component. An owner id drops stale loads. The habit draft stays in the existing dialog.
- Remaining old symbol/path search, including config and discovery: `town-hall.spec.ts` is in `townTestMatch`, the discovery test, and `docs/QUALITY.md`. `/town/hall` is in `routes.json` and `route-examples.json`.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. SCENE-07 and SCENE-08 still own weekly reflection and seasons. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests and discovery +416/−3. This evidence file is docs. No generated bundle is committed. Post-merge `make build-frontends` exited 0. Release `cee0d93dfd74db1abb64e913f7e1c7a27fdd0d74f5dffe1998406a6182d1b53b`. The initial bundle stays over the 650 kB warning budget at 680.38 kB. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +746 production lines. This is the Hall room, the public rules copy, the art, and the exterior and header links. The positive delta is the feature.
- No behavior/data/meaningful assertion silently removed: confirmed. The exterior Hall is now a link. Reading Hall return focus still uses its own link. Unfounded towns still show "Visit the Reading Hall" and also "Visit the Hall".

## Verification

Launch commands ran in `/tmp/vivek-scene-06` on the working tree committed as `e9ace8e5`. `make test-fast` used `PATH="/tmp/vivek-scene-06/.venv/bin:$PATH"`. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The leaf diff has no Python product file. `apps/server/tests/test_route_parity.py` was run because `routes.json` and `route-examples.json` changed. ROOM-11 health files arrived only through the merge. Playwright was not rerun after that merge: the merge did not change Hall sources, `town-hall.spec.ts`, or suite specs. Health browser coverage for the Gym floor already passed on pull request #570.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch SCENE-06` | Printed the commands below. It did not edit the queue. |
| `make test-fast` | PASS. Boundaries OK. 135 Python tests OK. 21 Node script tests pass. Town e2e files are listed (18) and not executed by this gate. |
| `make lint-web` | PASS on `e9ace8e5` and again on `86982114`. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS on `e9ace8e5` and again on `86982114`. Web app and spec, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS on `e9ace8e5`. 627 SUCCESS. Statements 77.75% (9711/12489), branches 65.44% (4367/6673), functions 79.51% (2026/2548), lines 82.86% (8445/10191). |
| `make build-frontends` | PASS on `86982114`. Release hash above. Initial total 680.38 kB. An earlier build of the Hall tree, before ROOM-11, also exited 0 at the same 680.38 kB warning. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS on `e9ace8e5`. 180 passed (2.3m), including both Hall viewports and Back to Town. |
| `npx playwright test --project=suite` | PASS on `e9ace8e5`. 61 passed (59.8s). |
| `scripts/check-doc-paths.sh` | PASS on `86982114`. Town `AGENTS.md` is 298 words. |
| `pytest apps/server/tests/test_route_parity.py` | PASS on `e9ace8e5`. 36 passed, 1 skipped. |

## Handoff

- PR URL (leaf closure keyword only): opened after this note. The body is only the leaf keyword for #444.
- Roadmap #134 append-only status-note URL: added after the merge, without editing the issue body.
- Merged/activation status (actual evidence, not assumption): not merged when this sentence is written.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review of the Hall stays separate from these passing checks.
- Next actor: open the pull request, wait for required checks, then merge.
