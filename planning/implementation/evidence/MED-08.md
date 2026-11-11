# MED-08 — implementation evidence

- Leaf issue and parent(s): [#242](https://github.com/Vivekpsps3/vivek-monorepo/issues/242); parents [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200) and [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) stay open
- Agent/context, branch/worktree: Cursor Grok, `agent/med-08`, `/tmp/vivek-med-08`
- Base main SHA, current tested SHA: base `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`; tested implementation `27ffa71f000a6c51accfec2210823a3cf2ae4583`
- Fresh-main/prerequisite/active-PR checks: MED-01 `29e1318` is an ancestor (saved reads stay database-only). PR #193 ancestor `495d698` (MusicBrainz release-group identity) is an ancestor. Open PR #322 (`agent/fin-01`) touches Finance only. No open pull request uses `media-records`, `media-membership`, or `media-library-api`. Claim is on #242. Worktree base matches `origin/main` at `3954d1f`.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| RECORD1 | Two owners save one MusicBrainz album. A song names that album. Personal rating, review, status, and all four progress units stay with the owner. Identical review and identical progress are no-ops. A stale review is 409 and does not write. Completing and clearing owner one's rating leaves owner two paused at rating 2. Deleting owner two's entry leaves the catalog and owner one's song. Episode catch-up Undo is owner-scoped and idempotent. Clearing a season does not change the show review. Clearing an album or track rating does not change the artist rating or review. Explicit release-group repair remains the refresh command from MED-01. | PASS | `apps/media/backend/tests/test_record_commands.py::test_record1_two_owners_share_one_catalog_and_keep_personal_commands`; `::test_record1_episode_season_album_and_track_undo`; `apps/media/backend/tests/test_album_repair.py::test_repair1_bounded_repair_preserves_each_owner`; `apps/media/backend/tests/test_music.py::test_pressing_row_merges_into_the_saved_release_group` |
| RECORD2 | Using a track id as an album id returns 422 and inserts nothing. A stale review conflict keeps the stored note. A rejected commit does not persist the book; the same write then stores it once. Book pages are `SELECT`-only, at most seven statements, and do not call lookup, repair, album refresh, or authoritative apply. The other owner sees no books and cannot open the first owner's entry. A failed provider lookup during explicit repair still rolls back, and the retry path remains the MED-01 refresh. | PASS | `apps/media/backend/tests/test_record_commands.py::test_record2_rollback_conflict_owner_and_bounded_reads`; `apps/media/backend/tests/test_album_repair.py::test_read1_saved_reads_do_not_call_providers_or_repair`; `::test_repair1_bounded_repair_preserves_each_owner`; `::test_page1_album_page_does_not_repair_full_history` |
| RECORD3 | Saving a song against an existing album issues one `catalog_items` identity `SELECT` for that source id. The discography response stays the entry card plus `already_saved`. Detail still exposes `catalog.source_id`. A second save is `already_saved` with the same id. A new album id becomes a public catalog row and not a membership. Album and track payloads keep their nested keys, distinct from the entry card. | PASS | `apps/media/backend/tests/test_record_commands.py::test_record3_public_album_uses_one_identity_lookup` |

Fixtures are synthetic titles and provider ids in the Media SQLite test database. No live provider is called. `lookup_detail` stays the offline stub unless a test replaces it.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Inline `(source, source_id)` query in `_public_catalog` | `save_discovered` when a song names `album_source_id`; route `POST /entries/{id}/discography` | `_catalog_by_source` | removed; kind mismatch rejection stays in `_public_catalog` | RECORD3 counts one identity `SELECT`; RECORD2 kind collision still rolls back |
| Hidden `repair_musicbrainz_albums` on ordinary reads | none after MED-01 | `finish_album_refresh` via `POST /entries/{id}/refresh` | retained only as that explicit command | RECORD2 spies; READ1 and PAGE1 |
| `catalog_dict`, `entry_card`, `_album_payload`, `_track_payload` | detail, library cards, discography card, nested music | each function | retained; field overlap is not one contract | RECORD3 key sets |
| `new_entry` and `_entry_for_catalog` | provider save, manual album/track, discovered save | those two functions | retained; not a new repository | RECORD1 creates one personal row per owner |
| `membership.py` backfill and downgrade | applied `site_media_membership_v1` | `membership.py` | retained; not edited | import in `apps/server/alembic/versions/site_media_membership_v1.py` unchanged |
| `metadata.refresh` duplicate-id probe | manual show linking | `metadata.refresh` | retained; it excludes the current row and returns 409, which is not the kind check | not equivalent; left in place |
| `_link_saved_artists` and `_repair_roster` | album placement and explicit repair | those functions | retained; they select an owner's rows, not the global identity | not equivalent |
| `_claim_album_group` strict versus blocked kind handling | MusicBrainz placement and repair | `_claim_album_group` | retained; a blocked repair must not become a hard 422 | `test_repair1_bounded_repair_preserves_each_owner` |

- Candidate class and protected counterexamples: duplicate live policy for the global `(source, source_id)` lookup only. Catalog versus personal entry, membership migration SQL, release-group versus pressing, and owner Undo stay as they are.
- Comparison base SHA and full replacement closure: `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`. Closure is `apps/media/backend/services/records.py`, `apps/media/backend/tests/test_record_commands.py`, and this evidence file. `journal.py` and `membership.py` were read and not edited.
- Production added/deleted/moved; comments/blank-only churn separately: `records.py` 2321 → 2317 physical lines (git +1/−5). No comment or blank-only churn. `ast.stmt` stays 1177 → 1177 because one assignment replaced another. `journal.py` 638 and `membership.py` 874 are unchanged. Membership lines stay outside the runtime denominator.
- Independent equivalent implementations before/after: two runtime catalog identity queries (`_catalog_by_source` and the `_public_catalog` copy) → one `_catalog_by_source`. Serializers stay four. Entry create/lookup owners stay two. Explicit repair stays one.
- State/cache owners and public entry points before/after: `CatalogItem` remains shared identity. `UserEntry`, season/episode progress, and `ProgressOperation` remain personal. `get_db` still commits before the success response and rolls back on failure. Journal routes are unchanged.
- Remaining old symbol/path search, including config and discovery: the only `CatalogItem.source == source, CatalogItem.source_id == source_id` filter in `records.py` is `_catalog_by_source`. No registry, repository, or second entry state machine was added.
- Follow-up change: an identity lookup edits `_catalog_by_source`. Public-album kind rejection stays in `_public_catalog`. A personal field edits `new_entry` or `patch_entry`. Explicit album repair edits `repair_musicbrainz_albums`.
- Tests/docs/generated changes separately: `test_record_commands.py` is 578 new lines. This evidence file is the only documentation change. No generated output. Coverage floors in `quality/coverage.txt` were not edited.
- Net production delta and specific reviewed safety/compatibility exception if positive: physical production −4. No safety addition.
- No behavior/data/meaningful assertion silently removed: existing music, repair, library-query, season, and progress tests still pass inside the media coverage gate.

## Verification

Commands ran in `/tmp/vivek-med-08` on the implementation tree before this evidence file's SHA line was finalized. Local execution only at this writing. CI, merge, and deployment were not run. The first `make test-fast` failed because the fresh worktree had no `node_modules` (`typescript` missing). `npm ci` installed dependencies. The rerun passed. That was environment setup, not a skipped or weakened gate.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS after `npm ci`. Doc paths, blame revisions, shared boundaries, finance UX, 63 unittest tests, e2e discovery, and 15 node tests. |
| `make lint-python` | PASS. 212 files formatted. Ruff 101 findings match the baseline. Suppressions 6 match the baseline. |
| `make typecheck-python` | PASS. mypy 87 findings match the baseline. |
| `./scripts/coverage-gate.sh media` | PASS. 208 passed. Total coverage 84.36% (floor 70.60%). Floor file not edited. |
| `./scripts/coverage-gate.sh server` | PASS. 874 passed, 2 xfailed. Total coverage 80.12% (floor 61.53%). Perf gate passed. No server source change. Floor file not edited. |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 53 passed. |
| `make lint-web` | PASS. ESLint baselines matched. Engine purity test passed. |
| `make typecheck-web` | PASS. |
| `CHROME_BIN=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 654 of 654 SUCCESS. Statements 82.47% (5102/6186). |
| `make build-frontends` | PASS. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$CHROME_BIN npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 77 passed (52.8s). |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/328 (`Closes #242`). Parents #200 and #85 are referenced and not closed.
- Roadmap #134 append-only status-note URL: posted after the pull request. The issue body was not edited.
- Merged/activation status (actual evidence, not assumption): pull request #328 is open. Not merged, not deployed. Squash merge waits for required CI.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Other Media leaves stay separate.
- Next actor: this session pushes, opens the pull request, waits for green CI, then squash-merges.

## Context handoff

Issue / parent / local packet: MED-08, GitHub #242, parents #200 and #85, packet `planning/implementation/issues/MED-08.md`.

Branch, worktree, base main SHA, current SHA: `agent/med-08`, `/tmp/vivek-med-08`, base `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`, tested implementation `27ffa71f000a6c51accfec2210823a3cf2ae4583`.

Owned files and conflict groups: `media-records`, `media-membership`, `media-library-api`. Edited files are `records.py`, the new Media backend test, and this evidence file. Other active PRs checked: #322 Finance only.

Completed acceptance rows with direct evidence: RECORD1, RECORD2, and RECORD3 PASS in the table above.

Unfinished/failed rows and exact next action: none in the leaf. Push, open the pull request, squash-merge after CI, and comment on #134 and #242. Do not delete this worktree.

Deletion ledger and current consumer migration: `_public_catalog` calls `_catalog_by_source`; the inline query is gone; kind rejection remains on that caller. Journal already called `save_discovered`.

Commands run, results, tested SHA; required checks still pending: the table above passed locally. CI was not run yet.

PR and roadmap note URLs; actual merge/deployment/activation state: https://github.com/Vivekpsps3/vivek-monorepo/pull/328. The #134 comment follows. Not merged and not deployed.

External prerequisites and next actor: MED-01 is already merged. Next actor is this session for the pull request and merge.

No unstated decision from the previous context is necessary to continue.
