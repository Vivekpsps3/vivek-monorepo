export interface Transaction {
  id: number;
  date: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description?: string;
  source?: 'manual' | 'import';
  account_display?: string | null;
}

export interface ImportPreviewRow {
  dedupe_key: string;
  date: string;
  account_mask: string;
  account_display: string;
  description: string;
  category: string;
  amount: number;
  status: 'new' | 'duplicate';
}

export interface ImportRowNote {
  line: number;
  reason: string;
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

export interface JobIncome {
  id: number;
  employer: string;
  role_title?: string | null;
  pay_frequency: IncomePayFrequency;
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
  next_due_date: string;
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
  next_due_date: string;
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
  /** Blended observed activity and scheduled assumptions; not an actual-only total. */
  combined_outlook_net_cashflow: number;
  /**
   * True when both observed and scheduled income are non-zero.
   * Combined totals always sum both; if imported pay overlaps job schedules, income is double-counted.
   */
  possible_income_overlap: boolean;
  /**
   * True when both observed expenses and scheduled bills/subs are non-zero.
   * Combined expenses always sum both; reimbursed or mirrored bills can double-count.
   */
  possible_expense_overlap: boolean;
  total_income: number;
  total_expenses: number;
  net_cashflow: number;
  savings_rate: number | null;
  average_daily_spend: number;
  fixed_occurrences: CashflowOccurrence[];
  subscription_occurrences: CashflowOccurrence[];
}

export interface Holding {
  id: number;
  symbol: string;
  shares: number;
  purchase_price: number;
  purchase_date: string;
  current_price?: number;
  value?: number;
  price_source?: string;
  price_as_of?: string | null;
  account_display?: string | null;
  company_name?: string | null;
  brokerage_account_id?: number | null;
}

export interface TransactionCreate {
  date: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description?: string;
}

export interface HoldingCreate {
  symbol: string;
  shares: number;
  purchase_price: number;
  purchase_date: string;
}

export interface Asset {
  id: number;
  name: string;
  category: string;
  current_value: number;
  as_of_date: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetCreate {
  name: string;
  category: string;
  current_value: number;
  as_of_date: string;
  notes?: string;
}

export interface Liability {
  id: number;
  name: string;
  category: string;
  balance_owed: number;
  as_of_date: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiabilityCreate {
  name: string;
  category: string;
  balance_owed: number;
  as_of_date: string;
  notes?: string;
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
  avg_cost_basis: number;
  cost_basis_total: number;
  status: string;
}

export interface FidelityPreviewResult {
  broker: string;
  filename: string;
  accounts: string[];
  rows: FidelityPreviewRow[];
  summary: { accounts: number; positions: number; total_cost: number };
}

export interface FidelityCommitResult {
  accounts_replaced: number;
  holdings_replaced: number;
  inserted: number;
  accounts: string[];
}

export interface MarketPriceQuote {
  symbol: string;
  price: number;
  price_source: string;
  price_as_of?: string | null;
  valid: boolean;
}

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastPayload {
  message: string;
  kind: ToastKind;
  undo?: () => void;
}
