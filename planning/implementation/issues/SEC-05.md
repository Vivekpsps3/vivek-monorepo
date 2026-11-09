# SEC-05 — Export every vault collection as one encrypted portable bundle

- Stable key: `SEC-05`
- GitHub leaf: [#270](https://github.com/Vivekpsps3/vivek-monorepo/issues/270)
- Parents: [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `CON-03`, `SAFE-03`, `SAFE-05`
- Conflict groups: `vault-export`, `finance-settings`, `finance-vault-lifecycle`
- Verification profiles: `finance_front`, `web_front`, `finance_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

The owner can produce a recovery bundle for all allowed vault records without any plaintext export or missing new domain.

Deliver a versioned authenticated backup download with complete collection metadata and browser-local encryption.

## Requirements

- #121 Full-vault export/import clauses 1–2 and all-collection recovery manifest.
- TD-07/TD-34 recovery membership integration.

## Source paths

- `apps/finance/frontend/src/app/crypto/`
- `apps/finance/backend/services/encrypted_storage.py`
- `apps/web/src/app/settings/finance-section.component.ts`
- `apps/web/src/app/settings/finance-section.component.html`
- `apps/web/src/app/settings/finance-section.component.css`
- `planning/implementation/issues/CON-03.md`

## Target paths

- `apps/finance/frontend/src/app/crypto/ (owned bundle codec/export adapter)`
- `apps/web/src/app/settings/finance-section.component.*`
- `apps/finance/frontend/e2e/`
- `docs/SECURITY_MODEL.md`
- `docs/VERIFICATION.md`

## Steps

1. Use CON-03 collection ownership/schema contract and SAFE-03 record/crypto adapter to enumerate all allowed collections including Health and later review records.
2. Specify bundle/version/authenticated metadata/counts/limits and a separate user-chosen backup password; reject unsupported schema rather than silently omitting it.
3. Verify current authentication/passphrase locally and encrypt the download with reviewed primitives and fresh randomness; never include cookies, tokens, server secrets or unencrypted temporary files.
4. Bound input/output memory and interruption behavior; apply owner/epoch eligibility to every collection read and before offering the download.
5. Provide clear Settings action, validation and what recovery requires; document a synthetic bundle compatibility example for SEC-06.
6. Remove any hardcoded incomplete export list or competing raw export path for this recovery operation; existing intentional CSV conveniences remain separate.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| A01 | Synthetic markers in each allowed collection | export succeeds with a separate backup password | authenticated versioned bundle counts are complete and no plaintext marker appears in network/localStorage/logs/unencrypted file | all-collection browser and codec roundtrip fixtures |
| A02 | Unsupported/corrupt record or too-large input | bundle generation is requested | export fails with actionable safe status rather than a silently partial success | codec/version/limit tests |
| A03 | Read/encryption is held | lock/owner changes or cancel occurs | obsolete completion cannot offer a sensitive download or retain plaintext state | deterministic held-promise export test |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Hand-maintained export membership/duplicate raw recovery export | Derive membership from the versioned collection contract and keep one bundle format. | required | A newly registered synthetic collection is exported without editing another handwritten list. |

## Non-goals

- Do not change the signing/AES-GCM protocol or move private plaintext server-side.
- Do not add a second ledger, state store, background daemon or generic framework.
- Do not claim external activation, deployment or merged completion without evidence.

## Test scenarios

- Every collection, wrong password/tamper detection in codec roundtrip
- Unknown/versioned/corrupt/oversized records
- Lock/cancel/account switch during enumeration/encryption

## Risks

- SEC-05 alone does not close parent121: successful restore remains SEC-06.

## Completion evidence

- Issue-specific acceptance matrix with test/artifact for every row, exact commands and source/base revision.
- Deletion ledger: removed vs moved vs necessary new production code, surviving consumers and compatibility proof.
- One reviewable PR closing this leaf only, with parent references and a fresh roadmap status note.
