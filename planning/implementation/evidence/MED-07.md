# MED-07 — implementation evidence

- Leaf issue and parent(s): [#241](https://github.com/Vivekpsps3/vivek-monorepo/issues/241); parents [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200) and [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) stay open
- Agent/context, branch/worktree: Cursor Grok, `agent/med-07`, `/tmp/vivek-med-07`
- Base main SHA, current tested SHA: base `08be484ba3b3535dbcb500749245f2e75ee1f2e4`; tested implementation `3d89ab8a8968cd1e689acc947511c9f5b796d2ae`
- Fresh-main/prerequisite/active-PR checks: MED-01 is `29e1318` (saved reads stay database-only). PR #193 is ancestor `495d698` (MusicBrainz release-group identity). No open pull requests at implementation time. Claim was already on #241. Worktree base matches `origin/main` at `08be484`.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| PROV1 | Official movie and TV detail both call `_tmdb_official_detail`. Valid payloads keep movie versus series identity: movie overview/genres/artwork/official provenance and empty extra; TV network creator, lifecycle, production flag, and episode count. 404, JSON list, object without id, 429, 500, provider 401, and malformed JSON each make one upstream request. Movie 429/5xx does not fall through to HTML. | PASS | `apps/media/backend/tests/test_provider_contracts.py::test_tmdb_official_detail_is_one_shared_transport` and `::test_lookup_detail_uses_the_shared_tmdb_transport_once` |
| PROV2 | `lookup_detail` uses the supplied `DETAIL_TIMEOUT` client and the same helper once per movie or TV id, including 404/429/5xx/401/malformed/timeout, and returns None on those failures. Search uses `/3/search/movie` and does not call the detail helper. A saved library, detail, and summary read does not call the helper or `lookup_detail`. Existing provider, portrait, ranking, partial-outage, and READ1 suites still pass inside the media coverage gate. | PASS | the two tests above, `::test_saved_read_does_not_call_official_tmdb_detail`, and `./scripts/coverage-gate.sh media` (202 passed) |
| PROV3 | Authenticated `/3/{movie\|tv}/{id}` detail fetch, 404 handling, JSON validation, source id, overview, genres, and official provenance exist only in `_tmdb_official_detail`. `lookup_detail` still enters through `tmdb_movie_detail` and `tmdb_tv_detail`. No consumer calls a removed inline copy. | PASS | `rg` of `api.themoviedb.org/3/` in `providers.py` and the media coverage gate |

Offline fixtures are `httpx.MockTransport` responses. No live TMDB call is made. Provider 401 stays an upstream status on the detail adapter; a signed-out session 401 remains the separate route check in `test_journal.py`.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Official TMDB movie detail fetch, 404/status/JSON check, source id, overview, genres, provenance | `tmdb_movie_detail` | `_tmdb_official_detail` | removed from the movie adapter after the adapter called the helper | PROV1 spy records `movie` |
| Same official block in `tmdb_tv_detail` | `tmdb_tv_detail` | `_tmdb_official_detail` | removed from the TV adapter | PROV1 spy records `tv` |
| Movie public HTML fallback | `tmdb_movie_detail` when `TMDB_API_KEY` is unset | `tmdb_movie_detail` | retained | no-key test: one `www.themoviedb.org` request, helper not called, coverage `extraction` |
| TV network, lifecycle, `in_production`, episode count | `tmdb_tv_detail` | `tmdb_tv_detail` | retained | series fixture still exposes AMC, Ended, false, 62 |
| Episode/collection fetches in `followups.py` | explicit follow-up actions | `tmdb_episodes`, `tmdb_collection_parts` | retained; 404 raises and the payload is seasons or collection parts, not detail projection | not equivalent; left in place |
| Commons portrait fetch | portrait search/select | `portraits._fetch` | retained; different host, license rule, and `SEARCH_CACHE` | portrait tests in the media gate |
| `attach_artist_portraits` | no Python caller | none at runtime | retained | search and saved-read tests forbid portrait enrichment; `artist-portrait:` remains a membership cache prefix. Not the duplicated detail policy |

- Candidate class and protected counterexamples: duplicate live policy for official TMDB movie/TV detail only. Catalog versus personal entry, saved-read repair, and MusicBrainz release-group identity stay as they are.
- Comparison base SHA and full replacement closure: `08be484ba3b3535dbcb500749245f2e75ee1f2e4`. Closure is `apps/media/backend/services/providers.py`, `apps/media/AGENTS.md`, `apps/media/backend/tests/test_provider_contracts.py`, and this evidence file.
- Production added/deleted/moved; comments/blank-only churn separately: `providers.py` 2249 → 2254 physical lines (git +34/−29). Executable statements 1973 → 1971 (−2). Docstrings +4 and blank lines +3, which are the helper docstring and the extra function spacing. `apps/media/AGENTS.md` 26 → 29, documentation only.
- Independent equivalent implementations before/after: two official TMDB detail transport-and-common-projection blocks → one `_tmdb_official_detail`.
- State/cache owners and public entry points before/after: unchanged owners are `lookup_detail` (`DETAIL_TIMEOUT`), `_invoke`, `MB_PACE`/`mb_get`, `SEARCH_CACHE`, and `cached_call`. Public entry points remain `tmdb_movie_detail`, `tmdb_tv_detail`, and `lookup_detail`.
- Remaining old symbol/path search, including config and discovery: the only `/3/{media}/{id}` detail URL in `providers.py` is inside `_tmdb_official_detail`. Search and popular URLs stay in their own functions. No registry, base class, or new package.
- Follow-up change: an official TMDB detail status or common projection change edits `_tmdb_official_detail`. Movie HTML stays in `tmdb_movie_detail`. TV network and lifecycle stay in `tmdb_tv_detail`.
- Tests/docs/generated changes separately: `test_provider_contracts.py` 707 → 995 (+288). No generated output. Coverage floors in `quality/coverage.txt` were not edited.
- Net production delta and specific reviewed safety/compatibility exception if positive: executable statements −2. Physical `providers.py` +5 is the docstring and required blank lines around the helper, not a second policy. No safety exception beyond that docstring.
- No behavior/data/meaningful assertion silently removed: existing movie, TV, lookup, search, and saved-read assertions remain. The new tests add request-count and failure cases.

## Verification

Commands ran in `/tmp/vivek-med-07` on the implementation tree before this evidence file's SHA line was finalized. Local execution only. CI, merge, and deployment were not run. The repo virtualenv is the Make `.venv` (symlinked at the worktree, not committed).

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Doc paths, blame revisions, shared boundaries, finance UX, 44 unittest tests, e2e discovery, and 15 node tests. |
| `make lint-python` | PASS. 212 files formatted. Ruff 101 findings match the baseline. Suppressions 0. |
| `make typecheck-python` | PASS. mypy 87 findings match the baseline. |
| `./scripts/coverage-gate.sh media` | PASS. 202 passed. Total coverage 80.29% (floor 70.60%). Floor file not edited. |
| `./scripts/coverage-gate.sh server` | PASS. Total coverage 80.63% (floor 61.53%). Perf gate passed. No server source change. Floor file not edited. |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 53 passed. |

## Handoff

- PR URL (leaf closure keyword only): opened with `Closes #241`. Parents #200 and #85 are referenced and not closed. URL recorded in the roadmap comment.
- Roadmap #134 append-only status-note URL: posted after the pull request. The issue body was not edited.
- Merged/activation status (actual evidence, not assumption): local gates passed. Squash merge is authorized for this leaf. This file does not claim deployment or activation.
- Remaining external prerequisites or approved scope decisions: none for this leaf. MED-08 and other Media leaves are separate.
- Next actor: this session merges after the pull request is green locally, then removes only `/tmp/vivek-med-07`.

## Context handoff

Issue / parent / local packet: MED-07, GitHub #241, parents #200 and #85, packet `planning/implementation/issues/MED-07.md`.

Branch, worktree, base main SHA, current SHA: `agent/med-07`, `/tmp/vivek-med-07`, base `08be484ba3b3535dbcb500749245f2e75ee1f2e4`, tested implementation `3d89ab8a8968cd1e689acc947511c9f5b796d2ae`.

Owned files and conflict groups: `media-provider-transport`, `media-provider-family`, `media-records`. Other active PRs checked: none open.

Completed acceptance rows with direct evidence: PROV1, PROV2, and PROV3 PASS in the table above.

Unfinished/failed rows and exact next action: none in the leaf. Push, open the pull request, squash-merge, comment on #134, and remove this worktree.

Deletion ledger and current consumer migration: both official detail adapters call `_tmdb_official_detail`; the old inline blocks are gone; movie HTML and TV lifecycle remain.

Commands run, results, tested SHA; required checks still pending: the six commands above passed. CI was not required before the local gates.

PR and roadmap note URLs; actual merge/deployment/activation state: pull request and #134 comment follow this commit. Not deployed.

External prerequisites and next actor: MED-01 is already merged. Next actor is this session for merge and worktree removal.

No unstated decision from the previous context is necessary to continue.
