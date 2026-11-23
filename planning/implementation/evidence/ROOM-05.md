# ROOM-05 — implementation evidence

- Leaf issue and parent(s): [#455](https://github.com/Vivekpsps3/vivek-monorepo/issues/455) ROOM-05. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#315](https://github.com/Vivekpsps3/vivek-monorepo/issues/315) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/room-05`; `/tmp/vivek-room-05`. The shared checkout was not edited. Health, Finance, Media, Town, and pixels were not edited.
- Base main SHA, current tested SHA: fetched `origin/main` moved from `45ef8ae69939f0cdc4bf2f5820c0b1e5a64c7515` to `73a289b481dc5227df62a0b2ff07270681ac1bad` (ROOM-13, pull request #574). That fast-forward is the parent of product `1a01e5157e44390ed6e0dec07a4c50df402da610`. The gates below ran on that product tree. This note only records that SHA.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441), TUX-07 (#412), TUX-08 (#413), TUX-09 (#414), and SCENE-09 (#447) are merged ancestors. Rooms stay on `/travel/terminal?room=map|gallery`. No new route, store, or crypto. `object=ferry` stays an invalid hall object. The model ferry copies status and the saved end date and does not write.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ROOM-05-A1 | Synthetic Paper coast is `planning`, 2026-12-01 through 2026-12-03. Synthetic Paper return is `done`, 2026-10-01 through 2026-10-03. Selecting each postcard shows that memory's status and `span_text`, and the two spans are not swapped. A disagreeing souvenir span stays visible with "The saved trip dates do not match this souvenir." | PASS | `harbor-rooms.test.mjs` and `harbor-rooms.component.spec.ts`. `harbor-rooms.spec.js` compares `#harbor-facts` with `GET /travel/api/memories?tz=UTC`. |
| ROOM-05-A2 | Map tiles abort. Finance stays locked. The itinerary still lists 2026-12-01 and 2026-12-03. PTO charge stays "0 days" with the saved date rows. Ordinary souvenirs stay selectable. Posted money stays "Hidden while Finance is locked". Planned Museum hour $15.00 and booked flight $12.00 stay separate. A saved ferry leg "Saved ferry BELL" stays a transport. | PASS | The same Playwright journey aborts `https://tile.openstreetmap.org/**`, expects the tile sentence, and leaves PTO entries unchanged after Open allocation. |
| ROOM-05-LIFE | A memories 503 keeps the private note and the saved titles; retry shows the planned postcard. A second home 503 keeps Paper coast, Paper return, and the note. Sign-out fulfills the held home and memories responses as 401. The note and a secret title do not return. A late load after an owner change is dropped. | PASS | `harbor-rooms.component.spec.ts` and `harbor-rooms.spec.js` ("a failed souvenir load keeps the private note", "a late room response does not restore a note after sign-out"). |
| ROOM-05-VIEW | 390×844 night touch and 1280×800 light keyboard, reduced motion. Planned and completed postcards, the destination, the model ferry, and ← Terminal are the primary and return actions. Targets are at least 44 px. Axe serious, critical, and color-contrast violations are empty. Body text is `rgb(255, 240, 212)` at night and `rgb(24, 46, 64)` in light. Animation name is `none`. No horizontal scroll. | PASS | `harbor-rooms.spec.js` phone and desktop. Screenshots stayed in the Playwright output directory and are not committed. |

Fixtures are synthetic. No real trip, credential, or transaction is used. The room does not invent a return date. `counts_as_pto` stays false and the displayed charge stays 0. Ringing the model ferry performs no POST, PATCH, PUT, or DELETE. Trip status stays `planning` and `end_date` stays 2026-12-03.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior map-room or souvenir-gallery implementation. The terminal hall already owned saved legs, the flight desk, and saved days. | `/travel/terminal` and `terminal-hall.spec.js`. | `harbor-rooms.mjs` projects span, PTO, destinations, souvenirs, and reconciled stages. `HarborRoomsComponent` renders the two rooms. The hall still owns the flight draft. | Nothing deleted. The hall stays mounted and hidden while a room is open so the flight draft survives. `room=ferry` is not a room. | `git show --stat 1a01e515` adds the rooms and does not remove a router, a trip store, or a hall assertion. |

- Candidate class and protected counterexamples: trip records, PTO rows, Finance links, memories, and the decorative ferry stay on their existing owners. No second store.
- Comparison base SHA and full replacement closure (including new files): `73a289b481dc5227df62a0b2ff07270681ac1bad` through product `1a01e5157e44390ed6e0dec07a4c50df402da610`. New production files: `harbor-rooms.mjs`, `harbor-rooms.d.mts`, `harbor-rooms.component.ts`, `.html`, and `.css`.
- Production added/deleted/moved; comments/blank-only churn separately: production +1172/−3, net +1169. Guidance is `docs/TRAVEL.md` +2 and `apps/travel/AGENTS.md` +2/−2, and is not in that production count. Blank-only lines are not split out.
- Independent equivalent implementations before/after: 0 / 1 map room. 0 / 1 souvenir gallery. 1 / 1 terminal hall. 1 / 1 trip and memory API.
- State/cache owners and public entry points before/after: the room is the `room` query on `/travel/terminal`. The private note stays in the session field `#harbor-note` and is not written or put in the URL. An owner change or session clear drops the note and the ferry ring state.
- Remaining old symbol/path search, including config and discovery: Travel routers have no diff. `routes.json` was not edited. Travel e2e discovery lists 35 files. `object=ferry` is still not a hall object.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +787. This evidence file is docs. No generated bundle is committed. `make build-frontends` exited 0. Release `2de1615d5a14a5987e85552e2348ff5e12a9e9b2ad1873c3ae0f06c08aec11ab`. The initial bundle stays over the 650 kB warning budget at 680.50 kB. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +1169 production lines. This is the map room, the souvenir gallery, and the hall buttons that open them. The positive delta is the feature.
- No behavior/data/meaningful assertion silently removed: confirmed. The hall still books an incomplete flight and opens a saved departure, return, and day. A failed map and a locked Finance session leave the itinerary, the PTO charge, and saved souvenirs usable.

## Verification

Commands ran in `/tmp/vivek-room-05` on `1a01e5157e44390ed6e0dec07a4c50df402da610`. `make test-fast` used `PATH="/tmp/vivek-room-05/.venv/bin:$PATH"`. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` set to that same Chrome. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Travel coverage printed a suggestion to pin 88.32%. The floor stayed 80.41%.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch ROOM-05` | Printed the commands below. It did not edit the queue. |
| `make test-fast` | PASS. Doc paths OK. Planning validation 88 active packets, 24 parents, 99 completed. 135 Python tests OK. 21 Node script tests pass. Travel e2e files are listed (35) and not executed by this gate. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 658 SUCCESS. Statements 77.59% (10322/13303), branches 65.28% (4602/7049), functions 79.64% (2195/2756), lines 82.61% (8974/10862). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS. 94 pass, 0 fail. |
| `make build-frontends` | PASS. Release hash above. Initial total 680.50 kB. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 210 passed (2.4m), including the harbor phone and desktop journeys and the existing terminal hall. |
| `make lint-python` | PASS. 264 files already formatted. Ruff 90, suppressions 6. Each matches its baseline. |
| `make typecheck-python` | PASS. mypy 79 findings match the baseline. |
| `./scripts/coverage-gate.sh travel` | PASS. 232 passed. Coverage 89.32%. Floor 80.41% unchanged. |

## Handoff

- PR URL (leaf closure keyword only): not opened when this sentence is written. The body will be only the leaf keyword for #455.
- Roadmap #134 append-only status-note URL: not added yet. The issue body will not be edited.
- Merged/activation status (actual evidence, not assumption): not merged when this sentence is written.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review of the rooms stays separate from these passing checks.
- Next actor: open the pull request, wait for required checks, then merge.
