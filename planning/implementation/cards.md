# Cards — discovery design

Parent [#195](https://github.com/Vivekpsps3/vivek-monorepo/issues/195).
Discovery leaf [DISC-02](completed/issues/DISC-02.md) / [#265](https://github.com/Vivekpsps3/vivek-monorepo/issues/265).
Evidence: [DISC-02](evidence/DISC-02.md).

Status: design only, read from `origin/main` `8126d6efef2e6e0564d7dccc67e17d785204d4f9`.
This page accounts for the parent proposal. It does not approve implementation,
add a queue entry, or close #195. The [execution queue](README.md) remains the
only work order.

The concept this design fixes is a private Finance workspace for cards the
user already has: a gallery, a Needs attention list, and one detail page
whose facts stay distinct. Whether to build it is still an owner decision.

## What the words mean

These are different facts. None is a synonym for another.

| Word | Meaning | Not this |
| --- | --- | --- |
| Card | User-authored wallet metadata in a future `cards` collection. Nickname, product label, optional last four, appearance, opened date, current annual fee, next renewal date, optional links. | A payment instrument, a PAN vault, or a liability |
| Debt balance | Existing `Liability.balance_owed` as of `Liability.as_of_date`. Net worth reads only this, in `computeNetWorth`. | Statement balance, minimum due, annual fee, or a benefit |
| Statement | One user-entered snapshot of a cycle: period, as-of date, statement balance, minimum due, due date, and an explicit paid confirmation. | Import-receipt coverage, a live issuer feed, or the debt balance |
| Renewal | The next annual-fee civil date the user keeps on the card, plus separate fee-event history when they record that a fee date happened. | The opened date, a statement due date, or a benefit period end |
| Benefit | Current user-authored terms: name, optional amount and unit, and one period rule. | A transaction, a refund, or cash savings |
| Benefit use | One explicit use. It keeps the amount that was recorded then. Later edits to the benefit do not rewrite it. | Proof that a matching purchase or refund posted |
| Your estimate | Optional integer cents on a use, labeled as the user's own estimate. | A points-to-cash rate, net worth, or spending |
| Unknown | A null date or amount. Display the word unknown. | Zero, overdue, or paid |
| Overdue | A known civil date is before local today and the user has not recorded the resolving action. | A null date, or a date that merely arrived while autopay was checked |

`ProfilePayload.annual_fee_drag` is a planning rate, not this fee.
Local today is `todayIsoDate()` from `@vivek/browser` (browser-zone civil date).
Vault `updated_at` is not a due date, a renewal, or a use date. Import
`coverage_start` / `coverage_end` on an import receipt is statement coverage
for a file, not a card statement. Cards never read or write receipts.

## Journey

Saturday, the unlocked user opens Cards from the Finance section list.

The page shows two things first. A **Needs attention** list: a statement due
April 3 that is not confirmed, an annual fee that renews May 1, and a dining
credit whose calendar month ends April 30 with no use recorded. Below it, a
gallery of two tiles: a nickname, an optional last four, and a local
appearance. No chart is required to answer what needs attention.

The user adds a third card, "Blue cash", product label "Example Bank Cash",
no last four, appearance `paper`, no opened date, annual fee left blank, and
no renewal date. They link an existing credit-card liability and do not create
one. The overview shows that debt with its as-of date, and "No statement
recorded." The debt balance on Accounts does not change.

They record a statement: period March 1–31, as of March 28, statement balance
$120.00, minimum $35.00, due April 3, autopay "I set this up", payment not
confirmed. April 3 passing does not mark it paid. Needs attention keeps the
row and says the autopay note is not confirmation. They later confirm paid on
April 2. The row leaves attention. The linked liability still shows its own
balance. Undo confirmation returns the statement to not confirmed and clears
the paid date.

They add a calendar-month dining credit of $10.00 nominal, mark it used on
April 4, and put a $10.00 estimate on that use. The history shows the nominal
amount and the estimate in separate columns. It does not say they saved $10,
and it does not post a refund. Editing the credit's future amount to $15.00
leaves the April use at $10.00.

They archive the card. Gallery and attention drop it. The liability,
transactions, and bills stay. Delete, if they choose it, removes only the
card rows and says what remains.

Nothing in this journey writes net worth, the ledger, a bill, or an import
receipt. Reload shows the same rows. Lock clears the nicknames, amounts, and
attention list immediately.

## Screens

Future route `/finance/cards`, a child of the existing Finance shell
(`authGuard` + `vaultGuard` in `app.routes.ts`). Direct load and refresh stay
on this route while the vault is unlocked. There is no second passphrase and
no suite-level app beside Finance.

Navigation decision: add one Finance section, `{ label: 'Cards', link: '/finance/cards' }`,
to `financeSections` in `apps/finance/frontend/src/app/core/layout/finance-navigation.ts`.
The private shell already renders that array. Do not add a Hub destination,
a search hit, or a top-level switcher entry. Do not add a sixth copy of Home
or Accounts.

1. **Cards home.** Title "Cards". Actions: "Add a card" and "List view" (or "Gallery view"). The attention list is above the gallery. Empty vault copy: "No cards yet." and the add action. No $0 totals.
2. **List view.** `/finance/cards?view=list`. The same active cards as links, in the same order as the gallery. No animation required. The query is the only view memory. Do not use `localStorage`.
3. **Gallery.** Default when `view` is absent. Each tile is a link to the detail route. It shows appearance, nickname (or product label, or "Card"), and last four as `•••• 1234` or nothing. It does not show a dollar amount. Status text is "Overdue", the nearest attention date, "Unknown", or "Nothing in the next horizon." Unknown is not "Nothing."
4. **Detail.** `/finance/cards/:id`. Tabs are links: Overview (default), `?tab=benefits`, `?tab=history`. Overview shows debt, current statement, and renewal as separate labeled blocks. Benefits is the checklist. History is the merged log. Archived detail says "Archived" and offers Restore and Delete.
5. **Card editor.** Dialog. Nickname or product label required (at least one). Optional last four, appearance, opened date, annual fee, renewal date, liability, imported account. Save, archive, delete. First invalid field takes focus.
6. **Statement editor.** Optional period start, period end, as-of, statement balance, minimum, due date, autopay, payment status, paid date, transaction link, bill link. Copy states that these are entered facts, not issuer verification.
7. **Renewal editor.** Records a fee event and, in the same form, the next renewal date the user confirms. It does not advance the date by itself.
8. **Benefit editor.** Name, amount, period, optional source note. Archive and delete. Delete explains that uses go with the benefit and that debts and transactions stay.
9. **Use editor.** Date, recorded amount (prefilled from current terms, editable), optional estimate, optional note, optional transaction link. Copy: "Marked used here. This does not mean a refund or transaction posted."
10. **Locked.** `vaultGuard` sends the browser to the existing unlock screen. Personal names, last four, amounts, notes, and attention rows are absent. Unlock returns to `/finance/cards` or `/finance/cards?view=list`. A detail id is not a return coordinate.

Small screen, 390px, in document order:

```text
Cards
[ Add a card ]  [ List view ]

Needs attention
Statement · Blue cash
Due Apr 3 · Tomorrow · Not confirmed
Statement $120.00 · Minimum $35.00
Autopay recorded, not confirmed

Annual fee · Blue cash
Renews May 1 · In 28 days
Fee unknown

Benefit · Dining credit
Ends Apr 30 · In 27 days · Not used
Nominal credit $10.00

[ Blue cash          ]
[ Example Bank Cash  ]
[ •••• 1234          ]
[ Due Apr 3          ]

[ Second card        ]
[ Nothing in the     ]
[ next horizon       ]
```

The list view replaces the tiles with the same two links and does not drop
the attention list. At 1280 the list stays above a wrapping row of tiles.
Light and dark use the suite theme. Reduced motion keeps every row, link,
and static appearance. No tilt, drag, or swipe. Hover is not the only way
to open a card. Due dates are text, not only a color.

`returnPath` in `packages/ui/src/return-context.ts` does not know
`/finance/cards` today, and it strips record ids on purpose (`edit=42` is
dropped on Spending). The future route leaf adds only:

- destination `/finance/cards` with `view: ['list']`
- a cards-specific rule that `/finance/cards/` plus a 1–16 digit id returns
  the gallery path `/finance/cards`, with `tab` and the id removed

Do not add a general numeric-id pattern. Nickname, last four, and amounts
are never query keys. `routes.json` must accept `cards` and `cards/` plus
digits, or a refresh 404s. Add mounted examples `finance/cards` and
`finance/cards/42` in `route-examples.json`. No new alias such as `/cards`.

## Attention

Pure function of active-card records plus a caller-supplied today string.
No timer and no notification. Recompute when `cards$` emits and when the
document becomes visible. Remove that listener on destroy.

Horizons match dates the app already treats as soon, except the annual fee:

| Kind | Included when |
| --- | --- |
| Statement, not confirmed, due date known | Due date before today (overdue), or due date from today through `isoAddDays(today, 13)`. That is `dueSoon(today, 14)`'s end date. |
| Statement, not confirmed, any of balance, minimum, or due date null while another of those is set | "Due date unknown" or the missing amount as unknown. Not overdue. A statement with every amount null and no due date is not an attention row. |
| Statement confirmed paid | Never, whatever the due date or autopay value is. |
| Renewal date known | Date before today, or date from today through `isoAddDays(today, 44)`. The longer horizon is only for the annual date. |
| Annual fee non-null, including a recorded `0`, and renewal date null | "Renewal date unknown". Not overdue. |
| Annual fee null and renewal date null | No renewal row. |
| Benefit period end known, no use with `used_on` inside the period | End before today, or end inside the same 14-day horizon as statements. Calendar periods roll: yesterday's month is not attention once today is in the next month. |
| Benefit period unknown | No attention row. The benefit shows "Period unknown". |
| Archived card or archived benefit | No attention row. |

Sort overdue first, oldest date first; then upcoming, soonest first; then
unknown. Tie-break by display name, then statement, renewal, benefit.
Each row is a link to the detail tab that owns it. Status words are only
"Overdue", "Not confirmed", "Ends", and "Unknown". Never "Verified",
"Paid by autopay", or "Issuer confirmed".

Autopay `"user_reported"` adds "Autopay recorded, not confirmed" and still
lists an unconfirmed statement. Autopay `"off"` adds nothing. Autopay null
means the user did not say.

A benefit with at least one in-period use is not an attention row, even if
the nominal amount is larger than the use. v1 does not compute credit
remaining. Repeated uses stay in history and do not multiply the fee or
the nominal credit.

## Periods

All bounds are inclusive civil dates. The pure function takes `today` and
the card's `opened_on`. It does not read the clock.

| `period_kind` | Current period | Unknown when |
| --- | --- | --- |
| `calendar_month` | First through last civil day of today's month. February 2024 ends 2024-02-29. February 2025 ends 2025-02-28. | Never. The month exists. |
| `calendar_year` | January 1 through December 31 of today's year. | Never. |
| `card_anniversary` | See below. | `opened_on` is null, or today is before `opened_on`. Copy: "Anniversary unknown" or "Anniversary starts {opened_on}". Not expiring. |
| `one_off` | `starts_on` through `ends_on`. Both required, start ≤ end. | The editor refuses an incomplete one-off. It is not stored as unknown. |

Anniversary date in year Y is the opened month and day, except February 29
in a non-leap year, which is February 28. Current start is the latest
anniversary date on or before today. Inclusive end is the day before the
next year's anniversary date. Pinned cases:

| Opened | Today | Start | End |
| --- | --- | --- | --- |
| 2024-02-29 | 2025-02-27 | 2024-02-29 | 2025-02-27 |
| 2024-02-29 | 2025-02-28 | 2025-02-28 | 2026-02-27 |
| 2024-03-01 | 2026-02-28 | 2025-03-01 | 2026-02-28 |
| 2024-03-01 | 2026-03-01 | 2026-03-01 | 2027-02-28 |

A use counts only when `used_on` is inside that inclusive span. The next
day belongs to the next period. Editing terms does not move old uses.

## Records and data flow

One future Finance collection, `cards`, written at envelope schema version 2
(`CURRENT_RECORD_SCHEMA_VERSION`). Kinds live in ciphertext. The server keeps
storing opaque `/api/vault/*` rows in `encrypted_records`. This design adds
no table, migration, plaintext route, or blind index.

```text
card / statement / benefit / use / fee-event editor
  -> existing Finance codec and EncryptedStoreService.allocateId
  -> FinanceService writeEligible / observeEligible
  -> /api/vault ciphertext
     (owner id + lock generation checked around the call)

attention and periods
  -> pure functions of decrypted rows + todayIsoDate()
  -> not persisted

liability_id / bank_account_id / transaction_id / bill ref
  -> read the existing collection by numeric id
  -> missing id shows "unavailable"
  -> Cards never inserts or updates those rows

lock, logout, account switch, reset
  -> FinanceService.clearSessionState drops the cards subject
  -> EncryptedStoreService.clear drops the bag
  -> in-flight reads and writes check the same generation they already check

export / restore
  -> cards is a Finance owner name, so recovery membership includes it
  -> old backups that omit the name restore as zero card rows
```

`allocateId()` already draws one random safe integer across Finance bags.
A reference stores the collection name and that id. A cards id is not looked
up in `liabilities`.

On this base, `recovery_snapshot` emits every `COLLECTION_POLICY.recovery`
name, and restore rejects `expected_counts` whose keys are not exactly that
set. The client builds those counts from the live snapshot, so a backup
file with no `cards` member becomes count 0 after the name is registered.
The collection leaf must prove that old file still restores, and that a
file with card rows round-trips. Do not add a second restore list. #121 is
closed; the landed contract is this policy union, not a new recovery format.
#125 still owns operational backup. This design does not claim an off-host
restore.

Unknown envelope `schema_version` and unknown `kind` stay sealed, show as
unsupported, are not rewritten, and still export. A failed delete or a
revision conflict leaves the last good row. The open draft stays in component
memory until lock, logout, or account switch. Drafts are not written to
`localStorage`, the URL, or logs.

`CardRecord` (`kind: "card"`)

| Field | Type and rule |
| --- | --- |
| `nickname` | `string`. Trimmed. May be empty only when `product_label` is not. |
| `product_label` | `string`. Issuer and product in one label. Same emptiness rule. |
| `last_four` | `string` matching `^\d{4}$`, or `null`. Reject any other length or character. Never a full number. |
| `appearance` | `"paper"`, `"leather"`, or `"jewel"`. Default on create is `"paper"`. Any other stored value renders as paper and the editor says the saved appearance is not available. |
| `opened_on` | `YYYY-MM-DD` or `null`. |
| `annual_fee_cents` | integer cents ≥ 0, or `null`. `0` is a recorded zero fee. `null` is unknown. This is the current stated fee, not the sum of fee events. |
| `renewal_on` | `YYYY-MM-DD` or `null`. The upcoming date only. Not derived from `opened_on`. If both are set and disagree, show both. |
| `liability_id` | `number` or `null`. Existing `Liability.id`. Any category is linkable. The picker labels `credit_card` as "Credit card" and does not hide other debts. No name match and no created liability. |
| `bank_account_id` | `number` or `null`. Existing `BankAccountRecord.id`. Display the live `display_name`. Do not copy the mask, do not compare it to `last_four`, and do not treat it as a balance. Unconfirmed accounts can still be linked and are labeled unconfirmed. |
| `shelf` | `"active"` or `"archived"`. |
| `source_note` | `string` or `null`. User text. No fetch. |

`StatementRecord` (`kind: "statement"`)

| Field | Type and rule |
| --- | --- |
| `card_id` | `number`. The card's numeric id. |
| `period_start`, `period_end`, `as_of`, `due_on` | each `YYYY-MM-DD` or `null`. If both period bounds are set, start ≤ end. |
| `statement_balance_cents`, `minimum_due_cents` | integer cents ≥ 0, or `null`. |
| `autopay` | `"off"`, `"user_reported"`, or `null`. |
| `payment_status` | `"unconfirmed"` or `"paid"`. Create defaults to unconfirmed. A due date does not change it. |
| `paid_on` | `YYYY-MM-DD` when paid, otherwise `null`. The editor requires it to mark paid and clears it on undo. |
| `transaction_id` | `number` or `null`. Existing `Transaction.id`. The amount stays on the transaction. |
| `bill` | `null`, or `{ collection: "fixed_expenses" \| "subscriptions", id: number }`. |
| `source_note` | `string` or `null`. |

The overview's current statement is the unconfirmed statement with the
earliest due date, else the row with the latest due date, else latest
`as_of`, else latest `period_end`, else the newest id. Older unconfirmed
statements still appear in attention. A newer statement does not mark an
older one paid.

`FeeEventRecord` (`kind: "fee_event"`)

| Field | Type and rule |
| --- | --- |
| `card_id` | `number`. |
| `occurred_on` | `YYYY-MM-DD`. Required. |
| `amount_cents` | integer cents ≥ 0, or `null`. Prefilled from `annual_fee_cents` and still editable. Null stays null. |
| `transaction_id`, `bill` | Same link rules as a statement. |
| `note` | `string` or `null`. |

The renewal form writes the fee event first, then `renewal_on`, using the
existing per-row revision. If the card write fails, keep the fee event,
keep its id on the open form, and retry only the card. Do not insert a
second fee event on retry. Do not roll the fee event back. The next date
is whatever the user submitted, including null. The form may prefill one
year after `occurred_on` using the February 29 clamp. It does not save
that prefill unless the user saves.

`BenefitRecord` (`kind: "benefit"`)

| Field | Type and rule |
| --- | --- |
| `card_id` | `number`. |
| `name` | Non-empty trimmed string. |
| `amount` | `null`, or one of `{ unit: "usd_cents", cents: number }`, `{ unit: "points", points: number }`, `{ unit: "count", count: number }`, `{ unit: "label", text: string }`. Counts are integers ≥ 0. Label text is non-empty. `null` is unknown, not zero. No second unit is stored beside the first. |
| `period_kind` | `"calendar_month"`, `"calendar_year"`, `"card_anniversary"`, or `"one_off"`. |
| `starts_on`, `ends_on` | Required only for `one_off`. Otherwise null. |
| `shelf` | `"active"` or `"archived"`. |
| `source_note` | `string` or `null`. |

There is no rate field and no dollar equivalent of points.

`BenefitUseRecord` (`kind: "benefit_use"`)

| Field | Type and rule |
| --- | --- |
| `benefit_id` | `number`. |
| `used_on` | `YYYY-MM-DD`. Required. The user picks it. |
| `recorded_amount` | The same amount union, copied from the benefit at save unless the user edits this use. Later benefit edits do not change it. |
| `user_estimate_cents` | integer cents ≥ 0, or `null`. Label "Your estimate". |
| `transaction_id` | `number` or `null`. A link is not a match and not a refund. |
| `note` | `string` or `null`. |

History merges statements, fee events, and uses for that card. Sort by
civil date descending. Undated statements sort last. Columns are date,
what, recorded amount, and your estimate. Recorded amount keeps its unit
("Nominal credit $10.00", "1,200 points", "2 visits", "Unknown"). The
estimate column is money or "None". No third column adds them. No row
says "saved". A missing linked transaction or bill is "Linked record
unavailable" and the history row remains.

Orphan rows whose `card_id` or `benefit_id` does not resolve stay out of
the gallery and out of attention. Home shows "N card records are not
attached" with Relink and Delete. Relink only retargets the id inside
`cards`. Partial delete uses the same list.

Archive sets `shelf` to `"archived"` and does not delete or rename a
liability, bank account, transaction, bill, subscription, or receipt.
Delete confirms with `ConfirmService` and lists child counts. It deletes
uses, benefits, statements, fee events, and the card, in that order, each
with `expected_revision`. A failed step stops, names what remains, and
does not touch other collections. Restore of an archived card sets
`shelf` back to `"active"` and does not recreate attention history.

Money entry reuses `validateMoney`, `parseMoneyInput`, and the existing
money formatter. Card payloads store integer cents. Liability
`balance_owed` stays a dollar number on the liability. Display it from
the live liability. Do not copy it into cents on the card. A linked `$0`
debt is the liability's recorded zero, with its as-of date. An unlinked
card says "No debt linked", not `$0`.

## Reuse

| Need | Owner to reuse | Do not add |
| --- | --- | --- |
| Session | Existing passwordless session | A Cards login |
| Ciphertext, revision, AAD, owner, lock generation | `EncryptedStoreService`, `FinanceService.writeEligible` / `observeEligible`, `/api/vault/*` | A second store, event bus, or plaintext `/api/cards` |
| Collection allowlist | `FINANCE_OWNER_COLLECTIONS` and client `FINANCE_COLLECTIONS`, pinned by `scripts/check_collection_policy.py` | A Health name, a third recovery list, or a SQL table |
| Which names Finance decrypts | The finance bags. Health stays `health_stats` and `health_prs`. | Putting `cards` in the foreign set |
| Lock and unlock | `vaultGuard`, `clearSessionState`, `lockFinance` | A Cards vault or a `localStorage` draft |
| Return after unlock | `returnPath`, with the narrow gallery rule above | A wildcard that keeps record ids |
| Shell placement | `financeSections`, already consumed by `private-layout.component.ts` | A new top-level app, Hub card, or `searchFinanceNames` hit |
| Routes | `app.routes.ts`, `apps/web/routes.json`, `route-examples.json` | An alias `/cards` or a page outside the Finance shell |
| Money and dates | `@vivek/browser` cents and `todayIsoDate` / `formatDate` / `formatRelativeDay`; Finance `validateMoney` | A new money library or a points exchange rate |
| Dialogs, focus, confirm | `focusFirstInvalid`, `ConfirmService`, the existing save-alert copy | A form engine or swipe gestures |
| Theme | `suite-theme` plus three local appearance classes | Uploaded art, issuer images, or a new token package |
| Debt | `Liability` and `computeNetWorth` | Writing `balance_owed` from a statement or fee |
| Imported account | `BankAccountRecord` | Copying `account_mask` or reading it as a balance |
| Payment or fee already in the ledger | `Transaction.id` | Creating a transaction, changing spend totals, or inferring a match |
| Bill already scheduled | `FixedExpense` or `Subscription` | Creating one, copying `autopay: boolean` into `payment_status`, or adding Cards into `dueSoon` / cashflow |
| Planning debt tool | The liability the user already selects there | A statement balance as the calculator source |
| Planning `annual_fee_drag` | A speculative rate on `ProfilePayload` inside `planning_profiles` | Reading or writing it as a card's annual fee |
| Hub | `loadFinanceHubSnapshot` as it is | Card balances or attention counts in the Hub snapshot |
| Import coverage | Receipt coverage stays on the receipt | Treating a card statement as coverage, or the reverse |

`FixedExpense.autopay` is a boolean on a bill. It is a different field from
statement `autopay` and must not be copied either way. Home's "card activity"
in the design guide is posted ledger activity, not this workspace.

No `apps/finance` cards module, route, or collection exists on this base.
`planningEvidenceCards` and recurring `.commitment-cards` are not a credit-card
prototype. Nothing to delete. Do not add a scaffold, sample store, or second
write-up in `queue.json`.

Checked and absent on this base: a `/finance/cards` route, a `cards` vault
name, a benefit model, and a PAN/CVV field. Liability category `credit_card`
is the debt category the picker labels. It is not this workspace.

## Requirement disposition

`first version` means the future implementation slice above.
`later candidate` means the parent kept it and this design leaves it out of
that slice. `unresolved` means the owner still chooses. `excluded` means the
parent already put it outside the first version, or this design refuses it
because the parent did. This table is not an approval to build.

| Clause in #195 | Disposition | Reason |
| --- | --- | --- |
| DISC-02 is discovery only; implementation is unselected | unresolved | This PR is the design. The owner has not selected a build. |
| Preserve Finance ownership, distinct facts, and encrypted privacy | first version | Collection, record split, and vault rules above |
| A beautiful home for cards the user already has | first version | Gallery plus detail |
| Private workspace for what is due, what renews, and which benefits were used | first version | Attention, renewal, and explicit uses |
| 2026-11-08 request and the nine-delivery separation note | excluded | Dated status. Live order stays in `queue.json`. |
| Proposal is not implementation or deployment authorization | unresolved | Same as the selection choice |
| Finance-owned product, not another login or financial database | first version | Reuse table |
| Physical-card tiles, restrained gradients, nickname, optional last four | first version | Gallery. Three local appearance ids. No image. |
| Local theme; no upload, issuer scraping, or remote artwork | excluded | Those sources are out. Appearance ids are local CSS. |
| Needs attention for a payment date, a renewal, and an ending benefit | first version | Attention rules |
| Detail Overview, Benefits, and History | first version | Detail tabs |
| Button or list equivalent; phone, keyboard, reduced motion | first version | List view and screen rules |
| Wallet with the answer visible; no giant chart first | first version | Attention is above the gallery. v1 has no chart. |
| Add, edit, archive, delete with the named collection fields | first version | `CardRecord` and editor |
| Dates and amounts optional; unknown stays honest | first version | Null versus zero |
| Link existing credit-card debt; do not create or duplicate a liability | first version | `liability_id`. Other liability categories stay selectable so a miscategorized card is not blocked. No silent create. |
| Statement amount, minimum, due date, manually confirmed paid | first version | `StatementRecord` |
| Dated facts, not a live issuer feed | excluded | No feed, scrape, or bank connection |
| Show as-of and statement period | first version | Statement fields and overview labels |
| Liability balance stays authoritative and is not the statement balance | first version | Debt block reads `Liability` only |
| Autopay setup is not confirmed payment; a passed date is not paid | first version | `autopay` versus `payment_status` |
| User-authored benefits, optional amount and unit, period, explicit uses | first version | Benefit and use records |
| Calendar month, calendar year, card anniversary, and one-off periods | first version | Period table, including the February 29 clamp |
| Preserve past usage when terms change | first version | `recorded_amount` on the use |
| Undo and correction | first version | Edit, confirm-delete, and paid undo. No second ledger. |
| Unknown value is not zero | first version | Null display rules |
| A used benefit is not a posted transaction or refund | first version | Use copy and the unused transaction writer |
| Attention derived locally; absolute date plus relative context | first version | `formatDate` and `formatRelativeDay` |
| Overdue, unknown, and unconfirmed stay distinct | first version | Attention status words |
| Never imply issuer verification | first version | Forbidden status words |
| No background notifications in v1 | excluded | No scheduler, push, or midnight job |
| Editable history of statements, fees, and uses | first version | History merge |
| Recorded amount separate from user-estimated value | first version | History columns |
| No invented points rate and no nominal credit counted as cash saved | excluded | No rate field and no savings total |
| Proposed route `/finance/cards` | first version | Future route. Not added here. |
| One navigation decision; no new permanent suite tab | first version | `financeSections` only |
| Accessible list view beside the gallery | first version | `view=list` |
| Code and records live in `apps/finance/` | first version | Future files named below |
| Reuse money, dates, cents, dialogs, revision, and vault lifecycle | first version | Reuse table |
| Stable links to liabilities, accounts, and transactions; missing sources are explicit | first version | Liability, `BankAccountRecord`, and transaction links. Brokerage accounts are not card accounts. |
| Card metadata does not write balances, net worth, spending, or the recurring ledger | first version | No writers into those collections |
| Fees and payments may link to an existing bill or transaction | first version | Optional `bill` and `transaction_id` |
| Avoid double-counting and duplicate reminders | first version | Links do not copy amounts or insert bills |
| Archiving does not delete or relabel financial history | first version | `shelf` only |
| Imported-activity matching, with preview and confirmation | later candidate | Parent puts automatic v1 inference out |
| Labels, statement facts, and uses stay encrypted | first version | Vault collection |
| Last four optional; never PAN, CVV, credentials, or payment tokens | excluded | No fields for those |
| Tracker, not a payment-instrument vault or bill-pay service | excluded | Those products are out |
| Export, restore, and lock include the additive collection | first version | Policy-union recovery plus `clearSessionState`. Old backups omit the name as zero rows. |
| #65 and #84 core journeys stay complete | first version | This PR does not reopen them |
| No card-specific rates, issuer terms, automatic recommendations, or banking integration | excluded | Parent bars them |
| Benefits stay editable facts, with source or as-of notes where useful | first version | Optional `source_note`. Statement as-of is the statement date. |
| Create, link or standalone, record, reload, undo, archive, delete | first version | Journey. Future leaves must cover it. |
| The named amounts stay visibly distinct; missing is not $0 | first version | Overview blocks |
| Deterministic paid, overdue, unknown, and period tests | first version | Test list below. Not run in this PR. |
| Month ends, leap days, anniversaries, local-day changes, edited terms, and repeat uses | first version | Pinned period cases. Uses do not erase history. |
| 390 and 1280, light and dark, keyboard, list, contrast, zoom, reduced motion, first invalid focus, conflict and retry | first version | Screen rules |
| Decoration must not hide a due date or depend on swipe or hover | first version | Text dates and real links |
| Privacy and owner-isolation tests; plaintext out of requests, logs, URLs, and `localStorage` | first version | Future tests. No blind index. |
| Lock during load or save clears content; stale responses cannot restore it | first version | Existing generation checks plus the cards subject |
| Export and restore recover every new record type | first version | Five kinds in the one collection |
| Applicable gates pass before an implementation PR | first version | Future leaves use the root gates for files they touch |
| Lead with bills, perks, or an equal overview | first version | This design chooses gallery plus attention. Benefits stay the detail, not the home. |
| Leather wallet, jewel tones, or a typographic dashboard | unresolved | Three ids exist so the choice is not dropped. Default is `paper`. The owner has not picked a lead look, and this PR does not approve art. |
| Welcome-offer progress with explicit eligible-spend rules | later candidate | Parent names it as later |
| User-confirmed transaction matching | later candidate | Separate from v1 links |
| Points balances without an assumed cash value | later candidate | v1 can record points on a benefit. A running points balance is the later choice. |
| A renewal-review note | later candidate | v1 has `source_note` and fee events, not a review workflow |
| Companion Sidequests proposal | excluded | Different parent and design. No shared records. |

## Future leaf boundaries

These are review boundaries for a later scheduling decision. They are not
queue entries. DISC-02 does not authorize them. The owner must select
implementation first. The smallest PR after that selection is boundary 1.
It has no page.

1. **Collection.** Add `cards` to `FINANCE_OWNER_COLLECTIONS` and `FINANCE_COLLECTIONS`. Decode the five kinds. Reject unknown kinds without rewriting them. Bag, `FinanceService` stream, and `clearSessionState` clear. Policy script stays green. Health still cannot decrypt the name. Synthetic export includes the name. An old backup with no `cards` member restores as zero rows. A backup with one row of each kind round-trips. No route and no Hub change.
2. **Gallery and card editor.** Route, section label, manifest, return-path rule, examples. Create, edit, archive, restore, delete. Liability and bank-account links, including missing ids. Empty, unknown, list view, 390/1280, keyboard, reduced motion, conflict, retry, lock during save. Overview says no statement and no renewal have been recorded. No benefit or statement writer yet.
3. **Statements and renewals.** Statement and fee-event editors, paid versus autopay, attention and history for those kinds only, undo paid, leap-day renewal prefill, orphan relink. Benefits still absent. Attention copy must not say a benefit is due.
4. **Benefits.** Benefit and use editors, period function, snapshot preservation, benefit attention, history estimate column, repeated uses. No points conversion and no remaining-credit math.

Each UI boundary carries the lock, owner, privacy, and revision tests for
the fields it introduces. Boundary 1 carries recovery. Do not save a fifth
leaf for a framework, a chart, or a shared form engine.

Likely files once implementation is selected:

- `apps/finance/backend/services/encrypted_storage.py`
- `apps/finance/frontend/src/app/crypto/encrypted-store.persistence.ts`
- `apps/finance/frontend/src/app/crypto/encrypted-store.service.ts`
- `apps/finance/frontend/src/app/services/finance.service.ts`
- `apps/finance/frontend/src/app/models/card.model.ts`
- `apps/finance/frontend/src/app/cards/` for the pure period and attention functions and the screens
- `apps/finance/frontend/src/app/app.routes.ts`
- `apps/finance/frontend/src/app/core/layout/finance-navigation.ts`
- `apps/web/routes.json`
- `apps/web/route-examples.json`
- `packages/ui/src/return-context.ts` and its spec
- `scripts/check_collection_policy.py` only if a declaration site drifts; the script already reads the two subsets

`public-api.ts` already exports `financeSections`. It does not need a cards
projection. `loadFinanceHubSnapshot`, `searchFinanceNames`, `computeNetWorth`,
cashflow, and trip spend stay out of boundaries 1–4.

Future tests, none of which this PR runs against an app:

- Null fee versus `0`; null statement versus a linked `$0` debt; unlinked debt copy is "No debt linked".
- Passed due date with autopay `user_reported` stays unconfirmed.
- Confirming paid removes attention; undo puts it back and clears `paid_on`.
- February month ends, the four anniversary rows above, and a use on the end date versus the next day.
- Editing a benefit does not change an older use. Two uses do not add a second fee.
- Points render as points. An estimate is not added to the nominal credit.
- Archive hides attention and leaves the liability byte-for-byte. Delete failure keeps the remaining card rows and never deletes the liability.
- Conflict keeps the draft. Lock mid-save publishes nothing and clears the screen.
- A second owner cannot read the rows. Nickname, last four, and amounts are absent from the URL, `localStorage`, logs, and request bodies other than vault ciphertext.
- Unknown kind survives export. Old backup without `cards` restores.

Representative follow-up after those four: one new optional note on a
statement touches the card codec, the statement editor, and the history
label. It does not touch net worth, bills, or routes.

## Unresolved owner choices

- Whether to implement Cards at all.
- Which appearance leads the look: `paper`, `leather`, or `jewel`. The field and the default `paper` are decided. Art approval is not.
- Whether a later Hub mention, nickname search, welcome-offer tracker, confirmed transaction match, points balance, or renewal-review note is wanted. The parent already calls those later or leaves them open. v1 does not include them.

## Machinery that must not be added

A second vault, login, crypto stack, event bus, XP ledger, plaintext card
API, image upload, issuer client, bank connection, notification worker,
points rate table, generic form engine, or prototype folder. A copy of
`balance_owed` on the card. A statement that posts cashflow. A blind index
on the last four. A chart added so the page matches the dashboard standard.
A swipe-only gallery. A queue entry created by this discovery PR.
