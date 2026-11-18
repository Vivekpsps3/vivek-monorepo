# MUX-03 — Build artist, album and song collection views

- Leaf #399. Tracking parent #304. Roadmap #134.
- Branch `agent/mux-03`. Worktree `/home/vivek/.grok/worktrees/deployments-vivek-monorepo/subagent-01a1ee48-bd82-7093-9216-c55165de8303`.
- Base main `b1b1b95cda284d5a67379723ff2789a9e8ce50ac` (archive merge of #508). Tested source SHA `2d3c1b4decd2ae1ba18f5a12d32e32c6996e9a29`. This evidence commit does not change that source.
- MUX-01 is on this base: implementation #505 merge `8e9ad566367158c1c61285d990bcec7d6288c9d0`, archive #506 merge `77ccd105d21bfe5c0a130614c221db30073b5bff`. MUX-02: implementation #507 merge `a0c8c1d6da9a0622085d9d3b8f56f2f640c13f84`, archive #508 merge `b1b1b95cda284d5a67379723ff2789a9e8ce50ac`. STYLE-03 is PR #496. Movies, Series, Books, Music Albums (`kind=album`), Songs (`kind=track`), and All items stay. Open PR #500 (`agent/nav-03`) edits Hub and Town only. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/399#issuecomment-6976390014

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| MUX-03-A1 | `test_default_collection_nests_one_album_without_following` saves Only Pressing and loose Loose Single (rating 3) under manual person-only “Only Voice”, Other Pressing under a different manual id that shares the display name, Quiet Pressing (year 2004, rating 8) containing Quiet Single (rating 2) under followed Quiet Voice, and an empty followed MusicBrainz Quiet Catalog. `GET /media/api/music-groups?sort=title` does not write links or call providers. Only Pressing appears once, with no songs. Loose Single is under “songs”, not inside the album. Other Pressing is a second catalog id. Quiet Single sits inside Quiet Pressing. Quiet Catalog has `saved_count` 0. Listening status `completed` returns none. `following` returns the two followed artists. `unfollowed` returns both Only Voice rows. `q` and `favorite` match the loose song’s group. `sort=rating` ranks the artist entry rating and ignores the album’s 8. User two sees nothing. Playwright `one album is one artist group` at 390×844 night touch and 1280×800 light keyboard opens Music from All items, shows four artists, expands Fixture Pressing once, reloads with the group still open, and opens the two Only Voice groups one at a time so Other Pressing is not inside the first. Albums shows three cards and no inline child panel. No discography or musicbrainz.org request. | PASS |
| MUX-03-A2 | The same API fixture keeps artist rating null, album 8, and song 2. Playwright `artist album and song return keeps ratings, group and scroll` follows 44 Cedar artists plus Cedar Artist Return, nests Cedar Pressing (rating 8) and Cedar Single (rating 3), opens page 2, expands the group, and records scroll below 150px. Touch or Enter opens the album: radio 8 is checked and 3 is not. The song page checks 3 and leaves 8 clear. “← Library” returns to the album, then to the same artist URL. The Hide control stays expanded, the album link is focused, scroll is within 10px, and the cards still show 8 / 10 and 3 / 10. Reload keeps the group. API ratings stay null, 8, and 3. Both viewports. | PASS |
| MUX-03-LIFE | `a late artist list does not replace the songs on screen` holds `GET /media/api/music-groups`, switches to Songs, then releases a Late Voice payload. North Single stays and the URL stays `kind=track`. `a failed artist read keeps the search and the saved rows` fills `#library-q` with North, then a 503 `Group offline` clears the heading and keeps the typed query. Retry library focuses `#library-heading` and restores North Voice. `a missing off-page group does not remove the artists already shown` keeps North Voice and the search when `group=999999` is 404, including after Retry saved music. `test_failed_grouping_does_not_change_owner_rows` still passes inside the media coverage gate. Library has no private draft store. Detail draft and sign-out clearing stay on their existing screens; the Media Playwright suite including those screens passed. | PASS |
| MUX-03-VIEW | Both matrix journeys above use reduced motion, 390×844 night touch and 1280×800 light keyboard. Artist, album, song, group, and back links assert a 44px box. Axe on `main` reports no serious or critical violations. Names of unfollowed artists are headings. Browse discography is a separate link and only for a followed MusicBrainz artist (`a musicbrainz follow keeps discography as a separate link`). Opening a group does not follow and does not request a discography. Screenshots `one-album-{width}-{theme}.png` and `return-{width}-{theme}.png` are attached to the Playwright report. | PASS |

Compilation, collaboration, feature, and same-name strangers stay on the MUX-02 tests in the same file and the same SHA. `test_compilation_collaboration_feature_and_unknown_stay_distinct` now also checks the nest: Shared Title stays under its Various Artists album credit, Compilation Single stays loose under the performer, and Both Names is one album id under each collaborator. Synthetic titles only: Fixture Voice, Only Voice, Silent Voice, Quiet Voice, Cedar Artist, North Voice, Catalog Voice. No listening history, tokens, or provider credentials.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition and proof |
| --- | --- | --- | --- |
| Inline saved-child panel on album and song cards | Album and song library cards expanded `saved_children`, which listed the open album again | Artist group page `GET /media/api/music-groups`, plus the album or song card link `Show {artist} (N)` | Deleted from album and song cards. Playwright album and song views assert `.saved-children` count 0. All-items artist expansion `#saved-{entryId}` remains, and `bundle-m` plus `screenshots` still find “Show saved albums and songs”. |
| Artist collection that listed only followed `UserEntry` rows | Music link `kind=artist` on `GET /media/api/library` | `list_saved_artist_groups` for the artist page only | `list_library` with `kind=artist` is unchanged and still returns artist entries. The Music screen calls the group list. Album and song screens still call the library list. |

- Feature replacement at base `b1b1b95cda284d5a67379723ff2789a9e8ce50ac`. Production files `journal.py`, `records.py`, `detail.component.html`, `detail.component.ts`, `library-filters.css`, `library-filters.mjs`, `library.component.ts`, and `media.models.ts`: 6361 lines before, 6854 after. Diff adds 574 and deletes 81 physical lines (net +493). Tests add 560 and delete 44 (`test_artist_groups.py` +183, `music-collection.spec.ts` 293, `artist-groups.spec.ts` +81/−43, plus the two small static and chrome edits). `apps/media/AGENTS.md` adds 4 and deletes 2. `docs/MEDIA.md` adds 3 and deletes 3. This evidence file is separate. The positive production delta is the saved-group list, the album-then-song nest, and the three Music views. It is not a simplification.
- One group read. The existing `GET /media/api/music-groups/{catalog_id}` still returns one artist, including `saved_children`. The new list route is registered before that detail route. No second library store and no new crypto protocol. STYLE-03 `media-card` is used and was not replaced. `returnPath` still allows `kind`, `status`, `sort`, `fav`, and `offset`. Song and album back links pass that library source so history restores `group` and scroll.
- Album, song, and other library filters stay in SQL. The artist page orders this user’s saved groups from the same membership after one read. Book pages add no group query.

## Verification

Node 20.20.2. Playwright 1.64.1 with cached Chromium 1248. This worktree has no `.venv`; Python gates used `PATH="/home/vivek/Deployments/vivek-monorepo/.venv/bin:$PATH"`. Karma used `CHROME_BIN` pointed at that same Chromium. The first Karma run failed with no Chrome binary. The rerun passed. Browser retries and coverage floors were unchanged. Media coverage printed 72.42% against floor 68.7% (rose from 69.70%; suggested floor 71.42% was not pinned). The production bundle reported the existing initial-size warning at 669.05 kB.

The first targeted Playwright run failed 3 and passed 8 because `getByRole('alert')` also matched the empty shell toast. Assertions now use `.local-error` and `.media-grid [role="alert"]`. Those 3 passed, then the full Media suite passed.

| Exact command | Final result |
| --- | --- |
| `PATH="/home/vivek/Deployments/vivek-monorepo/.venv/bin:$PATH" make test-fast` | PASS on the implementation tree and again with this evidence file present. Doc paths, planning validation (111 active, 24 parents, 76 completed), 135 unittest OK, e2e discovery media files=21, 21 Node script tests. |
| `make lint-python` | PASS. 244 files already formatted. Ruff 90 matches the baseline. Suppressions 6. |
| `make typecheck-python` | PASS. mypy 80 findings match the baseline. |
| `./scripts/coverage-gate.sh media` | PASS. 98 passed. 72.42% >= 68.7%. |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 42 tests, 0 failed. |
| `make lint-web` | PASS. |
| `make typecheck-web` | PASS. Seven TypeScript projects. |
| `CHROME_BIN="$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome" npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 415 of 415. Statements 72.66% (5780/7954). |
| `make build-frontends` | PASS. `dist/web` and release `ae9450d713a4072d021b17222c93a0bc7e77d37098f0d3e325d7f5cc517b1c3d`. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/media/e2e/playwright.config.ts --reporter=line` | PASS. 125 passed, 0 failed (1.0m), including both viewports of the one-album fixture, the return trip, the late list, the 503 search, and the missing group. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/509. `Closes #399` only. Parent #304 remains open.
- Roadmap #134 append-only status-note URL: after merge and archive.
- Merged/activation status: PR #509 is open. Local gates passed on `2d3c1b4decd2ae1ba18f5a12d32e32c6996e9a29`. Merge waits on required checks.
- Remaining external prerequisites: none for this leaf. MUX-04 through MUX-09 stay unbuilt. OPS-06 / #277 was not touched.
- Next actor: required CI, then merge, then archive.
