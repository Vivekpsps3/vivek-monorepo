# GAME-05 — reachable resident dialogue

- Leaf issue and parent(s): [#473](https://github.com/Vivekpsps3/vivek-monorepo/issues/473) under [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#316](https://github.com/Vivekpsps3/vivek-monorepo/issues/316).
- Agent/context, branch/worktree: branch `agent/game-05`, worktree `/tmp/vivek-game-05`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/473#issuecomment-7220640879).
- Base main SHA `fbd9685ed5050ada3b8f7f3795954e2ff8f50816` (fast-forward from `7597dfd0ce81ee0364e4ff9369227f1e6bcbcb74` after FIXUP-05 merged). Tested SHA `d3ef3f4c2695d1ace4490f2d83b111846d1d44ac`.
- Fresh-main/prerequisite/active-PR checks: GAME-01 stamp receipts and SCENE-03 room inspection are on this main. No open pull request overlapped Town dialogue files. Pixels is unchanged. Later conversation packets stay unauthored.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| GAME-05-A1 | Welcome, replay, and a second identity. Replay and a stale expected revision on an already finished identity return 200 and the same revision. Rank rises once per identity, through 5. Welcome grants 2 Stamps once through `meeting:{resident}` on the quest consumer. A later identity grants no Stamps. | PASS | `apps/server/tests/test_town_dialogue.py`; `apps/web/e2e/town-residents.spec.ts` talk, replay, reload, and the second conversation |
| GAME-05-A2 | The directory lists all six residents. Exactly one is away for the civil hour, and that resident still accepts Welcome. Posted bodies are only `resident_id`, `conversation_id`, and `expected_revision`. Responses and completion columns omit private life fields. XP and habit rows stay put. | PASS | Service and HTTP tests in `test_town_dialogue.py`; browser journey talks to `article[data-present="false"]` and records no life-mutation requests |
| GAME-05-LIFE | A 503 keeps the note and confirmation and retries the same body. A 409 drops the note, hides the server message, and reloads the saved rank. Owner change drops a held success and a late error. Escape clears the note. Sign-out clears the directory. | PASS | `residents.component.spec.ts`; browser 503 retry and 409 conflict |
| GAME-05-VIEW | 390×844 and 1280×800, light and night, touch and keyboard, reduced motion. Targets are at least 44px. Focus moves to the confirmation, back to Talk on cancel, to the notice on success, and to Inspect on Close. Back restores the same resident. Axe on `app-town-residents` has no serious or critical violations. | PASS | `apps/web/e2e/town-residents.spec.ts` inside the Town Playwright run. Screenshots stay in the local Playwright report and are not committed. |
| PLACE-12-CAST | Each resident shows one specific purpose on the directory and again while inspected. Quiet and return visits use the same purpose. No invented event, private detail, or task gate. | PASS | Catalog purposes in `resident_catalog.py`; component spec and browser text for all six |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Prior resident dialogue, rank, or schedule path | None on this main | `town_dialogue_journals`, `town_dialogue_completions`, `apps/server/town/dialogue.py`, `ResidentsComponent` | Nothing to delete. This is the first directory. | Search of the base had no resident dialogue records |

- Candidate class and protected counterexamples: feature replacement with no prior implementation. Town habits, stamps, quests, layouts, pixels day facts, and life tables stay separate. No second state store.
- Comparison base SHA `fbd9685ed5050ada3b8f7f3795954e2ff8f50816`. Replacement closure is the catalog, dialogue service, page, document route, and schema head `site_town_dialogue_v1`.
- Production added/deleted: about 856 physical lines added and 3 removed, including the migration and the page. The positive delta is the feature.
- Independent equivalent implementations before/after: one write owner, `complete_conversation`. The client posts only the three identity fields. Rank is the completion count and has no decay write.
- State/cache owners and public entry points before/after: absence of a journal row is revision 0. `GET /api/town/residents` and `POST /api/town/residents/conversations`. Welcome receipts stay in the stamp ledger.
- Remaining old symbol/path search: no superseded dialogue path. Pixels was not edited. `apps/media` was not edited.
- Follow-up change: schema-head companions outside the packet directories, required by the new Alembic head. `apps/server/schema.py`, `apps/server/identity/admin.py`, `apps/server/checks.py`, `scripts/restore-drill.py`, migration pins in server and travel tests, `apps/web/routes.json`, `apps/web/route-examples.json`, `tests/e2e/discovery.mjs`, `docs/QUALITY.md`. `queue.json`, `completed/registry.json`, CI workflows, and `packages/` were not edited.
- Tests/docs/generated changes separately: tests add about 919 lines and remove 10. Guidance nets about zero words. No binaries.
- Net production delta and exception: positive production lines are the directory and the page, not a simplification.
- No behavior/data/meaningful assertion silently removed: stamp grant rules, quests, and room inspection are unchanged. Account deletion removes only that owner's dialogue rows. Meeting rewards use grant key `meeting:{resident}` and consumer `quest` so the existing stamp check stays in place.

## Verification

Commands ran from `/tmp/vivek-game-05` on tested SHA `d3ef3f4c2695d1ace4490f2d83b111846d1d44ac`.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. 135 Python unittest tests and 21 Node tests. Discovery guard ok. |
| `make lint-web` | PASS. Existing ESLint baselines match. |
| `make typecheck-web` | PASS. Seven TypeScript projects compile. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 737 tests. Statements 78.03% (12540/16069). Lines 83.33% (10918/13102). |
| `make build-frontends` | PASS. Release `5ff17a9dc16c1c439c480c099fd6158dc232bf26be92b41459d0659cb03cecf6`. Existing initial-bundle warning is 730.90 kB against 650 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 287 Town, Health, World, and Pixels cases, including the seven resident journeys. |
| `npx playwright test --project=suite` | PASS. 75 cross-app cases. |
| `make lint-python` | PASS. 274 files already formatted. Ruff 90 and suppressions 6 match the baseline. |
| `make typecheck-python` | PASS. mypy 79 findings match the baseline. |
| `make db-check` | PASS. Schema drift check ok at `site_town_dialogue_v1`. |
| `./scripts/coverage-gate.sh server` | PASS. 501 passed, 1 skipped. Total coverage 82.37% above floor 61.53%. |
| `./scripts/coverage-gate.sh travel` | PASS. 232 passed. Total coverage 89.32% above floor 80.41%. Travel pins name the new head. |
| `./scripts/coverage-gate.sh finance` | PASS. 160 passed. Total coverage 81.41% above floor 81.03%. |
| `./scripts/coverage-gate.sh media` | PASS. 112 passed. Total coverage 75.41% above floor 68.70%. |

`make test-fast` uses the worktree virtualenv on PATH so the restore drill can import Alembic. The first system-python run failed before the suite for that reason and was rerun. Coverage floors were not changed.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/638
- Roadmap #134 append-only status-note URL: added after merge.
- Merged/activation status: not merged yet.
- Remaining external prerequisites or approved scope decisions: GAME-06, GAME-07, and GAME-08 still author the resident scenes. This leaf stores the five identities and one shared line per identity.
- Next actor: open the pull request, wait for green checks, then merge. Do not deploy. Leave parent issues open.
