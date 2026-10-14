import { createHash } from 'node:crypto';
import { test, expect, Page } from '@playwright/test';
import { syntheticVault } from './synthetic-vault';

const today = () => new Date().toISOString().slice(0, 10);

function legacyChaseDedupeKey(date: string, amount: number, description: string): string {
  const normalizedDescription = description.trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedAmount = (Math.round(amount * 100) / 100).toFixed(2);
  return createHash('sha256')
    .update(['chase', 'chase', date, normalizedAmount, normalizedDescription].join('|'))
    .digest('hex');
}

async function expectQuoteRequests(vault: Awaited<ReturnType<typeof syntheticVault>>, symbols: string[]) {
  await expect.poll(() => vault.quoteRequests.map(symbol => symbol.toUpperCase()).sort()).toEqual([...symbols].sort());
}

async function enterVault(page: Page) {
  await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill('Synthetic finance test passphrase');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/');
}

function profilePayload(vault: Awaited<ReturnType<typeof syntheticVault>>) {
  const row = vault.data('planning_profiles')[0];
  const raw = row?.payload_json ?? row?.payload;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

test('unlock refreshes each unique holding and former-employer ticker once, applying one dated quote to every match', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 1000, as_of_date: '2026-10-01' }],
    liabilities: [{ id: 2, name: 'Card', category: 'credit_card', balance_owed: 100, as_of_date: '2026-10-01' }],
    holdings: [
      { id: 10, symbol: 'VOO', shares: 1, purchase_price: 80, purchase_date: '2022-01-01', current_price: 100, price_source: 'manual', position_as_of: '2026-10-10' },
      { id: 11, symbol: ' VOO ', shares: 2, purchase_price: 90, purchase_date: '2023-01-01', current_price: 110, price_source: 'manual', position_as_of: '2026-10-11' },
    ],
    job_incomes: [{
      id: 20, employer: 'Former employer', role_title: 'Engineer', pay_frequency: 'annual', base_pay: 120000,
      annual_bonus: 0, annual_equity: 0, annual_other: 0, annual_taxes: 30000, annual_deductions: 0,
      taxes_per_period: 0, deductions_per_period: 0, effective_date: '2020-01-01', end_date: '2024-12-31',
      stock_symbol: 'voo', stock_valuations: [{ date: '2026-10-08', price_per_share: 90, source: 'manual' }],
      is_active: false, pay_periods_per_year: 1, annual_base_pay: 120000,
    }],
  });

  await vault.open('/');
  await expectQuoteRequests(vault, ['VOO']);
  await expect.poll(() => vault.data('holdings').filter(row => row.symbol.trim().toUpperCase() === 'VOO').every(row => row.current_price === 125))
    .toBe(true);
  await expect.poll(() => vault.data('job_incomes')[0]?.stock_valuations?.some((row: any) => row.price_per_share === 125 && row.symbol === 'VOO'))
    .toBe(true);
  await expect(page.locator('.market-banner')).toHaveCount(0);
  await expect(page.locator('.home-tile').filter({ hasText: 'What you have' })).toContainText('$1,275.00');

  expect(vault.quoteRequestDetails).toEqual([{ symbol: 'VOO', refresh: true }]);
  expect(vault.data('holdings')).toHaveLength(2);
  expect(vault.data('holdings')[0]).toMatchObject({ shares: 1, purchase_price: 80, position_as_of: '2026-10-10', current_price: 125 });
  expect(vault.data('holdings')[1]).toMatchObject({ shares: 2, purchase_price: 90, position_as_of: '2026-10-11', current_price: 125 });
  const quoteDate = vault.data('holdings')[0].quote_date;
  expect(quoteDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(quoteDate <= today()).toBe(true);
  const job = vault.data('job_incomes')[0];
  expect(job).toMatchObject({ employer: 'Former employer', end_date: '2024-12-31', base_pay: 120000, stock_symbol: 'voo' });
  expect(job.stock_valuations).toHaveLength(2);
  expect(job.stock_valuations.find((row: any) => row.date === quoteDate)).toMatchObject({ price_per_share: 125, symbol: 'VOO' });
  expect(vault.data('assets')[0].current_value).toBe(1000);
  expect(vault.data('liabilities')[0].balance_owed).toBe(100);
});

