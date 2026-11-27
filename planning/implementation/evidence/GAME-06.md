# GAME-06 — Mara and Ada conversations

- Leaf issue and parent(s): [#474](https://github.com/Vivekpsps3/vivek-monorepo/issues/474) under [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#316](https://github.com/Vivekpsps3/vivek-monorepo/issues/316).
- Agent/context, branch/worktree: branch `agent/game-06`, worktree `/tmp/vivek-game-06`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/474#issuecomment-7221896901).
- Base main SHA `18e2dfc89971c088bb0c91a44d497d7fdb10a7db`. Tested SHA `20a5262f1fedc979a9f7f522e5d2b6d2ec3dfebd`.
- Fresh-main/prerequisite/active-PR checks: GAME-05 dialogue (`complete_conversation`, rank 0–5, welcome `meeting:{resident}` for 2 Stamps) is on this main via [#638](https://github.com/Vivekpsps3/vivek-monorepo/pull/638). ROOM-01 Library and ROOM-06 Treasury outcomes are on this main via [#599](https://github.com/Vivekpsps3/vivek-monorepo/pull/599) and [#575](https://github.com/Vivekpsps3/vivek-monorepo/pull/575). FIXUP-09 owns Travel and `tests/e2e/suite.spec.ts`; those paths were not edited. Imani, Jun, Wren, and Sol stay on the shared server line.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| GAME-06-A1 | Keyboard, sound off. All ten Mara and Ada scenes. Each has two replies. Both replies share the same rank effect. First welcome says rank rises by 1 and 2 Stamps once. Other first completions say rank rises by 1 and no Stamps. Replay says rank stays and no Stamps. Posted bodies stay `resident_id`, `conversation_id`, and `expected_revision`. | PASS | `resident-scenes.spec.ts`; `residents.component.spec.ts`; `apps/web/e2e/town-residents.spec.ts` reads all ten with the keyboard |
| GAME-06-A2 | Locked Finance shows “Sample civic ledger” / “Labeled sample. Not a Finance record.” An open vault for the signed-in owner shows “Treasury door” / “A public door. Records stay in Finance.” Account, spending, and private-goal strings are not rendered. Ada’s talk makes no vault or Finance request. | PASS | `adaMention` unit cases with planted secrets; browser journey plants the same secrets, traps Finance routes, and reads Ada while locked, then replays the activity after `finance-vault-present` is the owner id |
| GAME-06-LIFE | A 503 keeps the selected reply and the note and retries the same body. A 409, Escape, owner change, and a Finance lock clear the reply and the note. A late success after the lock does not raise rank. | PASS | `residents.component.spec.ts` held responses; browser draft cleared by a `finance-vault-lock` storage event before Finish |
| GAME-06-VIEW | 390×844 and 1280×800, light and night, keyboard and touch, reduced motion. Choice targets are at least 44px. Cancel returns focus to Talk. Close focuses Inspect. Back restores `resident=mara`. Axe on the residents page has no serious or critical violations. | PASS | `apps/web/e2e/town-residents.spec.ts` view loop inside the Town Playwright run. Screenshots stay in the local Playwright report and are not committed. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Prior authored Mara or Ada scenes | None on this main | `residentScenes` overlays the GAME-05 page; completion stays `complete_conversation` | None deleted. No prior authored scene existed. The shared server identity lines stay for Imani, Jun, Wren, and Sol. | Search of the base had one catalog line per identity for every resident |

- Candidate class and protected counterexamples: feature addition on the existing dialogue page. No second dialogue store. Rank, stamps, habits, quests, and Finance records stay with their current owners.
- Comparison base SHA `18e2dfc89971c088bb0c91a44d497d7fdb10a7db`. Replacement closure is `apps/web/src/app/town/resident-scenes.ts` plus the residents page, its template, and its stylesheet.
- Production added/deleted: 269 physical lines added and 14 removed. The new catalog file is 181 lines, including 18 blank lines and 6 comment lines. The positive delta is the ten scenes and the reply draft.
- Independent equivalent implementations before/after: one write owner, `complete_conversation`. Reply choice is session taste and does not change rank. `dialogueVaultOpen` uses the same presence rule as the Town treasury lot and does not read a ledger.
- State/cache owners and public entry points before/after: `GET /api/town/residents` and `POST /api/town/residents/conversations` are unchanged. `selectedChoiceId` is session-only, cleared with the note on invalidation, and kept across a 503.
- Remaining old symbol/path search: `resident_catalog.py` still supplies the shared line. The page shows an authored opening only when `sceneFor` matches Mara or Ada. `apps/server`, Travel, `queue.json`, and CI were not edited.
- Follow-up change: none in this leaf. GAME-07 and GAME-08 still author the other residents.
- Tests/docs/generated changes separately: tests add 348 lines and remove 5. This evidence file is the documentation change. No binaries. `dist/` is build output and is not committed.
- Net production delta and exception: positive production lines are the authored scenes, not a simplification.
- No behavior/data/meaningful assertion silently removed: unauthored residents still finish a talk without a reply choice. Welcome stamps, replay, 503, and 409 behavior from GAME-05 stay in place.

## Verification

Commands ran from `/tmp/vivek-game-06` on the sources in tested SHA `20a5262f1fedc979a9f7f522e5d2b6d2ec3dfebd`, before this evidence file.

| Command | Result |
| --- | --- |
| `PATH="/tmp/vivek-game-06/.venv/bin:$PATH" make test-fast` | PASS. 135 Python unittest tests and 21 Node tests. Discovery guard ok. |
| `make lint-web` | PASS. Existing ESLint baselines match. Direct ESLint on the changed Town files also exited 0. |
| `make typecheck-web` | PASS. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 745 tests. Statements 78.1% (12597/16129). Branches 65.87% (5672/8610). Functions 80.35% (2745/3416). Lines 83.39% (10964/13147). |
| `make build-frontends` | PASS. Release `94c7b82feff97852a451f8f205a45e9f55521d8143774970de8dc3ab5c19bc84`. Existing initial-bundle warning is 730.90 kB against 650 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 292 Town, Health, World, and Pixels cases, including the ten conversations and the view loop. |
| `npx playwright test --project=suite` | PASS. 75 cross-app cases. |

`make test-fast` uses the worktree virtualenv on PATH so the restore drill can import Alembic. The first system-python run failed before the suite for that reason and was rerun. Coverage floors were not changed. A focused residents Playwright file was rerun after Finish waited for the dialog; the full Town run above includes that fix.

## Handoff

- PR URL (leaf closure keyword only): opened after this record.
- Roadmap #134 append-only status-note URL: added after merge.
- Merged/activation status: not merged yet.
- Remaining external prerequisites or approved scope decisions: GAME-07 and GAME-08 still author the other residents. Parent issues stay open.
- Next actor: open the pull request, wait for green checks, then merge. Do not deploy.
