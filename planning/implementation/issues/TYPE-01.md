# TYPE-01 — Replace unsafe boundary casts with small owned decoders

- Stable key: `TYPE-01`
- GitHub leaf: [#218](https://github.com/Vivekpsps3/vivek-monorepo/issues/218)
- Parents: [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200), [#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `SAFE-05`
- Conflict groups: `hub-load`, `pixels-data`, `typed-read-contracts`, `quality-baselines`
- Verification profiles: `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Malformed or future payloads become explicit unavailable/unsupported states instead of causing unexplained UI crashes.

Validate the actual Hub/Pixels cross-domain read payloads and remove duplicated ad hoc cast/error guards, without generating a universal API client.

## Requirements

- TD-12
- TD-35 first risk-ordered boundary tranche
- TD-26 preserve explicit dates/money/null semantics
- #200 runtime boundary and declaration parity
- #199 meaningful negative contract tests

## Source paths

- `apps/web/src/app/hub/hub-load.ts`
- `apps/web/src/app/hub/hub.component.ts`
- `apps/web/src/app/pixels/pixels-data.service.ts`
- `apps/web/src/app/pixels/pixels-model.ts`
- `apps/media/frontend/src/media.models.ts`
- `apps/travel/frontend/src/travel.models.ts`
- `quality/eslint-finance-baseline.txt`

## Target paths

- `apps/web/src/app/hub/hub-load.ts`
- `apps/web/src/app/hub/`
- `apps/web/src/app/pixels/pixels-data.service.ts`
- `apps/web/src/app/pixels/pixels-model.ts`
- `quality/eslint-finance-baseline.txt`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Inventory the required read-model fields actually consumed by Hub and Pixels, identifying nullable/missing/future-version shapes and which source is responsible for decoding. Keep HTTP envelope types separate from feature view models.
3. Add small app-owned decoders from unknown to the existing typed shape at boundary entry. Share only structurally identical primitives; preserve money/date/ID/owner and absent/locked/expired/partial semantics.
4. Replace unchecked response.json as T assertions and repeated unsafe local casts/guards in migrated consumers. Keep a cheap generic transport helper but require a real decoder where untrusted shape matters.
5. Reduce touched any findings and their baseline entries when they actually shrink; add malformed/unknown-version tests and declaration-implementation fixtures for any touched MJS helper. Stop after this real boundary tranche; record remaining typing debt rather than mass converting all files.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | A required source field has a wrong type or missing nested structure | Hub/Pixels reads it | the source fails predictably without crashing unrelated panels or fabricating zeros | malformed response decoder and rendered-state tests |
| LOCAL2 | A valid payload includes null/unknown/locked fields | it is decoded | those distinctions survive without incorrect numeric/date conversion | valid/null/unknown fixture matrix |
| LOCAL3 | An actual boundary consumer is migrated | code is searched/typechecked | unchecked casts and duplicated guards for that payload are removed | consumer diff and type/lint baseline evidence |
| LOCAL4 | A late invalidated response arrives | decoder/consumer completes | SAFE lifecycle ownership still drops it rather than publishing newly validated stale data | held-response lock/session tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Unchecked generic JSON casts and repeated ad hoc shape guards for the chosen payloads | Use one owned decoder per real boundary and remove redundant consumer casts | required | negative shape tests and migrated caller search |

## Non-goals

- No generated universal client
- No global noUncheckedIndexedAccess or strictness migration
- No mass MJS rewrite
- No conflating monetary totals or calendar conventions

## Test scenarios

- malformed response, null/unknown values and future schema
- one source unavailable while others render
- stale/owner-invalidated response after decoder completion

## Risks

- Types alone do not validate runtime data. Decoder additions are justified safety code; keep the shape minimal and remove superseded guards/casts rather than multiplying schemas.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.