test('a partial quote failure retains saved prices and position facts while Home recalculates from successful quotes', async ({ page }) => {
  const originalAssets = [{ id: 1, name: 'Checking', category: 'cash', current_value: 1000, as_of_date: '2026-10-01' }];
  const originalLiabilities = [{ id: 2, name: 'Card', category: 'credit_card', balance_owed: 100, as_of_date: '2026-10-01' }];
  const originalTransactions = [{ id: 3, date: today(), type: 'expense', kind: 'purchase', category: 'Food', amount: 40, description: 'Grocery' }];
  const originalHoldings = [
    { id: 10, symbol: 'VOO', shares: 1, purchase_price: 80, purchase_date: '2022-01-01', current_price: 100, price_source: 'manual', position_as_of: '2026-10-10' },
    { id: 11, symbol: 'AAPL', shares: 2, purchase_price: 20, purchase_date: '2023-01-01', current_price: 50, price_source: 'manual', quote_date: '2026-10-08', position_as_of: '2026-10-11' },
  ];
  const vault = await syntheticVault(page, {
    assets: originalAssets, liabilities: originalLiabilities, transactions: originalTransactions, holdings: originalHoldings,
  });
  vault.failQuote('AAPL');

  await vault.open('/');
  await expectQuoteRequests(vault, ['AAPL', 'VOO']);
  await expect.poll(() => vault.data('holdings').find(row => row.symbol === 'VOO')?.current_price).toBe(125);
  await expect(page.locator('.market-banner')).toContainText('AAPL');
  await expect(page.locator('.market-banner')).toContainText('Saved prices remain available');
  await expect(page.locator('.home-tile').filter({ hasText: 'What you have' })).toContainText('$1,125.00');

  expect(vault.data('holdings').find(row => row.symbol === 'AAPL')).toMatchObject({
    shares: 2, purchase_price: 20, current_price: 50, price_source: 'manual', quote_date: '2026-10-08', position_as_of: '2026-10-11',
  });
  expect(vault.data('assets')).toEqual(originalAssets);
  expect(vault.data('liabilities')).toEqual(originalLiabilities);
  expect(vault.data('transactions')).toEqual(originalTransactions);
  expect(vault.mutations.every(change => change.body.records.every((row: any) => row.collection === 'holdings'))).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/finance-ux-partial-quotes.png', fullPage: true });
});

test('a manual holding quote action uses the shared quote path and leaves balance-sheet and position facts alone', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 1000, as_of_date: '2026-10-01' }],
    liabilities: [{ id: 2, name: 'Card', category: 'credit_card', balance_owed: 100, as_of_date: '2026-10-01' }],
    holdings: [{ id: 10, symbol: 'VOO', shares: 3, purchase_price: 80, purchase_date: '2022-01-01', current_price: 100, price_source: 'manual', position_as_of: '2026-10-10' }],
  });
  await vault.open('/have?t=holdings');
  await expectQuoteRequests(vault, ['VOO']);
  await expect.poll(() => vault.data('holdings')[0]?.current_price).toBe(125);
  const original = vault.data('holdings')[0];
  vault.setQuote('VOO', { price: 130 });

  await page.getByRole('button', { name: 'Refresh price for VOO', exact: true }).click();
  await expect.poll(() => vault.quoteRequests.length).toBe(2);
  await expect.poll(() => vault.data('holdings')[0]?.current_price).toBe(130);

  expect(vault.quoteRequestDetails).toEqual([
    { symbol: 'VOO', refresh: true }, { symbol: 'VOO', refresh: true },
  ]);
  expect(vault.data('holdings')[0]).toMatchObject({
    shares: original.shares, purchase_price: original.purchase_price,
    purchase_date: original.purchase_date, position_as_of: original.position_as_of, current_price: 130,
  });
  expect(vault.data('assets')[0].current_value).toBe(1000);
  expect(vault.data('liabilities')[0].balance_owed).toBe(100);
});

test('the legacy compensation link opens one canonical Jobs & pay editor with read-only dated history', async ({ page }) => {
  const vault = await syntheticVault(page, {
    job_incomes: [{
      id: 20, employer: 'Former employer', role_title: 'Engineer', pay_frequency: 'annual', base_pay: 120000,
      annual_bonus: 0, annual_equity: 0, annual_other: 0, annual_taxes: 30000, annual_deductions: 0,
      taxes_per_period: 0, deductions_per_period: 0, effective_date: '2020-01-01', end_date: '2024-12-31',
      compensation_payments: [{ date: '2024-12-15', kind: 'bonus', label: 'Retention bonus', amount: 5000 }],
      is_active: false, pay_periods_per_year: 1, annual_base_pay: 120000,
    }],
  });

  await vault.open('/planning?t=compensation&start=2024-01-01&end=2024-12-31');
  await expect(page).toHaveURL(/\/recurring\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get('t')).toBe('pay');
  expect(url.searchParams.get('history')).toBe('1');
  expect(url.searchParams.get('start')).toBe('2024-01-01');
  expect(url.searchParams.get('end')).toBe('2024-12-31');
  await expect(page.getByRole('link', { name: 'Jobs & pay', exact: true })).toHaveClass(/on/);
  await expect(page.locator('app-income').getByRole('heading', { name: 'Jobs and pay', exact: true })).toBeVisible();
  await expect(page.locator('app-income')).toHaveCount(1);
  await expect(page.locator('app-income').getByRole('button', { name: 'Add job', exact: true })).toBeVisible();
  await expect(page.locator('details.compensation-history')).toHaveAttribute('open', '');

  const report = page.locator('app-compensation-report');
  await expect(report).toContainText('Former employer');
  await expect(report.getByRole('row').filter({ hasText: 'Former employer' })).toContainText('$5,000.00');
  await expect(report.getByLabel('From (blank for all history)', { exact: true })).toHaveValue('2024-01-01');
  await expect(report.getByLabel('Through', { exact: true })).toHaveValue('2024-12-31');
  await expect(report.getByRole('button', { name: /Edit|Add job/ })).toHaveCount(0);
  expect(vault.data('job_incomes')[0].compensation_payments).toEqual([
    expect.objectContaining({ date: '2024-12-15', kind: 'bonus', label: 'Retention bonus', amount: 5000 }),
  ]);
});

