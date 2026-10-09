# Adding a bank CSV import

Bank imports create **expense** transactions (`source=import`). They **do not** change net worth; update liabilities on **Balance sheet** if you track balances there.

Parsers live in `apps/finance/frontend/src/app/utils/bank-import.util.ts`. Tests: `apps/finance/frontend/src/app/utils/bank-import.util.spec.ts`.

Each parser must produce:

- `dedupe_key` (`bank|account|date|amount|normalized description` SHA-256)
- `date`, `account_mask`, `description`, `category`, `amount` (positive number for expenses)

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

Commit rechecks existing keys, making retries safe after a partial save failure.
The dialog preserves the preview/selection after failure and prevents selection
changes or dismissal while saving. Returning to file selection clears stale
previews while retaining files and bank assignments.

| Slug | Notes |
|------|--------|
| `capital_one` | Credits/payments skipped; debits become expenses. |
| `chase` | Sale rows only (credit card export). |
| `amex` | American Express credit card export. |
| `citi` | Citi credit card export (Status, Debit/Credit, Member Name). |
| `bank_of_america` | Bank of America credit card export (Posted Date, Payee, Amount). |
| `x_money` | Completed negative Card Purchase rows only. |

Fidelity positions CSV is a **holdings** import (replace positions per account), not expense transactions. Parser: `apps/finance/frontend/src/app/utils/fidelity-import.util.ts`.
