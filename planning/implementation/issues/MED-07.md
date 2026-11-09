# MED-07 — Delete repeated provider orchestration by consolidating real Media transport/adapters

- Stable key: `MED-07`
- GitHub leaf: [#241](https://github.com/Vivekpsps3/vivek-monorepo/issues/241)
- Parents: [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200), [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286). Use its branch if the amendment is not yet on main.
- Dependencies: `MED-01`
- Conflict groups: `media-provider-transport`, `media-provider-family`, `media-records`
- Verification profiles: `media_back`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A provider change has one owned parser/identity adapter and one shared policy for genuinely identical transport behavior.

A provider change has one owned parser/identity adapter and one shared policy for genuinely identical transport behavior.

## Requirements

- #200 TD-17 and A10/F-13; preserve all #85 provider request-count/safe-origin/identity acceptance.

## Source paths

- `apps/media/backend/services/providers.py`
- `apps/media/backend/services/portraits.py`
- `apps/media/backend/tests/`
- `docs/MEDIA.md`

## Target paths

- `apps/media/backend/services/providers.py`
- `apps/media/backend/services/`
- `apps/media/backend/tests/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Inventory current TMDB movie/TV detail callers and the repeated authenticated fetch/404/JSON/projection policy. Existing Pace, MB_PACE, mb_get, _invoke and cache helpers already have owners; do not rebuild them.
3. Consolidate the equivalent authenticated portions of tmdb_movie_detail and tmdb_tv_detail using one small plain helper in the current service. Keep movie public-HTML fallback, TV-specific lifecycle/network fields, source IDs, errors and provenance semantics in their domain adapters.
4. Migrate all current public callers through thin stable entry points, then delete old repeated branches and unused helper exports in the same PR. A file split without deletion of independent implementations is insufficient.
5. Keep explicit search/refresh separate from DB-only saved reads; preserve total budgets, provider-auth versus session401, artwork origins, ordering and partial-source recovery.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PROV1 | two or more provider families currently duplicating transport policy | exercise equivalent timeout/cache/outage cases through real adapters | one shared implementation is actually called and source-specific identity/parsing results remain unchanged | offline provider fixtures, call spies and before/after ownership map |
| PROV2 | all supported provider fixtures and mixed partial failure | run search/detail/portrait actions with bounded fake transport | same normalized identities/order/provenance; no cross-provider side effects and no saved-read requests | Media API/provider regressions and request budget vectors |
| PROV3 | old branch/export candidates | migrate callers then inspect/run suites | old independent transport paths are absent and no consumer still calls them | consumer search, measured production LOC/branch ledger and complete affected tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| repeated provider transport/deadline/cache/error paths inside providers.py and portraits helpers | replace only equivalent cases with one small shared policy and delete former implementations after adoption | required | at least two real adapters use survivor; named old paths removed |
| provider-specific wrappers/exports with no supported consumer | remove verified dead wrappers while retaining public compatibility needed by actual routes/tests | required | consumer inventory and build/API tests |

## Non-goals

- No universal provider base class, plugin loader or new HTTP framework.
- No title-only identity merge or generic payload dictionaries hiding provider rules.

## Test scenarios

- offline fixtures eachprovider;partialoutage;timeoutquota;cache;safeURL;provenance;ranking;identity;no saved IO

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.

## Dependency rationale

Wait for database-only saved reads so transport cleanup cannot reintroduce repair-on-read. TYPE-01 is a TypeScript boundary task and supplies no required Python API.

## Concrete deletion plan

Baseline providers.py is 2,249 lines, but that is not a deletion estimate. tmdb_movie_detail (33 lines) and tmdb_tv_detail (33 lines) repeat authenticated HTTP fetch, 404/status/JSON validation, source-id, overview, genres and provenance projection. Consolidate the equivalent portion for these two actual consumers; delete their repeated implementation blocks in the same PR.

Keep movie public-HTML fallback and TV network/lifecycle/episode metadata separate. Reuse current HTTP client, DETAIL_TIMEOUT, _invoke deadlines, Pace/MB_PACE/mb_get and cache owners. Do not add a provider registry, transport class hierarchy, per-provider package scaffolding or broad mechanical file split.

Prove valid/movie-fallback/TV-no-key/404/429/5xx/malformed payload behavior and exact upstream request counts with offline fixtures. Keep supplied-client ownership and database release-before-I/O semantics. Record net production delta including the helper; fewer independent equivalent policy blocks is required. Large provider-specific parsers are retained behavior, not assumed waste.
