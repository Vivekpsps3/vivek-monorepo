# MUX-05 — Build readable book shelves and reading actions

- Leaf #401. Tracking parent #304. Roadmap #134.
- Branch `agent/mux-05`. Worktree `/home/vivek/.grok/worktrees/deployments-vivek-monorepo/subagent-01a1eec7-9e5d-7d92-a91d-f513f2ab8c56`.
- Base main `67fb3799d8f6a39daa4b0d619bd4607473fbd7e6` (archive merge of #512). Tested source SHA `6bc6b4c64f8acc35407b5d05072da9b56ecded3f`. This evidence commit does not change that source.
- MUX-01 is on this base: implementation #505 merge `8e9ad566367158c1c61285d990bcec7d6288c9d0`. STYLE-03 is PR #496. MUX-04 is on this base and was not reimplemented: implementation #511 merge `b912b0407340a1bb5f1efeca29f76f6eb0863c8d`, archive #512 merge `67fb3799d8f6a39daa4b0d619bd4607473fbd7e6`. Movies and Series stay poster shelves. Open PR #500 (`agent/nav-03`) edits Hub and Town only. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/401#issuecomment-6979764691

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| MUX-05-A1 | Playwright `updating a current book and coming back keeps progress and scroll` opens Glass House from the text shelf, sets Progress to 88 and the note to “Returned from the reading desk.”, waits for “Changes saved.”, and goes back. The URL keeps `kind=book`, `sort=title`, and `face=text`. Scroll stays within 80px of the shelf position. The card shows `p. 88` and the new note. The stored entry is progress 88, label `p. 88`, and that review, with `completed_on` absent. The same journey at 1280 with `status=in_progress` returns to that shelf. The four-viewport journey also saves page 40 to 41 and “A revised synthetic note.” from the inline desk and returns focus to “Update progress for Glass House”. `test_book_cards_group_only_real_identities_and_keep_unknown_progress` moves Glass House to completed and keeps page 40 and the review. | PASS at `6bc6b4c64f8acc35407b5d05072da9b56ecded3f` |
| MUX-05-A2 | The same browser journey shows Missing Cover Tale with `data-cover=missing`, no image, the title on the spine, and “Author not linked”. Other Glass House stays `data-author=unlinked` with “Ada Writer · not linked” and is outside the `openlibrary:OL10A` group. A second Glass House with no author id stays a separate to-read book. Harbor Cycle One and Two group under `openlibrary:OL55S`; Harbor Cycle Three, whose series is only a name, stays outside that group. Quiet Index shows “Progress unknown”, not 100% and not a year. A broken cover falls back to a labeled spine. Node `books.test.mjs` covers the same shelf, identity, and unknown-progress cases. The Python card test keeps two Glass House rows, a linked author, a null name-only series, an excerpt rather than the full review, and no `completed_on`. `test_openlibrary_detail_stores_only_canonical_author_and_series_keys` stores OL10A and OL55S and drops name-only series. | PASS at `6bc6b4c64f8acc35407b5d05072da9b56ecded3f` |
| MUX-05-LIFE | `a failed save keeps the book and the typed progress` leaves typed 55 on the desk and stored page 40 after a 502. `a late shelf move does not rewrite the movie shelf, and sign-out clears the draft` fulfills a held status patch after Movies is open, leaves the movie poster count at 1, keeps the server status `want`, and a logout plus 401 removes every `media-item-draft:` key. The Python test rejects percent 140 with 422 and leaves page 40, and another principal’s 404 does not change progress. | PASS at `6bc6b4c64f8acc35407b5d05072da9b56ecded3f` |
| MUX-05-VIEW | `reads titles, authors, and progress without a poster grid` runs at 390×844 light keyboard, 390×844 night touch, 1280×800 light touch, and 1280×800 night keyboard, with reduced motion. Spine and text are both used. Text view has no images and survives reload with `kind`, `sort`, and `face=text`. Title links and Update progress are at least 44px. Keyboard uses focus and Enter. Touch uses tap. Axe on `main` reports no serious or critical violations. `expectCleanMediaPage` stays clean. Empty Books says “No books saved yet”. An empty Current shelf says “Nothing you're reading right now.” and an empty Read shelf says “No finished books on this shelf.” All items stay rows. Dense book titles, a recorded favorite, and `10 / 10` stay inside the shelf at 320 and at 200% text, with no horizontal overflow and no axe violations. Theater shelves still show movie and series posters, next-episode, and Undo. Screenshots for each book matrix cell are attached to the Playwright report and are not committed. | PASS at `6bc6b4c64f8acc35407b5d05072da9b56ecded3f` |

Synthetic titles only: Glass House, Second Glass, Other Glass House, Missing Cover Tale, Harbor Cycle One, Harbor Cycle Two, Harbor Cycle Three, Quiet Index, Imported Glass, Paper Lantern, Aisle 01–10, Shelf 00–24, Tide, and the long Coastal Almanac title. No real reading history or provider credentials.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition and proof |
| --- | --- | --- | --- |
| Generic book row inside the Books collection | Books library page used `media-card` rows | `media-book-shelf` for `kind=book`. `media-card` remains the row and poster owner for Movies, Series, Music, Games, Now, and All items | Replaced for Books only. Theater, collections, dense titles, and All items passed in the full Media Playwright suite. STYLE-03 card material was not replaced. |
| No prior book-shelf store | None | Existing entry status, `progress_value`, `progress_unit`, `review`, and `catalog.extra` Open Library keys | No second library store and no new crypto protocol. Unknown progress stays unknown. A finished move does not invent a percent or show `completed_on`. |

- Feature replacement at base `67fb3799d8f6a39daa4b0d619bd4607473fbd7e6`. Production files `providers.py`, `records.py`, `book-shelf.component.css`, `book-shelf.component.ts`, `books.d.mts`, `books.mjs`, `library-filters.css`, `library-filters.mjs`, `library.component.ts`, `media.models.ts`, and `return-context.ts`: 7265 lines before, 8562 after. Diff adds 1314 and deletes 17 physical lines (net +1297). Tests add 851 and delete 14 (`books.test.mjs` 142, `test_book_shelves.py` 244, `test_provider_contracts.py` 39, `book-shelf.spec.ts` 406, plus small locator updates). `docs/MEDIA.md` adds 1 and deletes 1. This evidence file is separate. The positive production delta is the book shelf, the text view, identity grouping, and the reading desk. It is not a simplification.
- Shelves reuse `in_progress`, `completed`, and `want`. Paused, dropped, and anticipating stay on an honest Other shelf. `face=text` is a library URL coordinate allowlisted by ReturnContext. Grouping uses only `openlibrary:OL…A` and `openlibrary:OL…S`. Drafts stay in the existing `media-item-draft:` session store.

## Verification

Playwright with cached Chromium 1248. This worktree has no `.venv` or `node_modules`; gates used the symlinks to `/home/vivek/Deployments/vivek-monorepo/.venv` and `node_modules`. Python gates used `PATH=".venv/bin:$PATH"`. Karma used `CHROME_BIN` pointed at that Chromium. The first full Media Playwright run failed 12 tests that still looked for the old book row, the old Books summary, or a single text node for a title that now also prints on the spine. Locators now use the shelf link, and a recorded rating and favorite stay on the volume. The rerun passed. Browser retries and coverage floors were unchanged. Media coverage printed 73.66% against floor 68.7% (suggested floor 72.66% was not pinned). The production bundle reported the existing initial-size warning at 669.53 kB. Release `f9f0e289b78919be7a8dd420b57a49ecc0b4fd31fa949da7b27319fa858828c5`.

| Exact command | Final result |
| --- | --- |
| `PATH=".venv/bin:$PATH" make test-fast` | PASS on the implementation tree and again with this evidence file present. Doc paths, planning validation (109 active packets, 24 parents, 78 completed), blame ignore, shared boundaries, finance UX F1, 135 unittest OK, e2e discovery media files=23, 21 Node script tests. |
| `PATH=".venv/bin:$PATH" make lint-python` | PASS. 246 files already formatted. Ruff 90 matches the baseline. Suppressions 6. |
| `PATH=".venv/bin:$PATH" make typecheck-python` | PASS. mypy 80 findings match the baseline. |
| `PATH=".venv/bin:$PATH" ./scripts/coverage-gate.sh media` | PASS. 104 passed. 73.66% >= 68.7%. |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 46 tests, 0 failed. |
| `make lint-web` | PASS after the template comparisons were made strict. ESLint baselines matched. Engine purity OK. |
| `make typecheck-web` | PASS. Seven TypeScript projects. |
| `CHROME_BIN="$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome" npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 415 of 415. Statements 72.66% (5780/7954). |
| `make build-frontends` | PASS. Release `f9f0e289b78919be7a8dd420b57a49ecc0b4fd31fa949da7b27319fa858828c5`. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts --reporter=line` | PASS. 141 passed, 0 failed (56.8s), including the four book viewports, progress return, missing cover, unlinked author, failed save, late move, empty shelves, Movies, Series, collections, and All items. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/513. `Closes #401` only. Parent #304 remains open.
- Roadmap #134 append-only status-note URL: after merge and archive.
- Merged/activation status: PR #513 is open. Local gates passed on `6bc6b4c64f8acc35407b5d05072da9b56ecded3f`. Merge waits on required checks.
- Remaining external prerequisites: none for this leaf. MUX-06 through MUX-09 stay unbuilt. OPS-06 / #277 was not touched.
- Next actor: open the pull request, wait for required checks, merge, then archive. Parent #304 remains open.
