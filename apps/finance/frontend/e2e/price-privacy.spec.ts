import { test, expect, type Page } from './frozen-clock';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { moneyText } from './money-text';
import { syntheticVault } from './synthetic-vault';

// F7 / FIN-01: one quote per symbol, automatic-check preference, ticker-only privacy.

const PASSPHRASE = 'Synthetic finance test passphrase';
const NOTICE = 'Prices checked automatically for 1 ticker symbol (VOO). Only ticker symbols are sent.';
const holdings = [
  { id: 10, symbol: 'VOO', shares: 1, purchase_price: 80, purchase_date: '2022-01-01', current_price: 100, price_source: 'manual', price_as_of: '2026-10-01T00:00:00Z', position_as_of: '2026-10-10' },
  { id: 11, symbol: 'VOO', shares: 2, purchase_price: 90, purchase_date: '2023-01-01', current_price: 110, price_source: 'manual', price_as_of: '2026-10-05T00:00:00Z', position_as_of: '2026-10-11' },
];

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;
const THEMES = ['light', 'dark'] as const;

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('unlock checks each symbol once and shows the one-time ticker notice', async ({ page }) => {
  const vault = await syntheticVault(page, { holdings });
  await vault.open('/');

  await expect.poll(() => vault.quoteRequests).toEqual(['VOO']);
  await expect.poll(() => vault.data('holdings').every(row => row.current_price === 125)).toBe(true);

  const notice = page.locator('.price-notice');
  await expect(notice).toContainText(NOTICE);
  await notice.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('finance-price-notice-seen:987'))).toBe('1');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('finance-auto-price-check:987'))).not.toBe('off');
});

test('with automatic checks off, manual refresh updates every holdings screen and research stays quiet', async ({ page }) => {
  const researchRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/market/research')) researchRequests.push(request.url());
  });
  await page.addInitScript(() => localStorage.setItem('finance-auto-price-check:987', 'off'));
  const vault = await syntheticVault(page, { holdings });
  await vault.open('/');

  await expect(page.locator('.home-tile--balance')).toContainText('Automatic price checks are off');
  expect(vault.quoteRequests).toEqual([]);

  await page.getByRole('button', { name: 'Refresh prices' }).click();
  await expect.poll(() => vault.quoteRequests).toEqual(['VOO']);
  await expect.poll(() => vault.data('holdings').every(row => row.current_price === 125)).toBe(true);
  await expect(page.locator('.home-tile--balance')).toContainText(moneyText('$375.00'));

  await vault.open('/have?t=holdings');
  const prices = page.locator('.price-cell');
  await expect(prices).toHaveCount(2);
  await expect(prices.nth(0)).toContainText(moneyText('$125.00'));
  await expect(prices.nth(1)).toContainText(moneyText('$125.00'));
  expect(vault.quoteRequests).toEqual(['VOO']);

  await vault.open('/planning?t=stocks');
  await expect(page.getByText('Saved price for VOO', { exact: false })).toContainText('125');
  expect(researchRequests).toEqual([]);
  expect(vault.quoteRequestDetails).toEqual([{ symbol: 'VOO', refresh: true }]);
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

test('turning automatic checks off persists for this user and the next unlock sends nothing', async ({ page }) => {
  const vault = await syntheticVault(page, { holdings });
  await vault.open('/');
  await expect.poll(() => vault.quoteRequests).toEqual(['VOO']);

  let laterQuote = false;
  const onRequest = (request: { url: () => string }) => {
    if (request.url().includes('/api/market/price/')) laterQuote = true;
  };
  page.on('request', onRequest);

  const menu = await openUserMenu(page);
  const toggle = menu.getByRole('menuitemcheckbox', { name: 'Check prices when I unlock' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(menu).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('finance-auto-price-check:987'))).toBe('off');
  await page.keyboard.press('Escape');

  const locked = await openUserMenu(page);
  await locked.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page).toHaveURL(/\/vault\/unlock/);
  await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('app-dashboard')).toBeVisible();
  await expect(page.locator('.home-tile--balance')).toContainText('Automatic price checks are off');
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 400)));
  expect(laterQuote).toBe(false);
  expect(vault.quoteRequests).toEqual(['VOO']);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('finance-auto-price-check:987'))).toBe('off');
  page.off('request', onRequest);
});

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`keyboard notice, preference, and About price checks agree [${viewport.width} ${theme}]`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      const vault = await syntheticVault(page, { holdings });
      await vault.open('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect.poll(() => vault.quoteRequests).toEqual(['VOO']);

      const notice = page.locator('.price-notice');
      await expect(notice).toContainText(NOTICE);
      const ok = notice.getByRole('button', { name: 'OK', exact: true });
      await ok.focus();
      await page.keyboard.press('Enter');
      await expect(notice).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => localStorage.getItem('finance-price-notice-seen:987'))).toBe('1');

      await vault.reload();
      await expect(page.locator('.price-notice')).toHaveCount(0);

      let menu = await openUserMenu(page);
      const toggle = menu.getByRole('menuitemcheckbox', { name: 'Check prices when I unlock' });
      await toggle.focus();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await expect(toggle.locator('ui-icon')).toHaveCount(1);
      await page.keyboard.press('Space');
      await expect(menu).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await expect(toggle.locator('ui-icon')).toHaveCount(0);
      await page.keyboard.press('Space');
      await expect(menu).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await expect(toggle.locator('ui-icon')).toHaveCount(1);
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await expect(menu).toBeVisible();
      const toggleBox = await toggle.boundingBox();
      expect(Math.round(toggleBox?.height ?? 0)).toBeGreaterThanOrEqual(44);
      await page.keyboard.press('Escape');
      await expect(page.locator('.home-tile--balance')).toContainText('Automatic price checks are off');

      const trigger = page.getByRole('banner').getByRole('button', { name: 'synthetic', exact: true });
      menu = await openUserMenu(page);
      const about = menu.getByRole('button', { name: 'About price checks', exact: true });
      await about.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'About price checks' });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('#price-details-title')).toBeFocused();
      await expect(dialog).toContainText('Price checks send ticker symbols only. Shares, balances and plans stay encrypted in this browser.');
      await expect(dialog).toContainText("Prices come from a public market-data service, requested by Finance's server.");
      await expect(dialog).toContainText('Check prices when I unlock is off.');
      await expect(dialog).toContainText(NOTICE);
      await expect(dialog).not.toContainText('IP');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();

      menu = await openUserMenu(page);
      await menu.getByRole('button', { name: 'About price checks', exact: true }).click();
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Check prices when I unlock is off.');
      await expect(dialog).toContainText(NOTICE);
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await expectNoHorizontalScroll(page);
    });
  }
}
