# ROOM-04 — implementation evidence

- Leaf issue and parent(s): [#454](https://github.com/Vivekpsps3/vivek-monorepo/issues/454) ROOM-04. Parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stays open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/room-04`; `/tmp/vivek-room-04`. The shared checkout was not edited. Health (`apps/web/src/app/town/health/`), Finance `public-api.ts`, and Town habit server files were not edited. Those Health files arrived through the FIT-03 merge.
- Base main SHA, current tested SHA: implementation base `57b69462126defe6bf3b8853237a8b18c1c9abcf` (SCENE-03 merge, pull request #555). Hall implementation `26931972ccc098d58c81d52d8aa904e2f7b7b3ea`. `origin/main` moved to `e8ff90ea5d736ea1fd01c73be02c2478e9d7cab0` (FIT-03 pull request #556) and was merged as `a4c54ddb1857e52bf2e67f858633c3dd80b756b2`. The verification table is the rerun on that merge. Travel guidance stays at 298 words.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441, pull request #555) is the base. `library-room` is present. TUX-04 (#409, pull request #537) flight-first capture is `flight-start.component.ts` / `flight-start.mjs`, and a new trip still leaves the return empty. TUX-06 (#411, pull request #539) local-day itinerary is `trip.component.ts` with `settleItineraryWrite`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/454#issuecomment-7050417952). At launch, no competing pull request owned `travel-forms` or `travel-ui`. FIT-03 later merged and is an ancestor of `a4c54ddb`.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ROOM-04-A1 | Empty Terminal shows the flight number field, “Edit times manually”, “No saved departures”, and “No trip days yet”. A stubbed UA837 lookup, then a typed local time, plans a new trip with an empty return. Save draft posts `end_date: null` and no PTO flag. Home stays empty and PTO entries stay empty. | PASS | `apps/travel/e2e/terminal-hall.spec.js` phone and desktop journeys. `terminal-hall.component.spec.ts` empty desk. `terminal-hall.test.mjs` empty home. |
| ROOM-04-A2 | Synthetic Harbor week (`counts_as_pto: false`) has outbound UA100 SFO→HND on 2026-12-12 and inbound UA200 HND→SFO on 2026-12-14. Opening each leg restores that flight, airports, local time, and role in the existing transport editor. Escape and “Discard changes”, then “← Terminal”, focuses that row and keeps `object`, `trip`, `leg`, and `day`. Opening 2026-12-13 focuses that saved day. Transport ids, the trip end date, PTO entries, and the home trip id stay unchanged. The inspect phase records no trip write. | PASS | The same Playwright journeys. `terminal-hall.test.mjs` keeps the two legs, drops an id-less leg, and sets `createsTrip: false`. |
| ROOM-04-LIFE | A 502 lookup keeps “UA 404” and the typed date, with the manual-time action still available. A held home response after sign-out does not publish the hall or the typed ident. An owner change or session clear cancels the home request and clears the desk. A changed flight number drops a late attach. A 502 attach keeps the typed ident and the retry sentence. A flight whose return is already set does not navigate. | PASS | Playwright failed-lookup and late-home tests. `terminal-hall.component.spec.ts` failure, owner, and stale-attach tests. `terminal-hall.test.mjs` `acceptHallLoad` and `clearHallDesk`. |
| ROOM-04-VIEW | 390×844 dark touch and 1280×800 light keyboard, reduced motion. The flight field is focused on an empty hall before and after the theme round trip. Board, desk, and table controls are at least 44px. `animationName` is `none`. Body text is `rgb(24, 46, 64)` in light and `rgb(255, 240, 212)` in night. The document does not grow horizontally. Axe serious and critical violations are empty, including `/travel/terminal` in the screen sweep. | PASS | Both Playwright hall journeys and `apps/travel/e2e/axe.spec.js`. |

Fixtures are synthetic. Harbor week, UA100, UA200, and the stubbed UA837 lookup are test data. The hall reads `GET /travel/api/home` and the existing trip, transport, and day routes. It does not add a trip store or a live provider call. The return role on a saved leg is `inbound`.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Superseded presentation, copied state, or no-op hall path | None. No Terminal route or hall component existed on `57b69462`. | `TerminalHallComponent` at `/travel/terminal`, reading the existing home and trip APIs. Flight capture stays `FlightStartComponent`. Day detail stays `TripComponent`. | None removed. The trips list, manual new-trip dates, and the flight form’s manual-time and empty-trip choices stay. | `git diff 57b69462..26931972` adds the hall and does not delete a prior hall symbol. |

- Candidate class and protected counterexamples: feature addition. Saved trips, draft returns, manual times, PTO charges, and the flight lookup adapter stay on their existing owners.
- Comparison base SHA and full replacement closure (including new files): `57b69462126defe6bf3b8853237a8b18c1c9abcf`. New production files: `terminal-hall.component.ts` (303), `terminal-hall.component.html` (135), `terminal-hall.component.css` (76), `terminal-hall.mjs` (163), `terminal-hall.d.mts` (59). Changed production files: `new-trip.component.ts`, `public-api.ts`, `travel-navigation.ts`, `trip.component.ts`, `trip.component.html`, `apps/web/routes.json`, `packages/ui/src/return-context.ts`.
- Production added/deleted/moved; comments/blank-only churn separately: production +799/−5, net +794. Docs +3/−1 (`docs/TRAVEL.md` and Travel `AGENTS.md`). Blank-only lines are not split out.
- Independent equivalent implementations before/after: 0 / 1 hall. 1 / 1 trip store (home and trip APIs). 1 / 1 flight-first form. 1 / 1 local-day itinerary.
- State/cache owners and public entry points before/after: trips stay on the travel API. The desk draft stays in the flight form for the session and clears on sign-out. Return focus uses the existing return context, now allowing `/travel/terminal` with `object`, `trip`, `leg`, and `day`. Public entry is `/travel/terminal`. Trip back remains “← Trips” unless the trip was opened from the hall.
- Remaining old symbol/path search, including config and discovery: no previous `travel-terminal-hall` symbol. `routes.json` includes `terminal` in the Travel document pattern. Section nav lists Terminal with `exact: true`, so a trip URL stays under Trips.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. Map room, souvenir gallery, PTO desk, and postcard stay with later room leaves. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +697/−1, net +696 (`terminal-hall.test.mjs`, `terminal-hall.component.spec.ts`, `terminal-hall.spec.js`, `axe.spec.js`, `section-nav.spec.ts`, `return-context.spec.ts`). Docs are Travel guidance and this evidence file. No generated bundle is committed. `make build-frontends` exited 0 on `a4c54ddb`. Release `419fcea16dde51420a1c61ac3c695f9df89aa00d85dbabc5e2c0a2f0e1549afd`. The earlier release on the pre-merge tree was `bb28ce3dff8d50591710547e2160860346709c8c245f309c89af48bca6a0c556`. The initial-bundle warning is 679.61 kB against the 650 kB warning budget. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +794 production lines. This is the feature: departure board, booking desk, and itinerary table on the saved trips. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Travel Playwright is 206 passed on the merge, including the hall journeys and the existing flight, draft, and itinerary tests.

## Verification

Commands ran in `/tmp/vivek-room-04`. `make test-fast` and `make build-frontends` used `PATH="/tmp/vivek-room-04/.venv/bin:$PATH"`. Karma and Playwright used `CHROME_BIN` / `PLAYWRIGHT_CHROMIUM_EXECUTABLE` `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout. Neither symlink is committed. The same commands first passed on the uncommitted product at base `57b69462` (Karma 548, Travel Playwright 206, release `bb28ce3d`). They were rerun on merge `a4c54ddb1857e52bf2e67f858633c3dd80b756b2`. The table is that rerun. Playwright serves `dist/web`, so the bundle was rebuilt before the browser gate.

| Command | Result |
| --- | --- |
| make test-fast | PASS on `a4c54ddb`. Planning/docs, boundaries, 135 Python tests, and 21 Node script tests. Travel e2e files are listed (34) and not executed by this gate. |
| make lint-web | PASS on `a4c54ddb`. eslint-finance 344 findings match the baseline. eslint-site 9, eslint-packages 1, eslint-world-engine 0. |
| make typecheck-web | PASS on `a4c54ddb`. Web app and spec, Finance, packages, and site. |
| npm run test:web -- --watch=false --browsers=ChromeHeadlessCI | PASS on `a4c54ddb`. 552 SUCCESS. Statements 76.33% (8304/10878), branches 63.07% (3531/5598), functions 77.37% (1700/2197), lines 81.42% (7214/8860). The added Health tests came with the FIT-03 merge. |
| node --test apps/travel/backend/static/tests/*.test.mjs | PASS on `a4c54ddb`. 88 pass, 0 fail. |
| make build-frontends | PASS on `a4c54ddb`. Production build and release manifest. Warning budget and Finance import warnings as above. Exit 0. Release `419fcea16dde51420a1c61ac3c695f9df89aa00d85dbabc5e2c0a2f0e1549afd`. |
| npx playwright test --config apps/travel/e2e/playwright.config.js | PASS on `a4c54ddb`. 206 passed (1.9m), including the phone and desktop hall journeys, the failed lookup, the late home after sign-out, and the Travel axe sweep. |
| make lint-python, make typecheck-python, ./scripts/coverage-gate.sh travel, ./scripts/coverage-gate.sh server | NOT RUN. This leaf's diff has no Python product code. `make test-fast` covers the Travel guidance path. |

## Handoff

- PR URL (leaf closure keyword only): not opened when this sentence is written.
- Roadmap #134 append-only status-note URL: added after the merge, without editing the issue body.
- Merged/activation status (actual evidence, not assumption): `origin/main` `e8ff90ea5d736ea1fd01c73be02c2478e9d7cab0` is merged as `a4c54ddb1857e52bf2e67f858633c3dd80b756b2`. The pull request itself is not opened when this sentence is written.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review and deployed activation stay separate. Later room leaves own the map, souvenirs, PTO desk, and postcard.
- Next actor: this implementer pushes the branch, opens the pull request, waits for the required checks, then merges with a merge commit.