test('one combined commitments list hands off to bill editing and keeps a failed save retryable', async ({ page }) => {
  const assets = [{ id: 1, name: 'Checking', category: 'cash', current_value: 1000, as_of_date: '2026-10-01' }];
  const transactions = [{ id: 3, date: today(), type: 'expense', kind: 'purchase', category: 'Food', amount: 40, description: 'Grocery' }];
  const vault = await syntheticVault(page, {
    assets,
    transactions,
    fixed_expenses: [{ id: 80, name: 'Internet bill', category: 'Utilities', amount: 60, frequency: 'monthly', start_date: today(), due_day: 2, autopay: false, payment_account: 'Checking', is_active: true }],
    subscriptions: [{ id: 81, name: 'Cloud storage', category: 'Software', amount: 120, frequency: 'annual', next_bill_date: today(), payment_account: 'Card', is_active: true }],
  });
  await vault.open('/recurring?t=spend');

  const table = page.getByRole('table', { name: 'Bills and subscriptions' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('row').nth(1)).toContainText('Cloud storage');
  await expect(table.getByRole('row').nth(2)).toContainText('Internet bill');
  await expect(page.locator('app-fixed-expenses ui-data-table')).toHaveCount(0);
  await expect(page.locator('app-subscriptions .subscription-list')).toHaveCount(0);

  const billRow = table.getByRole('row').filter({ hasText: 'Internet bill' });
  await billRow.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit bill', exact: true });
  await expect(editor).toBeVisible();
  await editor.getByLabel('Amount', { exact: true }).fill('75');
  vault.failNextWrites();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByRole('alert')).toBeVisible();
  await expect(editor).toBeVisible();
  expect(vault.data('fixed_expenses')[0].amount).toBe(60);
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect.poll(() => vault.data('fixed_expenses')[0].amount).toBe(75);
  expect(vault.data('assets')).toEqual(assets);
  expect(vault.data('transactions')).toEqual(transactions);

  const subscriptionRow = table.getByRole('row').filter({ hasText: 'Cloud storage' });
  await subscriptionRow.getByRole('button', { name: 'Edit', exact: true }).click();
  const subscriptionEditor = page.getByRole('dialog', { name: 'Edit subscription', exact: true });
  await expect(subscriptionEditor).toBeVisible();
  await expect(subscriptionEditor.getByLabel('Name', { exact: true })).toHaveValue('Cloud storage');
  await subscriptionEditor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(subscriptionEditor).toBeHidden();
});

test('phone commitments use one expandable card per obligation and stay keyboard operable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const vault = await syntheticVault(page, {
    fixed_expenses: [{ id: 80, name: 'Internet bill', category: 'Utilities', amount: 60, frequency: 'monthly', start_date: today(), due_day: 2, autopay: false, payment_account: 'Checking', is_active: true }],
    subscriptions: [{ id: 81, name: 'Cloud storage', category: 'Software', amount: 120, frequency: 'annual', next_bill_date: today(), payment_account: 'Card', is_active: true }],
  });
  await vault.open('/recurring?t=spend');
  await expect(page.locator('.commitment-card')).toHaveCount(2);
  await expect(page.locator('.commitment-table-wrap')).toBeHidden();
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);

  const internet = page.locator('.commitment-card').filter({ hasText: 'Internet bill' });
  const edit = internet.getByRole('button', { name: 'Edit', exact: true });
  await edit.focus();
  await page.keyboard.press('Enter');
  const editor = page.getByRole('dialog', { name: 'Edit bill', exact: true });
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/finance-ux-commitments-mobile.png', fullPage: true });
});

