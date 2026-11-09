# SEC-01 — Unify configured-origin challenge binding and prove auth ownership

- Stable key: `SEC-01`
- GitHub leaf: [#266](https://github.com/Vivekpsps3/vivek-monorepo/issues/266)
- Parents: [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `identity-origin`, `schema-head`
- Verification profiles: `finance_back`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Login and username-change challenges accept only the intended configured origin/purpose and cannot cross accounts or be spent twice.

Replace duplicate request-origin decisions with one validated, purpose-bound contract while preserving existing passwordless proofs and decoys.

## Requirements

- #121 Security decisions: retained protocol, configured origin, decoy/call-shape behavior, one-time challenge spend.
- #121 Historical regression: cross-account rename, username lookup/preflight and one-time challenge concurrency.
- TD-12 authentication boundary subset; ordinary form copy belongs HUB-01.

## Source paths

- `apps/server/identity/routes.py`
- `apps/server/identity/username_change.py`
- `apps/server/identity/challenge_auth.py`
- `apps/server/identity/auth_decoy.py`
- `apps/server/identity/session.py`
- `apps/finance/backend/tests/test_challenge_binding.py`
- `apps/finance/backend/tests/test_change_username.py`

## Target paths

- `apps/server/identity/`
- `apps/finance/backend/tests/`
- `docs/SECURITY_MODEL.md`

## Steps

1. Inspect configured public origin/allowed development origins and trusted Host/proxy handling; write the accepted missing/malformed/mismatch behavior as fixtures before changing helpers.
2. Implement one canonical origin/purpose validator and migrate login and rename issue/verify callers; remove their independent header/base_url fallback helpers.
3. Preserve the atomic consumed_at compare-and-set and existing persistent decoy behavior; add simultaneous proof-spend and cross-owner rename regressions using real transactions.
4. Compare observable status/error/call shapes for real and decoy accounts; perform bounded equivalent-cost work only where a tested distinguishable branch exists, without arbitrary sleeps.
5. Verify legacy username canonical lookup/preflight with current schema; keep synthetic identities and protocol fixtures unchanged.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| A01 | Configured same-site and documented development clients | challenge issue and verify use the same canonical origin and correct purpose | existing sign-in/rename succeed without forwarded-header trust expansion | API challenge-binding and username tests |
| A02 | Absent, malformed, foreign origin or swapped purpose/owner | a valid captured proof is submitted | the request is rejected with stable safe status/body; no rename/session creation | negative origin/purpose/cross-owner fixtures |
| A03 | A single unspent challenge and concurrent callers | two transactions try to consume it | one succeeds; the other changes no user/session state | SQLite concurrency test with synchronization gates |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| _origin and _request_origin helper pair | Delete independent origin derivation after both flows adopt the one validator. | required | Consumer search plus both success and rejection paths; no copied third helper. |

## Non-goals

- Do not change the signing/AES-GCM protocol or move private plaintext server-side.
- Do not add a second ledger, state store, background daemon or generic framework.
- Do not claim external activation, deployment or merged completion without evidence.

## Test scenarios

- Origin missing/malformed/allowlisted development/public mismatch
- Purpose replay and cross-owner proof
- Concurrent challenge consumption and decoy call-shape parity

## Risks

- A generic origin helper that trusts arbitrary Host/forwarded headers would worsen the boundary.

## Completion evidence

- Issue-specific acceptance matrix with test/artifact for every row, exact commands and source/base revision.
- Deletion ledger: removed vs moved vs necessary new production code, surviving consumers and compatibility proof.
- One reviewable PR closing this leaf only, with parent references and a fresh roadmap status note.
