# SEC-03 — Persist both credential wraps atomically with proof and revision

- Stable key: `SEC-03`
- GitHub leaf: [#268](https://github.com/Vivekpsps3/vivek-monorepo/issues/268)
- Parents: [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286).
- Dependencies: `SEC-01`, `SEC-02`, `CON-03`
- Conflict groups: `schema-head`, `identity-session`, `finance-vault-lifecycle`
- Verification profiles: `finance_back`, `server_back`, `schema`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Both signing-key and DEK wraps rotate together, or neither changes; other sessions are revoked only after a successful authorized update.

Deliver the authenticated backend credential-rotation contract before wiring the passphrase screen.

## Requirements

- #121 Passphrase change clauses 1–4: fresh purpose proof, dual wraps, expected revision, session revocation.
- #121 Acceptance: conflict/partial failure/owner/CSRF/proof regression.

## Source paths

- `apps/server/identity/challenge_auth.py`
- `apps/server/identity/routes.py`
- `apps/server/identity/models.py`
- `apps/server/identity/schemas.py`
- `apps/finance/backend/services/encrypted_storage.py`
- `apps/finance/backend/schemas_vault.py`

## Target paths

- `apps/server/identity/`
- `apps/finance/backend/services/encrypted_storage.py`
- `apps/finance/backend/schemas_vault.py`
- `apps/server/alembic/versions/ (new revision only if required)`
- `apps/finance/backend/tests/`

## Steps

1. Define the smallest owner-scoped CSRF-protected endpoint and request schema for both wrap payloads plus expected wrap revision and a fresh purpose-bound signed proof.
2. Reuse existing wrap/KDF bounds; do not accept plaintext passphrases, generate new data keys, or rewrite encrypted records for a passphrase change.
3. Perform both wrap updates and session-revocation policy in one transaction; compare-and-set the expected revision and preserve old state on any failure.
4. Keep or refresh the requesting session deliberately and revoke other sessions after success; document the limitation that a remote browser already holding a key cannot be remotely erased.
5. If schema support is required, create a new additive revision after checking the current single head, preflight legacy representation, and run preservation/rehearsal.
6. Retire separate credential-change persistence paths for this operation; leave automatic KDF-upgrade compatibility behavior explicitly covered rather than silently broken.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| A01 | Owner, valid fresh purpose proof, CSRF and expected revision | both new wrap payloads are submitted | both persist atomically, revision advances once, other server sessions revoke and ciphertext does not change | API integration plus ciphertext/wrap snapshots |
| A02 | Either write/commit fails or revision is stale | rotation is attempted | both old wraps remain valid and no partial session revocation is committed | injected second-write/commit failure and CAS conflict tests |
| A03 | Foreign owner, missing CSRF, consumed/wrong-purpose proof or invalid KDF payload | rotation is requested | request rejects without wrap or record mutation | owner/proof/validation test matrix |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Two independent wrap-update calls in credential change | Replace this operation with one transactional endpoint; remove obsolete duplicate orchestration only after SEC-04 adopts it. | required | Atomic API tests and clear compatibility caller inventory. |

## Non-goals

- Do not change the signing/AES-GCM protocol or move private plaintext server-side.
- Do not add a second ledger, state store, background daemon or generic framework.
- Do not claim external activation, deployment or merged completion without evidence.

## Test scenarios

- Second-write rollback and commit failure
- Wrap revision race and proof replay
- Other-session revocation without ciphertext rewrite

## Risks

- Schema and identity paths serialize with any active migration/credential work.

## Completion evidence

- Issue-specific acceptance matrix with test/artifact for every row, exact commands and source/base revision.
- Deletion ledger: removed vs moved vs necessary new production code, surviving consumers and compatibility proof.
- One reviewable PR closing this leaf only, with parent references and a fresh roadmap status note.