test('cold direct Activity links retain their account selection after encrypted account options load', async ({ page }) => {
  const vault = await syntheticVault(page, {
    bank_accounts: [{ id: 40, bank_slug: 'chase', account_mask: '1111', account_key: 'card-a', display_name: 'Daily card', confirmed: true }],
    transactions: [{ id: 1, date: today(), type: 'expense', kind: 'purchase', category: 'Food', amount: 10, description: 'Coffee', bank_account_key: 'card-a', account_display: 'Daily card' }],
  });
  await vault.open('/spending?t=activity&v=spending&month=all&account=card-a');

  const account = page.getByLabel('Account', { exact: true });
  await expect(account.locator('option[value="card-a"]')).toHaveCount(1);
  await expect(account).toHaveValue('card-a');
  await expect(page.locator('.month-total--expense')).toContainText('$10.00');
  await expect(page.getByRole('row').filter({ hasText: 'Coffee' })).toContainText('Daily card');
});

test('Activity exact account filters keep full matching totals through pagination and browser history', async ({ page }) => {
  const matching = Array.from({ length: 110 }, (_, index) => ({
    id: index + 1, date: today(), type: 'expense', kind: 'purchase', category: 'Food', amount: 1,
    description: `Grocery source ${index}`, merchant: 'Grocery', bank_account_key: 'card-a', account_display: 'Daily card',
  }));
  const otherAccount = Array.from({ length: 10 }, (_, index) => ({
    id: 200 + index, date: today(), type: 'expense', kind: 'purchase', category: 'Food', amount: 5,
    description: `Other card source ${index}`, merchant: 'Grocery', bank_account_key: 'card-b', account_display: 'Travel card',
  }));
  const vault = await syntheticVault(page, {
    bank_accounts: [
      { id: 40, bank_slug: 'chase', account_mask: '1111', account_key: 'card-a', display_name: 'Daily card', confirmed: true },
      { id: 41, bank_slug: 'chase', account_mask: '2222', account_key: 'card-b', display_name: 'Travel card', confirmed: true },
    ],
    transactions: [...matching, ...otherAccount],
  });
  await vault.open('/spending?t=activity&v=spending&month=all');
  await expect(page.getByLabel('Account', { exact: true }).locator('option[value="card-a"]')).toHaveCount(1);
  await page.getByLabel('Account', { exact: true }).selectOption('card-a');
  await page.locator('#tx-category-filter').selectOption('food');
  await page.locator('#tx-merchant-filter').selectOption('grocery');
  await expect(page).toHaveURL(/account=card-a/);
  await expect(page.getByLabel('Account', { exact: true })).toHaveValue('card-a');
  await expect(page.locator('#tx-category-filter')).toHaveValue('food');
  await expect(page.locator('#tx-merchant-filter')).toHaveValue('grocery');
  await expect(page.locator('.month-total--expense')).toContainText('$110.00');
  await expect(page.locator('.month-total--expense')).toContainText('110 matching row(s)');
  const tableRows = page.getByRole('table', { name: 'Transactions history' }).getByRole('row');
  await expect(tableRows).toHaveCount(101);
  await expect(page.getByRole('button', { name: 'Load more', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(tableRows).toHaveCount(111);
  await expect(page.locator('.month-total--expense')).toContainText('$110.00');

  await page.getByLabel('Account', { exact: true }).selectOption('card-b');
  await expect(page).toHaveURL(/account=card-b/);
  await expect(page.locator('.month-total--expense')).toContainText('$50.00');
  await expect(page.getByRole('table', { name: 'Transactions history' }).getByRole('row')).toHaveCount(11);
  await page.goBack();
  await expect(page).toHaveURL(/account=card-a/);
  await expect(page.locator('.month-total--expense')).toContainText('$110.00');
  await expect(page.getByRole('table', { name: 'Transactions history' }).getByRole('row')).toHaveCount(101);
  await page.goForward();
  await expect(page).toHaveURL(/account=card-b/);
  await expect(page.locator('.month-total--expense')).toContainText('$50.00');
});

test('saved planning defaults keep live facts live, while explicit starting-balance overrides survive reopen', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 1000, as_of_date: '2026-10-01' }],
    liabilities: [{ id: 2, name: 'Card', category: 'credit_card', balance_owed: 100, as_of_date: '2026-10-01' }],
    holdings: [{ id: 10, symbol: 'VOO', shares: 1, purchase_price: 80, purchase_date: '2022-01-01', current_price: 100, price_source: 'manual' }],
    fixed_expenses: [{ id: 80, name: 'Rent', category: 'Housing', amount: 100, frequency: 'monthly', start_date: '2026-01-01', is_active: true }],
    job_incomes: [{
      id: 20, employer: 'Current employer', pay_frequency: 'annual', base_pay: 96000, annual_bonus: 0, annual_equity: 0,
      annual_other: 0, annual_taxes: 16000, annual_deductions: 0, taxes_per_period: 0, deductions_per_period: 0,
      effective_date: '2020-01-01', is_active: true, pay_periods_per_year: 1, annual_base_pay: 96000,
    }],
  });
  await vault.open('/planning?t=path&tool=simulation');
  await expectQuoteRequests(vault, ['VOO']);
  await expect.poll(() => vault.data('holdings')[0]?.current_price).toBe(125);
  await expect(page.locator('.planning-facts-grid')).toContainText('$1,025');
  await expect(page.locator('.planning-facts-grid')).toContainText('$1,200');

  await page.getByPlaceholder('e.g. Retirement baseline', { exact: true }).fill('Live baseline');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => vault.data('planning_profiles').length).toBe(1);
  const profile = vault.data('planning_profiles')[0];
  const profileId = profile.id;
  expect(profilePayload(vault)).toMatchObject({
    spending_mode: 'recurring', monthly_income: null, annual_spending: null,
    portfolio_allocation: null, start_net_worth: null, net_annual_cashflow_override: null,
  });

  await vault.open('/have?t=assets');
  const checking = page.getByRole('row').filter({ hasText: 'Checking' });
  await checking.getByRole('button', { name: 'Edit', exact: true }).click();
  const assetEditor = page.getByRole('dialog', { name: 'Edit asset', exact: true });
  await assetEditor.getByLabel('Value').fill('1100');
  await assetEditor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(assetEditor).toBeHidden();

  await vault.open('/planning?t=path&tool=simulation');
  await expect(page.locator('.planning-facts-grid')).toContainText('$1,125');
  const loadProfile = page.locator('.mc-profiles-row select');
  await loadProfile.selectOption(String(profileId));
  await expect(page.getByLabel('Use ledger net worth at start', { exact: true })).toBeChecked();
  const startingNetWorth = page.getByRole('complementary', { name: 'Scenario builder' })
    .getByRole('spinbutton', { name: /^Starting net worth/ });
  await expect(startingNetWorth).toBeDisabled();

  await page.getByLabel('Use ledger net worth at start', { exact: true }).uncheck();
  await startingNetWorth.fill('777');
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect.poll(() => profilePayload(vault)?.start_net_worth).toBe(777);

  await vault.open('/have?t=assets');
  await vault.open('/planning?t=path&tool=simulation');
  await expect(page.locator('.planning-facts-grid')).toContainText('$1,125');
  await page.locator('.mc-profiles-row select').selectOption(String(profileId));
  await expect(page.getByLabel('Use ledger net worth at start', { exact: true })).not.toBeChecked();
  await expect(startingNetWorth).toHaveValue('777');
  expect(vault.data('assets')[0].current_value).toBe(1100);
  expect(vault.data('holdings')[0].current_price).toBe(125);
  expect(vault.data('liabilities')[0].balance_owed).toBe(100);
});

