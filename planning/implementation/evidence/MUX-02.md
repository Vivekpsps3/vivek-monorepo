# MUX-02 — Group saved music by canonical artist identity without duplicate membership

- Leaf #398. Tracking parent #304. Roadmap #134.
- Branch `agent/mux-02`. Worktree `/home/vivek/.grok/worktrees/deployments-vivek-monorepo/subagent-01a1ee04-ca25-7a73-93b9-e32bd1d9e1b5`.
- Base main `77ccd105d21bfe5c0a130614c221db30073b5bff` (archive merge of #506). Tested source SHA `4721685600802d793f087eaf10ec4c0a8ab04209`. This evidence commit does not change that source.
- MUX-01 is on this base: implementation #505 merge `8e9ad566367158c1c61285d990bcec7d6288c9d0`, archive #506 merge `77ccd105d21bfe5c0a130614c221db30073b5bff`. Movies, Series, Books, Music Albums (`kind=album`), Songs (`kind=track`), and All items stay. Open PR #500 (`agent/nav-03`) edits Hub and Town only. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/398#issuecomment-6974995698

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| MUX-02-A1 | `test_one_linked_album_has_one_membership_in_each_collection` saves one MusicBrainz pressing twice, then the same artist’s song. One casefolded artist catalog, one album entry, one song entry, album and song library cards once each, artist library empty, and one `artist_groups` row with `followed` false and `saved_count` 2. `GET /media/api/music-groups/{id}` returns those two children. A decoy `artist_identity` does not add a second membership when provider credits exist. Book and movie pages omit `artist_groups`. Playwright `one saved album stays one membership` at 390×844 and 1280×800 shows one album card, no artist link, `Show North Voice, not followed (2)`, and both saved titles once. Songs shows one song card and drops `group`. | PASS |
| MUX-02-A2 | `test_saving_before_follow_groups_the_album_and_skips_the_discography` saves the album first: one album lookup, no artist lookup, `musicbrainz_artist_catalog` not called, group `followed` false and `entry_id` null, artist collection empty. A later from-provider follow reuses that catalog, sets status following, keeps `saved_count` 1, and does not import releases. The same Playwright journey follows `person-north-voice` only after the saves, then Artists shows one North Voice row and `Show saved albums and songs (2)`. Browse discography is visible and no discography or musicbrainz.org request is sent. The album card then reads `Show North Voice (2)` and the grid still has one card. | PASS |
| MUX-02-LIFE | `test_failed_grouping_does_not_change_owner_rows` raises inside `_link_canonical_artists` after flush and inside album lookup. Both return 500, owner-one’s review and owner-two’s notes and rating stay, and a later save succeeds. Library and group GETs with link, catalog, lookup, and album-repair writes forbidden stay 200. User two’s group read of user one’s artist is 404. Playwright keeps `#library-q` at North when the group read returns 503 `Group offline`, keeps the album link, and Retry saved music restores North Single. `a late artist group does not replace the group on screen` holds the first group response, switches to South Voice, and the released North payload does not replace South Pressing. Library has no private draft store. Detail drafts and sign-out clearing stay on their existing screens; the Media Playwright suite including session-expiry draft removal passed. | PASS |

Compilation, collaboration, feature, unknown, and manual identity are the same file and the same SHA. `test_credit_roles_do_not_collapse_on_a_shared_name` and `test_compilation_collaboration_feature_and_unknown_stay_distinct`: the public Various Artists id is the only various credit; a different person named Various Artists stays a different catalog even when the album title matches; a compilation is not linked to its track performer; `&` keeps the album once under each collaborator; a featured credit creates no catalog and does not replace the primary; partial shared names stay distinct; a nameless credit does not group. `test_manual_identity_groups_without_merging_titles`: the same manual `source_id` groups an album and a song without a follow; a different `source_id` with the same display name does not; a `source_id` equal to the title is 422; identity on a book is 422; client-supplied `extra.artist_credits` is stripped; a title-only artist links only for the owner who already has that entry.

Synthetic titles only: North Voice, South Voice, Harbor-style pressings in the API fixtures, and manual ids such as `person-north-voice`. No listening history, tokens, or provider credentials.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition and proof |
| --- | --- | --- | --- |
| `_link_saved_artists` | Album placement in `_place_musicbrainz_album` (both return paths) and provider album save | `_link_canonical_artists` | Deleted. Callers migrated in this commit. It linked an album only when this user already had a MusicBrainz artist entry. The replacement writes one public link per canonical credit or explicit identity and does not create or follow a user entry. |
| Saved-child counting that could repeat one song under an album and a direct recording link | Artist detail `music.saved_count` and library expansion | `_saved_child_ids` set of entry ids, then `_saved_child_counts` | The count and the group list use that set. A song on a saved album of the same artist is one child. |

- Feature replacement at base `77ccd105d21bfe5c0a130614c221db30073b5bff`. Production files `journal.py`, `providers.py`, `records.py`, `summary.py`, `library-filters.mjs`, `library-filters.d.mts`, `library.component.ts`, and `media.models.ts`: 6456 lines before, 7139 after. Diff adds 767 and deletes 84 physical lines (net +683). Tests add 897 (`test_artist_groups.py` 743, `artist-groups.spec.ts` 141, `library-filters.test.mjs` 13). `apps/media/AGENTS.md` adds 3. `docs/MEDIA.md` adds 2 and deletes 2. This evidence file is separate. The positive production delta is the canonical membership write, the saved-only group read, and the album/song control that shows one membership. It is not a simplification.
- One linker, one group read `GET /media/api/music-groups/{catalog_id}`, and `artist_groups` on album and song cards of the current library page. Artists still expand through the existing entry detail. Book pages with no albums or tracks add no group query (`test_library_queries.py` still expects 3 selects). No second catalog store and no new crypto protocol. Follow remains `UserEntry.followed`.
- `rg` of the tree finds `_link_saved_artists` only in `planning/implementation/evidence/MED-08.md`, which records the older helper as it existed then.
- MUX-03 still owns full artist, album, and song collection views. This leaf does not add them.
- Media membership migration SQL is unchanged. Repair still reuses the existing artist catalog. Ordinary GETs do not write links or call providers.

## Verification

Node 20.20.2. Playwright 1.64.1 with cached Chromium 1248. Python gates used this worktree’s `.venv` symlink to `/home/vivek/Deployments/vivek-monorepo/.venv`. System `python3` lacks alembic, so `make test-fast` needs that interpreter on `PATH`. Browser retries and coverage floors were unchanged. Media coverage printed 71.71% against floor 68.7%. Server coverage printed 79.38% against floor 61.53% with no server Python edit. Neither floor was pinned. The production bundle reported the existing initial-size warning at 668.96 kB.

The first Media Playwright run failed 2 and passed 115 because `getByRole('alert')` also matched the empty shell toast region. The assertion now uses `.saved-children`. The rerun passed. `library-filters.d.mts` gained `group: null` after that rerun so the declared query matches the runtime clear; `tsc` for the web app and spec projects passed on the committed source. The bundle does not contain the declaration file.

| Exact command | Final result |
| --- | --- |
| `PATH="$PWD/.venv/bin:$PATH" make test-fast` | PASS on the implementation tree and again with this evidence file present. Doc paths, planning validation (112 active, 75 completed), 135 unittest OK, e2e discovery, 21 Node script tests. |
| `make lint-python` | PASS. 244 files already formatted. Ruff 90 matches the baseline. Suppressions 6. |
| `make typecheck-python` | PASS. mypy 80 findings match the baseline. |
| `PYTHON=$PWD/.venv/bin/python ./scripts/coverage-gate.sh media` | PASS. 97 passed. 71.71% >= 68.7%. |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 42 tests, 0 failed. |
| `PYTHON=$PWD/.venv/bin/python ./scripts/coverage-gate.sh server` | PASS. 397 passed, town perf 1 passed. 79.38% >= 61.53%. |
| `make typecheck-web` | PASS. Seven TypeScript projects. Web app and spec projects rerun after the declaration sync. |
| `make lint-web` | PASS. eslint baselines held. Engine purity passed. |
| `make build-frontends` | PASS. `dist/web` and the release manifest. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 117 passed, 0 failed (58.1s), including 390 and 1280 artist-group journeys. |
| `PATH="$PWD/.venv/bin:$PATH" python -m pytest apps/media/backend/tests/test_artist_groups.py -q` | PASS. 6 passed. Included in the media coverage gate as well. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/507. `Closes #398` only. Parent #304 remains open.
- Roadmap #134 append-only status-note URL: after merge and archive.
- Merged/activation status: PR #507 is open. Merge waits on required checks.
- Remaining external prerequisites: none for this leaf. MUX-03 through MUX-09 stay unbuilt. OPS-06 / #277 was not touched.
- Next actor: required CI, then merge, then archive.
