import AxeBuilder from '@axe-core/playwright';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { expect, test } from './frozen-clock';
import { moneyText } from './money-text';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from './synthetic-vault';

const unnamed = {
  id: 1, symbol: '', shares: 1, price_source: 'unavailable', current_price: null, purchase_price: null,
};
const harbor = {
  id: 2, symbol: 'HARBOR', shares: 2, purchase_price: 100, purchase_date: '2026-01-02',
  current_price: 124.56, price_source: 'live_eod', quote_date: '2026-10-14', position_as_of: '2026-10-14',
  account_display: 'Checking',
};
const tide = {
  id: 3, symbol: 'TIDE', shares: 2, purchase_price: 10, purchase_date: '2026-03-02',
  current_price: 40, price_source: 'live_eod', quote_date: '2026-10-01', position_as_of: '2026-10-01',
  account_display: 'Checking',
};
const cafe = {
  id: 41, date: '2026-08-15', type: 'expense', category: 'Groceries', amount: 18.4,
  description: 'Boardwalk Cafe', bank_account_key: 'checking', account_display: 'Checking',
};
const books = {
  id: 42, date: '2026-08-16', type: 'expense', category: 'Books', amount: 9,
  description: 'Lighthouse Books',
};
const records = { holdings: [unnamed, harbor, tide], transactions: [cafe, books] };

test.use({ hasTouch: true });

for (const [width, theme] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']] as const) {
  test(`Treasury gallery inspects a position and a dated entry at ${width} in ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });
    await page.addInitScript(choice => {
      localStorage.setItem('suite-theme', choice);
      localStorage.setItem('finance-auto-price-check:987', 'off');
    }, theme);
    const vault = await syntheticVault(page, records);
    await vault.open('/have?t=gallery');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const gallery = page.locator('app-treasury-gallery');
    await expect(page.getByRole('heading', { name: 'Treasury gallery', level: 1 })).toBeVisible();
    await expect(gallery).not.toContainText('$');
    await expect(page.locator('[data-inspector-position]')).toContainText('HARBOR');
    await expect(page.locator('[data-inspector-position]')).toContainText('Hidden');
    await expect(page.locator('[data-inspector-ledger]')).toContainText('Lighthouse Books');
    await expect(page.locator('[data-inspector-position]')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('[data-inspector-ledger]')).toBeInViewport({ ratio: 1 });
    await expect(gallery).toContainText('does not keep another ledger');
    expect(await gallery.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    for (const control of await gallery.getByRole('button').all()) {
      const box = await control.boundingBox();
      expect(Math.min(box!.height, box!.width)).toBeGreaterThanOrEqual(44);
    }
    for (const control of await gallery.getByRole('link').all()) {
      const box = await control.boundingBox();
      expect(Math.min(box!.height, box!.width)).toBeGreaterThanOrEqual(44);
    }
    expect((await new AxeBuilder({ page }).include('app-treasury-gallery').analyze()).violations).toEqual([]);
    await info.attach(`gallery-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });

    const tidePlaque = page.locator('[data-plaque="3"]');
    if (width === 390) await tidePlaque.tap();
    else {
      await tidePlaque.focus();
      await page.keyboard.press('Enter');
    }
    const position = page.locator('[data-inspector-position]');
    await expect(position).toContainText('TIDE');
    await expect(position).toContainText('Shares 2');
    await expect(position).toContainText('Mar 2');
    await expect(position).toContainText('Stale · 14 days old');
    await expect(position).toContainText(moneyText('$80.00'));
    await expect(position).not.toContainText(moneyText('$249.12'));
    await expect(page.locator('[data-gallery-gain]')).toHaveText('Unavailable');
    await expect(page.locator('[data-readout-gain]')).toHaveText(moneyText('$49.12'));
    await expect(page.locator('[data-readout-gain]')).not.toContainText('109');
    await expect(page.locator('[data-plaque="2"]')).toContainText('Hidden');
    await expect(page).toHaveURL(/position=3/);
    await expect(position).toBeInViewport({ ratio: 1 });
    expect((await new AxeBuilder({ page }).include('app-treasury-gallery').analyze()).violations).toEqual([]);
    await info.attach(`gallery-stale-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });

    await page.getByLabel('From date', { exact: true }).fill('2026-08-15');
    await page.getByLabel('Through date', { exact: true }).fill('2026-08-15');
    await expect(page.locator('[data-ledger-line]')).toHaveCount(1);
    await expect(gallery).not.toContainText('Lighthouse Books');
    const line = page.locator('[data-ledger-line="41"]');
    if (width === 390) await line.tap();
    else {
      await line.focus();
      await page.keyboard.press('Enter');
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    const ledger = page.locator('[data-inspector-ledger]');
    await expect(ledger).toContainText('Boardwalk Cafe');
    await expect(ledger).toContainText('Groceries');
    await expect(ledger).toContainText('Aug 15');
    await expect(page.locator('[data-ledger-amount]')).toContainText(moneyText('$18.40'));
    await expect(page).toHaveURL(/from=2026-08-15/);
    await expect(page).toHaveURL(/ledger=41/);
    await expect(ledger).toBeInViewport({ ratio: 1 });
    expect(vault.mutations.filter(change => change.path === '/api/vault/records/upsert')).toHaveLength(0);
  });
}

test('a locked vault keeps no ticker list and a late quote cannot restore one', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('finance-auto-price-check:987', 'off'));
  const vault = await syntheticVault(page, records);
  await vault.open('/have?t=gallery');
  await expect(page.locator('[data-inspector-position]')).toContainText('HARBOR');
  await (await openUserMenu(page)).getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page).toHaveURL(/\/vault\/unlock/);
  await expect(page.getByText('HARBOR', { exact: true })).toHaveCount(0);
  await expect(page.getByText('TIDE', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Boardwalk Cafe', { exact: true })).toHaveCount(0);
  await info.attach('gallery-locked', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByLabel('Vault passphrase').fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/have$/);
  await expect(page.getByText('HARBOR', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Treasury gallery', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/have\?t=gallery$/);
  await expect(page.locator('app-treasury-gallery')).not.toContainText('$');
  await expect(page.locator('[data-inspector-position]')).toContainText('HARBOR');
  await expect(page.locator('[data-gallery-gain]')).toHaveCount(0);
  await info.attach('gallery-relocked', { body: await page.screenshot(), contentType: 'image/png' });
});
