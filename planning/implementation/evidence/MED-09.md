# MED-09 — implementation evidence

- Leaf issue and parent(s): [#284](https://github.com/Vivekpsps3/vivek-monorepo/issues/284); parent [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) stays open
- Agent/context, branch/worktree: Cursor Grok, `agent/med-09`, `/tmp/vivek-med-09`
- Base main SHA, current tested SHA: base `0ed83e95a3727acc4f512dd2ac77211d8a622407`; tested product revision `ab4b4ba52d14e033bddd7f872f7e94b1eaa6915c`
- Fresh-main/prerequisite/active-PR checks: worktree started at the pinned `origin/main` above. MED-01's saved-read outcome is already on that base (`planning/implementation/evidence/MED-01.md`); this leaf does not change `records.py` or `journal.py`. At claim time the only open PR was #319 (planning docs). It later merged as `c252b4d` and does not touch Media library or Add. No other open PR edited these files. `origin/main` moved to that planning commit after the pin; this branch stays on the requested base.

## Acceptance

Packet row LIB1 is the retained M8/M11 library and Add behavior. Each original clause below is the same row, with the test that still proves it. Fixtures are the e2e media seed (Dune, Alpha, Zebra) plus synthetic `addItem` / `tagItem` rows, or the pure filter and `validateAdd` fixtures. No live provider call.

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LIB1 | Rapid typing, live URL filters, back/forward, clear, focus, result position, favorite alias, AND tags, Add correction, and zero invalid POST | PASS | the clause rows below, all inside the final Media Playwright run (77 passed) and `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` (53 passed) |
| LIB1 / readFilters parses all params and caps tags at 10 | `readFilters` keeps q, kind, status, sort, `fav=1`, and at most 10 tags | PASS | `library-filters.test.mjs` |
| LIB1 / readFilters de-dupes tags case-insensitively | `Sci-Fi` and `sci-fi` collapse; blanks drop | PASS | `library-filters.test.mjs` |
| LIB1 / filterCount ignores q and sort | count is kind + status + favorite + tags | PASS | `library-filters.test.mjs` |
| LIB1 / filterLabel | 0 is `Filters`; n is `Filters (n)` | PASS | `library-filters.test.mjs` |
| LIB1 / toQueryParams nulls defaults and maps tags | empty values become null; tags stay a list; favorite is `fav: 1` | PASS | `library-filters.test.mjs` |
| LIB1 / tagOptions puts missing selected tags first then sorts | missing selected tags lead, then case-insensitive available tags | PASS | `library-filters.test.mjs` |
| LIB1 / first result above 450px | at 390×844 the first `media-card` `y` is under 450, and the library has no "Find something new" link | PASS | `library-filters.spec.ts` › `first result is above 450px at 390` |
| LIB1 / one debounced read | one fill of `story` produces exactly one library GET after 250ms, and five fills while the clock is paused still produce one GET | PASS | `search filters live after typing` and `rapid typing sends one debounced library read` |
| LIB1 / live URL filters | choosing Type Movie sets the button to `Filters (1)` and `kind=movie` without closing the sheet | PASS | `filters apply live and count updates` |
| LIB1 / AND tags | items tagged x+y and x; checking both shows only the first; the URL has `tag=x` and `tag=y` | PASS | `tags multi-select uses AND` |
| LIB1 / clear keeps search and sort | Clear filters removes `kind` and leaves `q=story` and `sort=title` | PASS | `clear filters keeps search and sort` |
| LIB1 / keyboard focus | Done returns focus to the Filters button; Escape flushes a pending type change, closes the sheet, and returns focus to that button | PASS | `Done returns focus to Filters button` and `Escape flushes a pending filter and returns focus` |
| LIB1 / favorite alias | `/media/library?fav=1` shows only the favorite, the button reads `Filters (1)`, and Favorites only is checked | PASS | `old fav=1 link still works` |
| LIB1 / no tags hint | an item with no tags shows the sheet hint | PASS | `no tags shows hint` |
| LIB1 / empty filtered result | `kind=movie` with only a book shows the clear action, and clearing it restores the cards | PASS | `empty filtered result shows clear button` |
| LIB1 / back and forward | Movie then Book updates the URL, the Type control, and the visible cards; Back and Forward restore each state | PASS | `back and forward restore filter URL, controls, and results` |
| LIB1 / pending filter does not outrun Back | after a committed `kind=movie`, a paused change to book plus Back leaves the URL without `kind`, and advancing the clock 1000ms adds no further library GET | PASS | `Back drops a pending filter instead of applying it later` |
| LIB1 / empty and whitespace title | blank and whitespace titles return `Enter a title.` | PASS | `add-validate.test.mjs` |
| LIB1 / title over 300 | 301 characters is invalid; 300 is valid | PASS | `add-validate.test.mjs` |
| LIB1 / year bounds and blank | empty year is valid; 99, 999, 3001, and non-integers are not; 1000–3000 are valid | PASS | `add-validate.test.mjs` |
| LIB1 / kind must be known | the seven kinds pass; an unknown kind returns `Choose a type.` | PASS | `add-validate.test.mjs` |
| LIB1 / only invalid keys returned | a valid book returns `{}`; an empty title plus a bad kind and year returns only those keys | PASS | `add-validate.test.mjs` |
| LIB1 / Add correction and zero invalid POST | empty submit focuses Title, sets `aria-invalid`, and sends no POST; year 99 opens Optional details, focuses Release year, and sends no POST; fixing the year clears the message and `aria-invalid`; the corrected form navigates once | PASS | `add-form.spec.ts` › `manual add validates locally, keeps the draft, and saves after correction` |
| LIB1 / failed save preserves draft | a 503 on the one POST shows `Save failed`, keeps title, year, and note on `/media/add`, and the retry saves | PASS | `a failed save keeps the draft and can be retried` |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Stale library debounce navigation after Back/Forward | `LibraryComponent` `filterTimer` still called `applyNow` after `popstate`, which reloaded the library (`onSameUrlNavigation: "reload"`) | the same `filterTimer` / `applySoon` / `applyNow` path; `searchSoon` and `searchNow` still call it | removed the post-popstate navigation by clearing that one timer on `NavigationStart` when `navigationTrigger === "popstate"` | without the clear, `Back drops a pending filter` saw 4 library GETs (expected 3). With the clear, that test passed in the 77 |
| Second filter, debounce, or Add validation engine | none on this base. `searchSoon`/`searchNow` are entry points into the one timer. `validateAdd` is the only submit gate. The form stays `novalidate`; the `required` attributes remain the M11 semantic attributes, not a second POST path | `library-filters.mjs` and `add-validate.mjs`, used by the existing components | retained. No alternate implementation was found to delete, and none was added | request-count tests above, and the invalid Add POST count stays 0 |
| `.media-filters` rules in `media.css` | `search.component.ts` | search toolbar | retained. Not a library or Add filter path | not modified |

- Candidate class and protected counterexamples: conditional duplicate navigation, not a product removal. Saved-read database-only behavior, library outage/retry, scroll restore, and provider-free GET paths stay. `records.py`, `journal.py`, detail, the tag editor, and popular discovery were not edited.
- Comparison base SHA and full replacement closure: `0ed83e95a3727acc4f512dd2ac77211d8a622407`. Closure is `apps/media/frontend/src/library.component.ts`, `apps/media/e2e/library-filters.spec.ts`, `apps/media/e2e/add-form.spec.ts`, and this evidence file. `add.component.ts` and `media.css` were not changed.
- Production added/deleted/moved; comments/blank-only churn separately: `library.component.ts` +7/−0, all executable. No comment or blank-only lines. `add.component.ts` unchanged (256 lines).
- Independent equivalent implementations before/after: one debounce timer, one URL codec (`readFilters` / `toQueryParams`), and one Add validator. Still one of each. The extra post-Back navigation is gone.
- State/cache owners and public entry points before/after: the URL remains the filter source of truth. Public entry points remain `applySoon`, `applyNow`, `searchSoon`, `searchNow`, and `AddComponent.save`. No new cache.
- Remaining old symbol/path search, including config and discovery: `filterTimer` still exists once, in `library.component.ts`. `validateAdd` still exists once, in `add-validate.mjs`. No second debounce helper.
- Follow-up change: filter timing edits `applySoon` / `applyNow` and the popstate clear in `library.component.ts`. URL parsing stays in `library-filters.mjs`. Add rules stay in `add-validate.mjs` and `save()`.
- Tests/docs/generated changes separately: e2e +143 lines (`library-filters.spec.ts` +103, `add-form.spec.ts` +40). This evidence file is documentation. No generated bundle is committed. Coverage floors were not edited.
- Net production delta and specific reviewed safety/compatibility exception if positive: production +7. The lines cancel the pending timer when the user goes Back or Forward so that navigation cannot issue another library read. That is the safety fix for the competing request; it is not a new filter engine.
- No behavior/data/meaningful assertion silently removed: existing library, Add, outage, and conflict specs remain and passed in the Media Playwright run (77) and the media coverage gate (204).

## Verification

Local execution on product revision `ab4b4ba52d14e033bddd7f872f7e94b1eaa6915c` before this evidence file. CI, merge, and deployment were not run. Playwright used `PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright` because the sandbox browser cache had no Chromium. Karma port 9876 was already taken by another `ng test web`; the suite ran on port 55941 instead. `CHROME_BIN` was Playwright's Chromium because no system Chrome was on `PATH`. Coverage floors were not changed.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Doc paths, blame revisions, shared boundaries, finance UX, 53 unittest tests, e2e discovery, and 15 node script tests. |
| `make lint-web` | PASS. ESLint finance, site, packages, and world-engine ratchets match the baseline. |
| `make typecheck-web` | PASS. `tsc` for web, finance, packages, and site app/spec projects. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS via the isolated-port rerun below. The default port 9876 was busy. `ng` rejected a `--port` flag (`Unknown argument: port`). |
| `CHROME_BIN=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome SUITE_TEST_PROJECT=web npx ng test web --watch=false --browsers=ChromeHeadlessCI --karma-config=/tmp/karma-med-09.cjs` (port 55941) | PASS. 653 SUCCESS. Statements 82.41%, branches 68.65%, functions 81.92%, lines 85.93%. |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 53 passed, 0 failed. |
| `make build-frontends` | PASS. Production bundle written to `dist/web`. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS on the rerun after the Escape test clicked the sheet heading before Escape. 77 passed. The first full run failed that one new test because Escape closed the native type menu; the assertion was not weakened. |
| `make lint-python` | PASS. 211 files formatted. Ruff 101 and suppressions 6 match the baseline. |
| `make typecheck-python` | PASS. mypy 87 findings match the baseline. |
| `./scripts/coverage-gate.sh media` | PASS. 204 passed. Total coverage 84.15% (floor 70.60%). Floor file not edited. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 72 passed. |
| `npx playwright test --project=suite` | PASS. 24 passed. |

## Handoff

- PR URL (leaf closure keyword only): opened after this file, with `Closes #284`. Parent #85 is referenced and not closed.
- Roadmap #134 append-only status-note URL: posted after the pull request. The issue body was not edited.
- Merged/activation status (actual evidence, not assumption): local gates passed. Merge is not done. This file does not claim deployment or activation.
- Remaining external prerequisites or approved scope decisions: none for this leaf. MED-06 owns detail presentation. MED-10 owns retained runtime QA.
- Next actor: reviewer. Do not merge from this work.

## Context handoff

Issue / parent / local packet: MED-09, GitHub #284, parent #85, packet `planning/implementation/issues/MED-09.md`.

Branch, worktree, base main SHA, current SHA: `agent/med-09`, `/tmp/vivek-med-09`, base `0ed83e95a3727acc4f512dd2ac77211d8a622407`, tested product `ab4b4ba52d14e033bddd7f872f7e94b1eaa6915c`.

Owned files and conflict groups: `media-library`, `media-add`, `media-runtime`. Other active PRs checked: #319 was planning-only and has since merged without these files.

Completed acceptance rows with direct evidence: LIB1 and every original M8/M11 clause in the table above.

Unfinished/failed rows and exact next action: none in the leaf. The Escape spec was fixed and the Media Playwright suite was rerun to 77 passed.

Deletion ledger and current consumer migration: popstate clears the existing timer. `searchSoon`, `searchNow`, and `validateAdd` stay. Search `.media-filters` stays with search.

Commands run, results, tested SHA; required checks still pending: the table above. CI was not run here.

PR and roadmap note URLs; actual merge/deployment/activation state: the pull request and #134 note follow this commit. Not merged. Not deployed.

External prerequisites and next actor: MED-01 is already on the base. Next actor is the reviewer.
