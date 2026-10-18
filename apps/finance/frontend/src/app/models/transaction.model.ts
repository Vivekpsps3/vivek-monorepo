export interface Transaction {
  id: number;
  date: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description?: string;
  source?: 'manual' | 'import';
  account_display?: string | null;
  /** Stable encrypted account identity, independent of its editable display name. */
  bank_account_key?: string | null;
  source_bank?: string | null;
  source_account_mask?: string | null;
  /** Existing records omit this field and retain their income/expense meaning. */
  kind?: 'purchase' | 'refund' | 'payment' | 'transfer' | 'income' | 'ambiguous_credit';
  /** User-facing merchant label. `description` always retains the source text. */
  merchant?: string | null;
  reviewed?: boolean;
  review_reason?: string | null;
  import_receipt_id?: number | null;
  import_edited?: boolean;
  /** Snapshot of the source values used to safely distinguish unchanged imports for undo. */
  import_snapshot?: Pick<Transaction, 'date' | 'type' | 'category' | 'amount' | 'description' | 'merchant' | 'kind' | 'account_display' | 'bank_account_key' | 'source_bank' | 'source_account_mask' | 'reviewed' | 'review_reason'>;
  dedupe_key?: string;
}

export interface ImportPreviewRow {
  dedupe_key: string;
  /** Original CSV name, used to replace only the corrected file in a multi-file receipt. */
  source_filename?: string;
  date: string;
  account_mask: string;
  account_display: string;
  description: string;
  category: string;
  amount: number;
  status: 'new' | 'duplicate' | 'review';
  reviewed?: boolean;
  account_key?: string;
  bank_slug?: string;
  source_account_mask?: string;
  /** Previous importer identity checked only for explicitly mapped legacy accounts. */
  legacy_dedupe_key?: string;
  kind?: Transaction['kind'];
  review_reason?: string | null;
  merchant_suggestion?: string | null;
  merchant?: string | null;
}

export interface ImportRowNote {
  line: number;
  reason: string;
  filename?: string;
  kind?: 'payment' | 'transfer' | 'other';
}

export interface ImportPreviewResult {
  bank: string;
  filename: string;
  rows: ImportPreviewRow[];
  /** Rows the importer intentionally ignored (credits, payments, non-cleared, etc.). */
  skipped: ImportRowNote[];
  /** Rows that could not be parsed (bad date, missing account) and need fixing. */
  errors: ImportRowNote[];
  summary: {
    total_parsed: number;
    new: number;
    duplicate: number;
    skipped: number;
    errors: number;
  };
}

export interface BankImportFile {
  id: number;
  bank_slug: string;
  file: File;
  account_display?: string;
  bank_account_id?: number | null;
  account_key?: string;
  account_mask_override?: string;
  new_account_label?: string;
  /** Explicitly bind matching transactions from the legacy, unassigned importer identity. */
  map_legacy_account?: boolean;
  coverage_start?: string;
  coverage_end?: string;
  confirm_coverage?: boolean;
}

export interface BankImportFilePreview {
  id: number;
  bank_slug: string;
  filename: string;
  preview: ImportPreviewResult | null;
  error: string | null;
}

export interface BankImportOption {
  slug: string;
  name: string;
  hint: string;
  file_extensions: string[];
}

export interface ImportCommitResult {
  inserted: number;
  skipped: number;
  batch_id: number;
  receipt_id?: number;
  unresolved?: number;
  coverage_start?: string | null;
  coverage_end?: string | null;
}

export interface BankAccountRecord {
  id: number;
  bank_slug: string;
  account_mask: string;
  account_key: string;
  display_name: string;
  confirmed: boolean;
}

