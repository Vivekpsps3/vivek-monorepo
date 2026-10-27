# Implementation status

## Final release candidate — 2026-10-27

**All 34 of 34 tasks are done.** The integrated change is open as [PR #22](https://github.com/Vivekpsps3/vivek-monorepo/pull/22). Approved legacy runtime retirement, visual acceptance and final QA have passed. This checkpoint supersedes historical percentage estimates and pending-approval notes below. The [final verification](evidence/final-verification.md), [requirement acceptance map](evidence/requirement-acceptance.md) and [master board](10-execution-board.md) are authoritative.

| Remaining task | Status / acceptance |
| --- | --- |
| DEL-ALL | done — owner approved the removal; all 66 proposed files and two obsolete packaging symlinks are absent. Useful models, field-safe Undo payloads and retained tests are app-owned. [Actual removal](evidence/actual-runtime-removal.json), [static mapping](evidence/static-test-migration.json), [browser mapping](evidence/browser-test-migration.json). |
| UX-02 | done — final 390/768/1280 light/dark captures, 320/1440 shell/axe cases, forced colors, reduced motion/transparency, zoom, map, optional forms, row Undo and draft recovery pass. Representative post-cleanup screenshots and the live dark header were inspected. |
| QA-01 | done — `make test lint typecheck`, production build, root `npx playwright test` (177 passed, no skips/retries), image checks/browser probe, seeded adoption/upgrade with batch proof, dependency audits, ratchet-base checks and doc/CI validation pass. No gate was lowered. |
| PR-01 | done — [PR #22](https://github.com/Vivekpsps3/vivek-monorepo/pull/22) opened after all local checks passed. The integration branch is committed and pushed. CI is the second verification run; no merge or deployment was performed. |

The final cleanup exposed a hidden backend dependency on the retired JavaScript rounding file. The backend now owns its two-decimal display default, with full stored precision and explicit overrides preserved; the regression forbids frontend file reads. The first browser run’s two failures were diagnosed: a portrait test matched an album-card heading too early, and a Docker network change interrupted a Finance tab’s initial bundle requests. The portrait test now waits for the actual page heading and passed 20 repetitions; the full matrix rerun after Docker work passed all 177 tests without retries. The earlier commit-timing, database idempotency, identity-decoy, public-root, Media scroll/generation and Travel draft/Undo fixes remain green.

Final gates: Finance **116 / 84.52%**, Travel **74 / 85.10%**, Media **138 / 79.45%**, server **73 / 65.07%**. Karma **383 + 15 + 92**, retained Node **46**, script Python **38**, fast Node **7**. All six lint allowance comparisons are within `origin/main`. Npm production audit reports zero vulnerabilities; pinned backend audit reports no known vulnerabilities. Seeded adoption and upgrade each preserve **2,521 original rows**, with 36 proven catalog and 36 membership additions; integrity, FKs, drift, authentication and byte-identical planning pass.

Source: **103,220 → 95,953 lines (−7,267)** under the declared suffix method, including tests/vendor code, with moves and gross retirement reported separately. Installs/locks: **3 → 1**. Root build: **529.93 kB initial / 140.33 kB estimated transfer**, five public prerenders, 5.499-second descriptive sample. Mixed-library SELECTs: **319 → 5**. No exhaustive defect-free, live-provider-uptime or independent-agent review claim is made. Browser/map fixtures are deterministic.

Branch: `suite-experience-remediation`; implementation commit `2dc877e`; pre-refactor source snapshot `73de49c`. Final logs use `/tmp/suite-retirement-*`; portable metrics, migration proof and reconciliations are checked into the evidence folder. Original pre-removal uncommitted inputs remain preserved in `/tmp/suite-runtime-before-removal.tar.gz` and its SHA-256 manifest.

## Historical checkpoints

## Trip stories, rating, search pages, and Unicode title order — 2026-10-27

The owner asked for ten more tasks. Ten scoped follow-ups are done in the
working tree and verified locally. Parent rows TRV-04, ERR-01, NAV-01, ARC-05,
and SRC-02 stay open. DEL-ALL, DOC-01, QA-01, and PR-01 stay open. The
engineering estimate is **74% of the total plan**, including implementation
and acceptance; this is not a count of independently verified checklist rows.
The master checklist is still 16 of 34 rows marked done.

1. **Overlapping PTO — done.** The trip page names each shared date, the
   combined amount, and the labels. Home cards say "PTO overlaps".
2. **Same day and one night — done.** A departure that is also the return says
   "same day". A one-night span says "1 night".
3. **Home attention — done.** Unbooked necessary parking and open reminders
   show under "Needs a look" and link to the trip.
4. **Two-city trip — done.** Kyoto, then Osaka, saves as "Kyoto and Osaka"
   with both cities.
5. **Return before departure — done.** The draft keeps the error, and Save
   stays disabled until the return is on or after departure.
6. **Leap day — done.** 2028-02-29 through 2028-03-01 keeps February 29, both
   weekday PTO charges, and one night.
7. **Half day — done.** Choosing Half day saves 0.5 PTO days and reopens as
   Half day.
8. **Rating zero — done.** A saved 0 stays 0 on the card. Clearing the field
   saves no rating.
9. **Search pages — done.** More results and Previous move the search offset
   by 20 and back.
10. **Unicode title order — done.** Library title sort uses a stored fold key
    and SQL pagination. Revision `site_catalog_title_sort_v1` backfills it.

The deletion ledger, the rest of the backend lifecycle and schema-drift audit,
root docs/CI, and the remaining release gates are still open. The in-memory
create key still does not survive a process restart. Coverage floors stay
80.41% for Travel and 70.6% for Media.

| Latest local check | Result | Log |
| --- | --- | --- |
| Full Travel Playwright, including the trip stories | 66 passed, no skips | /tmp/suite-ten-travel-browser.log |
| Full Media Playwright, including rating and search pages | 46 passed, no skips | /tmp/suite-ten-media-browser.log |
| Sort, migration head, accent backfill, and drift tests | 14 passed | /tmp/suite-ten-pytest.log |
| Media coverage gate | 138 passed; 79.45%, unchanged 70.6% floor | /tmp/suite-ten-media-coverage.log |
| Ruff ratchet | 101 findings match the baseline | /tmp/suite-ten-ruff.log |

The browser server served `dist/web`, built 2026-10-27 06:37:44 UTC
(`/tmp/suite-ten-build2.log`). No commit, push, PR, or deployment was made.

Detail: [trip stories and title-sort evidence](evidence/travel-stories-title-sort.md).

## Progress, lost create, optional editors, weekend PTO, and date-line flights — 2026-10-27

The owner asked for five more tasks. Five scoped follow-ups are done in the
working tree and verified locally. Parent rows TRV-04, ERR-01, NAV-01, ARC-05,
and SRC-02 stay open. The engineering estimate is **72% of the total plan**,
including implementation and acceptance; this is not a count of independently
verified checklist rows. The master checklist is still 16 of 34 rows marked
done.

1. **Media in-flight progress edits — done.** A progress value and unit typed
   while a save is in flight stay on the form. The next save sends those newer
   values. The existing note path was already covered.
2. **Lost trip-create response — done.** The client keeps one save id while the
   payload is unchanged. The server remembers that id in this process and
   returns the same trip on retry, so a completed insert whose response never
   reached the browser does not create a second trip.
3. **Optional trip editors — done.** A failed save of a drive, activity, note,
   reminder, parking spot, cost, or destination keeps the typed values, and
   the retry saves one of each. Cancel, then Keep editing, retains an unsaved
   note. Discard changes drops it and does not save it.
4. **Weekend-only trip — done.** Saturday 2026-11-07 through Sunday 2026-11-08
   in Honolulu starts as Not PTO. The saved trip shows 0 PTO days.
5. **Date-line and repeated local hour — done.** The live flight model reports
   an earlier local arrival for a Tokyo-to-Honolulu preview, keeps the two
   America/New_York 01:30 stamps distinct by offset, and falls back to UTC for
   an unknown zone. The browser preview shows the earlier-date sentence.

The deletion ledger, backend lifecycle/schema drift, root docs/CI, and the
remaining release gates are still open. The in-memory create key does not
survive a process restart, and two creates that overlap before the first one
is recorded can still insert two trips. The coverage floor stays 80.41%.

| Latest local check | Result | Log |
| --- | --- | --- |
| Full Travel Playwright, including the five new Travel stories | 58 passed, no skips | /tmp/suite-travel-browser.log |
| Full Media Playwright, including in-flight progress | 44 passed, no skips | /tmp/suite-media-browser.log |
| Travel Node suites, including the live date-line model | 70 passed, no skips | /tmp/suite-travel-node.log |
| Travel coverage gate | 70 passed; 85.22%, unchanged 80.41% floor | /tmp/suite-travel-coverage.log |
| Trip-create attempt unit tests | 4 passed | /tmp/suite-create-attempt.log |
| Ruff on the create-attempt Python files | Passed | /tmp/suite-ruff-create.log |

The browser server served `dist/web`, built 2026-10-27 05:52:01 UTC
(`/tmp/suite-five-build.log`). Later edits were spec locators only. No commit,
push, PR, or deployment was made.

Detail: [progress, create, forms, weekend, and date-line evidence](evidence/travel-create-progress-forms.md).

## Map recovery verified, plus calendar, flights, and library recovery — 2026-10-27

The owner asked to finish Travel map recovery and then at least three more
tasks. Four scoped follow-ups are done in the working tree and verified
locally. Parent rows TRV-04, ERR-01, NAV-01, and ARC-05 stay open. The
engineering estimate is **70% of the total plan**, including implementation
and acceptance; this is not a count of independently verified checklist rows.

1. **Travel map failure and recovery — done.** Tile outages stay visible
   through selection and unrelated saves. Retry redraws tiles and returns
   focus to the map canvas below the sticky header. Location search keeps
   timeout, throttling, no-match, and ambiguous choices distinct.
2. **Travel calendar month and retry — done.** The default month uses local
   time, including across the UTC date line, and is written into the URL.
   Retry refetches that same month after a failed calendar request.
3. **Flight disambiguation, manual times, and adverse lookup states — done.**
   Two flights on the trip date stay unselected until a choice. A typed
   departure survives the next lookup. A missing AeroAPI key, a timeout, and
   no match stay distinct, and the departure field stays editable.
4. **Media library retry focus and scroll restoration — done.** A successful
   retry moves focus to the Library heading. Back from an item restores the
   library scroll position.

In-flight progress edits, ambiguous trip creation, the optional-form audit,
the deletion ledger, backend lifecycle/schema drift, root docs/CI, and the
remaining release gates are still open.

| Latest local check | Result | Log |
| --- | --- | --- |
| Full Travel Playwright, including map recovery, calendar, and flights | 53 passed, no skips | /tmp/suite-travel-browser.log |
| Full Media Playwright, including library recovery | 43 passed, no skips | /tmp/suite-media-browser.log |
| Travel Node suites, including nested flight errors | 69 passed, no skips | /tmp/suite-travel-node.log |

The browser server served `dist/web`, built 2026-10-27 04:19:55 UTC after the
component changes. The final spec edits were locators and a library navigation
wait, so they did not need another build. No commit, push, PR, or deployment
was made.

Detail: [map evidence](evidence/travel-map-recovery.md) and
[calendar, flights, and library evidence](evidence/travel-calendar-flights-library.md).

## Two requested follow-ups complete — 2026-10-27

The owner resumed for **two more tasks**. Both scoped follow-ups below are
**done**, integrated in the working tree and verified locally. Work stops at
this checkpoint after that requested increment. The engineering estimate is
**67% of the total plan**, including implementation and acceptance; this is
not a count of independently verified checklist rows.

1. **Travel PTO/settings draft handling — done.** Route/unload guards retain
   edits on cancellation and bypass expired/changed sessions. PTO reads,
   leave saves/removal and failed retries preserve an independent policy draft.
   Late policy/key saves preserve newer typing; personal-key removal preserves
   a replacement draft. API-key drafts stay out of browser storage.
2. **Media library page query work — done.** Cards batch page-scoped TV flags,
   lifecycle and owned music counts. The mixed 24-card fixture fell from **319
   to 5 SELECTs**; a book-only page from **197 to 2**. Detail truth, second-user
   isolation and duplicate relationship handling have regressions. The unused
   library `continue` payload is removed; next episodes remain on the Now
   summary, with an explicit contract test. Per-card query helpers were deleted.

These complete follow-ups within NAV-01 / the Travel browser audit and ARC-05;
the broader parent rows stay open. Full detail, changed files, API/deletion
notes and reproducible measurements are in the
[two-task evidence](evidence/travel-drafts-library-queries.md).

| Latest local check | Result | Log |
| --- | --- | --- |
| Full Travel Playwright, including 14 draft cases at phone/desktop and six screenshot runs | 38 passed, no skips | /tmp/suite-two-tasks-travel-browser.log |
| Full Media Playwright, including six screenshot runs | 41 passed, no skips | /tmp/suite-two-tasks-media-browser.log |
| Media coverage | 136 passed; 79.39%, unchanged 70.6% floor | /tmp/suite-two-tasks-media-coverage.log |
| Travel coverage | 66 passed; 85.07%, unchanged 80.41% floor | /tmp/suite-two-tasks-travel-coverage.log |
| Root/shared UI Karma | 88 passed, unchanged floors | /tmp/suite-two-tasks-web-karma.log |
| Travel/Media/auth-UX Node suites | 115 passed, no skips | /tmp/suite-two-tasks-node.log |
| Root production build | Passed; 5 prerendered pages | /tmp/suite-two-tasks-build.log |
| Python/web lint and all configured TypeScript checks | Passed, allowances unchanged | /tmp/suite-two-tasks-quality.log |
| Python checks after final contract-test update | Passed; Ruff 101, mypy 87, suppressions 0 | /tmp/suite-two-tasks-python-final.log |
| Fast docs/boundaries/script checks | Passed; 32 Python and 7 Node tests | /tmp/suite-two-tasks-fast.log |

Phone PTO/key confirmation captures were visually checked for readable copy,
visible actions and fit. The two browser screenshot directories are isolated
under `/tmp/suite-two-tasks/`. Final whole-suite visual acceptance remains open.

Resume the remaining old-to-new behavior audit (flight/map adverse states,
optional forms, focus/scroll, in-flight progress and ambiguous create retries),
then the deletion ledger, backend lifecycle/schema drift, root docs/CI and
production-browser/adoption scripts, remaining performance evidence and final
release gates. Non-ASCII SQL sort parity is still unaudited. Earlier Finance
results still need rerunning after prior shared session/modal changes.

Branch remains `suite-experience-remediation`, with one agent and uncommitted
work preserved. No commit, push, PR or deployment was made.

## Previous pause — 2026-10-27 (65% checkpoint)

The owner requested a pause at the next logical spot and a percent-complete
update. Work is now **paused after completing the current browser-check pass**.
Do not continue implementation until the owner resumes it. The engineering
estimate is **65% of the total plan**, including implementation and acceptance;
this is not a claim that 65% of checklist rows are independently verified.

Latest local evidence:

| Check | Result | Log |
| --- | --- | --- |
| Full Travel Playwright, including all six screenshot runs and axe | 24 passed, no skips | /tmp/suite-travel-browser.log |
| Full Media Playwright, including all six screenshot runs and axe | 41 passed, no skips | /tmp/suite-media-browser.log |
| Root/shared UI Karma | 88 passed, unchanged coverage floors | /tmp/suite-web-karma.log |
| Root production build | Passed; 5 public routes prerendered | /tmp/suite-root-build.log |
| Web lint and all configured TypeScript checks | Passed; allowances unchanged | /tmp/suite-web-checks.log |
| Python formatting/lint/suppressions/mypy | Passed; Ruff 101, mypy 87, suppressions 0 | /tmp/suite-python-checks.log |

Finance's earlier browser 49 / Karma 383 and public Karma 15 runs passed.
Shared modal/toast/session changes since those runs require a final rerun.
Media's earlier coverage run passed 133 tests at 79.32%, above the unchanged
70.6% floor; later Favorites and fixture changes require a fresh final gate.
Do not treat these prior results as final release verification.

This checkpoint finished SQL membership pagination/counts/Favorites, URL-backed
artist expansion, manual album/song UI, explicit DB-only calendar views with
provider refresh, honest partial MusicBrainz search, per-tab owned draft
recovery, changed-field/review-base saves, bounded requests, session race guards,
and native browser-story migration. Travel can explicitly allocate a legacy
PTO total, protects unsaved PTO changes, edits parking/costs, restores declined
date edits, and requires a visible transport mode choice. The screenshot pass
caught and fixed overlapping artist cards. Shared query-only navigation no
longer steals search focus; Escape targets only the top modal.

Read [browser migration checkpoint](evidence/browser-migration-checkpoint.md)
before retiring old tests or runtimes. The full old-to-new story audit remains
open; fewer passing tests do not prove parity. Screenshot artifacts currently
use default test-results paths; isolate/copy final per-domain artifacts before
the final QA run because another runner can clear a shared output directory.

Resume in this order:

1. Complete the remaining behavior audit in the browser checkpoint: retry
   heading focus, scroll restoration, in-flight progress edits, ambiguous create
   retries, flight disambiguation/overrides, map outage/recovery, and Travel
   policy/settings draft handling. Do not silently drop an old meaningful story.
2. Close the deletion ledger after replacement proof. Old Travel/Media static
   renderers/transports and associated obsolete source-string assertions remain
   on disk. Retain useful pure models, tests, data and applied migration history.
3. Finish the backend lifecycle/ownership audit and rerun schema drift after
   identity model relocation. Do not reintroduce ambient production DB state.
4. Finish root workflow docs/AGENTS/CI and migrate the production browser-check
   script. Validate CI YAML. Seeded adoption must support historical main:app
   trees and the current production_app --factory entrypoint.
5. Record performance/query/payload/source/dependency/build evidence. The library
   now pages in SQL but still computes the unused Continue rail and performs
   per-card relationship/progress queries; inspect and simplify that hot path.
6. Run the full applicable local gate matrix, immutable-image/browser checks,
   seeded migration/adoption and final visual/security/data-preservation audits.
   Reconcile every task/requirement with evidence before marking it done.
7. Only then prepare the single final PR. No commit, push, PR or deployment has
   been made during this implementation run.

Branch: suite-experience-remediation. The working tree remains uncommitted
(318 status entries at this checkpoint); preserve it. Continue with one agent,
as selected by the owner; do not claim independent agent review.

## Finance verification checkpoint — before the requested second pause

The current Finance browser fixes are complete. The production build and all
**49 Finance Playwright tests passed**, including the enabled screenshot matrix
at 390/768/1280 in light and dark (`SCREENSHOT_DIR=/tmp/suite-finance-final-shots`).
Finance Karma passed **383 tests**, root Karma **80**, site Karma **15**, with
all coverage floors unchanged. `make lint-web typecheck-web` also passed.
Logs are `/tmp/suite-finance-browser-full.log`, `/tmp/suite-finance-karma.log`,
`/tmp/suite-web-karma.log`, `/tmp/suite-site-karma.log`, and
`/tmp/suite-web-checks.log`.

The shared required-field labels retain their field names and expose required
state separately. The persistent header owns theme/account actions, Finance's
Guide retains the ticker privacy explanation, and there is one shell skip link.
An optional neutral update-notice port lets an active modal dismiss the shell
notice while preserving its draft and keeping background controls inert. A
regression test covers this behavior. Real-account challenge assertions consume
the response body before navigation can discard it.

The user requested another **4 hour 15 minute pause after this work**, then
automatic continuation. Do no implementation work during the timer. Resume the
remaining Travel/Media browser parity, deletion ledger, production browser
checks, docs/CI migration, session race audit, and complete release verification.
The total plan remains in progress; no PR, push or deployment has happened.

## Resumed after timed pause — account navigation verified

The requested **4 hour 15 minute pause completed** at 20:12 UTC on 2026-10-26. Work resumed automatically. The pause followed
after finishing the active account-navigation fix. That fix is complete: the
root Karma suite passed **78 tests** with its coverage floors; the production
build prerendered **5 public pages**; the real-account browser group passed
**7 tests**, covering sign-in, rename/reload, legacy username, CSRF, wrong
passphrase and taken username. Account opens on an already mounted Hub, Done
closes it and clears query state, and the persistent header owns Sign out.

The total plan is still in progress. No PR, push or deployment has happened.
Resume with the full Finance browser run and remaining legacy Travel/Media
browser parity, deletion, release checks, documentation and acceptance audits.
The old Travel map fixture server is stopped for this pause.

Current evidence also includes Media native browser 6 passing, Travel native
browser 5 passing, and the earlier isolated gates: Media 130 / 79.13%, Travel
66 / 85.07%, server 70 / 78.05%. Following backend identity relocation, Finance
passed 116 tests / 84.51% over its original logical source set, including the
relocated files; its 83.28% floor is unchanged. Server then passed 70 / 64.82%.
These must be rerun where later changes affect them. Finance Karma's last run
had a stale embedded-navigation assertion; its corrected assertion still needs
a rerun. Lint/type baseline allowances have only shrunk; rerun all ratchets.

Backend identity now lives in `apps/server/identity`; production uses explicit
`production_app --factory`, and root composition no longer publishes global
DB/session state. Historical Finance test helpers still use their explicit
fixture publication. The root CI/tooling migration is underway. The seeded
adoption script must support historical `main:app` and current factory trees;
its old-tree commands currently retain the historical entrypoint. The production
browser-check script still needs migration from old hash/static assumptions.
Full Travel/Media legacy runtimes remain on disk until browser-story parity
and the deletion ledger are closed. Do not mark those tasks done yet.

## Active implementation — 2026-10-26

The owner resumed work and requested the whole plan completed. The owner explicitly
selected **one agent**; the swarm/independent-agent portions of the original board
are superseded for this run. Automated unit, integration, and real-browser checks
are run separately from implementation. No independent agent review is claimed.
Work continues on `suite-experience-remediation`; do not push `main` or open the
final PR before the complete local gate matrix passes.

Current working tree (not a release candidate): one root npm install/lock, one
Angular build and browser bootstrap, suite-owned Hub/sign-in/account, neutral
session injection, root document delivery, strict common private CSP, and a real
Leaflet DOM adaptation. Public pages prerender meaningful content. The representative
Travel map works under enforced Trusted Types with synthetic tiles; its screenshots
are architecture evidence, not final UI acceptance. Full Travel/Media Angular
ports, remaining product tasks, deletion, docs/CI migration, and final gates remain.

Verified during this run: fast checks passed; Travel coverage gate passed 66 tests
at 85.26%; public Karma passed 15 tests with its original floors; the first moved
web suite passed 64 tests before the persistent-header integration. Root/map API
checks passed 26 tests. Root Chromium smoke observed zero private API calls from
public Home, zero CSP violations, zero browser errors, working map markers/popups,
and origin-only tile Referer. No real OSM tiles were fetched by automation.

Current failures being fixed: updated web shell/account tests, Python lint/type
ratchets (including inherited Media provider/type debt), remaining old build/CI
references, and root test/command migration. Do not read the historical `done`
rows below as final verification of the current working tree. Reconcile them with
the final acceptance evidence before closing tasks.

Baseline inventory: [resume-baseline.json](evidence/resume-baseline.json).
Source moves: [frontend-moves.json](evidence/frontend-moves.json).
Map captures: [desktop](evidence/screenshots/ARC-01-map-desktop.png),
[mobile](evidence/screenshots/ARC-01-map-mobile.png).

## Historical verification and pause record

A task is complete only after its acceptance behavior and applicable local gates have been verified with recorded evidence. The owner's single-agent instruction supersedes independent agent review for this run. `open` is not done.

### Previous handoff

Paused on 2026-10-26 after the TRV-03, SRC-01, and FIN-01 wave. The `suite-remediation` workflow is paused on branch `suite-experience-remediation` at `3d9dd10`. Resume only when asked. Do not push `main`.

Checked done in this session: QA-00, API-01, DB-01, DB-02, TRV-01, MED-01, NAV-02, TRV-05, MED-02, HUB-01, TRV-02, MED-04, WEB-01, TRV-03, SRC-01, FIN-01. FIN-01's verifier recorded a passing finance coverage gate. A spot check found `ui-dialog` in place of the old tutorial backdrop, no "Start the backend" copy, and `computeNetWorth` still in use. That gate was not re-run for this handoff.

Open with evidence, not finished:

- ARC-01 removed a Travel shim and an unused site route file only. Finance, Travel, and Media still have separate routers. There is no shared root build and no CSP, SEO, vault, or map spike.
- ARC-02 has one server factory, and the server coverage gate passed. Travel, Media, and Finance end-to-end servers still import symbols that factory deleted.
- ARC-03 collapsed the duplicate Karma configs without an Angular major upgrade. `make test-fast` then failed in `scripts/check-shared-boundaries.py`.
- UX-01 added required and optional notes. There is no contrast measurement, fallback spec, or interaction evidence.
- NAV-01 shows one Hub control on Finance, Travel, and Media. `make test-fast` exited 2 on the same shared-boundary check.

Not started, or started and not kept: TRV-04, SRC-02, SRC-03, MED-03, TV-01, TV-02, ERR-01, ARC-05, DEL-ALL, UX-02, DOC-01, QA-01, PR-01. TRV-04 and SRC-02 implementers had just started when the pause landed. They were cancelled, nothing of theirs was merged, and both rows stay pending.

The workflow journal already accepted ARC-01 and UX-01 before those rows were reopened, so a resume will not retry them. ARC-02, ARC-03, and NAV-01 failed verification, so the script's final sweep should still attempt them. Finish the reopened foundation rows by hand if the sweep skips them.

Keep the same rules. Delete the path a change replaces. Do not add a framework or a one-caller abstraction. Finance vault plaintext stays in the browser. Do not lower a coverage floor. Open one pull request only after every row above is done and the full gate matrix has passed.

| ID | Status | Evidence |
| --- | --- | --- |
| QA-00 | done | test -s planning/suite-experience-remediation/evidence/QA-00.md exited 0. Inspected QA-00.md against make test-fast (exit 0, only duration_ms differed), git status (clean; quote matches pre-commit parent f36fb602), and byte-identical Travel/Media static entries index.html, app.js, and modules/app.mjs. No app source changed. |
| ARC-01 | open | Not done. The diff deletes unused apps/site/src/app/app.routes.server.ts and the 3-line Travel app.js shim, and scripts/composition-path.test.mjs passes. Finance still has its own bootstrapApplication. Travel and Media still use hash routers. No root build, CSP, SEO, vault, or map spike was added. |
| ARC-02 | open | ./scripts/coverage-gate.sh server exited 0 (66 passed). Inspected apps/server/main.py, database.py, auth.py, test_composition.py, and finance/travel/media app.py plus e2e servers. One server create_app, database lifecycle, and Principal exist and domain factories are gone, but travel/media/finance e2e servers still import deleted create_app, AuthResult, Principal, init_db, and finance app. |
| API-01 | done | ./scripts/coverage-gate.sh server exit 0. Inspected 09-architecture-migrations.md, apps/server/database.py, errors.py, main.py, flights.py, places.py, integrations.py, market_data.py, providers.py. release_for_provider_io commits before provider IO; typed APIError uses 502 not suite 401; prefixes remain /api, /travel/api, /media/api. |
| DB-01 | done | ./scripts/coverage-gate.sh travel exit 0 (51 passed). Single unified head site_trip_pto_days_v1 revises site_auth_challenge_purpose_v2. Inspected 09-architecture-migrations.md, 05-travel.md, site_trip_pto_days_v1.py, models.py, services/pto.py, test_pto_allocation.py, schema.py. |
| DB-02 | done | ./scripts/coverage-gate.sh media exit 0. Inspected 09-architecture-migrations.md, 06-media-library.md, site_media_membership_v1.py, models.py, membership.py. Sole head site_media_membership_v1 revises site_trip_pto_days_v1 with membership, portrait, follow, and lifecycle fields; legacy scores, episodes, and shared artwork kept. |
| ARC-03 | open | make test-fast exited 2 because scripts/check-shared-boundaries.py failed. Inspected apps/karma.conf.js, apps/finance/frontend/angular.json, apps/site/angular.json, and both app package.json files; Angular stayed at 21.2.25. Replaced apps/finance/frontend/karma.conf.js and apps/site/karma.conf.js are gone, as is packages/ui/package-lock.json. |
| UX-01 | open | Not done. Finance subscriptions marks required fields and collapses optional ones. Travel and Media only add required/optional notes. Shared controls gained hover, disabled, invalid, and mobile scroll-margin. No contrast measurement, fallback spec, or interaction evidence. |
| NAV-01 | open | make test-fast exit 2; check-shared-boundaries failed with recipe error 1. Inspected 04-hub-finance.md, main-layout.component.html/css, travel and media index.html, app.css, controls.css. One visible suite-hub on Finance, Travel, and Media at desktop and narrow, old tab/menu/footer Hub links gone, deep links kept; command was not exit 0. |
| TRV-01 | done | node --test apps/travel/backend/static/tests/*.test.mjs exit 0. Inspected 05-travel.md, composer.mjs, composer-model.mjs, new-trip.mjs, app.css, tr3.test.mjs, router.mjs. toggleSplit and Split… removed; dates and Destination city precede one Rename trip title; changeCity keeps typed cities and blocks a blank stay. |
| MED-01 | done | ./scripts/coverage-gate.sh media exit 0 (70 passed). Inspected 06-media-library.md, records.py, journal.py, membership.py, providers.py, and views.mjs. UserEntry saves are explicit; discography and legacy music_albums do not insert album or song membership. _load_artist_catalog and backfill_missing_tracks are gone. |
| NAV-02 | done | CHROME_BIN set, npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI exit 0 (425 SUCCESS). Inspected 04-hub-finance.md, main-layout.component.html/ts/css, suite-hub-link.component.ts, app.routes.ts, auth.guard.ts, vault.guard.ts: one header Hub control, old nav-tab and mobile-tab /hub links absent, five section tabs, guards and deep-link redirects unchanged. |
| TRV-05 | done | node --test apps/travel/backend/static/tests/*.test.mjs exited 0 (61 passed). Inspected 05-travel.md, trip.mjs, new-trip.mjs, ui.mjs, and blockers.test.mjs: empty trips show one btn-sm Add transport and quiet days; always-open ride, day, parking, note, and reminder builders are gone. |
| MED-02 | done | node --test apps/media/backend/static/tests/*.test.mjs exited 0. Inspected 06-media-library.md, views.mjs libraryCard/savedExpansion/discographyHtml, app.mjs viewLibrary/libraryCards/viewDiscography, app.css .card/.is-artist, and index.html. artistSection, buildLibraryTree, and movieBrowseCards are absent from live JS. |
| HUB-01 | done | npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI exit 0 (446 SUCCESS, CHROME_BIN set). Inspected 04-hub-finance.md, hub.component.ts/html, hub-load.ts, finance-hub-facade.ts, dek-store.ts, hub-summary.ts: failed cards recover alone; vault facade imports only after financeVaultPresent; old Hub VaultService inject and loadDashboard path is gone. |
| TRV-02 | done | ./scripts/coverage-gate.sh travel exit 0 (55 passed). Inspected 05-travel.md, pto.py, models.py, assemble.py, routers/pto.py, trips.py, trip.mjs, pto.mjs, test_pto_allocation.py. One TripPtoDay per date, weekends default 0, and trip, home, calendar, preview, and PTO board forecasts use those charges. |
| MED-04 | done | ./scripts/coverage-gate.sh media exit 0. Inspected 06-media-library.md, domain.py, records.py, summary.py, membership.py, calendar.py, format.mjs, app.mjs, views.mjs, hub.component.html, test_artist_follow.py. Artists are following or unfollowed; legacy in_progress is not a listen and no song or experience is created. |
| WEB-01 | done | npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI exit 0 with CHROME_BIN (8 SUCCESS). Inspected 04-hub-finance.md, app.routes.ts static titles, ecdh.service.ts local ECDH, secrets.component.html escaped text, app.component.html one Workspace /hub link, package.json and lock without socket.io-client, and apps/site/flask absent. |
| TRV-03 | done | node --test apps/travel/backend/static/tests/*.test.mjs exit 0. Inspected 05-travel.md TRV-03, flight.mjs, ui.mjs, new-trip.mjs, trip.mjs, composer.mjs, flights.py, integrations.py, and flight.test.mjs. A number and date debounce to /api/flights/lookup and preview one local-day candidate; edit-flight-manually keeps the typed depart_at. lookup-flight, applyFlight, and flight-results are absent. |
| SRC-01 | done | ./scripts/coverage-gate.sh media exited 0 (91 passed). Inspected 07-search-providers.md, providers.py, records.py, domain.py, and test_provider_contracts.py. Movie, tv, book, game, artist, album, and track each have one search route and one lookup_detail path with provenance and MB_PACE or the 3s timeout. The replaced MusicBrainz sleep and immediate retry are gone. |
| FIN-01 | done | ./scripts/coverage-gate.sh finance exit 0 (116 passed). Inspected 04-hub-finance.md, main-layout.component.html/ts, api-health.service.ts, ui-dialog.component.ts/html, vault-setup.component.ts, vault-unlock.component.ts, client-finance.ts, vault-crypto.ts, bank-import.parsers.ts, and fidelity-import.util.ts. Shared ui-dialog replaced tutorial-backdrop, Retry replaced Start the backend, and vault crypto, import parsers, and computeNetWorth are unchanged. |
| TRV-04 | open | pending |
| SRC-02 | open | pending |
| SRC-03 | open | pending |
| MED-03 | open | pending |
| TV-01 | open | pending |
| TV-02 | open | pending |
| ERR-01 | open | pending |
| ARC-05 | open | pending |
| DEL-ALL | open | pending |
| UX-02 | open | pending |
| DOC-01 | open | pending |
| QA-01 | open | pending |
| PR-01 | open | pending |
