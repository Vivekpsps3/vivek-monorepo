# MED-11 — implementation evidence

- Leaf issue and parent(s): [#296](https://github.com/Vivekpsps3/vivek-monorepo/issues/296); parents [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200) and [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) stay open
- Agent/context, branch/worktree: Cursor Grok, `agent/med-11`, `/tmp/vivek-med-11`
- Base main SHA, current tested SHA: base `80b9ca0e0776297f3addcdfdac78542f6a7ced40`; tested implementation `82dd58c54545f53afd43192d09fd025aa1f6e7fd`
- Fresh-main/prerequisite/active-PR checks: worktree HEAD matched `origin/main` at the base SHA before edits. No dependency leaf. `membership.py` and `site_media_membership_v1` still import the applied backfill. Historical planning notes that name the deleted symbols were not treated as callers.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| MEDDEL1 | Fresh search of `apps`, `packages`, `scripts`, and `docs` found no remaining `jsonstore`, `clean_rating`, `clean_artwork`, `choose_release`, `WHEN_RANK`, `within_days`, `needs_collaborators`, `saved_source_keys`, `records.mark_next`, portrait-chain, `_safe_https`, or `_https_artwork` consumer. Live owners remain `records.dumps`/`loads`, `validate.rating_value`/`http_url`, `when.classify_release`/`public_release_on`/`episode_state`/`is_released`, `records.saved_source_ids`, `episode_next.mark_next_checked`, and `image_from_relations`. | PASS | symbol search after the edit; `./scripts/coverage-gate.sh media` (204 passed), including `test_episode_next.py` |
| MEDDEL2 | Artist search records no outbound request and writes no catalog, membership, episode, or provider-cache row. Library and entry reads open no HTTP client and leave artwork empty. `artist-portrait:` stays in `membership.RETAINED_PREFIXES`; migration revisions and `membership.py` were not edited. | PASS | `test_search_cache.py::test_search_writes_no_catalog_membership_episode_or_query_cache_rows`, `test_artist_art.py::test_saved_library_and_detail_do_not_fill_missing_portraits`, `test_membership_migration.py` inside the media gate |
| MEDDEL3 | `validate.https_artwork` is the only strict-HTTPS owner. Whitespace trim, case-sensitive `https://`, length 1000/1001, empty, non-string, and non-HTTPS values match at the helper, RAWG `background_image`, Steam `header_image`, and `records._apply_authoritative`. `http_url` still accepts HTTP and raises on a bad URL. | PASS | `test_provider_contracts.py::test_game_artwork_uses_one_strict_https_policy` and `::test_authoritative_artwork_fill_uses_the_same_https_policy` |

Route `POST /entries/{id}/episodes/next` still calls `episode_next.mark_next_checked`. Expected-id, owner, 409 conflict, and concurrency tests in `test_episode_next.py` passed inside the media gate.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| `jsonstore.py` (`dump_json`, `load_json`, `load_list`, `load_dict`) | none | `records.dumps` / `records.loads` | removed the module; contracts were not merged | no import remains; JSON fallbacks differ |
| `textutil.clean_rating`, `textutil.clean_artwork` | none | `validate.rating_value`, `validate.http_url` | removed both helpers and their now-unused imports | no caller; `http_url` still raises and accepts HTTP |
| `when.choose_release`, `WHEN_RANK`, `within_days` | none | `classify_release`, `public_release_on`, `episode_state`, `is_released` | removed the unused picker, rank table, and day window | no caller; release serializer stays |
| `records.needs_collaborators`, `records.saved_source_keys` | none | `store_collaborators` / `cached_collaborators`, `saved_source_ids` | removed both wrappers | search still uses `saved_source_ids` |
| `records.mark_next` | none; the route uses `episode_next.mark_next_checked` | `episode_next.mark_next_checked` | removed the old command | episode-next owner, expected-id, conflict, and concurrency tests |
| `musicbrainz_artist_image`, `wikidata_artist_images`, `cached_artist_portraits`, `attach_artist_portraits` | no production caller; tests only forbade them | none at runtime; `image_from_relations` stays for `musicbrainz_artist_detail` | removed the chain; spies moved to HTTP | transport spy on search; `httpx.Client` forbid on saved reads |
| `_safe_https` and `_https_artwork` | `_apply_authoritative`, `rawg_detail`, `steam_detail` | `validate.https_artwork` | moved one identical policy; deleted both copies | MEDDEL3 boundary and call-site identity checks |
| `membership.py` and `artist-portrait:` rows | applied migration `site_media_membership_v1` | `membership.py` | retained | migration file and helper untouched; retention tests passed |
| Packet source bullet for `jsonstore.py` | planning validator requires each source path to exist | surviving service files in the packet | removed that one bullet after the module was deleted | `planning/implementation/plan.py validate` PASS |

- Candidate class and protected counterexamples: verified orphans, plus one duplicate strict-HTTPS policy. `records.dumps`/`loads`, `validate.http_url`, `membership.py`, applied migration revisions, episode progress, and existing `artist-portrait:` rows stay.
- Comparison base SHA and full replacement closure: `80b9ca0e0776297f3addcdfdac78542f6a7ced40`. Closure is the Media service files below, the three Media tests, this packet's source bullet, and this evidence file.
- Production added/deleted/moved; comments/blank-only churn separately: services `+16 / -315` physical lines (net −299). `validate.py` `+10` is the single `https_artwork` owner, including its one-line docstring and the blank lines around it. The other added lines are the import and the three call sites that replaced `_safe_https` / `_https_artwork`. `when.py` `+1` is the import that no longer needs `timedelta`.
- Independent equivalent implementations before/after: two strict-HTTPS normalizers → one `validate.https_artwork`. One uncalled portrait chain → none. Unused JSON/text/release/record helpers → none. `http_url` remains a separate raising HTTP-or-HTTPS validator.
- State/cache owners and public entry points before/after: `SEARCH_CACHE`, `ProviderCache`, and `membership.RETAINED_PREFIXES` are unchanged. Removed entry points are the symbols in the ledger. Saved-read and search routes do not gain a provider call.
- Remaining old symbol/path search, including config and discovery: no match under `apps`, `packages`, `scripts`, or `docs`. Historical planning notes still name the old symbols and were left in place.
- Follow-up change: strict provider artwork edits `validate.https_artwork`. User-entered HTTP artwork still edits `validate.http_url`. Next-episode behavior edits `episode_next.mark_next_checked`.
- Tests/docs/generated changes separately: tests `+152 / -10` (net +142): `test_provider_contracts.py` +133, `test_artist_art.py` +15/−7, `test_search_cache.py` +4/−3. Packet source list −1. No generated output. Coverage floors were not edited.
- Net production delta and specific reviewed safety/compatibility exception if positive: −299 physical service lines. No positive production exception.
- No behavior/data/meaningful assertion silently removed: saved-read and search assertions now fail on a real HTTP client or outbound request. Episode-next and migration assertions are unchanged. `http_url` is still asserted distinct from `https_artwork`.

## Verification

Commands ran from `/tmp/vivek-med-11` with `PATH="/tmp/node24/bin:$PATH"` (`node` v24.11.1), holding `flock` on `/tmp/vivek-wave-gates.lock` for the whole sequence. Local execution only. The floor file was not changed. Media coverage printed a rise from 71.60% to 84.15% because uncovered lines were deleted; the 70.60% floor stayed.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Doc paths, 80-packet planning validation, blame revisions, shared boundaries, finance UX, 44 unittest tests, e2e discovery, and 15 node tests. |
| `make lint-python` | PASS. 211 files formatted. Ruff 101 findings match the baseline. Suppressions 6 match the baseline. |
| `make typecheck-python` | PASS. mypy 87 findings match the baseline. |
| `./scripts/coverage-gate.sh media` | PASS. 204 passed. Total coverage 84.15% (floor 70.60%). |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 53 passed. |
| `./scripts/coverage-gate.sh server` | PASS. 874 passed, 2 xfailed. Total coverage 80.63% (floor 61.53%). Perf gate passed. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/299 (`Closes #296`). Parents #200 and #85 are referenced and not closed.
- Roadmap #134 append-only status-note URL: posted after the pull request. The issue body was not edited.
- Merged/activation status (actual evidence, not assumption): local gates passed. Squash merge is authorized for this leaf. This file does not claim deployment or activation.
- Remaining external prerequisites or approved scope decisions: none for this leaf.
- Next actor: integration owner, after this leaf is squash-merged.

## Context handoff

Issue / parent / local packet: MED-11, GitHub #296, parents #200 and #85, packet `planning/implementation/issues/MED-11.md`.

Branch, worktree, base main SHA, current SHA: `agent/med-11`, `/tmp/vivek-med-11`, base `80b9ca0e0776297f3addcdfdac78542f6a7ced40`, tested SHA `82dd58c54545f53afd43192d09fd025aa1f6e7fd`.

Owned files and conflict groups: `media-records`, `media-provider-transport`, `media-provider-family`. Product edits stayed in `apps/media/backend/services/` and `apps/media/backend/tests/`.

Completed acceptance rows with direct evidence: MEDDEL1, MEDDEL2, and MEDDEL3 PASS in the table above.

Unfinished/failed rows and exact next action: none in the leaf. Push, open the pull request, squash-merge, comment on #134, and remove this worktree.

Deletion ledger and current consumer migration: orphans are gone; both strict-HTTPS call sites use `validate.https_artwork`; portrait spies sit on the HTTP boundary; membership retention is unchanged.

Commands run, results, tested SHA; required checks still pending: the six commands above passed. CI was not required before the local gates.

PR and roadmap note URLs; actual merge/deployment/activation state: https://github.com/Vivekpsps3/vivek-monorepo/pull/299. The #134 comment follows merge. Not deployed.

External prerequisites and next actor: none. Next actor is the integration owner after merge.
