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
| ARC-03 | open | pending |
| UX-01 | open | pending |
| NAV-01 | open | pending |
| TRV-01 | open | pending |
| MED-01 | open | pending |
| NAV-02 | open | pending |
| TRV-05 | open | pending |
| MED-02 | open | pending |
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
