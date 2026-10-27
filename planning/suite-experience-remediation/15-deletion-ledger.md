# Delete / combine / keep ledger

Every deletion must identify its consumers, move any required behavior, pass the replacement checks, and remove old imports/docs/build references in the same integration slice. Retired source is recoverable in git; do not move whole dead systems into an “archive” directory in the live build. Data and applied migration history are different from obsolete application code.

## Current checkpoint — 2026-10-27

The owner explicitly approved retirement of the 66 listed files and completion of all remaining tasks. The [actual removal record](evidence/actual-runtime-removal.json) confirms every proposed path is absent, useful pure models/tests moved to app-owned frontends, and two unused shared-browser packaging symlinks are removed. A byte-identical `/tmp` backup preserves the original uncommitted inputs. This resolves the earlier approval block.

The root lock/build/bootstrap, backend identity/session/database lifecycle, Finance-only validator ownership, root proxy, docs/CI and actual six-user seed use one supported workflow. Coverage exposed and fixed the backend’s hidden JavaScript rounding-file dependency. [All 113 static assertion dispositions](evidence/static-test-migration.json) and [69 original browser-story dispositions](evidence/browser-test-migration.json) identify their retained or native replacements. Applied migration history, useful URL aliases, provider distinctions, encryption, operational backup/adoption tooling and unchanged coverage floors remain.

Final affected verification and task closure are recorded in [final verification](evidence/final-verification.md). The remaining `backend/static/tests` paths are CI test-discovery paths; no renderer/router/session runtime is retained there. Historical source anchors in planning documents describe the baseline rather than supported runtime paths. Pure formatter/model modules have no mounting, global action dispatcher or HTTP transport.

| ID | Concrete candidate | Action and replacement | Proof / deletion condition |
| --- | --- | --- | --- |
| DEL-01 | `apps/site/flask/` backend, its tests/requirements/config | Delete retired Flask/Socket.IO/Ollama stack. Current `/secrets` is browser-local ECDH. | Search CI/docs/image/ops consumers, preserve any actual contract in local demo tests; remove stale README setup. Root image does not copy Flask. |
| DEL-02 | `socket.io-client` in site dependencies | Remove unused transport dependency. | No current source import; fresh install/build and demo behavior pass. |
| DEL-03 | `marked`, `ngx-markdown`, `provideMarkdown` and Secrets MarkdownModule | Replace decrypted-text Markdown with escaped plain text; delete render dependency/providers if no remaining consumer. | Inspect every import/template, test HTML-looking text and ECDH roundtrip; remove obsolete CSP exception only after actual browser check. |
| DEL-04 | Two Angular bootstraps, per-app dependency locks/build/Karma/ESLint/TS configs | Combine root workspace and one `apps/web` runtime/build; retain feature tests and meaningful per-domain reports. | Route/build/test discovery manifest before/after; no duplicate npm install or runtime copy. |
| DEL-05 | `SuiteLocationStrategy`, Finance-prefix stripping and obsolete full-document auth continuation workarounds | Delete obsolete prefix/runtime branches at root-router cutover; one canonical safe-next-path and route manifest. Preserve intentional public↔private full-document transitions when their policies differ. | Finance home vs public root, aliases, queries, login return, refresh/back and required document-policy transitions all pass. |
| DEL-06 | Travel/Media hash parsers/routers, string views, global action dispatch, duplicate app shells/theme/account/menu code | Replace with Angular feature routes/components and suite shell, retaining useful pure models. | Each domain slice passes same user stories, error/undo/draft behavior and integrated browser checks; startup hash translator replaces bookmarks. |
| DEL-07 | Travel/Media duplicated `api.mjs` transport, CSRF preflight/login-next/error parsing | One small platform HTTP/session client. | Cancellation covers preflight+request; session/provider error separation; do not preflight via expensive home/summary endpoint. |
| DEL-08 | Domain Principal/AuthResult, remote Finance auth fallback, per-domain session middleware | One server principal/session/CSRF dependency. | Migrate isolated tests/harnesses first; expired/rotated/concurrent-user/CSRF tests pass. |
| DEL-09 | Domain engine creation/bind_database, duplicated sessions/pragmas, startup create_all/ALTER fallbacks | One server database lifecycle and explicit test fixture DB creation. | Fresh/adopted DB migrations and all domain tests run via injected session; import cannot create accidental files. |
| DEL-10 | Finance app route/middleware/exception copying in `apps/server/main.py` | Explicit exported routers and one app factory; named middleware once. | Assembled auth/security/cache/health/rate-limit behavior passes. |
| DEL-11 | Per-domain deploy files such as `apps/travel/docker-compose.yml`, orphan standalone commands/requirements | Delete unsupported deployment modes and stale cache-key/docs references; one root compose/image/server lock. | Full tracked-reference audit. Keep any requirements input still used to compile authoritative locks until consolidated. |
| DEL-12 | Media title-keyed tree, unpaginated artist sections, popular-movies-in-empty-library branch | Delete after saved-only uniform library ships. | Explicit membership fixture, same-name identity fixture, sort/filter/count/pagination tests. |
| DEL-13 | Eager artist discography hydration/backfill/resume paths and repeated artist-heavy library payload | Delete automatic pipeline; explicit paginated Explore/Refresh only. | Migration preserves personal scores; normal reads make zero provider calls. Keep actual public relationships needed by browse. |
| DEL-14 | Generic artist Listening/Listened branches | Delete from UI/API/filter/summary after following migration. | All legacy states mapped, no fake songs, child activity remains independent. |
| DEL-15 | Durable query-keyed cache writes/search portrait writes | Delete ordinary search persistence; bounded memory cache. | DB mutation-count tests; saved enrichment/follow-up cache consumers retained. |
| DEL-16 | Editable aggregate PTO plus redundant per-view calculations | Replace with per-date canonical calculation and explicit read-only legacy allocation mode. | Legacy custom totals preserved; forecasts/cards/previews agree; no duplicate source of truth. |
| DEL-17 | Finance-only validators in `packages/browser/src/validators.ts` | Move domain rules to Finance; shrink shared export surface. | Public/browser package no longer knows asset/job/holding collection rules; neutral helpers remain shared. |
| DEL-18 | Repeated appended app CSS/unused field/button/navigation variants | Adopt token/primitive/component cascade and delete superseded rules. | Changed route/state screenshots and contrast/overflow tests pass; no hidden media-query regressions. |
| DEL-19 | Tiny wrapper/export modules with one consumer | Inline only where it removes indirection and keeps readable ownership. | Reference search and test; do not trade four readable lines for a new compatibility abstraction. |
| DEL-20 | Obsolete docs, old plan claims, unsupported install/run commands | Canonical README/architecture/development/behavior/quality docs; small links to historical context if useful. | All doc paths and actual commands work; no competing “supported” topology. |

