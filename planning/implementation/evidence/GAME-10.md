# GAME-10 — implementation evidence

- Leaf issue and parent(s): [#478](https://github.com/Vivekpsps3/vivek-monorepo/issues/478) GAME-10. Parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stays open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/game-10`; `/tmp/vivek-game-10`. The shared checkout was not edited. Health, Finance, Travel, Media, and server product files were not edited. ROOM-14 arrived through the merge below and those files were left as merged.
- Base main SHA, current tested SHA: product and tests are `4aa311b1a596296a42cd5d97d20c890eea7c8c05`. Every gate below ran on that tree. The branch started at `b70ca1159fe311973b917e81b72a59e826d57856` (HOME-03, pull request #596). `origin/main` then moved to `26dc5f33dffdd384b34d089d150dd3d8e1f71159` (ROOM-14, pull request #597). That merge is `4aa311b1`. No rebase and no force-push.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441) is an ancestor of this base. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/478#issuecomment-7109381316). Fetch again before this note still has `origin/main` at `26dc5f33`. Pixel scores were not changed. The game grants no Stamps, currency, or life records.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| GAME-10-A1 | Empty account `town-empty`. Seed 10 deals Bell, Ferry, Lantern, Lantern, Glass, Chart, Ferry, Glass, Chart, Shell, Shell, Bell. Finish is six matching turns. Restart deals the same shelves face down at 0 moves, with no matched face left up. | PASS | `memory-shelves.spec.ts`, `memory-shelves.component.spec.ts`, and `apps/web/e2e/town-memory.spec.ts` finish, restart, and Lantern shelf 3. |
| GAME-10-A2 | Reduced motion and sound-off finish the same six moves. Motion allowed finishes the same six moves, and the status is unchanged after 1.1 seconds. There is no failing timer. A match tone plays only when Town sound is on and motion is allowed. | PASS | Playwright reduced-motion matrix and the motion-allowed journey. Component specs cover sound off, sound on, and reduced motion. |
| GAME-10-LIFE | A throwing `sessionStorage` write keeps the open shelf. Sign-out removes `town.memory-shelves.v1.` keys. An owner change during the write drops the previous key. Town, Media, and Pixels 503 responses still match the Lantern pair in one move. | PASS | Component specs for storage, owner switch, and `cleared$`. Playwright 503 and sign-out journeys. |
| GAME-10-VIEW | 390×844 touch and 1280×800 keyboard, light and night, reduced motion. Pause, resume, restart, and quit work from the buttons and from P, R, and Q. Shelves, Play, Pause, Restart, and Quit are at least 44px. ArrowRight moves focus. Return to Town restores the face-up shelf and focuses Memory Shelves. Axe serious and critical violations on `app-memory-shelves` are empty. No horizontal scroll. | PASS | Eight Playwright journeys inside the Town suite. Reviewed captures at 390 and 1280, light and night, including the completed board and the restarted face-down board. Screenshots stayed outside the commit. |

Fixtures are synthetic. The shared Town scene frame file was not edited. The score is turns. Pause hides the board from input and does not change the move count. Quit keeps the last finished move count in this tab only.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior Town Memory Shelves page. The Media arcade table still has its own incomplete session. | The Arcade building links to `/media/library?kind=game`. | `memory-shelves.ts` and `MemoryShelvesComponent` on `/town/memory`. | The Media table was not edited. The Arcade building was not retargeted. Town gained a header link and a switcher section. | `town.component.spec.ts` expects the header link. Town Playwright passed 215 tests, including the Media boundary. |

- Candidate class and protected counterexamples: Reading Hall, Hall, Home, Clinic, Gym, the weekly review, habit check-in, the cosmetic catalog, and the Media arcade stay. No previous Town memory module existed to delete.
- Comparison base SHA and full replacement closure (including new files): `26dc5f33dffdd384b34d089d150dd3d8e1f71159`. New production files: `memory-shelves.ts`, the component, template, and stylesheet. Changed production files: Town routes, private Town section, Town header, return focus, `routes.json`, and `route-examples.json`.
- Production added/deleted/moved; comments/blank-only churn separately: production +704/−2, net +702, counted from `origin/main` to `4aa311b1`. Guidance and discovery +4/−4 (`town/AGENTS.md`, `docs/QUALITY.md`, `tests/e2e/discovery.mjs`, `scripts/check-e2e-discovery.test.mjs`). Blank-only lines are not split out. This evidence file is additional docs after that count.
- Independent equivalent implementations before/after: 0 / 1 Town Memory Shelves game. The Media arcade table remains a separate session and was not changed. 0 / 0 currency wallet.
- State/cache owners and public entry points before/after: `/town/memory` is the public entry. The board and last finished move count live in `sessionStorage` under `town.memory-shelves.v1.<ownerId>`. Sign-out and an owner change clear that prefix. A storage failure keeps the in-memory shelf. Nothing is posted to Town, Media, Pixels, or Health.
- Remaining old symbol/path search, including config and discovery: `town-memory.spec.ts` is in `townTestMatch`, the discovery test, and `docs/QUALITY.md`. The private route pattern includes `memory` beside `review` and `home`.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +579/−0. This evidence file is docs. No generated bundle is committed. `make build-frontends` exited 0. Release `7eca2565939072801dfe31d99dda91c7944e8d3247955b636ba34d01144e55d3`. The initial bundle stays over the 650 kB warning budget at 681.98 kB. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +702 production lines. This is the feature: a seeded six-pair board, flip-two turns, pause, quit, restart, and a move score. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Town Playwright passed 215 tests. The first Memory Shelves browser run, before this worktree had `dist/web/browser/index.csr.html`, showed the workspace-updating response. The same assertions passed after `make build-frontends`.

## Verification

Commands ran in `/tmp/vivek-game-10` on `4aa311b1`. `make test-fast` used `PATH="/tmp/vivek-game-10/.venv/bin:$PATH"` because `/usr/bin/python3` has no project dependencies. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at that Chromium. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. `apps/server/tests/test_route_parity.py` ran because `routes.json` and `route-examples.json` changed. Python lint, typecheck, and coverage gates were not run. The leaf diff has no Python product file.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch GAME-10` | Prints `make test-fast`, `make lint-web`, `make typecheck-web`, `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI`, `make build-frontends`, `npx playwright test --config apps/web/e2e/playwright.config.ts`, and `npx playwright test --project=suite`. It does not edit the queue. |
| `make test-fast` | PASS. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. E2E discovery lists town files=23. Node script tests 21 pass / 0 fail, plus engine purity 1 pass / 0 fail. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 698 SUCCESS. Statements 77.95% (11591/14868), branches 65.6% (5153/7854), functions 80.36% (2484/3091), lines 83.16% (10081/12121). |
| `make build-frontends` | PASS. Release hash above. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 215 passed (3.8m), including eight Memory Shelves tests. |
| `npx playwright test --project=suite` | PASS. 61 passed (2.1m). |
| `/tmp/vivek-game-10/.venv/bin/python3 -m pytest -q apps/server/tests/test_route_parity.py -m "not perf"` | PASS. 45 passed, 1 skipped, 1 warning, 1.81s. |

## Handoff

- PR URL (leaf closure keyword only): recorded after open. The body is only `Closes #478`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet.
- Remaining external prerequisites or approved scope decisions: no receipt integration, so this game grants no currency and no Stamps. No deployment.
- Next actor: review and merge this leaf only.