test('two tabs refresh encrypted activity after edits, lock together, and send only invalidation metadata', async ({ page }) => {
  await page.context().addInitScript(() => {
    const NativeChannel = (window as any).BroadcastChannel;
    (window as any).__financeMessages = [];
    (window as any).BroadcastChannel = class extends NativeChannel {
      postMessage(message: unknown) {
        (window as any).__financeMessages.push(message);
        super.postMessage(message);
      }
    };
  });
  const vault = await syntheticVault(page, {
    transactions: [{ id: 7, date: today(), type: 'expense', kind: 'purchase', category: 'Food', amount: 10, description: 'CROSS TAB PRIVATE DESCRIPTION', merchant: 'Market' }],
  });
  const second = await page.context().newPage();
  await vault.open('/spending?t=activity', page);
  await vault.open('/spending?t=activity', second);
  const secondRow = second.getByRole('row').filter({ hasText: 'CROSS TAB PRIVATE DESCRIPTION' });
  await expect(secondRow).toContainText('$10.00');

  const firstRow = page.getByRole('row').filter({ hasText: 'CROSS TAB PRIVATE DESCRIPTION' });
  await firstRow.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit transaction' });
  await editor.getByLabel('Amount', { exact: true }).fill('99');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(secondRow).toContainText('$99.00');
  const activityMessages = await page.evaluate(() => (window as any).__financeMessages as unknown[]);
  expect(activityMessages).toContainEqual({ version: 1, userId: 987, kind: 'invalidate', collections: ['transactions'] });
  expect(JSON.stringify(activityMessages)).not.toContain('CROSS TAB PRIVATE DESCRIPTION');
  expect(vault.mutations.every(change => !JSON.stringify(change.body).includes('CROSS TAB PRIVATE DESCRIPTION'))).toBe(true);

  await page.locator('.account-actions > summary').click();
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
  await expect(page).toHaveURL(/\/vault\/unlock$/);
  await expect(second).toHaveURL(/\/vault\/unlock$/);
  const lockMessages = await page.evaluate(() => (window as any).__financeMessages as unknown[]);
  expect(lockMessages).toContainEqual({ version: 1, userId: 987, kind: 'lock' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/finance-ux-lock-propagation.png', fullPage: true });
});

test('signing out in one tab also ends the other synthetic session', async ({ page }) => {
  const vault = await syntheticVault(page);
  const second = await page.context().newPage();
  await vault.open('/', page);
  await vault.open('/', second);
  await page.locator('.account-actions > summary').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(second).toHaveURL(/\/login$/);
});

test('two tabs resolve simultaneous asset IDs as separate editable records', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{ id: 10, name: 'Checking', category: 'cash', current_value: 1000, as_of_date: '2026-10-01' }],
  });
  const second = await page.context().newPage();
  await vault.open('/have?t=assets', page);
  await vault.open('/have?t=assets', second);

  await page.getByRole('button', { name: 'Add asset', exact: true }).first().click();
  await second.getByRole('button', { name: 'Add asset', exact: true }).first().click();
  const firstEditor = page.getByRole('dialog', { name: 'Add asset', exact: true });
  const secondEditor = second.getByRole('dialog', { name: 'Add asset', exact: true });
  await firstEditor.getByLabel('Name').fill('Asset from tab one');
  await secondEditor.getByLabel('Name').fill('Asset from tab two');
  await firstEditor.getByLabel('Value').fill('300');
  await secondEditor.getByLabel('Value').fill('400');
  vault.holdNextUpserts(2);
  try {
    await Promise.all([
      firstEditor.getByRole('button', { name: 'Save', exact: true }).click(),
      secondEditor.getByRole('button', { name: 'Save', exact: true }).click(),
    ]);
    await expect.poll(() => vault.mutations
      .filter(change => change.path.endsWith('/upsert'))
      .flatMap(change => change.body.records)
      .filter((record: any) => record.collection === 'assets')).toHaveLength(2);
    expect(vault.data('assets')).toHaveLength(1);
  } finally {
    vault.releaseHeldUpserts();
  }
  await expect(firstEditor).toBeHidden();
  await expect(secondEditor).toBeHidden();
  await expect.poll(() => vault.data('assets').length).toBe(3);
  const firstRecord = vault.data('assets').find(row => row.name === 'Asset from tab one');
  const secondRecord = vault.data('assets').find(row => row.name === 'Asset from tab two');
  expect(firstRecord).toBeTruthy();
  expect(secondRecord).toBeTruthy();
  expect(firstRecord!.id).not.toBe(secondRecord!.id);

  await vault.reload(page);
  await vault.reload(second);
  const firstRow = page.getByRole('row').filter({ hasText: 'Asset from tab one' });
  await firstRow.getByRole('button', { name: 'Edit', exact: true }).click();
  const editOne = page.getByRole('dialog', { name: 'Edit asset', exact: true });
  await editOne.getByLabel('Value').fill('333');
  await editOne.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => vault.data('assets').find(row => row.name === 'Asset from tab one')?.current_value).toBe(333);

  const secondRow = second.getByRole('row').filter({ hasText: 'Asset from tab two' });
  await secondRow.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirmation = second.getByRole('dialog', { name: 'Delete asset?', exact: true });
  await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(() => vault.data('assets').some(row => row.name === 'Asset from tab two')).toBe(false);
  expect(vault.data('assets').find(row => row.name === 'Asset from tab one')?.current_value).toBe(333);
  expect(vault.data('assets').find(row => row.name === 'Checking')?.current_value).toBe(1000);
});

