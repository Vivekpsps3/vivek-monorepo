# Requirement acceptance map

The current evidence is [final verification](final-verification.md). The owner approved runtime retirement, which is now implemented. Final verification and the single PR are recorded in STATUS.md. Paths in this table are repository-relative acceptance suites.

| Requirement | Acceptance evidence / disposition |
| --- | --- |
| R01 | `tests/e2e/suite.spec.ts`: one persistent Hub at 320/1440 in both themes; domain navigation and screenshot matrices |
| R02 | Finance coherence/mobile/screenshot suites; five local hubs and one shared header |
| R03 | Travel native/blockers stories and composer-model regressions: named destination changes and retained splits |
| R04 | Travel native/blockers/optional forms: one Rename trip editor and separate destination labels |
| R05 | Travel flights/native and backend flight contracts: bounded automatic lookup with date/identity disambiguation |
| R06 | Travel flights and pure flight-model regressions: manual values survive lookup; Use schedule resets deliberately |
| R07 | Travel map-recovery/native: real Leaflet DOM, partial outage/retry, explicit place choices, origin-only tile Referer under CSP/TT |
| R08 | Travel trip-stories/undo and backend PTO allocation: per-date/half-day choices, reload, in-flight draft preservation and forecasts |
| R09 | Travel weekend story and PTO allocation tests: zero weekend defaults |
| R10 | Optional-form retries, Media manual add, Finance editor/failure and root modal/a11y/contrast/zoom stories |
| R11 | Travel native/blockers: quiet itinerary and Add transport, with explicit mode |
| R12 | Travel screenshots/native: date strip, quiet empty days and contextual activity editor |
| R13 | Media bundle/native: shared card primitive and library geometry at phone/desktop |
| R14 | Media membership migration/library tests and bundle expansion: public catalog availability never implies personal membership |
| R15 | Media discography contract/browser stories: separate explicit discovery; manual independent music saves |
| R16 | Media portrait backend/native/bundle/detail-races: search/select/reset/attribution, personal override and stale-response isolation |
| R17 | Search-cache, provider-contract and saved-read tests: bounded ephemeral search and durable authoritative saved metadata |
| R18 | Media bundle expansion: collapsed saved children, counts and URL-backed Back behavior |
| R19 | Artist-follow tests and Media native/bundle: Following is separate from song/album activity and original scores |
| R20 | Provider contracts, relevance/cache/metadata tests and source-status browser stories; no claim of live paid-provider smoke |
| R21 | Named Gentlemen movie/TV/all fixtures, relevance-before-cap and honest partial coverage, with browser query/type/pagination/retry |
| R22a | TV progress/backend and native catch-up: aired-only, explicit specials and compare-and-set Undo |
| R22b | TV refresh/resurfacing test: future episode airs after catch-up and returns to summary/activity |
| R22c | Lifecycle/freshness/completeness contracts remain separate from personal status in detail/library/Now/Hub/calendar |
| R22d | Finance/Travel/Media and root route/state/screenshot/a11y matrices; retained/replaced story reconciliation and final rendered checks |
| R22e | Shared tokens, restrained glass header/overlays, contrast checks and both-theme/mobile/zoom/fallback stories |
| R22f | Final audit discoveries are registered with reproduction/regression evidence in the issue register |
| R22g | Reviewable domain/task/evidence checklists retained; owner explicitly selected one agent instead of parallel/independent review |
| R23 | Root public/prerender/private transitions, real account group, lazy Hub and persistent suite navigation |
| R24 | Controlling architecture, deletion ledger, boundary tests and root composition/CSP/map/SEO/vault proof |
| R25 | One composition remains; approved old runtime removal and model/test migration are recorded in actual-runtime-removal.json |
| R26 | Root lock/install/bootstrap/router and injected backend identity/database; retired domain runtime files and packaging mirrors are removed |
| R27 | Relocation manifests and measured source/toolchain counts; final source totals show 7,267 fewer lines, separately accounting for moves/gross retirement |
| R28 | SQL paging/batched queries, bounded caches/provider deadlines and recorded query/payload/build metrics |
| R29 | Root setup/dev/build/test workflow, one E2E config/harness and actual six-user dev seed; docs/CI commands verified |
| R30 | Root ownership/feature ports and deleted Finance bootstraps/auth relocations implemented; approved runtime removal completed |
| R31 | Recorded regression-first transaction and portrait reproductions, vertical fixes and local gates; independent pairing superseded by owner's single-agent instruction |
| R32 | Original parallel-capable board remains reviewable; execution uses the owner's later single-agent choice and claims no independent agent review |
| R33 | One integration branch and one final PR; [PR #22](https://github.com/Vivekpsps3/vivek-monorepo/pull/22) is open after all passing local gates and the completed deletion ledger. Deployment is not performed |
| R34 | One linked requirement/issue/task/evidence folder, with current status and explicit remaining closure work |
