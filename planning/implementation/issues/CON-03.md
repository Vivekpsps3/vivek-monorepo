# CON-03 — Check encrypted collection policy once and remove unowned membership copies

- Stable key: `CON-03`
- GitHub leaf: [#208](https://github.com/Vivekpsps3/vivek-monorepo/issues/208)
- Parents: [#197](https://github.com/Vivekpsps3/vivek-monorepo/issues/197), [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286). Use its branch if the amendment is not yet on main.
- Dependencies: `SAFE-03`
- Conflict groups: `vault-collection-policy`, `finance-persistence`, `health-store`, `server-vault`
- Verification profiles: `finance_back`, `server_back`, `finance_front`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A new private record type cannot be accidentally omitted from recovery or accidentally handled by the wrong domain.

Use a small explicit collection contract/parity check for backend accepted names and intentional client ownership subsets.

## Requirements

- TD-07
- TD-08 collection contract subset
- #197 owner/schema/export/reset compatibility
- #121 full allowed collection recovery membership

## Source paths

- `apps/finance/backend/services/encrypted_storage.py`
- `apps/finance/frontend/src/app/crypto/encrypted-store.persistence.ts`
- `apps/web/src/app/town/health/health-store.service.ts`
- `apps/finance/backend/tests/test_vault_health_collections.py`
- `apps/server/identity/admin.py`

## Target paths

- `apps/finance/backend/services/encrypted_storage.py`
- `apps/finance/frontend/src/app/crypto/encrypted-store.persistence.ts`
- `apps/web/src/app/town/health/health-store.service.ts`
- `apps/finance/backend/tests/`
- `scripts/`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Inventory all accepted collection names, current schemas, owner subsets and export/reset obligations; distinguish Finance bags from foreign Health collections. Do not infer equality where subsets intentionally differ.
3. Choose one small declarative policy table or cross-language parity test; avoid dynamic registration, runtime codegen or a configurable storage framework. Derive/check repeated names only where that removes a real second authority.
4. Add a synthetic test descriptor/fixture proving unknown collection rejection, supported owner membership and recovery enumeration coverage. Preserve future/foreign ciphertext explicitly; older clients must not delete unknown rows.
5. Migrate current client/backend consumers and delete obsolete duplicate membership constants where safe, documenting remaining intentional language-boundary copies with parity evidence.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | A collection name is accepted server-side but absent from the declared owner/recovery policy fixture | the contract check runs | the discrepancy fails before a new private feature ships | negative parity fixture |
| LOCAL2 | Health and Finance subsets differ intentionally | records are listed/reset/recovered | only the correct owner codec handles plaintext and all allowed records remain preserved | ownership subset and all-collection fixtures |
| LOCAL3 | An older client sees unknown/future ciphertext | it loads or saves other records | the unknown row is not deleted, decrypted or rewritten | compatibility fixture |
| LOCAL4 | A valid existing record uses current schema/AAD | policy consolidation lands | the same record remains readable and expected revisions behave unchanged | existing crypto/API tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Redundant collection name membership authorities with no separate semantic purpose | Consolidate or parity-check them and remove obsolete constants from migrated consumers | required | table of each previous list and its surviving intentional policy owner |

## Non-goals

- No new collection for this task
- No wire/AAD/key migration
- No dynamic arbitrary client collection acceptance
- No implementation of SEC export/restore UI

## Test scenarios

- known/unknown collection API requests
- intentional Finance/Health subset parity and future-version preservation
- synthetic record per accepted collection in recovery enumeration

## Risks

- Treating every list as the same set would break ownership isolation. Recovery protocol may not yet exist: wire this contract into its owning future SEC packet rather than claim a restore occurred.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.

## Concrete deletion plan

Inventory the actual accepted collection set in backend/services/encrypted_storage.py, the Finance subset in encrypted-store.persistence.ts, and HEALTH_STATS_COLLECTION/HEALTH_PRS_COLLECTION in health-store.service.ts. Different subsets encode ownership, so one union replacing every list is incorrect.

Choose a checked declarative policy or a small parity fixture; use it in the real server/client ownership checks and future recovery enumeration. Delete only duplicate membership authorities that have the same purpose. If cross-language literals remain, pin their intentional relation with a negative fixture rather than add runtime registration/codegen.

Evidence must name every old list, its distinct meaning, all migrated callers and the surviving authority. Synthetic Finance/Health/unknown-future records prove that foreign ciphertext is neither decoded by the wrong owner nor silently deleted. No new store, codec or generic collection plugin is justified by this task.
