# Adding a bank CSV import

Bank CSV import creates encrypted transactions (`source=import`). It does not update Balance sheet liabilities; record balances there separately. Spending follows `transactionEffects` in `apps/finance/frontend/src/app/crypto/client-finance.ts`: a purchase adds spending, a refund subtracts it, and a payment, transfer, or unclassified credit adds neither income nor spending. Amounts are positive; the `kind` carries the direction.

Parsers live in `apps/finance/frontend/src/app/utils/bank-import.parsers.ts`. Preview, staged receipts, and commit live in `apps/finance/frontend/src/app/utils/bank-import.util.ts`. Tests: `apps/finance/frontend/src/app/utils/bank-import.util.spec.ts`.

Each parsed row has:

- `dedupe_key` (SHA-256 of `bank|account|date|amount|normalized description`)
- `date`, `account_mask`, `description`, `category`, `amount` (positive)
- `kind`: `purchase`, `refund`, or `ambiguous_credit`

Card payments and transfers are skipped. They are not stored as spending. A credit is classified from the description and the bank type text: payment and transfer language is excluded; refund, return, reversal, or merchant-credit language becomes `refund`; every other credit is `ambiguous_credit`. An unclassified credit stays out of income and spending totals until it is classified as a refund, income, payment, or transfer.

The Transactions import dialog accepts multiple CSV files and requires a bank selection
for each file. Files can be added or removed independently. It calls
`FinanceService.previewBankImports()` / `commitBankImports()` to parse locally and
write encrypted records. The single-file service methods remain available for
existing callers. CSV contents are not sent to the backend.

`buildBankImportPreviews()` processes files in selection order with a shared
set of existing/seen transaction keys, so overlapping statements are marked as
duplicates before confirmation. Each file retains its own filename, bank,
preview rows, skipped-row notes, and errors. A failed file does not block valid
rows from other files. The UI commits the selected new rows together through
the encrypted store; account labels come from each file's assigned bank.
Commit writes a staged import receipt first and rechecks existing keys, so a
retry after a partial save can resume that receipt. Ambiguous credits on the
receipt stay unresolved until classified. The dialog preserves the preview/selection after failure and prevents selection
changes or dismissal while saving. Returning to file selection clears stale
previews while retaining files and bank assignments.

| Slug | Notes |
|------|--------|
| `capital_one` | Debits are purchases. Credits are classified as refunds, or held as ambiguous; payments and transfers are excluded. |
| `chase` | Purchases are imported. Credits are classified as refunds, or held as ambiguous; payments and transfers are excluded. |
| `amex` | Purchases are imported. Credits are classified as refunds, or held as ambiguous; payments and transfers are excluded. |
| `citi` | Cleared purchases are imported. Credits are classified as refunds, or held as ambiguous; payments and transfers are excluded. |
| `bank_of_america` | Negative amounts are purchases. Positive amounts are classified as refunds, or held as ambiguous; payments and transfers are excluded. |
| `x_money` | Completed card purchases and recognized refunds are imported. Other rows are skipped. |
| `custom_csv` | Column map for date, description, and a signed amount or debit/credit, plus optional account, category, and currency. Delimiter and header are detected. A mapped currency must be USD; other currencies stay row errors and are not committed. The same preview, receipt, and Undo path is used. Mapping profiles are encrypted `csv_mapping_profile` records at format version 1. |

Fidelity positions CSV is a **holdings** import (replace positions per account), not expense transactions. Parser: `apps/finance/frontend/src/app/utils/fidelity-import.util.ts`.