test('import account mapping refreshes the exact account label in another mounted Activity tab', async ({ page }) => {
  const date = '2026-10-01';
  const description = 'LEGACY CROSS TAB COFFEE';
  const legacy = {
    id: 70, date, type: 'expense', category: 'Food', amount: 10, description, merchant: 'Coffee shop',
    source: 'import', dedupe_key: legacyChaseDedupeKey(date, 10, description),
  };
  const vault = await syntheticVault(page, { transactions: [legacy] });
  const second = await page.context().newPage();
  await vault.open('/spending?t=imports', page);
  await vault.open('/spending?t=activity', second);
  const secondRow = second.getByRole('row').filter({ hasText: description });
  await expect(secondRow).toContainText('—');

  await page.getByRole('button', { name: 'Import from bank', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from bank', exact: true });
  const csv = Buffer.from([
    'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
    `${date},${date},${description},Food,Sale,-10,`,
  ].join('\n'));
  await dialog.locator('input[type=file]').setInputFiles({ name: 'map-cross-tab.csv', mimeType: 'text/csv', buffer: csv });
  await dialog.getByLabel('Bank for map-cross-tab.csv', { exact: true }).selectOption('chase');
  await dialog.getByLabel('Account name', { exact: true }).fill('Daily card');
  await dialog.getByLabel('Map matching legacy transactions to this account', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await expect(dialog.locator('.import-file-preview')).toContainText('0 new · 1 duplicate');
  await dialog.getByRole('button', { name: 'Map 1 legacy transaction(s)', exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(secondRow).toContainText('Daily card');
  await expect.poll(() => vault.data('bank_accounts').length).toBe(1);
  expect(vault.data('transactions')[0]).toMatchObject({
    description, bank_account_key: expect.any(String), account_display: 'Daily card', source_bank: 'chase',
  });
});

test('receipt coverage is saved and undo refreshes mounted Activity and Home tabs', async ({ page }) => {
  const now = new Date();
  const coverageStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)).toISOString().slice(0, 10);
  const transactionDate = today();
  const coverageEnd = today();
  const vault = await syntheticVault(page, {
    bank_accounts: [{ id: 40, bank_slug: 'chase', account_mask: 'card', account_key: 'card', display_name: 'Daily card', confirmed: true }],
  });
  const activityTab = await page.context().newPage();
  const homeTab = await page.context().newPage();
  await vault.open('/spending?t=imports', page);
  await vault.open('/spending?t=activity', activityTab);
  await vault.open('/', homeTab);
  const homeMonth = homeTab.locator('.home-tile').filter({ hasText: 'This month' });

  await page.getByRole('button', { name: 'Import from bank', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Import from bank', exact: true });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'confirmed-coverage.csv', mimeType: 'text/csv', buffer: Buffer.from(
      `Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n${transactionDate},${transactionDate},COVERAGE PURCHASE,Food,Sale,-10,\n`
    ),
  });
  await dialog.getByLabel('Bank for confirmed-coverage.csv', { exact: true }).selectOption('chase');
  await dialog.getByRole('combobox', { name: /Account identity for this file/ }).selectOption('40');
  await dialog.getByLabel('From', { exact: true }).fill(coverageStart);
  await dialog.getByLabel('Through', { exact: true }).fill(coverageEnd);
  await dialog.getByLabel("I confirm these dates are the statement's covered period", { exact: true }).check();
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await dialog.getByRole('button', { name: /^Import 1 transaction/ }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => vault.data('import_batches')[0]?.status).toBe('complete');
  await expect(activityTab.getByRole('row').filter({ hasText: 'COVERAGE PURCHASE' })).toContainText('$10.00');
  await expect(homeMonth).toContainText('$10.00');
  expect(vault.data('import_batches')[0].coverage[0]).toMatchObject({
    account_key: 'card', start_date: coverageStart, end_date: coverageEnd, confirmed: true,
  });

  const history = page.getByText(/Import receipts \(/);
  if (await history.count()) await history.click();
  const receipt = page.locator('.import-history-row').filter({ hasText: 'confirmed-coverage.csv' });
  await receipt.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('dialog', { name: 'Undo this import?' }).getByRole('button', { name: 'Undo import', exact: true }).click();
  await expect.poll(() => vault.data('import_batches')[0]?.status).toBe('withdrawn');
  await expect(activityTab.getByRole('row').filter({ hasText: 'COVERAGE PURCHASE' })).toHaveCount(0);
  await expect(homeMonth).toContainText('$0.00');
  expect(vault.data('transactions')).toHaveLength(0);
  expect(vault.data('bank_accounts')[0]).toMatchObject({ account_key: 'card', display_name: 'Daily card', confirmed: true });
});

test('Home stays readable at desktop, phone and dark theme sizes', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 1000, as_of_date: '2026-10-01' }],
    holdings: [{ id: 10, symbol: 'VOO', shares: 1, purchase_price: 80, purchase_date: '2022-01-01', current_price: 100, price_source: 'manual' }],
  });
  await vault.open('/');
  await expectQuoteRequests(vault, ['VOO']);
  await expect(page.locator('.home-tile').filter({ hasText: 'What you have' })).toContainText('$1,125.00');
  const holdingsCanvas = page.locator('canvas[aria-label="Portfolio allocation by symbol"]');
  const nontransparentChartPixels = () => holdingsCanvas.evaluate(node => {
    const canvas = node as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context || canvas.width === 0 || canvas.height === 0) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let alpha = 3; alpha < pixels.length; alpha += 4) if (pixels[alpha] > 0) count++;
    return count;
  });
  await expect(holdingsCanvas).toBeVisible();
  await expect.poll(nontransparentChartPixels).toBeGreaterThan(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/finance-ux-home-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const width = await page.evaluate(() => {
    const scroller = document.querySelector('.main-content');
    const documentWidth = scroller instanceof HTMLElement
      ? scroller.scrollWidth
      : document.documentElement.scrollWidth;
    return { document: documentWidth, viewport: innerWidth };
  });
  expect(width.document).toBeLessThanOrEqual(width.viewport + 1);
  await expect.poll(nontransparentChartPixels).toBeGreaterThan(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/finance-ux-home-mobile.png', fullPage: true });

  await page.locator('.account-actions > summary').click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dark', exact: true })).toHaveClass(/on/);
  const accountMenu = page.locator('.account-actions');
  await page.locator('.account-actions > summary').click();
  await expect(accountMenu).not.toHaveAttribute('open', '');
  await expect.poll(() => page.locator('app-charts ui-card .ui-card').first().evaluate(card => getComputedStyle(card).backgroundColor))
    .toBe('rgb(32, 35, 32)');
  await expect.poll(nontransparentChartPixels).toBeGreaterThan(1000);
  await holdingsCanvas.scrollIntoViewIfNeeded();
  await expect.poll(nontransparentChartPixels).toBeGreaterThan(1000);
  await holdingsCanvas.screenshot({ path: '/tmp/finance-ux-holdings-chart-dark.png' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/finance-ux-home-dark.png', fullPage: true });
});

test('phone navigation keeps all five hubs in view and supports keyboard Plan navigation', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/');
  const desktopNav = page.locator('.nav-tabs');
  await expect(desktopNav.getByRole('link')).toHaveCount(5);

  for (const width of [320, 390]) {
    if (width > 320) await vault.open('/');
    await page.setViewportSize({ width, height: 844 });
    const navigation = page.locator('.mobile-tabbar');
    const plan = navigation.getByRole('link', { name: 'Plan', exact: true });
    await expect(plan).toBeVisible();
    const layout = await navigation.evaluate(node => {
      const nav = node.getBoundingClientRect();
      const links = [...node.querySelectorAll<HTMLAnchorElement>('a.mobile-tab')].map(link => {
        const rect = link.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      });
      const scroller = document.querySelector('.main-content');
      return {
        viewport: window.innerWidth,
        document: scroller instanceof HTMLElement ? scroller.scrollWidth : document.documentElement.scrollWidth,
        nav: { left: nav.left, right: nav.right, top: nav.top, bottom: nav.bottom, width: node.clientWidth, scrollWidth: node.scrollWidth },
        links,
      };
    });
    expect(layout.document).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.nav.scrollWidth).toBeLessThanOrEqual(layout.nav.width + 1);
    expect(layout.links).toHaveLength(5);
    for (const link of layout.links) {
      expect(link.left).toBeGreaterThanOrEqual(layout.nav.left - 1);
      expect(link.right).toBeLessThanOrEqual(layout.nav.right + 1);
      expect(link.left).toBeGreaterThanOrEqual(0);
      expect(link.right).toBeLessThanOrEqual(layout.viewport + 1);
      expect(link.height).toBeGreaterThanOrEqual(44);
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `/tmp/finance-ux-nav-${width}.png` });
    await plan.focus();
    await expect(plan).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/planning(?:\?|$)/);
    await expect(page.getByRole('heading', { name: 'Planning', exact: true })).toBeVisible();
  }
});

