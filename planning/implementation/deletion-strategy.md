# Deletion-first implementation contract

Deletion and lower change cost are the owner's first priority. Existing behavior,
privacy, recovery and quality gates remain requirements. A feature or safety fix
may need new code; report it honestly. A simplification PR must remove its named
obsolete paths, not just add a more attractive route around them.

## Establish the removal before implementing

For a cleanup leaf, record its base SHA, exact symbols/branches/selectors, direct
and indirect consumers, surviving owner and counterexamples that must remain.
Use the concrete deletion section in DEL-01 through DEL-05, MED-07/MED-08,
CON-03, SAFE-05 and TYPE-01. Revalidate those measured starting points on current
main. A large file is a candidate footprint, never a forecast of deletable LOC.

Classify each candidate:

| Class | Completion |
| --- | --- |
| Verified orphan | Prove no supported import, provider, route, lazy/config, template, test-discovery or public compatibility consumer; delete its dependency closure. |
| Duplicate live policy | Identify equivalent behavior, migrate every chosen consumer to one owner, and delete the old complete implementation in the same PR. |
| Compatibility retirement | Prove supported data/client/startup states no longer require it, or obtain the explicit support-policy decision; preserve applied revisions and imported migration helpers. |
| Product removal | Describe lost user behavior and get an explicit product decision; a cleanup ticket does not authorize dropping an app, provider, format, history or recovery journey. |
| Stale comments/docs | Correct the current invariant and unfinished owner; report narrative reduction separately from executable deletion. |

Do not create replacement machinery for an orphan. Do not consolidate similar
fields that have different meanings. Protected counterexamples in this repo include
Media membership migration SQL, the Pixels Karma import adapter, catalog versus
personal-entry payloads, distinct Finance transaction views, and owner/revision/AAD
checks. A negative consumer search alone does not retire a supported protocol.

## Count the whole change

Use the merge base with current main, and count the entire replacement closure,
including new helpers, adapters, styles and all migrated apps. Record:

- production added/deleted/moved, with comments/blank-only churn identified;
- test and documentation changes separately; generated/bundled output excluded;
- before/after independent implementations, state/cache owners, public entry points,
  listener/timer cleanup paths and policy decisions the chosen workflow must edit;
- surviving callers, executed parity/race/interaction tests and retained compatibility;
- an explicit, narrow reason for any necessary safety/compatibility addition.

Useful commands from the repo root, with the actual comparison SHA substituted:

```sh
git diff --numstat --find-renames BASE_SHA -- apps packages scripts
git diff --stat --find-renames BASE_SHA
rg -n 'RetiredSymbol|retired-module' apps packages scripts
```

These are evidence inputs, not an automatic dead-code oracle. Inspect imports,
selectors and runtime/config/test discovery. Git can count a move as deletion and
addition; the ledger must classify it correctly. File count and LOC alone do not
measure policy duplication. Never minify, remove tests/rationale, weaken a gate or
change money/date/domain meaning to meet a quota.

## Completion gate

A simplification leaf requires fewer competing implementations/decisions and a
negative production LOC delta across its chosen closure. Any positive delta needs
a specific safety/compatibility exception and review; it is not automatically
accepted as simplification. A safety/feature leaf may grow while deleting an old
path; it must still report both sides. No unconsumed helper, second complete loader,
parallel cache/store or permanent temporary adapter can satisfy a deletion claim.

If baseline investigation disproves the alleged duplication, preserve that finding.
Prepare a precise packet amendment/disposition rather than invent an abstraction.
If a target needs multiple PRs, identify complete replacement leaves and requirement
ownership before proceeding. Do not call a partial extraction the whole cleanup.

## Keep future changes small

Prefer an existing plain function or domain owner. A new shared abstraction must
have two actual consumers, a bounded public surface, explicit disposal/error
ownership and old copies removed in the same PR. One domain-specific owner does
not require a package, interface hierarchy, plugin loader, generic repository,
form engine, event store or extra database.

For a representative follow-up feature, list production files and independent
policy owners that need changing. Reuse existing math, persistence, lifecycle,
routing and controls; identify every new decision that will need future maintenance.
REF-01 owns the disposable feature/removal proof. No plan can make arbitrary future
features free; success is fewer repeated decisions and a smaller required change.

## Scheduling and scope

Finish/verify active correctness PRs, then prioritize dependency-ready deletion:
DEL-03 removes the unused World wrapper; DEL-05 removes proven competing control
styles (coordinate FIN-02). DEL-04 follows the shared lifecycle contract. MED-07
and MED-08 follow MED-01 without waiting for unrelated TypeScript work.
DEL-02 remains conditional on support evidence, not a promised pile of deletions.

Dependencies require a specific merged API/outcome. Shared files alone are conflict
groups. Read live claims and actual PR diffs; group names are not a lock. The dated
review is evidence, not a prerequisite to every fix.

Each Markdown work packet owns detailed requirements/acceptance. queue.json keeps
only scheduling metadata. Do not copy packet prose back into it. The validator
checks structure, source paths, metadata parity and the DAG; semantic coverage and
behavior still require the packet's evidence and human review.
