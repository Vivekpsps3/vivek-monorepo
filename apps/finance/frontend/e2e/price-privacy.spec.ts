import { test, expect } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

// F7: one quote per symbol, automatic-check preference, ticker-only privacy.

const holdings = [
  { id: 10, symbol: 'VOO', shares: 1, purchase_price: 80, purchase_date: '2022-01-01', current_price: 100, price_source: 'manual', price_as_of: '2026-10-01T00:00:00Z', position_as_of: '2026-10-10' },
  { id: 11, symbol: 'VOO', shares: 2, purchase_price: 90, purchase_date: '2023-01-01', current_price: 110, price_source: 'manual', price_as_of: '2026-10-05T00:00:00Z', position_as_of: '2026-10-11' },
];

test('unlock checks each symbol once and shows the one-time ticker notice', async ({ page }) => {
  const vault = await syntheticVault(page, { holdings });
  await vault.open('/');

  await expect.poll(() => vault.quoteRequests).toEqual(['VOO']);
  await expect.poll(() => vault.data('holdings').every(row => row.current_price === 125)).toBe(true);

  const notice = page.locator('.price-notice');
  await expect(notice).toContainText('Prices checked automatically. Only ticker symbols are sent.');
  await notice.getByRole('button', { name: 'Got it' }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('finance-price-notice-seen:987'))).toBe('1');
});

test('with automatic checks off, unlock sends nothing and Home offers Refresh prices', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('finance-auto-price-check:987', 'off'));
  const vault = await syntheticVault(page, { holdings });
  await vault.open('/');

  await expect(page.locator('.home-tile--balance')).toContainText('Automatic price checks are off');
  expect(vault.quoteRequests).toEqual([]);

  await page.getByRole('button', { name: 'Refresh prices' }).click();
  await expect.poll(() => vault.quoteRequests).toEqual(['VOO']);
});

test('stock research fetches nothing until Look up is chosen', async ({ page }) => {
  const researchRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/market/research')) researchRequests.push(request.url());
  });
  const vault = await syntheticVault(page, { holdings });
  await vault.open('/planning?t=stocks');

  await expect(page.getByText('Saved price for VOO', { exact: false })).toBeVisible();
  expect(researchRequests).toEqual([]);

  await page.getByRole('button', { name: 'Look up' }).click();
  await expect.poll(() => researchRequests.length).toBeGreaterThan(0);
});