test('a release notice uses production build metadata and preserves an open transaction draft when dismissed', async ({ page }) => {
  const vault = await syntheticVault(page);
  const latestRelease = 'b'.repeat(64);
  await page.route('**/version.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ release: latestRelease }),
  }));
  await vault.open('/spending?t=activity');

  const loadedRelease = page.locator('meta[name="app-release"]');
  await expect(loadedRelease).toHaveAttribute('content', /^[a-f0-9]{64}$/i);
  const notice = page.locator('.release-notice');
  await expect(notice).toContainText('A new version is ready');
  await expect(notice).toContainText((await loadedRelease.getAttribute('content'))!.slice(0, 12));
  await expect(notice).toContainText(latestRelease.slice(0, 12));

  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add transaction' });
  await editor.getByLabel('Category', { exact: true }).fill('Food');
  await editor.getByLabel('Amount', { exact: true }).fill('18.25');
  await editor.getByLabel('Description (optional)', { exact: true }).fill('Draft survives notice');
  await notice.getByRole('button', { name: 'Dismiss', exact: true }).click();

  await expect(notice).toBeHidden();
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Category', { exact: true })).toHaveValue('Food');
  await expect(editor.getByLabel('Amount', { exact: true })).toHaveValue('18.25');
  await expect(editor.getByLabel('Description (optional)', { exact: true })).toHaveValue('Draft survives notice');
  expect(vault.data('transactions')).toHaveLength(0);
});