export interface ImportReceipt {
  id: number;
  bank_slugs: string[];
  filenames: string[];
  status: 'staging' | 'staged' | 'complete' | 'partial' | 'undoing' | 'withdrawn';
  started_at: string;
  completed_at?: string | null;
  selected_rows?: ImportPreviewRow[];
  selected_row_count: number;
  inserted_count: number;
  completed_dedupe_keys?: string[];
  unresolved: ImportRowNote[];
  last_error?: string | null;
  coverage_start?: string | null;
  coverage_end?: string | null;
  account_displays: string[];
  coverage?: Array<{ account_display: string; account_key?: string; bank_account_id?: number | null; start_date: string; end_date: string; confirmed: true }>;
  undo_summary?: { removed: number; edited: number; missing: number } | null;
  undo_progress?: { removed: number; edited: number; missing: number; expected_count?: number; pending_ids?: number[] } | null;
}

export interface ImportReceiptRows {
  id: number;
  record_type: 'bank_receipt_rows';
  receipt_id: number;
  chunk_index: number;
  rows: ImportPreviewRow[];
}

export interface CategoryRenameResult {
  from_category: string;
  to_category: string;
  updated: number;
}

export interface CategoryBulkRenameResult {
  updated: number;
  renames: CategoryRenameResult[];
}

export type IncomePayFrequency =
  | 'annual'
  | 'monthly'
  | 'semimonthly'
  | 'biweekly'
  | 'weekly'
  | 'hourly';

export type PaydayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export interface JobPromotion {
  date: string;
  annual_base_pay: number;
  role_title?: string;
}

export interface JobCompensationPayment {
  date: string;
  kind: 'bonus' | 'equity' | 'other';
  amount: number;
  label?: string;
}

export interface JobStockSale {
  date: string;
  shares: number;
  /** Total proceeds are fixed when recorded and never inferred from share valuations. */
  cash_proceeds: number;
}

export interface JobStockGrant {
  date: string;
  /** A bonus or equity award paid in shares. */
  origin: 'bonus' | 'equity';
  label?: string;
  quantity: number;
  price_at_grant: number;
  sales?: JobStockSale[];
}

/** Employee-funded ESPP purchase. The purchase price is the user's contribution basis. */
export interface JobStockPurchase {
  date: string;
  label?: string;
  quantity: number;
  price_paid_per_share: number;
  /** Optional fair market price on the purchase date; missing legacy values fall back to paid price. */
  market_price_at_purchase?: number | null;
  sales?: JobStockSale[];
}

export interface JobStockValuation {
  date: string;
  price_per_share: number;
  /** Quote provider for automatic prices; absent or `manual` for user-entered valuations. */
  source?: string;
  /** Timestamp when the quote was fetched from the provider, when available. */
  price_as_of?: string | null;
  /** Date this price was observed/saved; lets a recent public quote value shares acquired after its market close. */
  observed_date?: string | null;
  /** Present for a market quote so prices from a former ticker do not mark current shares. */
  symbol?: string | null;
}

export interface JobIncome {
  id: number;
  employer: string;
  role_title?: string | null;
  pay_frequency: IncomePayFrequency;
  /** Optional dates when cash salary is paid; separate from how base_pay is entered. */
  payday_frequency?: PaydayFrequency | null;
  /** First scheduled payday; dates before this anchor are not projected. */
  first_pay_date?: string | null;
  /** Second day of month for semimonthly schedules; long months clamp to month end. */
  second_pay_day?: number | null;
  base_pay: number;
  hours_per_week?: number | null;
  annual_bonus: number;
  annual_equity: number;
  annual_other: number;
  annual_taxes: number;
  annual_deductions: number;
  taxes_per_period: number;
  deductions_per_period: number;
  /** Employment start date; retains the existing vault field name. */
  effective_date: string;
  end_date?: string | null;
  promotions?: JobPromotion[];
  compensation_payments?: JobCompensationPayment[];
  /** Optional public market ticker for employer stock. Only this symbol is sent to quote lookup. */
  stock_symbol?: string | null;
  stock_grants?: JobStockGrant[];
  stock_purchases?: JobStockPurchase[];
  stock_valuations?: JobStockValuation[];
  is_active: boolean;
  notes?: string | null;
  pay_periods_per_year: number;
  annual_base_pay: number;
  annual_gross: number;
  monthly_gross: number;
  period_gross: number;
  period_net: number;
  annual_net: number;
  monthly_net: number;
  created_at: string;
  updated_at: string;
}