## Keep, or migrate before deleting

- [x] `apps/server/alembic` and already-applied historical revision files: keep revision history and identifiers. Remove unused execution entrypoints only after upgrade/adoption consumers migrate.
- [x] `apps/server/migrate.py`, `migrations.py`, `schema.py`: active adoption/upgrade/readiness behavior. Consolidate overlapping code only after equivalent seeded-adoption tests.
- [x] `scripts/backup-site.py`, monitoring/deploy/restore paths: active in image/compose/migrations. Do not delete because they reference legacy schema.
- [x] `scripts/serve-spa.mjs` and `scripts/test-site-browser.mjs`: active test infrastructure today. Replace consumers before removing; preserve production-like missing-asset/base-path/cache checks.
- [x] `packages/browser/runtime` pure date/week modules remain shared; obsolete shared-browser packaging mirrors were symlinks and are now removed. Their removal is not counted as source LOC reduction.
- [x] `packages/auth`: keep small shared pure identity primitives with actual consumers; do not absorb into a generic platform mega-package for aesthetic consistency.
- [x] Finance encryption, staging, revision conflicts, source/evidence semantics and browser restore: preserve behavior and tests through relocation.
- [x] Small explicit old-URL redirects: usually cheaper than breaking useful bookmarks. Retain only documented reachable mappings; remove whole obsolete runtime behind them.
- [x] Source-specific provider identity/rating scales and release precision: preserve differences; do not flatten them to shorten serializers.
- [x] Coverage floors and meaningful regression suites: migrate paths/test runners with parity; deleting tests is not codebase simplification.

## Evidence required from each owner

```text
Deletion ID(s):
Before path and consumer(s):
Replacement path/behavior or reason no longer needed:
Reference search performed:
Source lines removed / added / moved (separate):
Runtime dependencies/build mechanisms removed:
Tests and command remapping:
Remaining compatibility/data migration concerns:
Independent reviewer:
```

Do not add speculative wrapper infrastructure merely to avoid editing known consumers. Fix the consumers directly in the same branch, prove behavior, then remove the old part.
