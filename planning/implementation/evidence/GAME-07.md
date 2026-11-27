# GAME-07 — Imani and Jun conversations

- Leaf issue and parent(s): [#475](https://github.com/Vivekpsps3/vivek-monorepo/issues/475) under [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#316](https://github.com/Vivekpsps3/vivek-monorepo/issues/316).
- Agent/context, branch/worktree: branch `agent/game-07`, worktree `/tmp/vivek-game-07`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/475#issuecomment-7222973206).
- Base main SHA `9a4809f821ab02df5c35c3033d50847cb08d8052`. Tested SHA `9fee052de2b295534a6e286cd3794a068752d0da`.
- Fresh-main/prerequisite/active-PR checks: GAME-05 dialogue (`complete_conversation`, rank 0–5, welcome `meeting:{resident}` for 2 Stamps) is on this main via [#638](https://github.com/Vivekpsps3/vivek-monorepo/pull/638). ROOM-04 Terminal hall is on this main (`TerminalHallComponent`, `/travel/terminal`). ROOM-11 Gym floor is on this main (`gym-floor`, `/town/gym`, `HealthStoreService`). FIXUP-12 (#641) owns Hub files and was not edited. Wren and Sol stay on the shared server line.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| GAME-07-A1 | Empty Travel home (`in_progress`, `upcoming`, and `past` are empty) and locked Health (no vault). All ten Imani and Jun scenes. Each has two replies. Both replies share the same rank effect. The activity reply can leave the board or the floor alone. Sample departure board and sample training card stay labeled. Posted bodies stay `resident_id`, `conversation_id`, and `expected_revision`. | PASS | `resident-scenes.spec.ts`; `residents.component.spec.ts`; `apps/web/e2e/town-residents.spec.ts` reads all ten with the keyboard while sound is off |
| GAME-07-A2 | A planted trip title, destination, and taken phrase never render. A saved planning trip (`Synthetic harbor`, status `planning`) is unchanged after both activity replies. Planted workout, badge, and measurement text never render. Health badge names are absent. No Travel, Health, vault, or Finance write comes from the page. An open vault shows “Training floor” / “A public floor. Records stay in Health.” and still does not log a workout. | PASS | Unit refusal cases. Browser journey snapshots `GET /travel/api/trips/{id}` and `/travel/api/home` before and after the replies |
| GAME-07-LIFE | A 503 keeps Imani’s selected reply and note and retries the same body. A Health lock drops Jun’s reply, note, and a late rank-9 success. A 409 on Jun’s replay clears the reply and the note and keeps rank 1. Escape and owner change still clear the shared draft. | PASS | `residents.component.spec.ts` held responses; browser lock before Finish and the existing Jun conflict journey, now with a reply selected |
| GAME-07-VIEW | 390×844 and 1280×800, light and night, keyboard and touch, reduced motion. Imani preference and Jun activity targets are at least 44px. Cancel returns focus to Talk. Close focuses Inspect. Back restores `resident=imani`. Axe on the residents page has no serious or critical violations. | PASS | `apps/web/e2e/town-residents.spec.ts` view loop inside the Town Playwright run. Screenshots stay in the local Playwright report and are not committed. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Prior authored Imani or Jun scenes | None on this main | `residentScenes` overlays the GAME-05 page; completion stays `complete_conversation` | None deleted. No prior authored scene existed. The shared server identity lines stay for Wren and Sol. | Search of the base had one catalog line per identity. `sceneFor('wren')` and `sceneFor('sol')` stay null |

- Candidate class and protected counterexamples: feature addition on the existing dialogue page. No second dialogue store. Rank, stamps, trips, workouts, and Health badges stay with their current owners.
- Comparison base SHA `9a4809f821ab02df5c35c3033d50847cb08d8052`. Replacement closure is `apps/web/src/app/town/resident-scenes.ts` plus the residents page. Tests and this evidence file are separate.
- Production added/deleted: 152 physical lines added and 10 removed. `resident-scenes.ts` is 125 added and 1 removed, including 8 blank lines and 7 comment lines in the added production diff. The positive delta is the ten scenes and the two mention guards.
- Independent equivalent implementations before/after: one write owner, `complete_conversation`. Reply choice is session taste and does not change rank, a trip, a workout, or a badge. Imani’s talk does not read Travel. Jun’s talk uses vault presence only.
- State/cache owners and public entry points before/after: `GET /api/town/residents` and `POST /api/town/residents/conversations` are unchanged. `selectedChoiceId` is session-only, cleared with the note on invalidation, and kept across a 503.
- Remaining old symbol/path search: `resident_catalog.py` still supplies the shared line. The page shows an authored opening only when `sceneFor` matches Mara, Ada, Imani, or Jun. `apps/server`, Travel, Hub, `queue.json`, and CI were not edited.
- Follow-up change: none in this leaf. GAME-08 still authors Wren and Sol.
- Tests/docs/generated changes separately: tests add 453 lines and remove 5. This evidence file is the documentation change. No binaries. `dist/` is build output and is not committed.
- Net production delta and exception: positive production lines are the authored scenes, not a simplification.
- No behavior/data/meaningful assertion silently removed: unauthored residents still finish a talk without a reply choice. Welcome stamps, replay, 503, and 409 behavior from GAME-05 and GAME-06 stay in place.

## Verification

Commands ran from `/tmp/vivek-game-07` on the sources in tested SHA `9fee052de2b295534a6e286cd3794a068752d0da`, before this evidence file. `CHROME_BIN` was the Playwright Chromium because this shell had no `google-chrome` binary. Coverage floors were not changed.

| Command | Result |
| --- | --- |
| `PATH="/tmp/vivek-game-07/.venv/bin:$PATH" make test-fast` | PASS. 135 Python unittest tests and 21 Node tests. Discovery guard ok. |
| `make lint-web` | PASS. Existing ESLint baselines match. |
| `make typecheck-web` | PASS. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 752 tests. Statements 78.13% (12619/16151). Branches 65.92% (5683/8621). Functions 80.38% (2749/3420). Lines 83.41% (10982/13165). |
| `make build-frontends` | PASS. Release `b9e4f1b39448fd5fbb91437d6bf5721c86c8f764c15672262a9d21a52c2d9d97`. Existing initial-bundle warning is 731.13 kB against 650 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 297 Town, Health, World, and Pixels cases, including the ten conversations and the view loop. An earlier run failed the new journey on a pre-navigation `localStorage` read, plus two unrelated cases that passed when rerun. The localStorage read was moved to after navigation. The full run above then passed. |
| `npx playwright test --project=suite` | PASS. 75 cross-app cases. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/642
- Roadmap #134 append-only status-note URL: added after merge.
- Merged/activation status: not merged yet.
- Remaining external prerequisites or approved scope decisions: GAME-08 still authors Wren and Sol. Parent issues stay open.
- Next actor: open the pull request, wait for green checks, then merge. Do not deploy.