export interface JobIncomeCreate {
  employer: string;
  role_title?: string;
  pay_frequency: IncomePayFrequency;
  payday_frequency?: PaydayFrequency | null;
  first_pay_date?: string | null;
  second_pay_day?: number | null;
  base_pay: number;
  hours_per_week?: number | null;
  annual_bonus: number;
  annual_equity: number;
  annual_other: number;
  annual_taxes: number;
  annual_deductions: number;
  taxes_per_period: number;
  deductions_per_period: number;
  /** Employment start date; retains the existing vault field name. */
  effective_date: string;
  end_date?: string | null;
  promotions?: JobPromotion[];
  compensation_payments?: JobCompensationPayment[];
  stock_symbol?: string | null;
  stock_grants?: JobStockGrant[];
  stock_purchases?: JobStockPurchase[];
  stock_valuations?: JobStockValuation[];
  is_active: boolean;
  notes?: string;
}

export type FixedExpenseFrequency = 'monthly' | 'annual' | 'quarterly' | 'biweekly' | 'weekly';

export interface FixedExpense {
  id: number;
  name: string;
  category: string;
  amount: number;
  frequency: FixedExpenseFrequency;
  start_date: string;
  end_date?: string | null;
  due_day?: number | null;
  autopay: boolean;
  payment_account?: string | null;
  is_active: boolean;
  notes?: string | null;
  next_due_date: string | null;
  monthly_amount: number;
  annual_amount: number;
  created_at: string;
  updated_at: string;
}

export interface FixedExpenseCreate {
  name: string;
  category: string;
  amount: number;
  frequency: FixedExpenseFrequency;
  start_date: string;
  end_date?: string | null;
  due_day?: number | null;
  autopay: boolean;
  payment_account?: string | null;
  is_active: boolean;
  notes?: string;
}

