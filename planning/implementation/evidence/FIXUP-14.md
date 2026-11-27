# FIXUP-14 — Make Travel Memories a scannable, browsable trip collection

- Leaf issue and parent(s): [#592](https://github.com/Vivekpsps3/vivek-monorepo/issues/592) under [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent/context, branch/worktree: branch `agent/fixup-14`, worktree `/tmp/vivek-fixup-14`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/592#issuecomment-7230019267). No subagents. The shared checkout was not edited.
- Base main SHA `3fb3260b0289273f8e364bbddc36a1d5c604720c`. Memories behavior tested at `09034f675866b0819477144bc528c5cafe180462`. This evidence file is the only change after that SHA.
- Fresh-main/prerequisite/active-PR checks: fetched `origin/main` before the worktree. TUX-10 (#422) is closed and is an ancestor. On this base, `/travel/memories` still reads `project_memories`, shows honest spans, separates credit from the log day, names overlaps, and keeps redate, cancel, and delete with the stale-response epoch, the unsent private note, and focus return. ROOM-05 (#455) is closed and is an ancestor. Harbor rooms still read that same memories projection (`span_text`, status) and were not edited. GAME-11 and FIXUP-32 were open on other branches and were not touched.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIXUP-14-A1 | Two past trips: Leap harbor (2024-02-28 through 2024-03-05, no city, logged late, overlaps Portland) and Portland (2024-02-27 through 2024-03-02, city Portland). At 390×844 night and 1280×800 light, the first title and its Open action are inside the viewport on arrival. The card shows the saved span, day count, city or `No saved city`, and `No credit · logged late` without repeating the other trip's span or the date-rule prose. Open goes to that trip and back returns to the same article. 320px and 200% text do not overflow the card. Reduced motion sets the card animation to `none`. | PASS | `apps/travel/e2e/memories.spec.js` test `two past trips lead with the first open action`, inside Travel Playwright (232 passed). Arrival log: 390×844 `titleTop=341` `openBottom=423`; 1280×800 `titleTop=273` `openBottom=299`. |
| FIXUP-14-A2 | Planned harbor, late-logged north and south, and credit-eligible coast and fjord. Redate, cancel, and delete stay behind `Manage {title}` and keep confirmation, PATCH `{start_date, end_date}` only, focus return to the card or `#trip-memories`, and the one-read session guards. A failed save keeps the private note. A late response keeps the newer draft and the previous card. A stale GET does not revert the newer list. Sign-out clears the note without a discard prompt. Missing city and late credit stay `No saved city` and `No credit · logged late`. | PASS | The existing memories journeys in the same Playwright file, plus `apps/travel/backend/static/tests/memories.test.mjs`. |

The packet records the audited 390×844 page: the first title started at y835 after a paragraph and a three-rule legend. On `3fb3260b` the template still rendered that muted paragraph and the `How these dates differ` list before any card, printed `Source trip {id}`, repeated `credit_text`, `logged_text`, `pixels_text`, `world_text`, and `overlap_text` on every card, and gave Open, Redate, Cancel, and Delete equal buttons. This session did not rebuild that old page. The repaired first card is inside both viewports.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Muted intro paragraph above the list | `memories.component.ts` template | The one `details.memory-rules` disclosure after the cards | Removed the paragraph. The three server `differences` items moved into that disclosure. | Playwright expects one `.memory-rules` and the two rule sentences only after it opens. |
| `Source trip {{ memory.trip_id }}` paragraph | The card template | `data-trip` and `memory-{id}` for tests and focus return. The API still returns `trip_id`. | Removed from primary reading. | `main` text does not match `Source trip` plus digits. Harbor still does not render the id. |
| Per-card `Span`, `Town credit`, `Pixels`, and `Place` headings and the long `overlap_text`, `logged_text`, `credit_text`, `pixels_text`, and `world_text` paragraphs | The card template | Server `project_memories` still owns those strings. The card shows `memoryDates`, `memoryPlace`, `memoryCredit`, and, only when late, the logged day and overlap titles. | Removed the repeated paragraphs from the card. | Node labels and Playwright facts. Python memories tests still assert the API strings. |
| Peer Open, Redate, Cancel, and Delete row | The card button row | Open stays a primary link. Redate, cancel, and delete stay in `details.memory-manage`. | Moved the three mutations into that disclosure. Native `details` is used so Escape still returns to Redate. | Playwright: Redate and Delete are hidden until Manage opens. Cancel, delete, failed save, and stale-response journeys still pass. |

- Candidate class and protected counterexamples: product removal of repeated reading, not of the trip, the projection, or the mutations. Credit policy, overlap detection, Pixels day counts, and harbor room copy stay on the server. Saved records and routes stay.
- Comparison base SHA `3fb3260b0289273f8e364bbddc36a1d5c604720c`. Closure is `memories.component.ts`, `memories.component.css`, `memories.mjs`, and `memories.d.mts`. No new production file. Harbor, media, finance, Pixels, and other Travel screens were not edited.
- Production added/deleted: 268 lines added and 63 removed across those four files. Net +205. `memories.mjs` adds 80 lines of display formatting that read the projection and do not recompute credit. CSS adds the card facts grid. This is a usability repair, not a simplification claim.
- Independent equivalent implementations before/after: one memories projection and one memories page. The card formatters do not post a second memory and do not invent a city or a credit date.
- State/cache owners and public entry points before/after: writes stay `PATCH` and `DELETE /travel/api/trips/{id}`. Reads stay `GET /travel/api/memories`. `acceptMemoryLoad`, `settleMemoryWrite`, `clearMemoryDraft`, and the component epochs are unchanged. Focus after save stays on the article. Focus after delete stays on `#trip-memories`.
- Remaining old symbol/path search: `Source trip` is gone from the Travel memories template. `credit_text`, `pixels_text`, `world_text`, and `overlap_text` remain on the API and in the Python tests. The page no longer interpolates them.
- Follow-up change: none in this leaf. Harbor gallery and Pixels keep their rendering owners.
- Tests/docs/generated changes separately: tests add 234 lines and remove 27 (`memories.test.mjs` +41, `memories.spec.js` +193/−27). `docs/TRAVEL.md` replaces the memories paragraph (1 added, 1 removed). This evidence file is separate. No bundle or screenshot is committed.
- Net production delta and exception: +205 production lines for the card facts, the management disclosure, and the rules disclosure. No reviewed boundary exception. The existing initial-bundle budget warning (732.53 kB) and unused Finance pipe warnings stayed as they were.
- No behavior/data/meaningful assertion silently removed: open, redate, cancel, delete, confirmation, private note, failed save, late response, stale GET, and sign-out clearing stay. Missing and late facts stay accurate. The server difference sentences survive inside the disclosure.

## Verification

Commands ran from `/tmp/vivek-fixup-14` on the tree committed as `09034f675866b0819477144bc528c5cafe180462`. `PATH="/tmp/vivek-fixup-14/.venv/bin:$PATH"` so `python3` is the shared venv. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at that same Chromium. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. `./scripts/coverage-gate.sh travel` was not run. The diff has no Travel Python file.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch FIXUP-14` | PASS. Prints `make test-fast`, `make lint-web`, `make typecheck-web`, root Karma, the travel node tests, `make build-frontends`, and Travel Playwright. |
| `make test-fast` | PASS. Doc paths OK. Planning validation PASS (120 active packets, 25 parents, 99 completed packets). 135 unittest tests OK. Node script tests 21 pass. Quality ratchets matched. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. |
| `make typecheck-web` | PASS. Web, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 767 SUCCESS. Statements 78.05% (12734/16314), branches 66.1% (5774/8735), functions 80.24% (2778/3462), lines 83.35% (11093/13308). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS. 96 pass, 0 fail. |
| `make build-frontends` | PASS. Initial total 732.53 kB. Release `0c3e125725c9aca4d2871f949fb7e78b5fa339facd561a91a8693e771ab2fdbe`. The existing 650 kB budget warning and NG8113 Finance warnings remain. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 232 passed (3.7m), including both arrival lines. |

This Chromium exposes `<summary>` as a disclosure triangle, so the memories journeys locate `summary` by text. Redate, Cancel, and Delete remain buttons.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/656. The body is only `Closes #592`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: none. This leaf does not need Immich, Obsidian, or an off-host backup.
- Next actor: review and merge this leaf only. #277 remains open.
