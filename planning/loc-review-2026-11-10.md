# Code growth and roadmap review — 2026-11-10

This is dated evidence. Select work through the ordered
[execution queue](implementation/README.md); the recommendations below do not
create a second task order.

Reviewed main `8c37ce2`, 16 merged PRs from #278 through #295 (numbers are not
continuous), their diffs and evidence, current GitHub leaves/#134, and the local
planning workflow. No open PRs at inspection. This is a focused maintenance review,
not a new feature backlog or an independent rerun of historical product suites.

## What actually grew

Physical added/deleted lines from each merge's first parent, with rename detection:

| Category | Added | Deleted | Net |
| --- | ---: | ---: | ---: |
| Production | 1,480 | 761 | +719 |
| Tests | 3,974 | 169 | +3,805 |
| Planning, including evidence | 20,271 | 6,762 | +13,509 |
| Other Markdown | 392 | 36 | +356 |
| Tools/config | 196 | 11 | +185 |

Classify `planning/` first; other Markdown separately; test/spec/e2e/fixture paths
as tests; remaining `apps/`/`packages/` as production; everything else as tooling.
This sample has no lockfile changes. Build output is not included. These are
physical lines, including comments/blanks, not a semantic complexity score.
Reproduce with `git diff --numstat --find-renames MERGE_SHA^ MERGE_SHA` for the
sixteen first-parent commits since `495d698`, assigning paths as above.

#278 introduced 18,140 planning lines. #286 removed 5,631 planning lines, but that
was planning deduplication, not application reduction. **After #286**, the ten
implementation PRs still net **+521 production**, +2,588 test and +674 planning
lines. The concern therefore survives excluding initial planning overhead.

