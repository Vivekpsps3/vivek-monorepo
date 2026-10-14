import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { syntheticVault } from './synthetic-vault';

const today = () => new Date().toISOString().slice(0, 10);
const nativeHoverTitleSelector = 'ui-card[title], ui-page-header[title], ui-empty-state[title], nav [title], ui-button[title], button[title], a[title]';
const expectQuoteRequests = async (vault: Awaited<ReturnType<typeof syntheticVault>>, symbols: string[]) => {
  await expect.poll(() => vault.quoteRequests.map(symbol => symbol.toUpperCase()).sort()).toEqual([...symbols].sort());
};
const expectHoldingPrice = async (vault: Awaited<ReturnType<typeof syntheticVault>>, symbol: string, price: number) => {
  await expect.poll(() => vault.data('holdings').find(row => row.symbol.toUpperCase() === symbol.toUpperCase())?.current_price)
    .toBe(price);
};
const seed = () => ({
  assets: [{ id: 10, name: 'Checking', category: 'cash', current_value: 1000, as_of_date: '2026-01-01' }],
  liabilities: [{ id: 11, name: 'Card balance', category: 'credit_card', balance_owed: 100, as_of_date: '2026-01-01' }],
  holdings: [{ id: 12, symbol: 'VOO', shares: 1, purchase_price: 80, purchase_date: '2026-01-01', current_price: 100, price_source: 'manual' }],
  transactions: [
    { id: 20, date: today(), type: 'expense', kind: 'purchase', category: 'Food', amount: 100, description: 'SOURCE GROCERY', merchant: 'Grocery' },
    { id: 21, date: today(), type: 'expense', kind: 'refund', category: 'Food', amount: 25, description: 'SOURCE REFUND', merchant: 'Grocery' },
    { id: 22, date: today(), type: 'income', kind: 'income', category: 'Salary', amount: 200, description: 'Paycheck' },
    { id: 23, date: today(), type: 'expense', kind: 'payment', category: 'Card', amount: 500, description: 'AUTOPAY PAYMENT' },
    { id: 24, date: today(), type: 'income', kind: 'ambiguous_credit', category: 'Unresolved', amount: 30, description: 'UNKNOWN CREDIT' },
  ],
});

function spendingPlanSeed(gap = false) {
  const now = new Date();
  const periods = Array.from({ length: 3 }, (_, index) => {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3 + index, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
  });
  return {
    bank_accounts: [{ id: 40, bank_slug: 'chase', account_mask: 'card', account_key: 'card', display_name: 'Daily card', confirmed: true }],
    import_batches: periods.map((period, index) => ({
      id: 50 + index, record_type: 'bank_receipt', bank_slugs: ['chase'], filenames: [`month-${index}.csv`],
      status: 'complete', started_at: period.start, completed_at: period.end, selected_row_count: 2,
      inserted_count: 2, unresolved: [], account_displays: ['Daily card'],
      coverage: [{ account_key: 'card', account_display: 'Daily card', confirmed: true,
        start_date: gap && index === 1 ? period.start.slice(0, 8) + '02' : period.start, end_date: period.end }],
    })),
    transactions: periods.flatMap((period, index) => [
      { id: 60 + index * 2, date: period.start, type: 'expense', kind: 'purchase', category: 'Food', amount: 30, description: 'Covered groceries', bank_account_key: 'card' },
      { id: 61 + index * 2, date: period.start, type: 'expense', kind: 'refund', category: 'Food', amount: 3, description: 'Covered refund', bank_account_key: 'card' },
    ]),
    fixed_expenses: [{ id: 80, name: 'Fixed commitment', category: 'utilities', amount: 10, frequency: 'monthly', start_date: periods[0].start, is_active: true }],
  };
}

