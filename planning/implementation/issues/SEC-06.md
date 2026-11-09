# SEC-06 — Restore encrypted bundles with validated atomic or resumable staging

- Stable key: `SEC-06`
- GitHub leaf: [#271](https://github.com/Vivekpsps3/vivek-monorepo/issues/271)
- Parents: [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `SEC-05`, `SAFE-04`
- Conflict groups: `vault-core`, `vault-export`, `finance-settings`, `schema-head`
- Verification profiles: `finance_front`, `web_front`, `finance_back`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A user can recover every supported collection into their authenticated vault, preview conflicts, and survive interruption safely.

Complete merge/replace restore without partial data loss, using the portable bundle and existing record protocol.

## Requirements

- #121 Full-vault export/import clauses 3–4 and all acceptance wrong/tamper/oversize/version/lock/owner/rollback.
- #121 complete recovery requires export plus restore, not CSV only.
- TD-34: restore every allowed vault collection before new private collections ship. Server snapshot recovery and the measured drill stay on #125 (OPS-04), separate from this portable bundle.

## Source paths

- `apps/finance/frontend/src/app/crypto/`
- `apps/finance/backend/services/encrypted_storage.py`
- `apps/finance/backend/routers/vault.py`
- `apps/web/src/app/settings/finance-section.component.ts`
- `apps/web/src/app/settings/finance-section.component.html`
- `apps/web/src/app/settings/finance-section.component.css`
- `apps/finance/frontend/e2e/`

## Target paths

- `apps/finance/frontend/src/app/crypto/`
- `apps/finance/backend/services/encrypted_storage.py (only necessary staging contract)`
- `apps/finance/backend/routers/vault.py (if atomic batch extension required)`
- `apps/web/src/app/settings/finance-section.component.*`
- `apps/finance/backend/tests/`
- `apps/finance/frontend/e2e/`
- `docs/VERIFICATION.md`

## Steps

1. Decode/decrypt/validate locally before writes; preview collection/schema/count/conflict details, and derive ownership solely from current authenticated account.
2. Reuse SEC-05 bundle codec and CON-03 descriptors; reencrypt validated records under the current owner DEK with existing AAD/version rules.
3. Default merge skips existing IDs; explicit replace requires typed destructive confirmation and a pre-import export offer.
4. Use a tested transactional or resumable staging contract with explicit activation point so interruption/reload/cancel cannot silently destroy the current vault.
5. Exercise all collections and legacy supported versions; wrong backup password/tamper/oversize rejects before mutation.
6. Remove duplicated import/restore commit machinery where the existing staged record pipeline can serve both, without changing CSV receipt/Undo semantics.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| A01 | Valid complete bundle and existing destination records | merge/replace is previewed and confirmed | counts/conflicts match, records recover under current DEK, merge skips IDs and replace activates only after complete validated staging | end-to-end collection roundtrip and staged-write tests |
| A02 | Wrong password/tamper/unsupported version/oversized input | restore is attempted | zero destination mutation, no plaintext request/log/storage and clear bounded error | negative codec/API/network marker tests |
| A03 | Mid-batch failure, refresh, conflict or lock | restore is interrupted | old active vault remains safe; retry/resume follows explicit plan without double writes or cross-owner overwrite | injected batch failure and multi-browser interruption tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Parallel restore/import commit engines and ad hoc collection lists | Reuse shared validated staging primitives and one versioned bundle codec; delete obsolete trial/partial activation paths. | required | Idempotent resume, atomic activation and existing importer behavior survive. |

## Non-goals

- Do not change the signing/AES-GCM protocol or move private plaintext server-side.
- Do not add a second ledger, state store, background daemon or generic framework.
- Do not claim external activation, deployment or merged completion without evidence.

## Test scenarios

- Merge/replace/collision and all-collection representative records
- Failure at each activation boundary, refresh/resume
- Account switch/lock, foreign owner metadata and corrupt input

## Risks



## Completion evidence

- Issue-specific acceptance matrix with test/artifact for every row, exact commands and source/base revision.
- Deletion ledger: removed vs moved vs necessary new production code, surviving consumers and compatibility proof.
- One reviewable PR closing this leaf only, with parent references and a fresh roadmap status note.
