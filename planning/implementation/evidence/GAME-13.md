# GAME-13 — implementation evidence

- Leaf issue and parent(s): [#482](https://github.com/Vivekpsps3/vivek-monorepo/issues/482) GAME-13. Parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stays open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/game-13`; `/tmp/vivek-game-13`. The shared checkout was not edited. Media collections, Travel, Finance, and Health stores were not edited. No Town model or migration was added.
- Base main SHA, current tested SHA: base and `origin/main` at fetch time `21ec68f3c9a8e33c49d1ad8269afdbfac51ad0f8`. Product behavior tested below is `2a47ec753888269c67eb51e2f7d22faf8aa7624b`. The gates below ran on that tree before this evidence file, and `make test-fast` was repeated after the file was added.
- Fresh-main/prerequisite/active-PR checks: `origin/main` was still `21ec68f3` after fetch. GAME-04 (#479), GAME-06 (#474), GAME-07 (#475), GAME-08 (#476), GAME-09 (#477), and GAME-12 (#481) are closed, and their outcomes are on that base: six chapters with a once-only 10-Stamp keepsake, Mara and Ada, Imani and Jun, Wren and Sol, twelve discovery stamps with no currency, and a first daily minigame win of 5 Stamps with a cap of 10 and a replay of 0. Those amounts and receipt rules were not changed. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/482#issuecomment-7233696909).

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| GAME-13-A1 | Synthetic Town clock `2026-10-29`. One chapter (`find-your-shelves`, 10 Stamps, library seal), one discovery (`ferry-bell`, journal stamp, no trip), Mara rank 1 with a once-only welcome of 2, and both minigames (Memory Shelves score 8, Harbor Rhythm accuracy 100, one medal each). After reload the same owner still sees those badges and source strings. An unearned chapter, discovery, and resident stay without a once-only badge. | PASS | `apps/web/e2e/town-journal.spec.ts` earned journeys. Balance stays 22 after browsing. |
| GAME-13-A2 | The medal sentence is `5 Stamps, once, on {day}. Source {grant_key}.` A server display name of `Marathon finisher` is shown as Memory Shelves. The page says the records are not Health badges, Finance totals, or Media memberships. Samples stay labeled samples. Empty and earned reads do not write library, trip, world, vault, or Health records. Score 0 has no medal. | PASS | `hall-journal.spec.ts`, the earned and empty Playwright journeys, and production chunk `chunk-NMUBZRXG.js` (medal sentence present; `mmHg`, `health_workouts`, `First lift`, `Marathon finisher`, and `bpm` absent). |
| GAME-13-LIFE | A failed reload keeps the earned keepsake and the find text. Retry republishes. An owner change clears the find draft and drops a late response from the previous owner. An unknown collection shows an honest empty list and no badge. | PASS | `hall-journal.component.spec.ts` inside the web Karma run. |
| GAME-13-VIEW | 390×844 and 1280×800, light and night, touch and keyboard, reduced motion. Open, find, hide hints, Escape or Back, and reload. In-session open focuses the record heading. Escape returns focus to the Open control. Targets are at least 44px. Axe serious and critical violations on the journal are empty. Animations are empty under reduced motion. | PASS | Four earned and two empty-account journeys in `town-journal.spec.ts`, inside the Town run of 339 passed. |

Fixtures are synthetic. Stamps, scores, and medals stay game data. Life XP stays on the Hall progress dial. Chapter grants remain 10, welcome grants remain 2, and minigame grants remain 5 with cap 10. GAME-14 preferences, the Media Games split, furniture purchases, and a new currency are not in this change.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior Hall journal page. | Chapters, discoveries, ranks, and play receipts already had their own reads and writers. Hall scene objects stayed rules, progress, and archive. | `hall-journal.ts` projects those reads. `GET /api/town/minigames/runs` lists existing `town_play_receipts` rows and grants nothing. | None removed. There was no journal route, collection page, or second achievement store to delete. Grant amounts and receipt rules stay. | Server arcade-read test and Town Playwright. Empty `town-empty` reads all four collections and creates no library, trip, or Health row. |

- Candidate class and protected counterexamples: the Stamp wallet, chapter keepsakes, twelve discovery stamps, six resident ranks, both minigames, Workshop purchases, and Health badges stay. No Town model or migration was added.
- Comparison base SHA and full replacement closure (including new files): `21ec68f3c9a8e33c49d1ad8269afdbfac51ad0f8`. New production files: `hall-journal.ts`, `hall-journal.component.ts`, `hall-journal.component.html`, and `hall-journal.component.css`. Changed production files: `play_receipts.py` (`read_arcade`), Town router and schemas, `town.api.ts`, `routes.ts`, and the Hall header link.
- Production added/deleted/moved; comments/blank-only churn separately: production +659/−1, net +658, counted from `21ec68f3` to `2a47ec75`. Guidance +3/−3 (`apps/server/AGENTS.md`, `apps/web/src/app/town/AGENTS.md`), both files remain 300 words. Blank-only lines are not split out. This evidence file is additional docs after that count.
- Independent equivalent implementations before/after: 0 / 1 Hall journal projection. 1 / 1 Stamp wallet. 1 / 1 play-receipt table. The new GET does not mint a medal or a wallet.
- State/cache owners and public entry points before/after: chapters stay on quest progress, discoveries on discovery records, ranks on resident progress, and scores on `town_play_receipts`. The new public read is `GET /api/town/minigames/runs`. The find field is page state and clears on owner change. Sign-in still uses the existing session.
- Remaining old symbol/path search, including config and discovery: `townTestMatch` now includes `town-journal.spec.ts`. `town` route pattern includes `hall/journal`. No achievement store was added.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. GAME-14 preferences and FIXUP-06's Media Games split stay out of this PR. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +793/−1, including `town-journal.spec.ts`. Route examples, route manifest, discovery allowlist, and `docs/QUALITY.md` are +17/−4. This evidence file is docs. No generated bundle is committed. `make build-frontends` exited 0. Release `817cdd0a0ced1b3be45266c29efb4bc67bf1076f2f489b0ff1694a1aa377bd54`. The initial bundle stays over the 650 kB warning budget at 732.98 kB. The budget was not raised. Existing Finance unused-import warnings remain. Server coverage rose to 83.06% and the floor was not pinned.
- Net production delta and specific reviewed safety/compatibility exception if positive: +658 production lines. This is the journal projection, the four collection pages, and a read-only score list. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Town Playwright passed 339 tests. Chapter, discovery, resident, and minigame grant tests still pass.

## Verification

Commands ran in `/tmp/vivek-game-13`. `make` and coverage used `PATH="/tmp/vivek-game-13/.venv/bin:$PATH"`. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used that Chromium as `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Server coverage ran because `play_receipts.py`, the Town router, and schemas changed. The coverage floors were not pinned.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch GAME-13` | Prints the web, Playwright, and docs commands below. It does not edit the queue. |
| `make test-fast` | PASS on the product tree before this file, and again with this file present. Doc paths OK. Planning validation PASS (120 active packets, 25 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. E2E discovery lists town files=29. Node script tests 21 pass / 0 fail. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. Engine purity 1 pass. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 793 SUCCESS. Statements 78.06% (13520/17318), branches 66.44% (6254/9413), functions 80.54% (2952/3665), lines 83.54% (11780/14101). |
| `make build-frontends` | PASS. Release hash above. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 339 passed (3.9m), including the six journal journeys. |
| `npx playwright test --project=suite` | PASS. 75 passed (1.5m). |
| `make lint-python` | PASS. 279 files already formatted. Ruff 90 findings match the baseline. Suppressions 6 match. |
| `make typecheck-python` | PASS. mypy: 79 findings match the baseline. |
| `./scripts/coverage-gate.sh server` | PASS. 523 passed, 1 skipped. Total coverage 83.06% (floor 61.53%). The following perf gate passed 1 test. |

## Handoff

- PR URL (leaf closure keyword only): recorded after the pull request is opened. The body is only `Closes #482`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet.
- Remaining external prerequisites or approved scope decisions: no deployment. Preferences and the Media Games split stay on their own leaves.
- Next actor: required checks, then merge this leaf only.