function dateAtOffset(date: Date, offset: number, day: number): string {
  const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
  const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  return `${month.toISOString().slice(0, 7)}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function shiftIsoDate(value: string, days: number): string {
  const shifted = new Date(`${value}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function legacyChaseDedupeKey(date: string, amount: number, description: string): string {
  const normalizedDescription = description.trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedAmount = (Math.round(amount * 100) / 100).toFixed(2);
  return createHash('sha256')
    .update(['chase', 'chase', date, normalizedAmount, normalizedDescription].join('|'))
    .digest('hex');
}

test('empty vault supports keyboard transaction entry and a failed save can be retried', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/spending?t=activity');
  const add = page.getByRole('button', { name: 'Add transaction', exact: true });
  await expect(add).toBeVisible();
  await add.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Add transaction' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Date', { exact: true })).toBeFocused();
  await dialog.getByLabel('Category', { exact: true }).fill('Food');
  await dialog.getByLabel('Amount', { exact: true }).fill('12.50');
  await dialog.getByLabel('Description (optional)', { exact: true }).fill('Keyboard purchase');
  vault.failNextWrites();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect.poll(() => vault.mutations.length).toBe(1);
  expect(vault.data('transactions')).toHaveLength(0);
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(vault.data('transactions')).toHaveLength(1);
  expect(vault.data('transactions')[0].description).toBe('Keyboard purchase');
  expect(vault.mutations.every(change => !JSON.stringify(change.body).includes('Keyboard purchase'))).toBe(true);
  await vault.reload();
  await expect(page.getByText('Keyboard purchase', { exact: true }).first()).toBeVisible();
});

test('recorded totals count refunds and exclude payments and unresolved credits on Home, Activity and Calendar', async ({ page }) => {
  const vault = await syntheticVault(page, seed());
  await vault.open('/');
  await expectQuoteRequests(vault, ['VOO']);
  await expectHoldingPrice(vault, 'VOO', 125);
  const activity = page.locator('.home-tile').filter({ hasText: 'This month' });
  await expect(activity).toContainText('$200.00');
  await expect(activity).toContainText('$75.00');
  await expect(page.locator('.home-tile').filter({ hasText: 'What you have' })).toContainText('$1,025.00');
  await vault.open('/spending?t=activity');
  await expect(page.locator('.month-total--expense')).toContainText('$75.00');
  await expect(page.locator('.month-total--income')).toContainText('$200.00');
  await vault.open('/spending?t=calendar');
  await expect(page.locator('.month-total--expense')).toContainText('$75.00');
  await expect(page.locator('.month-totals')).toContainText('$200.00');
  expect(vault.data('holdings')[0].current_price).toBe(125);
  expect(vault.data('holdings')[0].quote_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(vault.data('holdings')[0].quote_date! <= today()).toBe(true);
  expect(vault.data('assets')[0].current_value).toBe(1000);
  expect(vault.data('holdings')[0].shares).toBe(1);
});

test('Spending opens on Activity without review controls and Home has no review queue', async ({ page }) => {
  const oldDate = shiftIsoDate(today(), -45);
  const vault = await syntheticVault(page, {
    assets: [{ id: 10, name: 'Checking', category: 'cash', current_value: 1000, as_of_date: oldDate }],
    liabilities: [{ id: 11, name: 'Card balance', category: 'credit_card', balance_owed: 100, as_of_date: oldDate }],
    transactions: [{ id: 20, date: today(), type: 'expense', kind: 'purchase', category: 'Food', amount: 20,
      description: 'Older card record', reviewed: false }],
  });

  await vault.open('/spending');
  await expect(page.getByRole('link', { name: 'Activity', exact: true })).toHaveClass(/on/);
  await expect(page.locator('app-transactions')).toBeVisible();
  await expect(page.locator(nativeHoverTitleSelector)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Review', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /review/i })).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Older card record' })).toContainText('$20.00');

  await vault.open('/');
  await expect(page.locator('.review-queue-card')).toHaveCount(0);
  await expect(page.locator(nativeHoverTitleSelector)).toHaveCount(0);
  await expect(page.locator('.home-tile').filter({ hasText: 'What you have' })).toContainText('$900.00');
  expect(vault.data('transactions')[0]).toMatchObject({ description: 'Older card record', amount: 20 });

  await vault.open('/planning');
  await expect(page.locator(nativeHoverTitleSelector)).toHaveCount(0);
});

