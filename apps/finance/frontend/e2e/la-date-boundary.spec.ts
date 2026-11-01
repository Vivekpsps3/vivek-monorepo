import { test, expect, frozenToday, type Page } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

/**
 * 17:30 in America/Los_Angeles on 2026-10-15 is 00:30 UTC on 2026-10-16.
 * Noon (the default frozen instant) is still the 15th in both zones, so it
 * cannot tell a UTC calendar day from the Los Angeles one.
 */
const BOUNDARY = Date.parse('2026-10-15T17:30:00-07:00');
const LA_TODAY = '2026-10-15';
const UTC_TODAY = '2026-10-16';

test.use({ frozenInstant: BOUNDARY });

async function browserDates(page: Page) {
  return page.evaluate(() => ({
    utc: new Date().toISOString().slice(0, 10),
    la: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()),
  }));
}

test('today and default dates stay on the Los Angeles day when UTC is already the next day', async ({ page }) => {
  expect(frozenToday()).toBe(LA_TODAY);
  expect(new Date(BOUNDARY).toISOString().slice(0, 10)).toBe(UTC_TODAY);

  const vault = await syntheticVault(page);
  await vault.open('/spending?t=calendar');
  expect(await browserDates(page)).toEqual({ utc: UTC_TODAY, la: LA_TODAY });
  await expect(page.locator('.day.today')).toHaveAttribute('aria-label', LA_TODAY);

  await vault.open('/spending?t=activity');
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  const transaction = page.getByRole('dialog', { name: 'Add transaction' });
  await expect(transaction.getByLabel('Date', { exact: true })).toHaveValue(LA_TODAY);

  await vault.open('/have?t=holdings');
  await page.getByRole('button', { name: 'Add Holding', exact: true }).click();
  const holding = page.getByRole('dialog', { name: 'Add holding' });
  await expect(holding.getByLabel('Purchase date', { exact: true })).toHaveValue(LA_TODAY);

  await vault.open('/have?t=assets');
  await page.locator('ui-page-header').getByRole('button', { name: 'Add asset', exact: true }).click();
  const asset = page.getByRole('dialog', { name: 'Add asset' });
  await expect(asset.getByLabel(/^As of\b/)).toHaveValue(LA_TODAY);
});

test('receipt coverage and quote_date stay on the Los Angeles day when UTC is already the next day', async ({ page }) => {
  const vault = await syntheticVault(page, {
    holdings: [{ id: 12, symbol: 'VOO', shares: 1, purchase_price: 80, purchase_date: '2026-01-01', current_price: 100, price_source: 'manual' }],
    bank_accounts: [{ id: 40, bank_slug: 'chase', account_mask: 'card', account_key: 'card', display_name: 'Daily card', confirmed: true }],
  });
  await vault.open('/');
  expect(await browserDates(page)).toEqual({ utc: UTC_TODAY, la: LA_TODAY });
  await expect.poll(() => vault.data('holdings')[0]?.quote_date).toBe(LA_TODAY);
  expect(vault.data('holdings')[0].quote_date).not.toBe(UTC_TODAY);

  await vault.open('/spending?t=imports', page, '/spending?t=activity&receipts=1');
  await page.getByRole('button', { name: 'Import from bank', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from bank', exact: true });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'boundary-coverage.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n${LA_TODAY},${LA_TODAY},BOUNDARY COVERAGE,Food,Sale,-10,\n`,
    ),
  });
  await dialog.getByLabel('Bank for boundary-coverage.csv', { exact: true }).selectOption('chase');
  await dialog.getByRole('combobox', { name: /Account identity for this file/ }).selectOption('40');
  await dialog.getByLabel('From', { exact: true }).fill(LA_TODAY);
  await dialog.getByLabel('Through', { exact: true }).fill(LA_TODAY);
  await dialog.getByLabel("I confirm these dates are the statement's covered period", { exact: true }).check();
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await dialog.getByRole('button', { name: /^Import 1 transaction/ }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => vault.data('import_batches')[0]?.status).toBe('complete');

  const receipt = vault.data('import_batches')[0];
  expect(receipt.coverage[0]).toMatchObject({
    account_key: 'card', start_date: LA_TODAY, end_date: LA_TODAY, confirmed: true,
  });
  expect(receipt.coverage_start).toBe(LA_TODAY);
  expect(receipt.coverage_end).toBe(LA_TODAY);
  expect(String(receipt.started_at).slice(0, 10)).toBe(UTC_TODAY);
  expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(receipt.started_at))).toBe(LA_TODAY);
  expect(vault.data('transactions')[0].date).toBe(LA_TODAY);
});
