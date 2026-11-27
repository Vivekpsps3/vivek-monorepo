# GAME-08 — Wren and Sol conversations

- Leaf issue and parent(s): [#476](https://github.com/Vivekpsps3/vivek-monorepo/issues/476) under [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#316](https://github.com/Vivekpsps3/vivek-monorepo/issues/316).
- Agent/context, branch/worktree: branch `agent/game-08`, worktree `/tmp/vivek-game-08`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/476#issuecomment-7223960655).
- Base main SHA `5444db9f4eaf4d23948428b58d19c1e686abc677`. Tested SHA `ee3a700fd9f4262f33853dd6d7673e9fe82b61ec`.
- Fresh-main/prerequisite/active-PR checks: GAME-05 dialogue (`complete_conversation`, rank 0–5, welcome `meeting:{resident}` for 2 Stamps) is on this main via [#638](https://github.com/Vivekpsps3/vivek-monorepo/pull/638). ROOM-09 music rooms are on this main (`music-bar.component.ts`, artist wall, Harbor Rhythm stage). SCENE-06 Hall is on this main (`hall-room`, `/town/hall`, public rules). No open pull request overlapped these files. The shared server identity lines stay.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| GAME-08-A1 | All ten Wren and Sol scenes. Each has two replies. Both replies share the same rank effect. A reflection visit before completion says the talk does not mark a chapter done. A replay says it is not recorded again and grants no Stamps. Welcome grants 2 Stamps once. Posted bodies stay `resident_id`, `conversation_id`, and `expected_revision`. Activity can leave the floor or the notes alone. | PASS | `resident-scenes.spec.ts`; `residents.component.spec.ts`; `apps/web/e2e/town-residents.spec.ts` reads all ten, then replays the reflection |
| GAME-08-A2 | Planted review text `Harbor week note stays shut` and concept note `Concept note tide tables` never render. A saved concept named Tide table is unchanged after Sol’s replay. Locked vault shows “Sample arcade sign” and “Sample rules card”. An open vault shows “Music bar” and “Rules board” and still does not copy the note. No Media, World, vault, or Health write comes from the page. The rank notice does not contain either planted note. | PASS | Unit refusal cases. Browser journey snapshots `GET /api/world/concepts?archived=0` before and after the replay |
| GAME-08-LIFE | A 503 keeps Wren’s selected reply and note and retries the same body. A Hall lock drops Sol’s reply, note, and a late rank-9 success. A 409 on Sol’s replay clears the reply and the note and keeps rank 1. Escape and owner change still clear the shared draft. | PASS | `residents.component.spec.ts` held responses; browser lock before Finish |
| GAME-08-VIEW | 390×844 and 1280×800, light and night, keyboard and touch, reduced motion. Wren preference and Sol activity targets are at least 44px. Cancel returns focus to Talk. Close focuses Inspect. Back restores `resident=wren`. Axe on the residents page has no serious or critical violations. | PASS | `apps/web/e2e/town-residents.spec.ts` view loop inside the Town Playwright run. Screenshots stay in the local Playwright report and are not committed. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Prior authored Wren or Sol scenes | None on this main | `residentScenes` overlays the GAME-05 page; completion stays `complete_conversation` | None deleted. No prior authored scene existed. The shared server identity lines stay as the fallback for an unknown conversation. | Search of the base had one catalog line per identity. `sceneFor('wren')` and `sceneFor('sol')` were null |

- Candidate class and protected counterexamples: feature addition on the existing dialogue page. No second dialogue store. Rank, stamps, reviews, and concept notes stay with their current owners.
- Comparison base SHA `5444db9f4eaf4d23948428b58d19c1e686abc677`. Replacement closure is `apps/web/src/app/town/resident-scenes.ts` plus the residents page. Tests and this evidence file are separate.
- Production added/deleted: 145 physical lines added and 1 removed. `resident-scenes.ts` is 124 added and 1 removed. The added production diff includes 12 blank lines and 6 comment lines. The positive delta is the ten scenes, the chapter visit line, and the two mention guards.
- Independent equivalent implementations before/after: one write owner, `complete_conversation`. Reply choice is session taste and does not change rank, a review, or a concept note. Wren and Sol do not read Media, the Hall editor, or World concepts.
- State/cache owners and public entry points before/after: `GET /api/town/residents` and `POST /api/town/residents/conversations` are unchanged. `selectedChoiceId` is session-only, cleared with the note on invalidation, and kept across a 503.
- Remaining old symbol/path search: `resident_catalog.py` still supplies the shared line. The page shows an authored opening when `sceneFor` matches. An unknown conversation id still uses that line and does not require a reply. `apps/server`, Media, `queue.json`, and CI were not edited.
- Follow-up change: none in this leaf. All six residents now have authored scenes.
- Tests/docs/generated changes separately: tests add 510 lines and remove 11. This evidence file is the documentation change. No binaries. `dist/` is build output and is not committed.
- Net production delta and exception: positive production lines are the authored scenes, not a simplification.
- No behavior/data/meaningful assertion silently removed: an unknown conversation still finishes without a reply choice. Welcome stamps, replay, 503, and 409 behavior from GAME-05 through GAME-07 stay in place.

## Verification

Commands ran from `/tmp/vivek-game-08` on the sources in tested SHA `ee3a700fd9f4262f33853dd6d7673e9fe82b61ec`, before this evidence file. `CHROME_BIN` was the Playwright Chromium because this shell had no `google-chrome` binary. Coverage floors were not changed.

| Command | Result |
| --- | --- |
| `PATH="/tmp/vivek-game-08/.venv/bin:$PATH" make test-fast` | PASS. 135 Python unittest tests and 21 Node tests. Discovery guard ok. |
| `make lint-web` | PASS. Existing ESLint baselines match. |
| `make typecheck-web` | PASS. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 754 tests. Statements 77.99% (12498/16025). Branches 65.98% (5659/8576). Functions 80.21% (2729/3402). Lines 83.27% (10881/13066). |
| `make build-frontends` | PASS. Release `294c1a5553db30686cbe1957fdba3e4999b9d9f2ed3c2f150e0325a95c4e0318`. Existing initial-bundle warning is 731.13 kB against 650 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 302 Town, Health, World, and Pixels cases, including the ten conversations and the view loop. An earlier run failed one unrelated case, `world.spec.ts` “Town error at 1280 dark”, which showed the Pixels heading. That case was not changed here. The full run above then passed. |
| `npx playwright test --project=suite` | PASS. 75 cross-app cases. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/644
- Roadmap #134 append-only status-note URL: added after merge.
- Merged/activation status: not merged yet.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Parent issues stay open.
- Next actor: wait for green checks, then merge. Do not deploy.
