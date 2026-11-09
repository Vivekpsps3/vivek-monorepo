# DEL-01 — Delete verified dead code and stale implementation claims

- Stable key: `DEL-01`
- GitHub leaf: [#213](https://github.com/Vivekpsps3/vivek-monorepo/issues/213)
- Parents: [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `shared-public-api`, `stale-source-cleanup`, `quality-docs`
- Verification profiles: `shared_front`, `docs`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

An agent following current source no longer implements old branch choreography or chooses a dead extension path.

Perform a bounded first deletion pass across obsolete helper/export/comment paths, preserving real compatibility and domain rules.

## Requirements

- TD-29
- TD-30 source-comment cleanup subset
- #200 removal ledger and no competing live path

## Source paths

- `apps/travel/frontend/src/trip-costs.component.ts`
- `apps/web/src/app/search/search-dialog.component.ts`
- `apps/web/src/app/town/health/health.constants.ts`
- `packages/ui/src/public-api.ts`
- `docs/LIFECYCLE.md`
- `planning/technical-debt/2026-11-09-assessment.md`

## Target paths

- `apps/travel/frontend/src/trip-costs.component.ts`
- `apps/web/src/app/search/search-dialog.component.ts`
- `packages/ui/src/`
- `docs/ADDING_A_BANK_IMPORT.md`
- `docs/QUALITY.md`
- `planning/implementation/`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Build a candidate ledger with source/config/lazy/test/documented compatibility consumers. Exclude World controller cleanup owned DEL-03 and live legacy format retirement owned DEL-02.
3. Remove elapsed unmerged/dependency/design-queue claims once compared with fresh main and the owning live issue. Replace only necessary current invariants or precise issue references; do not delete TODOs to pretend unfinished behavior is done.
4. Delete genuinely unreferenced pass-through helpers/exports/styles only when dynamic/config/test and public compatibility consumers are disproven; migrate actual call sites to an existing authoritative helper where identical.
5. Correct bank-import onboarding and volatile quality summaries to current contract/baseline references. Retain mathematical, crypto/AAD, transaction, migration and owner rationale. Produce an actual net-production deletion summary, not only moved lines.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | A removal candidate has zero actual supported consumers | it is removed | all builds/graph checks and surviving behavior tests pass | candidate consumer search plus applicable build/tests |
| LOCAL2 | A comment says K1 is unmerged or Finance streams are absent | current source and roadmap are compared | obsolete claim is gone and unfinished behavior remains honestly owned | source diff and live owning issue link |
| LOCAL3 | A wrapper performs a necessary unit conversion or compatibility reexport | candidate review occurs | it is retained or replaced only with equivalent boundary behavior | retained-candidate ledger with proof |
| LOCAL4 | The deletion PR closes | production/test/doc deltas are reported | it contains verified redundant path removal; file splitting or test deletion is not counted as implementation simplification | git diff --numstat and semantic deletion ledger |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Stale unmerged/absent-stream/design-blocker implementation commentary | Delete elapsed historical narration and keep a current invariant/owner where needed | required | fresh-main/source comparison |
| Verified unconsumed pass-through helpers, exports or duplicate styles outside dedicated packets | Delete only after all static/lazy/config/test/public consumers are checked | conditional | zero-consumer evidence and preserved behavior gates |

## Non-goals

- No feature removal
- No deleting historical Alembic revisions
- No weakening tests or deleting true safety comments
- No World-specific setup change owned DEL-03
- No changing trip/search behavior owned product packets

## Test scenarios

- consumer graph including lazy/public/test entry points
- no changed Finance/Travel/Media calculations
- current importer/refund and quality prose matches authoritative source

## Risks

- A short wrapper may be an important unit/ownership adapter. If no code candidate meets evidence, do not manufacture deletions; keep the issue open or propose the precise scope adjustment rather than claiming comment count proves full simplification.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.

## Concrete deletion plan

At main 63bc975, trip-costs.component.ts still says FinanceTripSpendRegistry/K1 is unmerged, while packages/ui/src/public-api.ts exports the registry. search-dialog.component.ts says Finance name streams do not exist, while FinanceService publishes them. Replace those two obsolete narratives with the current unresolved integration and its owning issue; do not pretend the spending/search features are complete.

Search actual imports, lazy routes, providers, templates and test/config entry points before deleting any runtime symbol. Do not sweep all public reexports. The five-line packages/ui/src/pixels/pixels-score.spec.ts import activates the owned scoring suite in Karma and must remain until discovery changes with executed parity proof. WorldControllerService belongs exclusively to DEL-03.

Report comment cleanup separately from executable deletion. If no runtime candidate survives the consumer check, retain the open deletion requirement or propose its precise disposition. Do not create a helper merely to report a changed production file.
