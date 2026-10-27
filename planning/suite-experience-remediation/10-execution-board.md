# Single-PR execution board

The owner selected one agent on 2026-10-26. Keep the task/dependency and gate requirements; parallel lanes and independent agent review are superseded for this run. Automated verification is recorded separately, and no independent agent review is claimed.

Live status is [STATUS.md](STATUS.md). A task is done only when that file says `done` and names the command the verifier re-ran. The checkboxes below are a mirror, updated only with that evidence. All product tasks start unchecked. The plan itself is complete when linked documents and evidence are verified; that does not mean the refactor has been implemented. Use one integration branch and one final PR. The original parallel ownership guide below remains planning context; this run uses one agent.

## Work-item status and handoff

Use `unclaimed → investigating → contract-ready → implementing → local-green → integrated → verified`. A task is Done only after acceptance evidence and integration, not when code is written. Record blocker, next action and owner when pending. The original plan called for independent paired review; the owner’s later single-agent instruction supersedes that execution choice. Automated acceptance is evidence, not independent review.

Every implementation handoff includes task/issue/requirement IDs, changed files, deletions, contract or migration change, tests actually run, result/log paths, screenshots if relevant, known limits, next dependent task, and reviewer. Existing user-owned changes must remain intact.

## Master checklist

The final vetting checkpoint records **34 of 34 rows done**. All 177 browser cases and the complete local gates pass; exact results and remaining dependencies are in [final verification](evidence/final-verification.md). DEL-ALL, UX-02 and QA-01 are done after the approved retirement and passing final checks. PR-01 is done: [PR #22](https://github.com/Vivekpsps3/vivek-monorepo/pull/22) is open after all local gates passed. The original unchecked wave lists below are replaced by the current disposition table; no independent-agent review is claimed.

| Done | Task | Owner lane | Dependencies | Concrete deliverable / acceptance |
| --- | --- | --- | --- | --- |
| [x] | QA-00 | Integration/QA | None | Repro fixtures, baseline test-discovery map, route/state captures and metrics; no production-data writes. |
| [x] | ARC-01 | Architecture + reviewer | QA-00 | Root Angular/real-map/CSP/SEO/vault spike in [architecture](14-top-down-refactor.md); decision recorded from evidence. |
| [x] | ARC-02 | Backend platform | QA-00 | Explicit root app factory, shared identity/session/DB dependencies; migrated harnesses and removed reflection/fallbacks. |
| [x] | ARC-03 | Toolchain/composition | ARC-01 | One workspace/lock/build/router bootstrap and tested feature import boundary. |
| [x] | API-01 | Backend platform + domains | ARC-02 | Session/error/provider contracts, request deadlines, provider IO outside DB writes, upstream auth separated. |
| [x] | UX-01 | Design/shell | QA-00, ARC-01 | Shared product/visual/interaction contract and first representative screens, contrast/fallback specs. |
| [x] | NAV-01 | Design/shell | ARC-03, UX-01 | One persistent shell with Hub, local nav, account/theme and dirty-route policy. |
| [x] | NAV-02 | Finance integration | NAV-01 | Finance navigation migrated; old Hub/tab/menu duplication removed; deep links and guards pass. |
| [x] | HUB-01 | Web composition | NAV-01, API-01 | Suite-owned Hub/account with independent summary recovery and lazy Finance facade. |
| [x] | WEB-01 | Public/toolchain | ARC-03, UX-01 | Public feature integrated with static HTML/SEO and coherent Workspace entry; local ECDH preserved. |
| [x] | DB-01 | Migration + Travel | ARC-02, API-01 | PTO allocation schema/backfill/legacy contract and migration evidence. |
| [x] | DB-02 | Migration + Media | ARC-02, API-01 | Music membership/art/follow/lifecycle schema and lossless mapping/conflict report. |
| [x] | TRV-01 | Travel UI | NAV-01, API-01 | Minimum trip + named segments + one title + accessible split + preserved drafts; old composer path removed. |
| [x] | TRV-02 | Travel domain/UI | DB-01, TRV-01 | Per-date PTO, weekend defaults, all forecast views and overlap/date-edit rules. |
| [x] | TRV-03 | Travel provider/UI | API-01, TRV-01 | Automatic schedule, disambiguation, clean manual override and robust provider states. |
| [x] | TRV-04 | Travel map/UI | ARC-01, API-01, TRV-01 | Production-policy-compatible map, explicit location choice, visible errors/retry and compliant geocoder pacing. |
| [x] | TRV-05 | Travel UI | TRV-01 | Quiet trip itinerary/add flow and obvious forms; redundant builders/empty sections removed. |
| [x] | MED-01 | Media domain | DB-02, API-01 | Explicit personal child membership and ID relationships; ordinary reads DB-only; eager hydration deleted. |
| [x] | MED-02 | Media UI | MED-01, NAV-01 | Uniform saved-only library with collapsed saved-child expansion and separate discography. |
| [x] | MED-03 | Media art/UI | DB-02, SRC-01, MED-02 | Search/select/reset personal artist portrait, attribution and effective-artwork fallback. |
| [x] | MED-04 | Media domain/UI | MED-01, DB-02 | Following-only artists across API/UI/filters/Now/Hub; no invented listens. |
| [x] | SRC-01 | Media providers | API-01 | Concrete source authority/detail/pacing contracts for every supported media kind. |
| [x] | SRC-02 | Media search/UI | SRC-01, NAV-01 | The Gentlemen fixtures, relevance-before-cap, identity-safe dedup, pagination and full search state UX. |
| [x] | SRC-03 | Media cache | SRC-01, DB-02 | Ephemeral bounded search cache and durable saved metadata; search-only persistence removed. |
| [x] | ERR-01 | Platform + UI owners | API-01, NAV-01 | Consistent typed local/retry errors and honest partial provider coverage across screens. |
| [x] | TV-01 | Media progress | DB-02, MED-01 | Idempotent Mark caught up + safe undo, aired/specials/unknown-date rules, progress reconciliation. |
| [x] | TV-02 | Media providers/UI | TV-01, SRC-01 | Production lifecycle/freshness and new-episode resurfacing in detail/library/Now/calendar/Hub. |
| [x] | FIN-01 | Finance UI | NAV-02, UX-01 | Route/state refresh preserving financial invariants, import/vault behavior and useful dense data. |
| [x] | ARC-05 | Platform + domains | MED-01, SRC-03, TRV-02 | Hot-path query/IO/caching improvements and recorded performance evidence. |
| [x] | DEL-ALL | Integration + owners | Each replacement slice | [Deletion ledger](15-deletion-ledger.md) closed; no unowned temporary runtimes/compatibility frameworks. |
| [x] | UX-02 | Design + app owners | Domain screens, WEB-01, FIN-01 | Final fluid glass integration, responsive/a11y/cascade cleanup, screenshot review. |
| [x] | DOC-01 | Toolchain/docs | Final architecture | README/AGENTS/CI/Makefile/docs updated to one supported workflow; command-equivalence proof. |
| [x] | QA-01 | Independent QA | Every integrated slice | Exploratory discovery, final full gates, image/browser/migration validation and acceptance evidence. |
| [x] | PR-01 | Integrator | All tasks local-green + QA-01 | Open one coherent refactor PR only after local gates pass; attach source/deletion/perf/UX evidence. |

## Integration-wave disposition

| Wave | Current disposition |
| --- | --- |
| 0: Characterize and prove target | Done: route/test/source baseline, domain contracts and production-policy root proof recorded in the evidence folder. |
| 1: One spine | Done for the active runtime: root workspace/router/server composition, shared identity, locked-vault navigation and supported docs. Legacy unserved static files remain pending approval. |
| 2: Domain vertical slices | Done: Travel, Media, Finance and public stories pass integrated browser/coverage checks. New final-audit defects have regression proof in the issue register. |
| 3: Deletion and visual acceptance | Done: approved removal/model-test relocations, reference audit, final rendered routes/CSS, 177-case browser matrix and all affected gates pass. |
| 4: Release candidate and PR | Done: [PR #22](https://github.com/Vivekpsps3/vivek-monorepo/pull/22) contains the integrated implementation and evidence after all local checks passed. No merge or deployment performed. |

## Original parallel ownership guide (historical)

| Exclusive integration surface | Owner | Other-agent rule |
| --- | --- | --- |
| Root npm lock/workspace, Dockerfile, CI, Makefile, shared TS/lint config | Toolchain integrator | Submit manifest/config requirements; do not regenerate locks concurrently. |
| `apps/web` route manifest/platform/layout, shared UI tokens | Shell integrator | Features export routes/data; no parallel root route or token edits. |
| Server factory/auth/database/security headers | Backend platform owner | Domains propose explicit API/dependency changes; paired review for headers/session. |
| Unified Alembic chain/schema checks | Migration owner | Own all revisions and data reconciliation; agents provide isolated backfill logic and fixtures. |
| Current Media giant UI/provider/record modules | Media integrator | Extract task modules first or serialize edits; different features still share files today. |
| Finance vault/import computations | Finance owner | Shared shell changes use public facade; never rewrite crypto from another lane. |

Four-slot execution example: one integrator plus Travel, Media and platform/toolchain implementers; reviewer roles rotate at checkpoints. With more capacity, split independent provider/QA/public tasks only after shared-file dependencies are settled. More agents must not mean more competing architecture or lockfile writers.

## XP loop for every bug and slice

1. Write the smallest concrete acceptance example and a meaningful failing regression for a real bug.
2. Implement the minimum end-to-end behavior. Characterize existing critical invariants separately from defects.
3. Run relevant tests and review the actual screen/API result.
4. Refactor duplicate/obsolete mechanisms exposed by the slice; delete the replaced path.
5. Review correctness, simplicity and preservation; integrate while green. The owner selected one agent for this run, so independent review is not claimed.
6. Update this board, issue register, command map and discovery ledger before starting the next slice.

Do not fake pair programming by two agents independently generating overlapping code. The reviewer challenges design, coverage, deletion and observed behavior. Short internal increments satisfy XP feedback despite the owner's single-PR release constraint.
