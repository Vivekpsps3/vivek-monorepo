# FIXUP-11 — Health opens with the next action

- Leaf [#589](https://github.com/Vivekpsps3/vivek-monorepo/issues/589) under [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Branch `agent/fixup-11`, isolated worktree `/tmp/vivek-fixup-11`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/589#issuecomment-7204025271).
- Base `f2630a169f92fd2d7feba15072c36c878d7f0cc4`. FIXUP-01 `57caac17`, HEAL-05 `e2f1d28e`, ROOM-11 `087344d4`, ROOM-12 `64a9a2a2` and ROOM-13 `73a289b4` are ancestors. Current main supplies Hub Quick add, the owner-bound vault lifecycle, Gym floor and progress, and the Clinic stations. No competing claim or open PR was present.
- Production revision `290418fc6569643ad37d9e2425656aae4faedb1d`. Browser regression revision `c3ecfbe8182ed40b63f8b5a1bc6341411510e2b5`.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| Audited baseline | A separate production build of `27c99dc2` at 390×844 reproduced duplicate setup instructions. Clinic Setup was at y929 and Unlock at y977. Gym Setup was at y1457 and Unlock at y1505. With a synthetic measurement and PR, Clinic Measurements began at y977 and Add weight was at y1307. Gym Workouts began at y3450. | Reproduced |
| FIXUP-11-A1 | Enter Clinic from the Town Wellness district. Unlock is fully visible and the scene has one inert preview. Open a direct Gym entry at the routine desk and record cabinet, simulate unavailable status, retry in place, and unlock to the exact entry, desk and cabinet. Owner A sees the saved PR after unlock. Reload as owner B with no vault. Set up Finance is on the first screen, with no private rows, inputs, dates, markers or downstairs/upstairs control duplicates. Setup carries the same exact URL. | PASS at 390×844 and 1280×800 in light and night |
| FIXUP-11-A2 | Clinic Add weight is fully visible in the initial viewport. Cancel and open Record weight from the scene. It keeps the typed value in the same editor and focus returns to each opener. Explore room and Clinic records focus their sections. Gym Start workout is fully visible in the initial viewport. A failed draft save keeps its set ID. Cancel focuses the same top action, now Resume workout. Retry saves one draft. Workouts, Progress and Records and trophies focus their sections. The scene's Record sets opens the same saved session with the same set ID. | PASS at 390×844 and 1280×800 in light and night, with touch and keyboard |
| Narrow and enlarged | Actual computed root text is 32px at 320×844. Clinic setup, Gym unlock and Gym Start workout each remain within the initial viewport and at least 44px high. A ready Gym has no horizontal overflow. | PASS |
| Compatibility | The existing full Health suite covers setup, Clinic deep links for each station, archive privacy, units, failed writes, row focus, workout conflicts, Quick add exact Hub return, lock and rest-timer disposal. | See full Town result |

The nine focused tests in `apps/web/e2e/health-entry.spec.ts` use reduced motion
and keep after screenshots in the local Playwright report. The audited fixture
captured the gated and ready rooms in
`/tmp/vivek-fixup-11-baseline/playwright-report/town`. Independent owner visual
review remains pending.

## Deletion and compatibility

| Candidate | Disposition | Proof |
| --- | --- | --- |
| Vault instructions repeated in Clinic and both Gym inspectors | Removed the setup, locked and unavailable description branches from all three scene models. Health Room owns the single state message and action. The first scene keeps its existing static artwork as an inert preview. The mezzanine mounts only when ready. | Four two-owner/failure and return journeys, plus locked station and archive behavior |
| Add weight at the bottom of the measurement list | Moved its existing control and editor handler to the top. The five other Clinic actions and the station controls remain available. | Same draft across direct and station entry, focus returns to each opener |
| Add session as a second unconditional launch prompt | Replaced it with the top Start or Resume workout action, which shares the current-session entry with the floor station and Hub. Existing history Resume controls address their exact sessions. New session is offered in Workouts when the top action would restore a different existing session. | Failed-save, return focus, same-session and history tests |
| Local presence treated as an authoritative lock | The existing Health gate checks the current owner's vault status when a stale local presence flag reaches a locked store. Generation checks still guard every asynchronous publication. | Owner B receives setup instead of owner A's locked status. Owner A's data remains absent. |

The production diff adds 316 and removes 307 physical lines, including relocated
markup and indentation. With whitespace ignored, 168 lines are added and 159
removed. The net nine lines add section focus, conditional direct actions, and
allowlisted public room coordinates for exact vault return. The scene-specific
copies of gate instructions are gone. The Health store, encrypted formats,
revision owner, calculations and route entry points stay in their existing
owners. The production lazy Health bundle grows from 30.67 to 31.03 kB estimated
transfer size. All preview and scene art use the existing CSS and load no new
art files. Tests add 279 and remove 115 lines. Guidance adds two and removes
three. No binaries are committed.

## Verification

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Planning, ownership and doc-path checks, 135 Python tests, 21 Node tests and browser discovery. |
| `make lint-web` and `make typecheck-web` | PASS. Existing lint baselines match. Seven TypeScript projects compile. |
| `make build-frontends` | PASS. Release manifest `46b015c7f59bcc6fce77000ac89be7a21d3753004c3315745ccfebb4837a3e82`. Existing initial-bundle warning is 731.20 kB against the 650 kB warning threshold. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 719 tests, 77.88% statements. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 553 tests, 65.22% statements. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts --output /tmp/vivek-fixup-11-town-verified-results` | PASS. 272 Town, Health, World and Pixels cases. |
| `npx playwright test --project=suite --output /tmp/vivek-fixup-11-suite-verified-results` | PASS. 75 cross-app cases. |
| `make e2e` | PASS. 297 Finance browser cases and five existing skips. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts --output /tmp/vivek-fixup-11-media-verified-results` | PASS. 197 Media browser cases. |
| `npx playwright test` from `apps/travel/e2e` | PASS. 210 Travel browser cases. |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS. 94 Travel runtime tests. |

Chromium passed all nine first-screen regressions and all twelve focused
compatibility journeys. Initial Town failures exercised the removed gated
scene controls or matched both the new Resume workout action and the history
row. The updated tests verify every affected locked deep link, retain the
marker and ciphertext assertions, and distinguish the two controls. An early
Media run overlapped a local bundle rebuild and failed three blank-page
journeys. All 197 passed against the stable build.

## Handoff

The PR closes only #589. Final merge and closure evidence belongs in a scoped
comment on [roadmap #134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134).
