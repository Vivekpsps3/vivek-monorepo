# Implementation status

Nothing on this list is done until an independent verifier has re-run the task's command, seen exit code 0, and checked the behavior in the tree. `open` is not done. Do not change a row because an implementer says it is finished.

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
| HUB-01 | open | pending |
| TRV-02 | open | pending |
| MED-04 | open | pending |
| WEB-01 | open | pending |
| TRV-03 | open | pending |
| SRC-01 | open | pending |
| FIN-01 | open | pending |
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