| PR | Production net | Assessment |
| --- | ---: | --- |
| [#279](https://github.com/Vivekpsps3/vivek-monorepo/pull/279) | +16 | Correct lock-listener fan-out replaces a broken single slot. |
| [#280](https://github.com/Vivekpsps3/vivek-monorepo/pull/280) | +6 | Repairs Profile direct loads. |
| [#282](https://github.com/Vivekpsps3/vivek-monorepo/pull/282) | +176 | Separates saved reads from external repair while retaining identity safety. |
| [#287](https://github.com/Vivekpsps3/vivek-monorepo/pull/287) | −94 | Actual dead pass-through/comment removal; some savings are narrative. |
| [#288](https://github.com/Vivekpsps3/vivek-monorepo/pull/288) | +6 | Repairs landmarks and arrival focus. |
| [#289](https://github.com/Vivekpsps3/vivek-monorepo/pull/289) | −52 | Two editors adopt one invalid-field owner. |
| [#290](https://github.com/Vivekpsps3/vivek-monorepo/pull/290) | +152 | Owner/generation/deadline checks prevent late Health publication. |
| [#291](https://github.com/Vivekpsps3/vivek-monorepo/pull/291) | +5 | TMDB policy owners fall from two to one; physical LOC does not fall. |
| [#292](https://github.com/Vivekpsps3/vivek-monorepo/pull/292) | −41 | Deletes an unused World controller wrapper and redundant formulas. |
| [#294](https://github.com/Vivekpsps3/vivek-monorepo/pull/294) | +209 | Narrows Health's vault access and gates results; the adapter is new code. |
| [#295](https://github.com/Vivekpsps3/vivek-monorepo/pull/295) | +336 | Adds editor behavior and legacy-pay normalization while deleting old controls. |

#278/#283/#286 change planning/guidance, #281 adds discovery tooling, and #293
activates browser tests; they add no production lines under this classification.
The three negative production changes total −187; the positive changes total
+906. Cleanup exists, but new behavior/protection outweighs it. #295 alone adds
more production than those three cleanups remove.

## Critique

1. **The plan mixes three outcomes:** repairs, new features and simplification.
   Feature-preserving simplification can reduce LOC; adding selected behavior and
   missing safety guarantees often cannot. #294's narrower API has value, but its
   +209 lines are not a LOC reduction. #295 is feature/compatibility delivery,
   despite its simplification language. Describe those tradeoffs before implementation.
2. **Tiny extractions cannot fund large growth.** #291 removes one duplicated
   policy but adds five physical lines and 288 test lines. Its evidence's reported
   “executable statements” is not an AST statement count: `ast.stmt` counts are
   1,347 → 1,344. Neither metric changes the +5 physical result. Keep the useful
   policy consolidation, but do not report it as meeting a physical deletion target.
3. **Status is copied into too many places.** The local ready table still offered
   SAFE-02, DEL-03, DEL-05, FIN-02 and MED-07 after merge. #134 even said DEL-03
   waited on SAFE-04/05 after #286 removed those dependencies. Coordination called
   #193 “current main.” The 79 packets present at the first review were useful
   scope; repeated indexes/status and copied evidence/handoff tables are avoidable
   maintenance.
4. **Some dependencies encode sequencing preferences rather than consumed APIs.**
   DEL-04's collection-publication cleanup uses existing epochs, not SAFE-04's
   Hub/Pixels/World message parser. Remove that edge; keep actual overlap coordinated.
   REF-01's final encrypted extension proof can wait for its contracts, but recording
   a baseline or improving navigation must not wait for that seven-dependency leaf.

## Focused reductions to pursue

- **MED-08:** `_public_catalog` repeats `_catalog_by_source`'s query. Replace it
  with the existing owner and retain kind rejection. That is a small verified
  candidate, not permission to delete the 2,356-line module. Additional serializers
  need equivalence proof; membership SQL supports an applied migration and stays.
- **DEL-04:** the job/fixed-expense/subscription getters and remote refresh repeat
  read/eligibility/publication. Consolidate that complete policy inside FinanceService
  and remove the old branches. Keep transaction/dashboard views, per-collection
  epochs and import/market owners distinct. No generic repository or new store.
- **SAFE-04:** migrate Hub/Pixels/World to one notification parser/cleanup owner,
  deleting real copies in the same change. Keep feature publication checks where
  their domain state is actually published. Sharing transport is not proof all
  downstream stale-result checks are redundant.
- **Planning now:** use the existing planner for live open-leaf/parent navigation;
  remove copied status/parent/TD tables and use one evidence record for handoff.
  Keep acceptance rows and local gates. No scaffold generator or new planning service.

Savings beyond the first catalog query are unmeasured until implementation. Do not
promise thousands of lines from file size, delete supported compatibility formats,
compress formatting, or remove regression assertions to satisfy a quota. The new
pay-schedule adapter also overlaps old annualization code; any future consolidation
must first prove cents rounding, promotions and legacy/hourly semantics equivalent.

The research supports these bounded choices: Google's
[review guidance](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
asks reviewers to reject unnecessary generality and maintain test quality;
[small changes](https://google.github.io/eng-practices/review/developer/small-cls.html)
should be self-contained and include real API usage. Fowler's
[YAGNI](https://martinfowler.com/bliki/Yagni.html) explains the carrying cost of
speculative capabilities while preserving refactoring and tests that enable change.
Applying that here is a repository judgment: reuse a current owner, migrate callers,
and measure the entire replacement. It does not imply an arbitrary deletion quota.

Validation for this review belongs in the change's completion report. Historical
PR evidence is source material, not a claim those product suites ran again here.

## Whole-monorepo pass

I then reviewed the repository from its owner map across `apps/`, `packages/`,
`scripts/`, current work packets, and the historical runtime-removal evidence. I
searched candidate symbols across source, tests, docs, route/config entry points,
and migration imports, and checked whether similarly named functions actually
share semantics. A text search is not a complete reachability proof for framework
discovery or external Python imports, so new deletion packets require a fresh
consumer map and affected behavior gates before removal.

### Media deletion findings

The following Media functions/files had no supported source caller in the current
tree; tests that patch some of them are indirect “must not call” checks, not
consumers. They are grouped in the new [MED-11 packet](implementation/issues/MED-11.md)
and [issue #296](https://github.com/Vivekpsps3/vivek-monorepo/issues/296), under
the existing #200/#85 ownership:

- `services/jsonstore.py` is 28 lines and has no import or caller. Its fallbacks
  differ from the live `records.dumps/loads`, so delete the orphan instead of
  merging those contracts.
- `textutil.clean_rating` and `clean_artwork` are unused. Keep the live
  `validate.rating_value/http_url`; their validation and error behavior is not a
  drop-in replacement for these unused `ValueError` helpers.
- `when.choose_release`, its `WHEN_RANK`, and `within_days` are unused. The
  release classifier/serializer and episode-state helpers remain live.
- `records.needs_collaborators` and `saved_source_keys` are unused. The latter
  only wrapped the live `saved_source_ids`. The route uses
  `episode_next.mark_next_checked`, not old `records.mark_next`; preserve its
  owner, expected-id and concurrency contract.
- The provider portrait chain (`musicbrainz_artist_image`,
  `wikidata_artist_images`, `cached_artist_portraits`,
  `attach_artist_portraits`) has no production caller. Keep
  `image_from_relations`, which has a separate live provider caller. Earlier
  MED-07 evidence retained the chain because tests forbid its use and the cache
  prefix is migration-preserved. That is a good reason to keep the negative
  behavior assertion and cache rows, but not to keep uncalled runtime code: move
  the test spy to the network boundary and leave `membership.py` and its applied
  migration behavior unchanged.
- `_safe_https` in `records.py` and `_https_artwork` in `providers.py` are exact
  duplicate policies with live callers. MED-11 may centralize them in the
  existing validation owner only if it preserves trimming, strict lowercase
  `https://`, the 1000-character cap and `None` on rejection. `http_url` is not
  equivalent because it accepts HTTP and raises a validation error.

The dead-code removal itself needs no replacement wrapper or generic helper
library. The only extraction candidate is one strict URL helper in the existing
validation module. MED-11 keeps historical migrations and the
`artist-portrait:` cache-retention contract; it follows the issue closed by
MED-07 rather than reopening completed scope.

### Travel model and duplicate policy

`apps/travel/frontend/src/calendar-model.mjs` is 69 lines and has only test
imports today. Its history matters: the 2026-10-27 approved runtime-removal
record explicitly preserved it as an app-owned pure model. The current absence of
production imports is not enough to reverse that decision. [TRIP-02](implementation/issues/TRIP-02.md)
now owns a fresh check against the itinerary/day-strip acceptance: move any still
required label behavior to its live owner, then delete only the unsupported
remainder and obsolete-only assertions. Keep shared week preferences and active
composer behavior.

Other repeated logic was not promoted to deletion:

- Identity `_origin` and `_request_origin` are exact copies; SEC-01 already owns
  their safe consolidation. Preserve origin/purpose binding and challenge tests.
- Three Travel `naive_wall` validators look alike but are field-scoped Pydantic
  validators. An extraction would add decorator indirection without proving
  fewer rules; keep them until a shared primitive deletes meaningful code.
- Travel `nights_away` and `span_days` both validate a range but represent
  different inclusive/exclusive day counts. Keep the domain distinction.
- The review found no safe asset deletion from names alone: Town/World sprites
  and icons can be chosen through runtime maps. Historical Alembic revisions and
  `membership.py` migration helpers remain protected.

### Structure, tooling and agent workflow

Large files are navigation costs, not standalone deletion targets. Media's
`records.py` and `providers.py`, Finance's transaction/planning views and Travel's
PTO/itinerary views contain live domain behavior already assigned to owner
packets. Splitting them without deleting a competing implementation adds
navigation and often raises LOC. The recent monorepo structure also already has
one root npm lockfile and shared browser/UI packages; no second task runner,
framework migration or global abstraction is justified by this scan.

Unused-symbol checks are partial: ESLint checks unused variables, but the repo has
no installed whole-program unused-export/dependency analyzer. Python dynamic
imports, Angular templates, migration imports and runtime-selected assets need
owner-aware review. I did not add a heavyweight analyzer for this bounded set of
findings. TODOs in Health still point to open #257, not stale work.

The local agent path is now short: root `AGENTS.md` routes work to the app owner;
`planning/implementation/README.md` gives the live queue/launch commands;
`queue.json` holds scheduling metadata; one issue packet owns requirements and
deletion; the evidence file owns results. The planner now hides closed leaves in
live mode and resolves parent readiness from GitHub. MED-11 is the 80th queue
packet. Keep this one authority chain and link evidence instead of copying its
tables into another status page.

No application code was changed in this exploration. The new and amended packets
are scope proposals only; their implementation requires the normal owner checks
and gates. No tests were run for this second phase.

## Test readability follow-up

A static filename inventory found 380 files matching `test_*.py`, `*.spec.*` or
`*.test.*` under apps/packages/scripts. This is not a discovery or execution count.
The Python scan found 45 pytest parametrize decorators, seven using the `ids`
keyword; meaningful IDs also come indirectly through `pytest.param` tables.
Missing explicit IDs are not inherently wrong: scalar inputs often produce
readable IDs already.

Parametrization is **not consistently readable across suites**. Tree-wide pattern
searches and selected implementation reads support these dispositions; they do
not certify every assertion in all 380 files.

| Example | Assessment | Scoped improvement |
| --- | --- | --- |
| `packages/ui/pixels/pixels-score.spec.ts` day-score cases | Good labels generate separate tests with literal expected scores and assertion context | Keep this style; use named objects if tuple width grows |
| `apps/server/tests/test_path_ids.py` | Good route/method/field/value IDs and real route discovery | Keep discovery; review collection-time app construction and route-specific request branching before adding more complexity |
| `apps/media/backend/tests/test_episode_next.py` foreign-owner matrix | Useful product of kind and expected-id shapes proves ownership precedes command validation | Retain independent pytest cases; add semantic IDs if default values become ambiguous |
| `apps/travel/backend/tests/test_pto_buckets.py` boundary tables | Uniform assertions and setup; `_PASS`/`_FAIL` names explain little about boundary intent | Name complex cases by minimum/maximum/one-step-outside behavior |
| `apps/web/src/app/town/town.api.spec.ts` | Seven operations share one test and five-position tuple rows | Generate named `it` cases with named fields and visible HTTP assertions |
| `apps/finance/frontend/src/app/utils/job-compensation.util.spec.ts` frequency loop | Uniform rule, but no per-frequency test identity and a calculated expected value | Use named frequency cases with literal expected annual pay; preserve explicit zero-hour behavior |
| `apps/media/backend/static/tests/next-episode.test.mjs` | Small uniform loops are readable but lack status/detail failure labels | Add assertion context or independent named tests where row diagnosis matters |
| `apps/finance/frontend/e2e/fin-02-recurring-editors.spec.ts` | Theme/viewport loops run inside one test against the same changing vault | Generate isolated matrix tests with fresh vault fixtures and preserve save/reopen coverage |
| `apps/finance/frontend/e2e/empty-states.spec.ts` | Named viewport/theme groups and route assertion context; routes share one journey | Keep context; consider individual route tests where independent reporting/reset justifies extra setup |

Other maintenance candidates include fixed microtask budgets in vault tests,
timed polling in Travel map fixtures and Finance setup imported from other test
modules. These are readability/maintenance risks, not demonstrated runtime bugs.
Use observable synchronization and small domain fixture modules when changing
those tests. Keep independent expected outcomes and safety assertions.

The maintained standard is now in `docs/QUALITY.md` under test readability and
parametrization. Apply it across languages incrementally with preserved coverage
and discovery. A mechanical rewrite or new test DSL would add review cost.

## Delivery verification

After explicit user approval to run checks and merge, `make test-fast` passed:
80 packets, eleven negative planning fixtures, live-listing fixtures, 44 Python
script tests, 15 Node tests, boundary checks and browser discovery. Discovery
does not claim browser journey execution. `make lint-python` and
`make typecheck-python` passed their existing ratchets; direct Ruff check/format
also passed for `planning/implementation/plan.py`, outside those targets' paths.

The first fast run exposed a self-test assumption that the highest-priority task
had a dependent. The fixture now selects an actual dependency edge independently
of priority, verifies pending versus satisfied prerequisites, and checks listing
order. The rerun passed. Application source and product behavior are unchanged;
product browser and coverage suites were not required by this planning/tool diff.
