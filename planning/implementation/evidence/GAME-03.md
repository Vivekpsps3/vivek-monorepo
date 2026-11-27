# GAME-03 — optional chapter quests

- Leaf issue and parent(s): [#472](https://github.com/Vivekpsps3/vivek-monorepo/issues/472) under [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent/context, branch/worktree: branch `agent/game-03`, worktree `/tmp/vivek-game-03`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/472#issuecomment-7219031285).
- Base main SHA `0710741918818e67fc73e9f1112517be87500bc5`. Tested SHA `2abcd75610ed9d786c98d8cdb1557a2f06ddd364`.
- Fresh-main/prerequisite/active-PR checks: GAME-01 (#465) stamp ledger and SCENE-03 (#441) Reading Hall return are on this main. Open PR #636 is FIXUP-05 and touches `apps/media` only. Pixels is unchanged.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| GAME-03-A1 | Repeat, back, and reload record one action. Same action with a stale expected revision returns 200 and the same revision. A new step with a stale revision is 409 `quest_conflict` and is not applied. | PASS | `apps/server/tests/test_town_quests.py`; `apps/web/e2e/town-quests.spec.ts` replay, reload, back, and forward |
| GAME-03-A2 | Empty, locked, and ready library states. A labeled sample records `find-your-shelves:inspect-saved:sample` and does not create library, trip, world, habit, stamp, or Health rows and does not award XP. A ready library records the primary action and does not show the item title. | PASS | Service and HTTP tests in `test_town_quests.py`; browser empty, 403 locked, and ready-summary cases |
| GAME-03-LIFE | A 503 keeps the confirmation and retries the same four-field body. A 409 drops the losing body and reloads the current journal. Owner change drops a held success and a late error. Invalidation clears the confirmation. | PASS | `quests.component.spec.ts`; browser 503 retry and unavailable GET |
| GAME-03-VIEW | 390×844 and 1280×800, light and night, touch and keyboard, reduced motion. Targets are at least 44px. Focus returns from cancel to the step and from success to the notice. No deadline copy. Axe on `app-town-quests` has no serious or critical violations. Direct `/town/quests` loads. | PASS | `apps/web/e2e/town-quests.spec.ts` inside the Town Playwright run. Screenshots stay in the local Playwright report and are not committed. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Stamp wallet quest label with no route | `stamp-wallet.component.html` rendered a span | `QuestsComponent` at `/town/quests` | The span is now a link. Hall and Town also link “Optional quests”. | Stamp wallet spec expects `a[href="/town/quests"]` |
| Prior quest table, service, or route | None on this main | `town_quest_journals`, `town_quest_steps`, `apps/server/town/quests.py` | Nothing to delete. This is the first journal. | Search of origin/main had no quest records |

- Candidate class and protected counterexamples: feature replacement of a dead label. Town habits, stamps, layouts, pixels day facts, and life tables stay separate. No second state store.
- Comparison base SHA `0710741918818e67fc73e9f1112517be87500bc5`. Replacement closure is the journal, catalog, page, document route, and schema head `site_town_quests_v1`.
- Production added/deleted: about 1016 physical lines added and 2 removed, including the migration and the page. Comments are not separated. The positive delta is the feature.
- Independent equivalent implementations before/after: one write owner, `record_step`. The client posts only `quest_id`, `step_id`, `action_id`, and `expected_revision`.
- State/cache owners and public entry points before/after: absence of a journal row is revision 0. One revision covers all six quests. `GET /api/town/quests` and `POST /api/town/quests/steps`.
- Remaining old symbol/path search: the quest consumer span is gone. Pixels was not edited.
- Follow-up change: schema-head companions outside the three packet directories, required by the new Alembic head. `apps/server/schema.py`, `apps/server/identity/admin.py`, `apps/server/checks.py`, `scripts/restore-drill.py`, migration pins in server and travel tests, `apps/web/routes.json`, `apps/web/route-examples.json`, `tests/e2e/discovery.mjs`, `docs/QUALITY.md`. No media head pin. `apps/media` was not edited. `queue.json`, `completed/registry.json`, CI workflows, and `packages/` were not edited.
- Tests/docs/generated changes separately: tests add about 1022 lines and remove 10. Guidance nets fewer words. No binaries.
- Net production delta and exception: positive production lines are the journal and the page, not a simplification.
- No behavior/data/meaningful assertion silently removed: stamp grant behavior, Weekly review, and Hall artwork are unchanged. Account deletion removes only that owner's quest rows.

## Verification

Commands ran from `/tmp/vivek-game-03` on tested SHA `2abcd75610ed9d786c98d8cdb1557a2f06ddd364`.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. 135 Python unittest tests and 21 Node tests. Discovery guard ok. |
| `make lint-web` | PASS. Existing ESLint baselines match. |
| `make typecheck-web` | PASS. Seven TypeScript projects compile. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 729 tests. Statements 77.95% (12414/15925). |
| `make build-frontends` | PASS. Release `36eb5f5581c31e5514f72f7d596c2a4d07a289903dee01fd9b70d071ec55e75a`. Existing initial-bundle warning is 731.33 kB against 650 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 280 Town, Health, World, and Pixels cases. |
| `npx playwright test --project=suite` | PASS. 75 cross-app cases. |
| `make lint-python` | PASS. 271 files already formatted. Ruff 90 and suppressions 6 match the baseline. |
| `make typecheck-python` | PASS. mypy 79 findings match the baseline. |
| `./scripts/coverage-gate.sh server` | PASS. 495 passed, 1 skipped. Total coverage 84.27% above floor 61.53%. |
| `./scripts/coverage-gate.sh travel` | PASS. 232 passed. Total coverage 84.83% above floor 80.41%. Travel pins name the new head. |

`make test-fast` uses the worktree virtualenv on PATH so the restore drill can import Alembic. The first system-python run failed before the suite for that reason and was rerun.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/637
- Roadmap #134 append-only status-note URL: added after merge.
- Merged/activation status: not merged yet. The pull request body is `Closes #472`.
- Remaining external prerequisites or approved scope decisions: GAME-04 still owns chapter rewards. This leaf grants no Stamps and no XP.
- Next actor: merge after GitHub checks pass. Do not deploy. Leave #304 and #277 open.
