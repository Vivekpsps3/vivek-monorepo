# GAME-04 — six Town chapters and their keepsakes

- Leaf issue and parent(s): [#479](https://github.com/Vivekpsps3/vivek-monorepo/issues/479) under [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent/context, branch/worktree: branch `agent/game-04`, worktree `/tmp/vivek-game-04`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/479#issuecomment-7227351023).
- Base main SHA `8358d7acc8c2714bdf05bdf74bc1469eb1e0f7f5`. Tested product SHA `9b8f6eb692b32a2869fa68a145ff842166018484`.
- Fresh-main/prerequisite/active-PR checks: GAME-03 journal (`2abcd756`), HOME-04 home room (`f0504a34`), ROOM-04 terminal hall (`a4c54ddb`), ROOM-06 book shelf (`2296dab7`), and GAME-10 memory shelves (`4aa311b1`) are ancestors of this base and still provide those outcomes. GAME-09 discoveries stay a separate journal. Pixels was not edited. No second quest store.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| GAME-04-A1 | Empty account finishes all six chapters with labeled samples. Populated account finishes the same chapters with the saved-item, saved-trip, and saved-memory actions. Each chapter grants 10 Stamps once and shows its named keepsake: paper-house postcard, library seal, harbor postcard, arcade pennant, brass civic seal, night-sky print. Replay of a stored step returns the same journal and does not grant again. Balance is 60 after six chapters. | PASS | `test_each_chapter_rewards_empty_and_populated_accounts_once`; `test_http_chapter_reward_survives_replay_and_absence`; browser journeys in `apps/web/e2e/town-quests.spec.ts` at 1280 light and 390 night |
| GAME-04-A2 | A finished journal aged to 2019-01-01 is still kept on 2031-04-02. Balance and keepsakes stay. Another account can still record a step. The page says leaving does not expire a step or remove a reward. Reload and a return through Town keep the six keepsakes and 60 Stamps. No expired task, lost reward, or penalty. | PASS | `test_long_absence_keeps_the_chapter_reward`; HTTP clock move in `test_http_chapter_reward_survives_replay_and_absence`; browser reload and return to `/town` |
| GAME-04-LIFE | A stale revision on the finishing step is 409 `quest_conflict`, leaves the first two steps, and grants nothing. A 503 on Save the layout keeps the confirmation and grants nothing until retry. Retry sends the same step and then shows the paper-house postcard and 10 Stamps. Owner change drops a held journal. | PASS | User 3 in `test_each_chapter_rewards_empty_and_populated_accounts_once`; `quests.component.spec.ts` 503 retry; browser test `a lost finishing step does not grant the reward` |
| GAME-04-VIEW | 1280×800 light keyboard and 390×844 night touch, reduced motion. Empty and populated accounts finish every chapter. Targets are at least 44px. Axe on `app-town-quests` has no serious or critical violations. No horizontal scroll. | PASS | Both chapter journeys in `apps/web/e2e/town-quests.spec.ts` inside the Town Playwright run. Screenshots stay in the local Playwright report and are not committed. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| A separate chapter reward table or a second journal | None. GAME-03 already stored the six chapters without Stamps | `town_quest_journals`, `town_quest_steps`, and the stamp ledger key `quest:{quest_id}` | Nothing deleted. The keepsake is `kept` on the existing journal view when all three steps are stored. Derived Media and Travel keepsakes stay on their own route. | Partial steps still leave the wallet at 0. Replay does not insert a second receipt. |

- Candidate class and protected counterexamples: reward added to the existing journal. Town habits, discoveries, dialogue, layouts, pixels, and life tables stay separate. Samples do not create library, trip, or Health rows and do not award XP.
- Comparison base SHA `8358d7acc8c2714bdf05bdf74bc1469eb1e0f7f5`. Replacement closure is the catalog keepsake fields, the one grant inside the completing step, and the quest page.
- Production added/deleted: catalog, journal grant, response schema, and quest page copy. About 121 production and guidance lines added and 10 removed. The positive delta is the reward.
- Independent equivalent implementations before/after: one write owner, `record_step`. The client still posts only `quest_id`, `step_id`, `action_id`, and `expected_revision`.
- State/cache owners and public entry points before/after: absence of a journal row is revision 0. `GET /api/town/quests` does not mint. `POST /api/town/quests/steps` grants 10 Stamps with consumer `quest` only when that post stores the last step. The public stamp-grant route is unchanged.
- Remaining old symbol/path search: the six quest ids and eighteen step ids are unchanged. Harbor Rhythm was not added. Discoveries were not edited.
- Follow-up change: none in this leaf. No schema head, so no migration pins.
- Tests/docs/generated changes separately: server tests, the quest Karma spec, and the Town browser spec. Town guidance stays at 297 words.
- Net production delta and exception: positive production lines are the once-only grant and the keepsake line, not a simplification.
- No behavior/data/meaningful assertion silently removed: earlier steps still grant nothing. Account deletion still removes only that owner's quest rows.

## Verification

Full Karma ran on the reward implementation before the reward sentence used "the" instead of "a". After that sentence change, `quests.component.spec.ts` passed 7 of 7, and `make build-frontends` rebuilt release `40afe30d9e6c1cd801b163f3c74b33c8d7f0bd7eae6a7bb8795cace31c6adde2`. Playwright below used that bundle. The coverage floor was not raised.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. 135 Python unittest tests and 21 Node tests. |
| `make lint-web` | PASS. ESLint baselines match. |
| `make typecheck-web` | PASS. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 763 SUCCESS. Statements 78.09% (12635/16179). Branches 66.06% (5707/8639). Functions 80.27% (2759/3437). Lines 83.4% (11006/13196). |
| `make build-frontends` | PASS. Release `40afe30d9e6c1cd801b163f3c74b33c8d7f0bd7eae6a7bb8795cace31c6adde2`. Existing initial-bundle warning is 732.75 kB against 650 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 313 Town, Health, World, and Pixels cases. |
| `npx playwright test --project=suite` | PASS. 75 cross-app cases. |
| `make lint-python` | PASS. Ruff and suppressions match the baseline. |
| `make typecheck-python` | PASS. mypy findings match the baseline. |
| `./scripts/coverage-gate.sh server` | PASS. 510 passed, 1 skipped. Total coverage 82.59% above floor 61.53%. |

`make test-fast` uses the worktree virtualenv on PATH. Karma and Playwright used Playwright Chromium `chromium-1248` as `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

## Handoff

- PR URL (leaf closure keyword only): opened after this file.
- Roadmap #134 append-only status-note URL: added after merge.
- Merged/activation status: not merged yet.
- Remaining external prerequisites or approved scope decisions: `POST /api/town/stamps/grants` still accepts a caller-chosen key. A receipt already stored under `quest:{quest_id}` would satisfy the unique ledger key. Normal chapter completion uses a fresh wallet. Harbor Rhythm remains GAME-11.
- Next actor: merge after GitHub checks pass. Do not deploy. Leave #304 open.
