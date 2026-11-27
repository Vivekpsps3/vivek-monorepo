# FIXUP-05 — Saved Media starts the collection

- Leaf [#583](https://github.com/Vivekpsps3/vivek-monorepo/issues/583) under [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Branch `agent/fixup-05`, isolated worktree `/tmp/vivek-fixup-05`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/583#issuecomment-7218991650).
- Base `0710741918818e67fc73e9f1112517be87500bc5`. MUX-04 `b912b040`, MUX-05 `70d13691`, MUX-06 `7f55790a`, ROOM-06 `6244f204`, ROOM-07 `9d6b74eb`, ROOM-08 `f527ccf6`, and ROOM-09 `b4975fff` are ancestors. No competing claim or open PR was present.
- Tested production revision `4f35408edcc0298a171768787915b5aeae65c244`.

## Acceptance

Synthetic records, entered from `/media` through the Media section nav, reduced motion, scroll 0. Titles: film “Paper Lantern on a very long coastal marquee”, series “Lantern Hour”, book “Glass House”, artist “Lantern Voice”. Bounds are viewport coordinates. A control counts as fully visible when its box sits under the sticky header and section nav and inside the viewport, and an action is at least 44px.

| Row | Executed proof | Result |
| --- | --- | --- |
| Audited baseline | Same synthetic records on the base bundle at 390×844. Film title y1500, Open screening y1576–1634. Series title y1301, Open seating y1417. Book title y1493–1613. Artist title y1753, portrait y1413–1745, and the song stage was above the artist wall. | Reproduced |
| FIXUP-05-A1 | Populated item and open/continue action, then a filtered empty result with Clear filters and Search Media. Light and night matched. | PASS |
| FIXUP-05-A2 | Keyboard: Planned films, scroll, open the record, return keeps kind, status, and scroll within 80px. Edit the ticket note and return focus to Open screening. Status stays want. Music grouping URL and album return keep the group. Touch: book progress 12 pages becomes p. 18 and focus returns to Update progress. No TMDB, MusicBrainz, Open Library, IGDB, or RAWG request. | PASS |
| Narrow and enlarged | At 320×844 the film Open screening is y740–784 under chrome y209. At 200% root text the same action stays at least 44px and the page does not overflow horizontally. | PASS |

After bounds, light and night:

| Viewport | Chrome | Film title / action / clear | Series title / action / clear | Book title / action / clear | Artist title / action / clear |
| --- | --- | --- | --- | --- | --- |
| 390×844 | 209 | 567–615 / 647–691 / 704–748 | 511–555 / 627–671 / 644–688 | 720–764 / 770–814 / 785–829 | 654–684 / 688–760 / 776–820 |
| 1280×800 | 129 | 452–496 / 528–572 / 563–607 | 396–440 / 512–556 / 503–547 | 501–545 / 551–595 / 541–585 | 491–521 / 525–597 / 613–657 |

`apps/media/e2e/collection-start.spec.ts` records these bounds. Existing theater, shelf, book, and music journeys still cover the ticket, next episode, reading desk, and artist group.

## Deletion and compatibility

| Candidate | Disposition | Proof |
| --- | --- | --- |
| Theater lobby and “Go to” cards | Removed. Screening board, poster corridor, auditorium, ticket desk, and Exit to Hub remain. The one no-play sentence is the movie summary. | Poster opens the ticket. Open screening is in view. |
| Episode-lounge lobby, jump cards, and the seating no-play line | Removed. Next-episode board is first, seating follows, then the calendar link and Exit to Hub. The one no-play sentence is the series summary. | Open seating is in view. Caught-up and watch behavior stays in the existing shelf tests. |
| Reading-hall lobby and jump cards | Removed. Shelf signs and the cover/text choice stay with the spines. The reading desk and completion keepsakes stay after the books. The one no-play sentence is the book summary. | Update progress is in view. Progress and scroll return stay in the book suite. |
| Music stage ahead of the artist wall, and repeated no-play lines | The stage mounts after the saved wall, including when the library read fails. One boundary remains on the stage: “This bar does not play audio.” Harbor Rhythm and the songbook no longer repeat it. | Artist portrait is above the song stage. External-link and draft tests still pass. |

The production diff, whitespace ignored, adds 179 lines and removes 273 across the library, theater, lounge, shelf, and music owners. With whitespace, those files add 199 and remove 293. Tests add the 245-line collection-start spec and 25 other lines, and remove 20. The ticket form, book desk, next-episode control, artist grouping, arcade tables, routes, and saved-read ownership are unchanged. Game launch placement is untouched. Completion and progress still mean the recorded status and the recorded page, percent, or hour.

## Verification

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Planning, ownership, and doc-path checks, 135 Python tests, 21 Node tests, and browser discovery. The project virtualenv supplied Alembic; the first shell `python3` did not. |
| `make lint-web` and `make typecheck-web` | PASS. Existing lint baselines match. Seven TypeScript projects compile. |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 63 tests. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 719 tests, 77.88% statements. Chrome was the Playwright Chromium binary. |
| `make build-frontends` | PASS. Release `0df1deb976cd8315293389fe446d14f6987795f2fce7da946d043f04e362bd95`. Library chunk transfer size 26.66 kB. Existing initial-bundle warning is 730.68 kB against the 650 kB warning threshold. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 203 Media browser cases. |

## Handoff

The PR closes only #583. Final merge and closure evidence belongs in a scoped comment on [roadmap #134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134).
