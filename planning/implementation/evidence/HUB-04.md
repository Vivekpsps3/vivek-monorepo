# HUB-04 — implementation evidence

- Leaf issue and parent(s): [#246](https://github.com/Vivekpsps3/vivek-monorepo/issues/246); parent [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93) stays open. Historical #103 stays open as a parent citation, not a leaf to close.
- Agent/context, branch/worktree: implementer, `agent/hub-04`, `/tmp/vivek-hub-04`
- Base main SHA, current tested SHA: base `a7e16c6fa5bd5543514081e0834022fe38dcd1d1` (SAFE-05 merge). Local gates below ran on that base plus this leaf's working tree. The implementation commit SHA is the PR head once this file is committed with the code.
- Fresh-main/prerequisite/active-PR checks: `gh issue view` on 2026-11-11. SAFE-03 #203, SAFE-04 #204, and SAFE-05 #205 are closed. #246 was open with no prior claim. No open pull requests. SAFE-05 merge SHA matches this base.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| SEARCH1 | Loaded Harbor Checking (synthetic vault, hub already showing $1,500) returns that name from search and not the amount. One character does not call finance or `/api/search`. A burst debounces to one query. Five ready account names render and a sixth is not invented. Unloaded streams add no Finance group. The browser search does not call `/market` or `/vault/records` while naming Harbor Checking. | PASS | `finance-search.spec.ts` cap/unloaded/no-loadDashboard; `search-dialog.component.spec.ts` min-chars, debounce, five rows; `tests/e2e/search.spec.ts` Harbor Checking and the Dune dialog |
| SEARCH2 | Persisted refs stay `{app,kind,id}`. Unlocked recents resolve locally and prune a missing account id; locked recents are not pruned and do not show a title. A finance result that resolves after lock, logout, or an identity change is not painted. The browser lock removes Harbor Checking. | PASS | `search-dialog.component.spec.ts` recents, lock race, logout, identity; `resolveLoadedFinanceRecents`; `tests/e2e/search.spec.ts` lock half |
| SEARCH3 | Owner-scoped Travel/Media search, `Cache-Control: no-store`, the no-provider guard, and the p95 test stay in `apps/server/search.py` / `apps/server/tests/test_search.py`. The dialog still uses `fetchHubSummary` and its 8s deadline. Combobox arrows and Enter still work, including onto a finance row. The browser records `no-store`, stores no title, and requests no provider host. | PASS | server coverage gate (existing `test_owner_scoped_cross_user`, `test_no_store_header`, `test_no_provider_calls`, `test_p95_under_150ms`); dialog deadline and combobox specs; `tests/e2e/search.spec.ts` Dune path |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Locked-only `SEARCH_FINANCE_PROBE.state()` (`none` / `locked` / `unlocked`) | `SearchDialogComponent` | `searchFinanceNames` / `resolveFinanceSearchRecents` on the Finance public API | probe removed; dialog calls the facade | dialog spec mounts unlocked names; no `finance.service` import in the dialog |
| Deferral comment that unlocked matching was still HUB-04 and that the dialog only contributed the locked row | readers of `search-dialog.component.ts` | the facade comment and the live name rows | comment replaced | source |
| A second matcher or recents store in the dialog | none; matching did not exist yet | `matchLoadedFinanceNames` and `resolveLoadedFinanceRecents`; storage stays `search-recents.ts` | not added | dialog renders facade rows only; storage JSON has no titles |

- Candidate class and protected counterexamples: duplicate live policy for the locked-only seam, plus the missing unlocked name path this leaf had to add. Transaction search, plaintext server Finance index, and `loadDashboard` stay out. Travel/Media server search is unchanged.
- Comparison base SHA and full replacement closure: `a7e16c6fa5bd5543514081e0834022fe38dcd1d1`. Closure is `finance-search.ts`, `finance.service.ts` peek/ready flags, `public-api.ts` lazy exports, `search-dialog.component.ts`, their specs, and `tests/e2e/search.spec.ts`.
- Production added/deleted/moved: `finance-search.ts` is new (171 lines: 151 code, 8 comment, 12 blank). `finance.service.ts` +76/−12. `public-api.ts` +19. `search-dialog.component.ts` +186/−55. No moves. `apps/server/search.py` unchanged.
- Independent equivalent implementations before/after: before, one locked/unlocked/none probe and no name matcher. After, one facade matcher shared by query and recents. The dialog does not match strings.
- State/cache owners and public entry points before/after: name bytes stay in the existing Finance subjects. `peekLoadedNames` reads them and returns null when the key is gone. `clearSessionState` clears the ready flags. The dialog drops painted rows on lock, logout, and identity change. Public entry is `searchFinanceNames` / `resolveFinanceSearchRecents`. Recents storage remains one localStorage key of `{app,kind,id}`.
- Remaining old symbol/path search: `SEARCH_FINANCE_PROBE` is gone. No dialog import of `finance.service`.
- Follow-up change: a new finance name source edits `finance-search.ts` and the publish sites that set `publishedNameStreams`. The dialog and server search stay as they are.
- Tests/docs/generated changes separately: `finance-search.spec.ts` 196 lines, search-dialog spec +225/−8, `tests/e2e/search.spec.ts` new. No generated assets committed. This evidence file is the only planning doc.
- Net production delta and specific reviewed safety/compatibility exception if positive: positive. This is the missing unlocked name search, not a deletion-only cleanup. The ready-stream flags exist so an empty initial subject is not treated as a loaded empty vault (that would prune live recents). The dialog still shows the locked row when the vault marker is present and the key is not held.
- No behavior/data/meaningful assertion silently removed: debounce, min 2 characters, combobox, abort, unavailable/expired copy, id-only recents, and the locked-row copy remain. Server search behavior is unchanged.

## Verification

Local, on the working tree above. Karma used port 9933 in this worktree only; that line was reverted before commit. `SUITE_KARMA_COVERAGE` stayed set.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-web` | PASS |
| `make typecheck-web` | PASS |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 686 tests. Coverage statements 82.68%, branches 68.98%, functions 82.19%, lines 86.17% |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 813 tests. Coverage statements 75.15%, branches 64.9%, functions 72.06%, lines 78.18% |
| `make build-frontends` | PASS |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS, 78 tests |
| `npx playwright test --project=suite` | PASS, 26 tests |
| `make e2e` with `PYTHON=$PWD/.venv/bin/python` | PASS, 245 tests |
| `make lint-python` | PASS |
| `make typecheck-python` | PASS |
| `./scripts/coverage-gate.sh server` | PASS, 874 passed, 2 xfailed, total coverage 79.86% (floor 61.53%) |

Focused iterations before those full commands: `finance-search.spec.ts` 7 passed, `finance.service.spec.ts` 21 passed, `search-dialog.component.spec.ts` 24 passed. A parallel Town Playwright run failed one theme assertion (`data-theme` empty on Town error at 1280 light) and the next solo run of that suite passed 78. Not a product change.

## Handoff

- PR URL (leaf closure keyword only): pending push
- Roadmap #134 append-only status-note URL: pending PR
- Merged/activation status: not merged. Local verification only. Not deployed.
- Remaining external prerequisites or approved scope decisions: none. SAFE-03, SAFE-04, and SAFE-05 are merged on this base. #93 and #103 stay open.
- Next actor: open the pull request, watch CI, squash-merge, then comment the squash SHA on #246 and append a note to #134.