export interface Subscription {
  id: number;
  name: string;
  category: string;
  amount: number;
  frequency: FixedExpenseFrequency;
  next_bill_date: string;
  end_date?: string | null;
  payment_account?: string | null;
  is_active: boolean;
  notes?: string | null;
  next_due_date: string | null;
  monthly_amount: number;
  annual_amount: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionCreate {
  name: string;
  category: string;
  amount: number;
  frequency: FixedExpenseFrequency;
  next_bill_date: string;
  end_date?: string | null;
  payment_account?: string | null;
  is_active: boolean;
  notes?: string;
}

export interface CashflowOccurrence {
  date: string;
  name: string;
  category: string;
  amount: number;
}

export type IncomeOccurrenceKind = 'posted' | 'paycheck' | 'estimate' | 'compensation' | 'stock_sale' | 'overlap';

/** A visible source line in the monthly income total. Null dates mean timing is unknown. */
export interface IncomeCashflowOccurrence {
  id: string;
  date: string | null;
  kind: IncomeOccurrenceKind;
  label: string;
  name: string;
  detail: string;
  amount: number;
}

export interface CashflowSummary {
  start_date: string;
  end_date: string;
  transaction_income: number;
  transaction_expenses: number;
  planned_income: number;
  fixed_expenses: number;
  subscriptions: number;
  /** Imported or manually entered activity that occurred in the selected period. */
  observed_income: number;
  observed_expenses: number;
  observed_net_cashflow: number;
  /** Active recurring schedules projected into the selected period. */
  scheduled_income: number;
  scheduled_expenses: number;
  scheduled_net_cashflow: number;
  /** Same figure as net_cashflow: one cashflow, with posted rows standing in for matching bills and pay. */
  combined_outlook_net_cashflow: number;
  /** True when posted pay and job pay are close enough to count once. */
  possible_income_overlap: boolean;
  /** Negative monthly adjustment applied when posted and projected income look like the same stream. */
  income_overlap_adjustment: number;
  /** True when at least one repeating bill matched a posted transaction and was not added again. */
  possible_expense_overlap: boolean;
  total_income: number;
  /** Dated sources, undated estimates, and the aggregate overlap adjustment; sums to total_income. */
  income_occurrences: IncomeCashflowOccurrence[];
  total_expenses: number;
  net_cashflow: number;
  savings_rate: number | null;
  average_daily_spend: number;
  fixed_occurrences: CashflowOccurrence[];
  subscription_occurrences: CashflowOccurrence[];
  /** Repeating bills in the period that are not already a posted transaction. */
  counted_occurrences: CashflowOccurrence[];
}

export interface Holding {
  id: number;
  symbol: string;
  shares: number;
  purchase_price: number | null;
  purchase_date: string | null;
  current_price?: number | null;
  value?: number | null;
  price_source?: string;
  price_as_of?: string | null;
  account_display?: string | null;
  company_name?: string | null;
  brokerage_account_id?: number | null;
  cost_basis_status?: 'known' | 'provisional' | 'unknown';
  market_value?: number | null;
  quote_date?: string | null;
  position_as_of?: string | null;
  position_review_interval_days?: number | null;
  lifecycle_status?: 'staged' | 'active' | 'inactive';
  portfolio_stage_id?: number | null;
  portfolio_row_index?: number;
}

export interface TransactionCreate {
  date: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description?: string;
  kind?: Transaction['kind'];
  merchant?: string | null;
  reviewed?: boolean;
}

export interface HoldingCreate {
  symbol: string;
  shares: number;
  purchase_price: number | null;
  purchase_date: string | null;
}

export interface Asset {
  id: number;
  name: string;
  category: string;
  current_value: number;
  as_of_date: string;
  notes?: string | null;
  review_interval_days?: number | null;
  created_at: string;
  updated_at: string;
}

export interface AssetCreate {
  name: string;
  category: string;
  current_value: number;
  as_of_date: string;
  notes?: string;
  review_interval_days?: number | null;
}

export interface Liability {
  id: number;
  name: string;
  category: string;
  balance_owed: number;
  as_of_date: string;
  notes?: string | null;
  review_interval_days?: number | null;
  created_at: string;
  updated_at: string;
}

export interface LiabilityCreate {
  name: string;
  category: string;
  balance_owed: number;
  as_of_date: string;
  notes?: string;
  review_interval_days?: number | null;
}

export interface NetWorth {
  other_assets: number;
  portfolio: number;
  liabilities: number;
  total_assets: number;
  total: number;
  as_of?: string;
  portfolio_sources?: Record<string, string>;
  portfolio_breakdown?: Record<string, number>;
}


export interface FidelityImportOption {
  slug: string;
  name: string;
  hint: string;
  file_extensions: string[];
}

export interface FidelityPreviewRow {
  account_mask: string;
  account_display: string;
  symbol: string;
  shares: number;
  avg_cost_basis: number | null;
  cost_basis_total: number | null;
  market_price?: number | null;
  market_value?: number | null;
  position_as_of?: string | null;
  valuation_source?: 'reported_price' | 'derived_market_value' | 'provisional_cost_basis' | 'unavailable';
  status: string;
}

export interface FidelityPreviewResult {
  broker: string;
  filename: string;
  accounts: string[];
  rows: FidelityPreviewRow[];
  summary: { accounts: number; positions: number; total_cost: number | null; known_cost_total?: number; total_market_value?: number | null; provisional_positions?: number; unavailable_positions?: number; unknown_basis_positions?: number };
}

export interface FidelityCommitResult {
  accounts_replaced: number;
  holdings_replaced: number;
  inserted: number;
  accounts: string[];
  stage_id?: number;
  status?: 'staged' | 'activated';
}

export interface MarketPriceQuote {
  symbol: string;
  price: number;
  price_source: string;
  price_as_of?: string | null;
  /** Market trading date for the quote, separate from when it was fetched. */
  quote_date?: string | null;
  valid: boolean;
}
