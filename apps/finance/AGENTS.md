# Finance

Start with the existing owner:

- [FinanceService](frontend/src/app/services/finance.service.ts) owns published views;
  [encrypted store](frontend/src/app/crypto/encrypted-store.service.ts) owns records;
  [persistence](frontend/src/app/crypto/encrypted-store.persistence.ts) owns their wire lifecycle.
- [Import service](frontend/src/app/services/finance-import.service.ts) and existing
  bank/brokerage import modules own preview, deduplication, receipts and Undo.
- [Public API](frontend/src/public-api.ts) is the cross-app entry point. Consumers
  receive narrow projections; they must not instantiate private stores or copy math.

Decrypted financial data stays in the browser. Preserve owner/session/collection
eligibility at publication, immediate lock clearing, expected revisions and encrypted
format/AAD compatibility. A timeout or an entry-time unlock check alone is insufficient.
Keep one authoritative record store and calculation/import engine. Loading a name
projection must not require rebuilding a whole dashboard.

Before extracting a service, identify duplicated decisions and actual consumers.
Delete replaced paths in the same change. Distinct filtered/dashboard views and
revision guards are not redundant merely because their fields resemble each other.

Use [DATA_MODEL](../../docs/DATA_MODEL.md) for money/cashflow semantics,
[SECURITY_MODEL](../../docs/SECURITY_MODEL.md) for vault changes and
[bank-import guide](../../docs/ADDING_A_BANK_IMPORT.md) for importers.
Use root test commands for the changed frontend/backend and every affected screen;
held-operation regressions belong beside existing coherence/session/record-queue tests.
