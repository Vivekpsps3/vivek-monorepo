# MED-01 — implementation evidence

- Leaf issue and parent(s): [#235](https://github.com/Vivekpsps3/vivek-monorepo/issues/235); parents [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) and [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200) stay open
- Agent/context, branch/worktree: Cursor Grok, `agent/med-01`, `/home/vivek/Deployments/worktrees/vivek-med-01`
- Base main SHA, current tested SHA: base `63bc975ede08967e61c50f78b25176b07dc07d18`; tested SHA is the commit that introduces this file
- Fresh-main/prerequisite/active-PR checks: leaf has no queue dependency. Open PRs #279 (`agent/safe-01`), #280 (`agent/ux-01`), and #281 (`agent/ver-02`) do not use `media-records`, `media-library-api`, or `media-provider-transport`. Claim was already on #235. PR #193 MusicBrainz release-group identity stays on write and on explicit album refresh.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| READ1 | Unresolved MusicBrainz pressing plus a book and an artist. `lookup_detail` and `repair_musicbrainz_albums` raise if called. Library is filtered, paged, and repeated, then summary and detail are read twice. Catalog, personal rows, and links are unchanged. Pending stays true and the saved title is unchanged. | PASS | `apps/media/backend/tests/test_album_repair.py::test_read1_saved_reads_do_not_call_providers_or_repair` |
| REPAIR1 | Two owners with different ratings, reviews, summaries, tags, and portraits. Explicit repair fails once, then `POST /entries/{id}/refresh` retries. A second repair does not look the album up again. A merge keeps the other owner's group notes. Nine albums stop at eight. A deadline stops after one lookup. A bad lookup leaves the saved title pending. A stored group does not call a provider. | PASS | `apps/media/backend/tests/test_album_repair.py::test_repair1_bounded_repair_preserves_each_owner` |
| PAGE1 | Forty unresolved albums. A two-row title page and the last page each run three SELECTs, including `LIMIT`. Detail for the page stays pending. Summary and a repeat page do not change the snapshot. Provider and repair spies raise if called. | PASS | `apps/media/backend/tests/test_album_repair.py::test_page1_album_page_does_not_repair_full_history` |

PR #193 identity still holds when refresh is explicit: `test_existing_pressing_repairs_by_artist_mbid_not_name` and `test_pressing_row_merges_into_the_saved_release_group`. Those tests now show that a plain GET leaves the pressing unresolved, and `POST /entries/{id}/refresh` places the release group, links the artist MBID, and keeps the favorite on the merged row.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| GET `/library` → `repair_musicbrainz_albums` before paging | `library` for mixed, artist, album, and track lists | none on read | removed | READ1 and PAGE1 spies and snapshots |
| GET discography and `detail()` repair calls | discography route; artist, album, and track detail | none on read | removed | same spies; discography remains an explicit provider browse and does not call repair |
| Unbounded scan of every saved MusicBrainz album | library, discography, detail, and artist refresh | `finish_album_refresh` → `repair_musicbrainz_albums` | replaced | explicit ids, cap of eight, deadline, owner filter; artist refresh no longer scans albums |
| Duplicate identity write path | the old in-loop placement | `_place_musicbrainz_album` | retained as the only placement path | REPAIR1 and the two MusicBrainz regression tests |

- Production added/deleted/moved: `journal.py` 643→638 (−5), `metadata.py` 183→185 (+2), `records.py` 2177→2356 (+179), `docs/MEDIA.md` 43→43 (one sentence replaced). Net +176 production lines. The added lines are the batch cap, deadline, owner filter, retry result, and pending flag. They are not a second repair framework.
- Tests/docs/generated changes separately: `test_album_repair.py` is 748 new lines; `test_music.py` 1230→1252 (+22); `test_library_queries.py` comment only (179→179).
- Remaining necessary overhead and why: `repair_musicbrainz_albums` stays so one explicit refresh can place a release group without walking the library. `identity_blocked` stays so a group id that already belongs to another kind is not looked up again. Save still resolves a MusicBrainz album through `_save_musicbrainz_album`.
- No behavior/data/meaningful assertion silently removed: the query budget in `test_library_queries.py` is still `<= 7`. Coverage floors in `quality/coverage.txt` were not changed.

## Verification

Commands ran in `/home/vivek/Deployments/worktrees/vivek-med-01` on the tree this commit records. Local execution only. CI, merge, and deployment were not run.

| Command | Result |
| --- | --- |
| `make lint-python` | PASS. 212 files formatted. Ruff 101 findings match the baseline. Suppressions 0. |
| `make typecheck-python` | PASS. mypy 87 findings match the baseline. |
| `./scripts/coverage-gate.sh media` | PASS. 199 passed. Total coverage 80.22% (floor 70.60%). Floor file not edited. |
| `./scripts/coverage-gate.sh server` | PASS. 874 passed, 2 xfailed, perf gate passed. Total coverage 80.63% (floor 61.53%). No server source change. Floor file not edited. |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 53 passed. |
| `make lint-web` | PASS. ESLint baselines matched. Engine purity test passed. |
| `make typecheck-web` | PASS. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 630 of 630 SUCCESS. Statements 81.45% (4936/6060). |
| `make build-frontends` | PASS. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$CHROME_BIN npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 72 passed (50.7s). |
| `make test-fast` | PASS. |

## Handoff

- PR URL (leaf closure keyword only): opened with `Closes #235`. Parents #85 and #200 are referenced and not closed.
- Roadmap #134 append-only status-note URL: posted after the PR. The issue body was not edited.
- Merged/activation status (actual evidence, not assumption): not merged, not deployed.
- Remaining external prerequisites or approved scope decisions: none for this leaf. MED-02 and later Media leaves still wait on this merge.
- Next actor: reviewer. Do not merge from this context.
