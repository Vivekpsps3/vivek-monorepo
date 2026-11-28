# GAME-12 — implementation evidence

- Leaf issue and parent(s): [#481](https://github.com/Vivekpsps3/vivek-monorepo/issues/481) GAME-12. Parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stays open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/game-12`; `/tmp/vivek-game-12`. The shared checkout was not edited. Pixels was not edited. No receipt path lives there.
- Base main SHA, current tested SHA: product behavior is `0ff1e50339dc03102fcda8831989a2be05e27a16`. The tested tree is `d25e7b7cf7771c66e1b6378169b42ff0c29f1e49`. That tree adds the discoveries compatibility member and the finish-route matcher. The branch started at `5785c3021c97f6c8b6f7f8e65b36d56dba33e091`. Every gate below ran before this evidence file.
- Fresh-main/prerequisite/active-PR checks: `origin/main` was still `5785c302` at fetch time. GAME-01 (#465), GAME-10 (#478), and GAME-11 (#480) are closed, and the Stamp wallet, Memory Shelves, and Harbor Rhythm are on that base. Chapter grants of 10 and welcome grants of 2 were left in place. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/481#issuecomment-7232394698).

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| GAME-12-A1 | The Town civil day is frozen when the run opens. A finish or retry that crosses midnight or sends another client timezone returns the stored day and the same reward. The first win of each minigame grants 5. Memory plus Harbor on one day reaches the cap of 10. The next civil day can grant 5 again. A repeated finish returns the stored score. | PASS | `apps/server/tests/test_town_play_receipts.py` covers Los Angeles `2026-11-27` held across a Tokyo clock and timezone, a retry that keeps score 6, and the next Tokyo day. |
| GAME-12-A2 | An edited seed, chart, or mode, a short or foreign nonce, another owner, and an unfinished board fail. The balance does not move and the daily reward stays available. A bad body on an already complete receipt does not change the stored score. A new public minigame key is refused and creates no wallet. | PASS | The same server file. Browser journeys reject the first finish, keep the board and a zero balance, then a retry grants 5. |
| GAME-12-LIFE | A failed or late reward does not replace the finished board with a loss. An owner change drops the previous draft and ignores a late success. Sign-out clears the session key. A storage failure keeps the in-memory board. Town, Media, and Pixels 503 responses still leave the local game playable. | PASS | `memory-shelves.component.spec.ts` and `harbor-rhythm.component.spec.ts`. Existing Playwright 503 and sign-out journeys still pass. |
| GAME-12-VIEW | 390×844 and 1280×800, light and night, touch and keyboard, reduced motion. First win, replay, and rejected receipt. Retry is at least 44px. The reward sentence is not a second status. Axe serious and critical violations on the game are empty. Finish bodies carry no health or finance fields. | PASS | Eight Playwright journeys in `town-memory.spec.ts` and `town-rhythm.spec.ts`, inside the Town run of 333 passed. |

Fixtures are synthetic. Stamps stay game-only. A replay stores its score and grants 0. Chapter and welcome grants do not count toward the daily cap. Compact Hub stays home. The Arcade entry was not consolidated.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior play-receipt path. Harbor status text said the game does not award Stamps. | Memory Shelves and Harbor Rhythm kept a session board and posted nothing. | `play_receipts.py` grants from the finished run. The games keep the board in session storage and show the 5-Stamp rule. | No receipt module was removed. The false "no Stamps" status sentence was replaced with the Town-day rule. Chapter grants, welcome grants, and session score drafts stay. | Server receipt tests and Town Playwright. Public `POST /api/town/stamps/grants` still retries an existing key and refuses a new `minigame:` key. |

- Candidate class and protected counterexamples: the Stamp wallet, chapter keepsakes, discoveries, resident ranks, Workshop purchases, and both minigames stay. Pixels has no receipt path and was not edited.
- Comparison base SHA and full replacement closure (including new files): `5785c3021c97f6c8b6f7f8e65b36d56dba33e091`. New production files: `play_receipts.py`, `site_town_play_receipts_v1.py`, and `play-reward.ts`. Changed production files: Town models, router, schemas, account deletion, restore drill, both game clients, and `town.api.ts`.
- Production added/deleted/moved; comments/blank-only churn separately: production +1159/−32, net +1127, counted from `origin/main` to `d25e7b7c`. Guidance +8/−9 (`apps/server/AGENTS.md`, `apps/web/src/app/town/AGENTS.md`). Blank-only lines are not split out. This evidence file is additional docs after that count.
- Independent equivalent implementations before/after: 0 / 1 play-receipt grant path. The public Stamp grant route remains and does not mint a new minigame key. 1 / 1 Stamp wallet.
- State/cache owners and public entry points before/after: `POST /api/town/minigames/runs` and `POST /api/town/minigames/runs/{nonce}/finish` are the write entry points. `town_play_receipts` is keyed by owner and nonce. The grant key is `minigame:<game>:<civil-day>`. The browser draft stays in the existing session record and clears on sign-out or owner change. Health and Finance fields are not part of the finish body.
- Remaining old symbol/path search, including config and discovery: no new spec file was added, so `townTestMatch` stays at town files=28. The migration head is `site_town_play_receipts_v1`.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. GAME-13 collections, GAME-14 preferences, furniture purchases, and Arcade entry consolidation stay out of this PR. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +864/−27. This evidence file is docs. No generated bundle is committed. `make build-frontends` exited 0. Release `26306412ac617df0b946891b89398d1e9c2f9449727268c02f16d1a9f45c9629`. The initial bundle stays over the 650 kB warning budget at 732.71 kB. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +1127 production lines. This is the receipt, the migration, the once-only grant, and the client hold/retry path. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Town Playwright passed 333 tests. The Harbor status string now states the real rule.

## Verification

Commands ran in `/tmp/vivek-game-12`. `make` used `PATH="/tmp/vivek-game-12/.venv/bin:$PATH"`. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used that Chromium as `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Travel coverage ran because the migration head assertions in the Travel tests changed. The coverage floors were not pinned.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch GAME-12` | Prints the web, Playwright, Python, and server coverage commands below. It does not edit the queue. |
| `make test-fast` | PASS on `0ff1e503`. Doc paths OK. Planning validation PASS (120 active packets, 25 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. E2E discovery lists town files=28. Node script tests 21 pass / 0 fail. |
| `make lint-web` | PASS on `0ff1e503`. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS on `0ff1e503`. Web app and spec, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS on `0ff1e503`. 786 SUCCESS. Statements 77.95% (13344/17118), branches 66.22% (6154/9292), functions 80.51% (2901/3603), lines 83.42% (11624/13934). |
| `make build-frontends` | PASS on `0ff1e503`. Release hash above. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS on `d25e7b7c`. 333 passed (3.4m), including eight reward journeys. An earlier run on `eb75ef9c` had 8 route-match failures and 325 passes. The matcher was fixed and the full command was rerun. |
| `npx playwright test --project=suite` | PASS on `0ff1e503`. 75 passed (1.7m). |
| `make lint-python` | PASS on `0ff1e503`. |
| `make typecheck-python` | PASS on `0ff1e503`. |
| `./scripts/coverage-gate.sh server` | PASS on `eb75ef9c`. 520 passed, 1 skipped. Total coverage 82.98% (floor 61.53%). The following perf gate passed 1 test. |
| `./scripts/coverage-gate.sh travel` | PASS on `d25e7b7c`. 232 passed. Total coverage 89.32% (floor 80.41%). |

## Handoff

- PR URL (leaf closure keyword only): recorded after the pull request is opened. The body is only `Closes #481`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet.
- Remaining external prerequisites or approved scope decisions: no deployment. Collections, preferences, and Arcade consolidation stay on their own leaves.
- Next actor: required checks, then merge this leaf only.
