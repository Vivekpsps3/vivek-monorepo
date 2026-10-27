# Suite experience remediation plan

Audit date: 2026-10-25. Source baseline: `f67ae44`. Status: implementation resumed on 2026-10-26. See [live status and handoff](STATUS.md) for current evidence and outstanding work.

This is the single execution plan for the owner's Hub, Finance, Travel, and Media feedback and subsequent top-down XP/YAGNI refactor request. It records every requested issue, additional source-grounded defects, a coherent public-site/workspace story, deletion and consolidation decisions, backend contracts, migration risks, parallel work boundaries, and acceptance checks. It does not claim that an audit can find every possible bug. New discoveries must enter the same register and receive an owner.

## Start here

Read [live status and handoff](STATUS.md), then the [top-down refactor and target architecture](14-top-down-refactor.md), then the [delete/combine/keep ledger](15-deletion-ledger.md), then the [single-PR swarm execution board](10-execution-board.md). These control the final direction. The detailed product plans below supply the acceptance stories within that refactor.

## Detailed subsections

1. [Requirements and traceability](01-requirements.md): every owner request mapped to work.
2. [Evidence and issue register](02-issue-register.md): confirmed gaps versus reproduction work.
3. [Design and interaction specification](03-design-system.md): modern flowing liquid-glass direction and screen rules.
4. [Hub, navigation, and Finance](04-hub-finance.md).
5. [Travel](05-travel.md).
6. [Media library, music, and portraits](06-media-library.md).
7. [Search, providers, and error visibility](07-search-providers.md).
8. [TV progress and production lifecycle](08-tv-progress.md).
9. [Backend contracts and migrations](09-architecture-migrations.md).
10. [Parallel execution board](10-execution-board.md): checklist, dependencies, file ownership, and agent handoffs.
11. [Verification and exploratory audit](11-verification.md).
12. [Research and decision log](12-research-decisions.md).
13. [Independent UI critique](13-independent-ui-review.md): detailed source review from the separate design reviewer.
14. [Top-down refactor](14-top-down-refactor.md): engineering-principle comparison, exact target tree/routes, spike, consolidation, one-PR release and scorecard.
15. [Deletion ledger](15-deletion-ledger.md): 20 concrete delete/combine candidates, active behavior to preserve, and proof required to remove each old path.

## Scope and operating rules

- Improve all private apps and the authenticated Hub; audit the public portfolio and shared sign-in for continuity. Keep each app's data and behavior in its own folder as required by [AGENTS.md](../../AGENTS.md).
- The active implementation composes Hub/account and public/domain features in `apps/web`, using one Angular router/build/lock. Travel/Media domain behavior remains app-owned. Their unserved static runtimes await the explicit removal approval recorded in the handoff.
- Production uses one service and one SQLite database with app-owned models. Historical standalone database documentation is not a reason to split production databases. Keep Finance's encrypted financial records browser-owned.
- Work iteratively: reproduce, agree the contract, implement a small vertical slice, test locally, review, then integrate. Do not start a simultaneous rewrite of the entire suite.
- Existing source-string assertions and screenshot color assertions may encode behavior the owner now rejects. Replace them with assertions for the agreed behavior, while preserving meaningful coverage. Never skip a suite, lower a gate, or mark failure as success.
- Shared files and the unified Alembic chain have one integration owner. Parallel agents may develop domain work after contracts are frozen, but must not independently edit the same shared migration or large UI module.
- Do not deploy, change real records, register paid providers, or open a PR as part of this planning task. Future implementation agents follow the board to deliver one refactor PR after local gates pass; internal integrations are small and tested, not separately merged feature PRs.

## Intended end state

A compact Hub button stays visible throughout every app. Travel starts with dates and destinations, then reveals transport and activities only when requested. Flights fill their schedule from a real provider and allow explicit manual overrides. Maps explain failures and remain useful with a textual place list. PTO is chosen per calendar date, with weekends excluded by default.

Media's library contains what the user saved. Artists use the same card or row treatment as other items, with a quiet expansion for saved music and a separate discography browsing flow. Artists are followed; songs and albums carry listening progress. Artist portraits can be searched, previewed, selected, and reset. Search makes source coverage and partial failures understandable, retains no permanent search history by default, and saves durable metadata when an item is added. TV shows distinguish personal progress, caught-up state, and ongoing/ended production status.

The visual redesign uses restrained glass for navigation and overlays, clear content surfaces, fluid spacing, calm motion, and excellent keyboard/mobile behavior. Attractive styling must accompany simpler flows and correct data semantics.

## Evidence limits

The original planning audit was source-only. The current working tree has since passed all 177 browser cases, the three Karma suites, all four Python coverage gates, Node/script checks, lint/types, assembled image checks and the real-image browser probe. Seeded adoption and upgrade preserve all 2,521 original rows in each mode. [Final verification](evidence/final-verification.md) records commands, results, regressions and limits; the [requirement map](evidence/requirement-acceptance.md) covers R01–R34. Screenshots were sampled, not exhaustively certified. Provider fixtures and synthetic map tiles do not prove live third-party uptime.

The [master board](10-execution-board.md) records all 34 tasks done with [PR #22](https://github.com/Vivekpsps3/vivek-monorepo/pull/22) open. The owner explicitly approved the 66-file removal: all proposed paths and two obsolete packaging mirrors are removed, useful models/tests are preserved, and the affected full gates passed. [Actual retirement](evidence/actual-runtime-removal.json), [69 browser-story dispositions](evidence/browser-test-migration.json), and [113 static assertion dispositions](evidence/static-test-migration.json) make the cleanup reviewable. The source report records 7,267 fewer lines than the declared pre-refactor snapshot. The integrated branch is committed and pushed; CI verifies the PR as the second run. No production deployment was performed.

## Completion criteria

- [x] Every requirement R01–R34 has its acceptance evidence attached, including the R22 subchecks.
- [x] Every P1 issue in the register is fixed; remaining issues have explicit disposition and owner.
- [x] Shared navigation, error behavior, themes, and responsive layouts meet the design specification.
- [x] Schema upgrades preserve existing PTO, music scores, reviews, episode marks, and user isolation.
- [x] All locally applicable regression gates pass before each PR opens.
- [x] Final integrated browser review covers empty, populated, loading, failure, locked, and mobile states.
- [x] Canonical behavior docs and this board reflect the shipped implementation.
- [x] One frontend/runtime/toolchain and one explicit backend composition path remain; replaced systems are deleted with evidence.
- [x] Net infrastructure/presentation code and dependency reduction, developer-loop metrics, and performance results are reported separately from code movement and required new features.
- [x] One final refactor PR contains the integrated implementation, migration/release plan and local validation evidence.
