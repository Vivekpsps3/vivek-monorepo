# SEC-04 — Ship passphrase change UI through the atomic rotation contract

- Stable key: `SEC-04`
- GitHub leaf: [#269](https://github.com/Vivekpsps3/vivek-monorepo/issues/269)
- Parents: [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286).
- Dependencies: `SEC-03`, `SAFE-03`, `SAFE-04`
- Conflict groups: `finance-vault-lifecycle`, `finance-settings`, `web-session`, `account-ux`
- Verification profiles: `finance_front`, `web_front`, `finance_back`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

The user can change passphrase, retain all records, and sign in/unlock with the new passphrase in another browser.

Complete current/new/confirm passphrase change using the same keys and one persistence operation.

## Requirements

- #121 Passphrase change UI/browser and same/cross-tab key invalidation.
- #121 Acceptance current/new/wrong passphrase and record preservation.

## Source paths

- `apps/web/src/app/settings/finance-section.component.ts`
- `apps/web/src/app/settings/finance-section.component.html`
- `apps/finance/frontend/src/app/crypto/vault.service.ts`
- `apps/finance/frontend/src/app/crypto/vault-crypto.ts`
- `packages/auth/src/index.ts`
- `apps/finance/frontend/e2e/`

## Target paths

- `apps/web/src/app/settings/finance-section.component.*`
- `apps/finance/frontend/src/app/crypto/`
- `packages/auth/src/index.ts (only required primitive reuse)`
- `apps/finance/frontend/e2e/`
- `apps/web/src/app/settings/settings.spec.ts`

## Steps

1. Read merged SEC-03 request/revision/proof contract and existing wrapping primitives; write the current/new/confirm validation and focus behavior before adding controls.
2. Verify current passphrase in-browser; rewrap the same signing private key and DEK with fresh salts/current floor using reviewed primitives, not by exporting a non-extractable in-memory key.
3. Use one atomic endpoint, retain recoverable same-session drafts on conflict/failure, and clear passphrases after success/lock/owner change.
4. Subscribe through the shared lifecycle contract to invalidate participating same-origin tabs; handle requesting-session refresh deliberately.
5. Complete success and failure UX and wire Settings data/security navigation without placeholder links.
6. Remove old two-call UI orchestration and duplicate state/listeners; preserve automatic KDF upgrade and existing unlock flows.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| A01 | Existing owner and records in every current collection | valid passphrase change completes | new passphrase signs in/unlocks after reload and in a fresh browser; old fails; record content and blind indexes remain | multi-browser synthetic vault journey |
| A02 | Wrong current/invalid confirm/stale revision or network failure | submit is attempted | linked errors/focus are correct, no plaintext leaves browser and old credentials remain usable | unit/API/browser failure matrix |
| A03 | Change is in flight | lock/logout/identity changes | draft and derived key state clear and late result cannot restore sensitive UI | held-response lifecycle marker test |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Separate passphrase persistence/listener/UI state paths | Use merged atomic request and lifecycle contract; remove duplicate wrap-save glue. | required | Request-count assertion: one authorized rotation, no ciphertext rewrite; shared consumer proof. |

## Non-goals

- Do not change the signing/AES-GCM protocol or move private plaintext server-side.
- Do not add a second ledger, state store, background daemon or generic framework.
- Do not claim external activation, deployment or merged completion without evidence.

## Test scenarios

- New/old/wrong passphrase, second browser
- Cross-tab invalidation and requesting-session behavior
- Failure/retry/conflict and unchanged record ciphertext

## Risks

- Changing passphrase wraps must preserve signing/data-key compatibility and leave the previous usable state intact on failure; avoid publishing stale unlocked state.

## Completion evidence

- Issue-specific acceptance matrix with test/artifact for every row, exact commands and source/base revision.
- Deletion ledger: removed vs moved vs necessary new production code, surviving consumers and compatibility proof.
- One reviewable PR closing this leaf only, with parent references and a fresh roadmap status note.
