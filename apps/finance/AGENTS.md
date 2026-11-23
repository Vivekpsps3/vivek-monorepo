# Finance

Start with the existing owner:

- [FinanceService](frontend/src/app/services/finance.service.ts) owns published views;
  [encrypted store](frontend/src/app/crypto/encrypted-store.service.ts) owns records;
  [persistence](frontend/src/app/crypto/encrypted-store.persistence.ts) owns their wire lifecycle.
- [Recovery export](frontend/src/app/crypto/recovery-export.ts),
  [restore](frontend/src/app/crypto/recovery-restore.ts) and their
  [bundle codec](frontend/src/app/crypto/recovery-bundle.ts) own portable recovery;
  membership comes from the server collection policy, never a second app list.
  Restore stages are temporary ciphertext; only atomic activation changes active
  records. Successful activation locks participating tabs before normal reload.
  [Lock service](frontend/src/app/core/finance-lock.service.ts) owns validated
  remote lock delivery, including Settings-only tabs.
- [Import service](frontend/src/app/services/finance-import.service.ts) and existing
  bank/brokerage import modules own preview, deduplication, receipts and Undo.
  The Imports page is the history and recovery surface; those actions stay here.
- [Public API](frontend/src/public-api.ts) is the cross-app entry point. Consumers
  receive narrow projections; they must not instantiate private stores or copy math.
  The private shell starts one trip-spend producer from that API when a vault is
  present. It republishes through the existing spend registry and clears on lock.
  That lookup also exposes id, cents, date, and category for one explicit Travel
  link. Travel does not receive descriptions, merchants, accounts, or a second ledger.

Decrypted financial data stays in the browser. Preserve owner/session/collection
eligibility at publication, immediate lock clearing, expected revisions and encrypted
format/AAD compatibility. A timeout or an entry-time unlock check alone is insufficient.
Keep one authoritative record store and calculation/import engine. Name search and the accounts hall read published views and do not rebuild
the dashboard.

Before extracting a service, identify duplicated decisions and actual consumers.
Delete replaced paths in the same change. Distinct filtered/dashboard views and
revision guards are not redundant merely because their fields resemble each other.

Use [DATA_MODEL](../../docs/DATA_MODEL.md) for money/cashflow semantics,
[SECURITY_MODEL](../../docs/SECURITY_MODEL.md) for vault changes and
[bank-import guide](../../docs/ADDING_A_BANK_IMPORT.md) for importers.
Use root test commands for the changed frontend/backend and every affected screen;
held-operation regressions belong beside existing coherence/session/record-queue tests.
