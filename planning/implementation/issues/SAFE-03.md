# SAFE-03 — Expose only the vault capabilities Health consumes and migrate it

- Stable key: `SAFE-03`
- GitHub leaf: [#203](https://github.com/Vivekpsps3/vivek-monorepo/issues/203)
- Parents: [#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198), [#197](https://github.com/Vivekpsps3/vivek-monorepo/issues/197)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `SAFE-02`
- Conflict groups: `finance-public-api`, `finance-vault-lifecycle`, `health-store`
- Verification profiles: `finance_front`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A private feature can reuse record/crypto operations without coupling to Finance’s entire concrete service.

Replace Health’s inferred whole VaultService type with a small explicit capability adapter implemented by the existing Finance vault.

## Requirements

- TD-08
- TD-07 interface subset only; CON-03 owns collection membership parity
- #198 requires browser-local encrypt/decrypt or codec-backed read/write with no key exposure
- #197 narrow public capability adoption

## Source paths

- `apps/finance/frontend/src/public-api.ts`
- `apps/finance/frontend/src/app/crypto/vault.service.ts`
- `apps/web/src/app/town/health/health-store.service.ts`
- `packages/auth/src/session-contract.ts`

## Target paths

- `apps/finance/frontend/src/public-api.ts`
- `apps/finance/frontend/src/app/crypto/`
- `apps/web/src/app/town/health/health-store.service.ts`
- `apps/web/src/app/town/health/health-store.service.spec.ts`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. List every Health vault method and envelope/error shape actually used; define only that explicit typed interface plus owner/generation eligibility. Keep interface ownership in the current public adapter unless a second actual owner justifies a neutral location.
3. Implement scoped codec-backed record operations or encryptPayload/decryptPayload plus list/upsert/delete with the existing collection/client ID/AAD/schema/revision checks. Never expose CryptoKey/raw DEK or unrelated Finance methods.
4. Migrate Health to the explicit interface and adapter, deleting Awaited<ReturnType<typeof openFinanceVault>> and its full concrete-type dependency. Keep old openFinanceVault for real remaining callers until migrated, not a duplicate complete vault.
5. Prove protocol equality with existing ciphertext fixtures and a narrow synthetic consumer; document exactly which compatibility export remains and who still calls it. Do not move the entire vault implementation.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | Health is typechecked against the narrow interface | a Finance-only method is referenced | compilation rejects that dependency while supported crypto/record operations compile | type-level negative fixture or equivalent compiler test |
| LOCAL2 | A v2 encrypted record and expected revision are supplied | the adapter lists/decrypts/upserts/deletes it | existing endpoint/envelope/AAD and conflict behavior remain unchanged | adapter/protocol fixture tests |
| LOCAL3 | An operation starts for A | owner/lock epoch changes during crypto | the adapter/consumer cannot publish old plaintext or expose a key | SAFE-02 races rerun through the new adapter |
| LOCAL4 | The Health consumer is inspected after migration | imports/types are searched | no concrete VaultService or inferred full-service return type is required | consumer graph plus build/typecheck |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| HealthVault = Awaited<ReturnType<typeof openFinanceVault>> | Delete the whole-service inferred alias and use the minimal consumed capability | required | negative type dependency test and migrated Health caller |
| Redundant public wrappers introduced only for this migration | Do not retain two implementations; delete temporary adapters once their caller is migrated | required | consumer search and public export diff |

## Non-goals

- No crypto/wire/schema migration
- No vault package extraction
- No domain record repository framework
- No future feature methods without a present consumer

## Test scenarios

- current ciphertext read/write roundtrip and bad AAD refusal
- revision409, malformed envelope, locked-path no-crypto import
- existing Health validation/conflict and lock tests through adapter

## Risks

- An envelope-only interface is insufficient because Health calls browser-local crypto. A renamed full service type is not narrowing. Production LOC may rise for an explicit safe interface; show removed coupling and keep the addition bounded.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.