test('Charts switch between recorded totals and scheduled commitments without changing financial records', async ({ page }) => {
  const now = new Date();
  const monthStart = dateAtOffset(now, 0, 1);
  const vault = await syntheticVault(page, {
    ...seed(),
    fixed_expenses: [{ id: 80, name: 'Monthly bill', category: 'Utilities', amount: 10, frequency: 'monthly',
      start_date: monthStart, due_day: 1, autopay: true, payment_account: 'Checking', is_active: true }],
    subscriptions: [{ id: 81, name: 'Annual subscription', category: 'Software', amount: 120, frequency: 'annual',
      next_bill_date: today(), payment_account: 'Card', is_active: true }],
  });
  const initialData = {
    assets: vault.data('assets'),
    liabilities: vault.data('liabilities'),
    holdings: vault.data('holdings'),
    transactions: vault.data('transactions'),
  };
  await vault.open('/');
  await expectQuoteRequests(vault, ['VOO']);
  await expectHoldingPrice(vault, 'VOO', 125);
  await expect(page.locator('.home-tile').filter({ hasText: 'What you have' })).toContainText('$1,025.00');
  const refreshedData = {
    assets: vault.data('assets'),
    liabilities: vault.data('liabilities'),
    holdings: vault.data('holdings'),
    transactions: vault.data('transactions'),
  };
  const quoteRequestCount = vault.quoteRequests.length;
  const mutationCount = vault.mutations.length;

  const charts = page.locator('app-charts');
  const recorded = charts.locator('.chart-note');
  await expect(charts.getByRole('button', { name: 'Recorded', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(recorded).toContainText('Income $200.00');
  await expect(recorded).toContainText('Spending $75.00');

  await charts.getByRole('button', { name: 'Scheduled', exact: true }).click();
  await expect(charts.locator('.chart-note')).toContainText('Income $0.00');
  await expect(charts.locator('.chart-note')).toContainText('Spending $130.00');
  await charts.getByText('Data', { exact: true }).click();
  const currentMonthRow = charts.getByRole('table', { name: 'Monthly cashflow data table' }).getByRole('row').last();
  await expect(currentMonthRow).toContainText('$130.00');
  expect(vault.mutations).toHaveLength(mutationCount);
  expect(vault.quoteRequests).toHaveLength(quoteRequestCount);
  expect(vault.data('assets')).toEqual(refreshedData.assets);
  expect(vault.data('liabilities')).toEqual(refreshedData.liabilities);
  expect(vault.data('holdings')).toEqual(refreshedData.holdings);
  expect(vault.data('transactions')).toEqual(refreshedData.transactions);
  expect(refreshedData).not.toEqual(initialData);
});

test('Upcoming commitments are date sorted and show account, autopay and frequency', async ({ page }) => {
  const soon = shiftIsoDate(today(), 2);
  const later = shiftIsoDate(today(), 5);
  const vault = await syntheticVault(page, {
    fixed_expenses: [{ id: 80, name: 'Internet bill', category: 'Utilities', amount: 60, frequency: 'monthly',
      start_date: later, due_day: null, autopay: false, payment_account: 'Everyday checking', is_active: true }],
    subscriptions: [{ id: 81, name: 'Cloud storage', category: 'Software', amount: 120, frequency: 'annual',
      next_bill_date: soon, payment_account: 'Travel card', is_active: true }],
  });
  await vault.open('/recurring?t=spend');

  const commitments = page.getByRole('table', { name: 'Bills and subscriptions' });
  const rows = commitments.getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('Cloud storage');
  await expect(rows.nth(1)).toContainText('Travel card');
  await expect(rows.nth(1)).toContainText('Not recorded');
  await expect(rows.nth(1)).toContainText('Annual');
  await expect(rows.nth(1)).toContainText('$120.00');
  await expect(rows.nth(2)).toContainText('Internet bill');
  await expect(rows.nth(2)).toContainText('Everyday checking');
  await expect(rows.nth(2)).toContainText('Manual');
  await expect(rows.nth(2)).toContainText('Monthly');
  await expect(rows.nth(2)).toContainText('$60.00');
});

test('Calendar keeps its selected date when opening Add transaction', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/spending?t=calendar');
  const selected = `${today().slice(0, 8)}05`;
  await page.getByRole('gridcell', { name: selected, exact: true }).click();
  await page.getByRole('link', { name: 'Add transaction', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add transaction' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Date', { exact: true })).toHaveValue(selected);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('summaries include transactions beyond 5,000 while visible rows remain paginated', async ({ page }) => {
  test.setTimeout(60_000);
  const rows = Array.from({ length: 5_101 }, (_, index) => ({
    id: index + 1, date: today(), type: 'expense', category: 'Food', amount: 1,
    description: `Purchase ${index}`,
  }));
  const vault = await syntheticVault(page, { transactions: rows });
  await vault.open('/');
  await expect(page.locator('.home-tile').filter({ hasText: 'This month' })).toContainText('$5,101.00', { timeout: 30_000 });
  await vault.open('/spending?t=activity');
  await expect(page.locator('.month-total--expense')).toContainText('$5,101.00', { timeout: 30_000 });
  expect(await page.locator('tbody tr').count()).toBeLessThan(5_101);
});

test('legacy spending links translate to Activity filters and five navigation hubs remain accessible', async ({ page }) => {
  const vault = await syntheticVault(page, seed());
  await vault.open('/spending?t=pay');
  await expect(page.getByRole('navigation', { name: 'Spending sections', exact: true })).toContainText('Activity');
  await expect(page.getByRole('button', { name: 'Income', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await vault.open('/spending?t=spend');
  await expect(page.getByRole('button', { name: 'Spending', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await vault.open('/planning');
  await expect(page.getByRole('navigation', { name: 'Planning', exact: true })).toContainText('Retirement & goals');
  await expect(page.getByRole('navigation', { name: 'Planning', exact: true })).toContainText('Portfolio projection');
  await expect(page.getByRole('navigation', { name: 'Planning', exact: true })).toContainText('Stock research');
});

test('planning accepts only covered selected spending and persists its composition without changing actual balances', async ({ page }) => {
  const vault = await syntheticVault(page, { ...spendingPlanSeed(), assets: seed().assets });
  await vault.open('/planning');
  await page.getByLabel('Spending basis', { exact: true }).selectOption('components');
  await expect(page.getByLabel('Fixed annual spending', { exact: true })).toHaveValue('120');
  await page.getByLabel('Irregular annual spending', { exact: true }).fill('600');
  await page.getByText('Suggest variable spending from the last three completed months', { exact: true }).click();
  await page.getByLabel('Select account Daily card', { exact: true }).check();
  await page.getByLabel('Select category Food', { exact: true }).check();
  await expect(page.locator('.spending-suggestion-result')).toContainText('$324');
  expect(vault.data('planning_profiles')).toHaveLength(0);
  await expect(page.getByLabel('Variable annual spending', { exact: true })).toHaveValue('0');
  vault.failWriteIn('planning_profiles');
  await page.getByRole('button', { name: 'Accept spending suggestion', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Accept spending suggestion', exact: true })).toBeEnabled();
  expect(vault.data('planning_profiles')).toHaveLength(0);
  await expect(page.getByLabel('Variable annual spending', { exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: 'Accept spending suggestion', exact: true }).click();
  await expect(page.getByLabel('Variable annual spending', { exact: true })).toHaveValue('324');
  await expect(page.getByLabel('Composed annual spending', { exact: true })).toContainText('$1,044');
  const stored = vault.data('planning_profiles')[0];
  const payload = typeof stored.payload_json === 'string' ? JSON.parse(stored.payload_json) : stored.payload;
  expect(payload.spending_mode).toBe('components');
  expect(payload.spending_components).toMatchObject({ fixed_annual: 120, variable_annual: 324, irregular_annual: 600 });
  expect(payload.spending_acceptance).toBeTruthy();
  expect(vault.data('assets')[0].current_value).toBe(1000);
  expect(vault.data('transactions')).toHaveLength(6);
});

test('a coverage gap prevents a planning estimate and preserves a legacy manual profile', async ({ page }) => {
  const vault = await syntheticVault(page, { ...spendingPlanSeed(true), planning_profiles: [{
    id: 90, name: 'Legacy manual plan', base_currency: 'USD', payload_json: JSON.stringify({ annual_spending: 7777 }),
  }] });
  await vault.open('/planning?t=path&tool=simulation');
  await expect(page.getByLabel('Planning question', { exact: true })).toHaveValue('simulation');
  await page.getByRole('combobox', { name: 'Load saved inputs', exact: true }).selectOption('90');
  await expect(page.getByLabel('Spending basis', { exact: true })).toHaveValue('manual');
  await expect(page.getByLabel('Manual annual spending', { exact: true })).toHaveValue('7777');
  await page.getByText('Suggest variable spending from the last three completed months', { exact: true }).click();
  await page.getByLabel('Select account Daily card', { exact: true }).check();
  await page.getByLabel('Select category Food', { exact: true }).check();
  await expect(page.getByText(/Coverage is incomplete/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept spending suggestion', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Manual annual spending', { exact: true })).toHaveValue('7777');
  expect(JSON.parse(vault.data('planning_profiles')[0].payload_json).annual_spending).toBe(7777);
});

test('Fidelity market values survive an interrupted replacement and explicit refresh follows automatic entry quotes', async ({ page }) => {
  const initial = seed();
  const vault = await syntheticVault(page, {
    ...initial,
    brokerage_accounts: [{ id: 30, broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: 'Z111', label: 'Fidelity ···Z111' }],
    holdings: [{ ...initial.holdings[0], brokerage_account_id: 30, account_display: 'Fidelity ···Z111' }],
  });
  await vault.open('/have?t=holdings');
  await expectQuoteRequests(vault, ['VOO']);
  await expectHoldingPrice(vault, 'VOO', 125);
  await page.getByRole('button', { name: 'Import from Fidelity', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Import from Fidelity/ });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'positions.csv', mimeType: 'text/csv', buffer: Buffer.from(
      'Account Number,Account Name,Symbol,Quantity,Average Cost Basis,Last Price,Current Value\nZ111,Individual,VOO,2,80,120,240\nZ111,Individual,SPAXX,100,,1,100\n'
    ),
  });
  await dialog.getByRole('button', { name: /Preview/ }).click();
  await expect(dialog.getByRole('table', { name: 'Fidelity import preview' })).toContainText('$240');
  expect(vault.quoteRequests.map(symbol => symbol.toUpperCase())).toEqual(['VOO']);
  vault.failWriteIn('holdings');
  await dialog.getByRole('button', { name: 'Confirm Replace', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Replace Fidelity holdings?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Confirm Replace', exact: true }).click();
  await expect.poll(() => vault.data('import_batches').filter(row => row.record_type === 'holding_stage').length).toBe(1);
  expect(vault.data('holdings')).toHaveLength(1);
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await expect(page.locator('.home-tile').filter({ hasText: 'What you have' })).toContainText('$1,025.00');
  await vault.open('/have?t=holdings');
  await page.getByRole('button', { name: /Resume/ }).first().click();
  await expect(page.locator('.summary-card')).toContainText('$340.00');
  await expect(page.locator('app-portfolio')).toContainText(/unavailable|unknown/i);
  expect(vault.quoteRequests.map(symbol => symbol.toUpperCase())).toEqual(['VOO']);
  await page.getByRole('button', { name: 'Refresh all share prices', exact: true }).click();
  await expect.poll(() => vault.quoteRequests.slice(1).map(symbol => symbol.toUpperCase()).sort()).toEqual(['SPAXX', 'VOO']);
  await expect(page.locator('.summary-card')).toContainText('$12,750.00');
  expect(vault.data('assets')[0].current_value).toBe(1000);
  for (const holding of vault.data('holdings')) {
    expect(holding.quote_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(holding.quote_date! <= today()).toBe(true);
    expect(holding.position_as_of ?? null).toBeNull();
  }
});

test('mapping a legacy Chase transaction is opt-in and keeps a later identical row in a new account', async ({ page }) => {
  const date = '2026-10-01';
  const description = 'SOURCE LEGACY COFFEE';
  const legacy = {
    id: 70, date, type: 'expense', category: 'Food', amount: 10, description,
    merchant: 'Coffee shop', source: 'import',
    dedupe_key: legacyChaseDedupeKey(date, 10, description),
  };
  const vault = await syntheticVault(page, {
    bank_accounts: [{ id: 40, bank_slug: 'chase', account_mask: 'chase', account_key: 'chase-account-a',
      display_name: 'Chase account A', confirmed: true }],
    transactions: [legacy],
  });
  const preservedTransactionFields = {
    date: legacy.date, type: legacy.type, category: legacy.category, amount: legacy.amount,
    description: legacy.description, merchant: legacy.merchant,
  };
  const csv = Buffer.from([
    'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
    `${date},${date},${description},Food,Sale,-10,`,
  ].join('\n'));
  await vault.open('/spending?t=imports');

  const importButton = page.getByRole('button', { name: 'Import from bank', exact: true });
  await importButton.click();
  let dialog = page.getByRole('dialog', { name: 'Import from bank', exact: true });
  await dialog.locator('input[type=file]').setInputFiles({ name: 'legacy.csv', mimeType: 'text/csv', buffer: csv });
  await dialog.getByLabel('Bank for legacy.csv', { exact: true }).selectOption('chase');
  await dialog.getByRole('combobox', { name: /Account identity for this file/ }).selectOption('40');
  const mapping = dialog.getByLabel('Map matching legacy transactions to this account', { exact: true });
  await expect(mapping).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await expect(dialog.locator('.import-file-preview')).toContainText('1 new · 0 duplicate');
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(mapping).toBeVisible();
  await mapping.check();
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await expect(dialog.locator('.import-file-preview')).toContainText('0 new · 1 duplicate');
  const mapAction = dialog.getByRole('button', { name: 'Map 1 legacy transaction(s)', exact: true });
  await expect(mapAction).toBeEnabled();
  await mapAction.click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => vault.data('transactions').find(row => row.id === legacy.id)?.bank_account_key).toBe('chase-account-a');
  expect(vault.data('transactions')).toHaveLength(1);
  expect(vault.data('transactions')[0]).toMatchObject({
    ...preservedTransactionFields,
    bank_account_key: 'chase-account-a',
    account_display: 'Chase account A',
    source_bank: 'chase',
    source_account_mask: 'chase',
  });
  expect(vault.data('transactions')[0].kind).toBeUndefined();

  await importButton.click();
  dialog = page.getByRole('dialog', { name: 'Import from bank', exact: true });
  await dialog.locator('input[type=file]').setInputFiles({ name: 'fresh-account.csv', mimeType: 'text/csv', buffer: csv });
  await dialog.getByLabel('Bank for fresh-account.csv', { exact: true }).selectOption('chase');
  await dialog.getByLabel('Account name', { exact: true }).fill('Chase account B');
  await expect(dialog.getByLabel('Map matching legacy transactions to this account', { exact: true })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await expect(dialog.locator('.import-file-preview')).toContainText('1 new · 0 duplicate');
  await dialog.getByRole('button', { name: 'Import 1 transaction(s)', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => vault.data('transactions').length).toBe(2);

  const mappedLegacy = vault.data('transactions').find(row => row.id === legacy.id)!;
  const freshAccountRow = vault.data('transactions').find(row => row.id !== legacy.id)!;
  expect(mappedLegacy).toMatchObject({
    ...preservedTransactionFields,
    bank_account_key: 'chase-account-a',
    account_display: 'Chase account A',
  });
  expect(mappedLegacy.kind).toBeUndefined();
  expect(freshAccountRow).toMatchObject({
    date, type: 'expense', category: 'Food', amount: 10, description,
    bank_account_key: expect.not.stringMatching(/^chase-account-a$/),
    account_display: 'Chase account B',
    kind: 'purchase',
  });
});

test('bank imports require account identity, resume one receipt, and undo retains edited records', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/spending?t=imports');
  await page.getByRole('button', { name: 'Import from bank', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from bank', exact: true });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'statement.csv', mimeType: 'text/csv', buffer: Buffer.from(
      `Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n${today()},${today()},SOURCE COFFEE,Food,Sale,-10,\n${today()},${today()},SOURCE BOOK,Shopping,Sale,-20,\n${today()},${today()},MISC CREDIT,Uncategorized,Credit,5,\n`
    ),
  });
  await dialog.getByLabel('Bank for statement.csv', { exact: true }).selectOption('chase');
  await expect(dialog.getByRole('button', { name: 'Preview all files', exact: true })).toBeDisabled();
  await dialog.getByLabel('Account name', { exact: true }).fill('Daily card');
  await dialog.getByLabel('From', { exact: true }).fill(`${today().slice(0, 8)}01`);
  await dialog.getByLabel('Through', { exact: true }).fill(today());
  await dialog.getByLabel("I confirm these dates are the statement's covered period").check();
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await expect(dialog).toContainText('MISC CREDIT');
  vault.failWriteIn('transactions', 2);
  await dialog.getByRole('button', { name: /^Import .*transaction/ }).click();
  await expect.poll(() => vault.data('transactions').length).toBe(1);
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await vault.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(() => vault.data('transactions').length).toBe(3);
  expect(new Set(vault.data('transactions').map(row => row.import_receipt_id)).size).toBe(1);
  const credit = vault.data('transactions').find(row => row.description === 'MISC CREDIT');
  expect(credit?.kind).toBe('ambiguous_credit');
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  const historyRow = page.getByRole('row').filter({ hasText: 'SOURCE COFFEE' });
  await historyRow.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit transaction' });
  await editor.getByLabel('Merchant (optional)', { exact: true }).fill('Coffee shop');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByRole('link', { name: 'Imports', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('dialog', { name: 'Undo this import?' }).getByRole('button', { name: 'Undo import', exact: true }).click();
  await expect.poll(() => vault.data('transactions').length).toBe(1);
  expect(vault.data('transactions')[0].merchant).toBe('Coffee shop');
  expect(vault.data('transactions')[0].description).toBe('SOURCE COFFEE');
  const receipt = vault.data('import_batches').find(row => row.status === 'withdrawn');
  expect(receipt?.coverage?.length ?? 0).toBe(0);
  expect(receipt?.undo_summary?.edited).toBe(1);
});

test('phone Activity rows expand with the original description and keyboard access', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const vault = await syntheticVault(page, seed());
  await vault.open('/spending?t=activity');
  const row = page.locator('details').filter({ hasText: 'SOURCE GROCERY' });
  await expect(row).toBeVisible();
  await expect(row.getByText('SOURCE GROCERY', { exact: true })).toBeHidden();
  await row.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(row.getByText('SOURCE GROCERY', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/finance-activity-mobile.png', fullPage: true });
});
