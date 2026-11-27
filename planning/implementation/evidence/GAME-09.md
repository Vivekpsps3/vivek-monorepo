# GAME-09 — twelve Town object interactions

- Leaf issue and parent(s): [#477](https://github.com/Vivekpsps3/vivek-monorepo/issues/477) under [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent/context, branch/worktree: branch `agent/game-09`, worktree `/tmp/vivek-game-09`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/477#issuecomment-7226281661).
- Base main SHA `d1d9075c6e87b5f822bd5d84e2d59ebf5c2f0ac2`. Merged `origin/main` `0a8ca08f2733f0c79622723100c095ec2d35f798` (FIXUP-24, pull request #646) before the browser rerun. Tested product SHA `5084c4f953ec322cd34da794b354ea3cf1b08be6`.
- Fresh-main/prerequisite/active-PR checks: SCENE-02's six-district exterior and GAME-03's once-only quest journal are on this main. GAME-08 resident conversations are on the base. Pixels is unchanged. No second client store.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| GAME-09-A1 | Ferry bell, rooftop telescope, and gym chalkboard each record once. A replay with a stale expected revision returns 200 and the same revision. A new hotspot with a stale revision is 409 `discovery_conflict` and is not applied. No trip, workout, library row, stamp receipt, or XP change. | PASS | `apps/server/tests/test_town_discoveries.py`; `apps/web/e2e/town-discoveries.spec.ts` records those three, reloads, and replays the bell |
| GAME-09-A2 | Pointer on the exterior mark, the keyboard list, touch at 390, and reduced motion reach the same confirmation and the same one stamp. All twelve hotspots record once. | PASS | Exterior unit tap; browser keyboard summary, scene click, and the twelve-hotspot journey |
| GAME-09-LIFE | A 503 keeps the confirmation and retries the same body. A 409 drops the losing telescope write and leaves revision 1. Owner change drops a held success. Hints stay off until asked. Nothing expires. | PASS | `discoveries.component.spec.ts`; browser 503 retry and conflict case |
| GAME-09-VIEW | 390×844 and 1280×800, light and night, keyboard and touch, reduced motion. Targets are at least 44px. Cancel returns focus to the hotspot. Success focuses the notice. Axe on `app-town-discoveries` has no serious or critical violations. Direct `/town/discoveries` loads. | PASS | `apps/web/e2e/town-discoveries.spec.ts` inside the Town Playwright run. Screenshots stay in the local Playwright report and are not committed. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Prior discovery table, route, or scene mark | None on this main | `town_discovery_journals`, `town_discovery_stamps`, `DiscoveriesComponent` | Nothing to delete. This is the first journal. | Search of the base had no discovery records |

- Candidate class and protected counterexamples: first implementation. Town habits, quests, dialogue, stamps, layouts, pixels, and life tables stay separate. A journal stamp is a discovery row, not Stamp currency.
- Comparison base SHA `d1d9075c6e87b5f822bd5d84e2d59ebf5c2f0ac2`. Replacement closure is the catalog, journal, page, exterior marks, document route, and schema head `site_town_discoveries_v1`.
- Production added/deleted: the journal, twelve authored reactions, and the page. The positive delta is the feature.
- Independent equivalent implementations before/after: one write owner, `record_discovery`. The client posts only `discovery_id` and `expected_revision`.
- State/cache owners and public entry points before/after: absence of a journal row is revision 0. `GET /api/town/discoveries` and `POST /api/town/discoveries`. Hints are in the payload and hidden until the visitor asks.
- Remaining old symbol/path search: the sixteen building rows stay sixteen. Discovery marks are not `data-scene-object`. Pixels was not edited.
- Follow-up change: schema-head companions required by the new Alembic head. `apps/server/schema.py`, `apps/server/identity/admin.py`, `apps/server/checks.py`, `scripts/restore-drill.py`, migration pins in server tests and three travel migration tests, `apps/web/routes.json`, `apps/web/route-examples.json`, `tests/e2e/discovery.mjs`, `docs/QUALITY.md`. Those travel files are head pins only. Travel product files were not edited. FIXUP-24 merged without a conflict. `queue.json`, the completion registry, and CI workflows were not edited.
- Tests/docs/generated changes separately: server, Karma, and Playwright specs cover the twelve hotspots. Guidance stays under 300 words.
- Net production delta and exception: positive production lines are the journal and the page, not a simplification.
- No behavior/data/meaningful assertion silently removed: quests, dialogue, stamps, and the building list stay. Account deletion removes only that owner's discovery rows. Applied migrations stay immutable.

## Verification

Python, web lint, typecheck, Karma, both coverage gates, and the production bundle ran on merge `414bf934` (product `988ecaaf` plus FIXUP-24). The Playwright runs below are on `5084c4f953ec322cd34da794b354ea3cf1b08be6`, which changes only the discoveries browser spec. An earlier Karma run, before that merge, failed one existing Health spec because a generated id contained `77`. That spec passed alone, and the merged-tree Karma run passed 762.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. 135 Python unittest tests and 21 Node tests. Discovery guard ok. |
| `make lint-web` | PASS. ESLint baselines match. |
| `make typecheck-web` | PASS. Seven TypeScript projects compile. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 762 SUCCESS. Statements 78.05% (12622/16171). Branches 66.06% (5705/8636). Functions 80.25% (2756/3434). Lines 83.35% (10994/13190). |
| `make build-frontends` | PASS. Release `edcd77f5e57883540320ae677df404111eea1240a4d4187785bbed3cb9837409`. Existing initial-bundle warning is 732.75 kB against 650 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 310 Town, Health, World, and Pixels cases. |
| `npx playwright test --project=suite` | PASS. 75 cross-app cases. |
| `make lint-python` | PASS. 277 files already formatted. Ruff 90 and suppressions 6 match the baseline. |
| `make typecheck-python` | PASS. mypy 79 findings match the baseline. |
| `./scripts/coverage-gate.sh server` | PASS. 507 passed, 1 skipped. Total coverage 82.55% above floor 61.53%. |
| `./scripts/coverage-gate.sh travel` | PASS. 232 passed. Total coverage 89.32% above floor 80.41%. Travel pins name the new head. The floor was not raised. |

`make test-fast` uses the worktree virtualenv on PATH. Karma and Playwright used Playwright Chromium `chromium-1248` as `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/648
- Roadmap #134 append-only status-note URL: added after merge.
- Merged/activation status: not merged yet.
- Remaining external prerequisites or approved scope decisions: GAME-04 still owns chapter rewards. GAME-11 still owns Harbor Rhythm. This leaf grants no Stamps and no XP.
- Next actor: merge after GitHub checks pass. Do not deploy. Leave #304 open.
