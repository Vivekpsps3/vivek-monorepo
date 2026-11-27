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
    await expect(page.locator('[data-inspector-position]')).toHaveCount(0);
    await expect(page.locator('[data-inspector-ledger]')).toHaveCount(0);
    await expect(page.locator('[data-plaque="2"]')).toContainText('HARBOR');
    await expect(page.locator('[data-plaque="2"]')).toContainText('Hidden');
    await expect(page.locator('[data-ledger-line="42"]')).toContainText('Lighthouse Books');
    await expect(page.locator('[data-ledger-line="42"]')).toContainText('Hidden');
    await expect(page.locator('details.activity-filters')).not.toHaveAttribute('open');
    if (width === 390) {
      const ledgerTop = await page.locator('[data-ledger-line]').first().evaluate(element => element.getBoundingClientRect().top + window.scrollY);
      expect(ledgerTop).toBeLessThan(1600);
    }
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
    await expect(position).toHaveCount(1);
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
    const plaqueBox = await tidePlaque.boundingBox();
    const positionBox = await position.boundingBox();
    expect(positionBox!.y).toBeGreaterThanOrEqual(plaqueBox!.y);
    expect(positionBox!.y - (plaqueBox!.y + plaqueBox!.height)).toBeLessThan(32);
    await expect(position.getByRole('link', { name: 'Open in Holdings', exact: true })).toHaveAttribute('href', /t=holdings/);
    expect((await new AxeBuilder({ page }).include('app-treasury-gallery').analyze()).violations).toEqual([]);
    await info.attach(`gallery-stale-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });

    await page.locator('details.activity-filters > summary').click();
    await page.getByLabel('From date', { exact: true }).fill('2026-08-15');
    await page.getByLabel('Through date', { exact: true }).fill('2026-08-15');
    await expect(page.locator('[data-ledger-line]')).toHaveCount(1);
    await expect(gallery).not.toContainText('Lighthouse Books');
    const line = page.locator('[data-ledger-line="41"]');
    const scrollBefore = await page.evaluate(() => window.scrollY);
    if (width === 390) await line.tap();
    else {
      await line.focus();
      await page.keyboard.press('Enter');
    }
    const ledger = page.locator('[data-inspector-ledger]');
    await expect(ledger).toContainText('Boardwalk Cafe');
    await expect(ledger).toContainText('Groceries');
    await expect(ledger).toContainText('Aug 15');
    await expect(page.locator('[data-ledger-amount]')).toContainText(moneyText('$18.40'));
    await expect(ledger).not.toContainText('TIDE');
    await expect(page).toHaveURL(/from=2026-08-15/);
    await expect(page).toHaveURL(/ledger=41/);
    await expect(line).toBeFocused();
    await page.waitForFunction(start => Math.abs(window.scrollY - start) < 80, scrollBefore);
    const lineBox = await line.boundingBox();
    const ledgerBox = await ledger.boundingBox();
    expect(ledgerBox!.y).toBeGreaterThanOrEqual(lineBox!.y);
    expect(ledgerBox!.y - (lineBox!.y + lineBox!.height)).toBeLessThan(32);
    await expect(ledger.getByRole('link', { name: 'Edit in Activity', exact: true })).toHaveAttribute('href', /edit=41/);
    await expect(page.getByRole('link', { name: 'Open in Activity', exact: true })).toHaveAttribute('href', /from=2026-08-15/);
    expect(vault.mutations.filter(change => change.path === '/api/vault/records/upsert')).toHaveLength(0);
  });
}

test('a locked vault keeps no ticker list and a late quote cannot restore one', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('finance-auto-price-check:987', 'off'));
  const vault = await syntheticVault(page, records);
  await vault.open('/have?t=gallery');
  await expect(page.locator('[data-plaque="2"]')).toContainText('HARBOR');
  await expect(page.locator('[data-inspector-position]')).toHaveCount(0);
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
  await expect(page.locator('[data-plaque="2"]')).toContainText('HARBOR');
  await expect(page.locator('[data-inspector-position]')).toHaveCount(0);
  await expect(page.locator('[data-gallery-gain]')).toHaveCount(0);
  await info.attach('gallery-relocked', { body: await page.screenshot(), contentType: 'image/png' });
});

const richHoldings = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  symbol: `PIER${index}`,
  shares: 1,
  purchase_price: 10,
  purchase_date: '2026-01-02',
  current_price: 12,
  price_source: 'manual',
  quote_date: '2026-10-14',
  position_as_of: '2026-10-14',
  account_display: 'Checking',
}));
const richLines = Array.from({ length: 18 }, (_, index) => ({
  id: 100 + index,
  date: `2026-07-${String(index + 1).padStart(2, '0')}`,
  type: 'expense',
  category: 'Groceries',
  amount: 3 + index,
  description: `Kiosk ${index}`,
  bank_account_key: 'checking',
  account_display: 'Checking',
}));

for (const [width, theme] of [[390, 'light'], [1280, 'dark']] as const) {
  test(`a rich gallery keeps the chosen record next to its row at ${width} in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });
    await page.addInitScript(choice => {
      localStorage.setItem('suite-theme', choice);
      localStorage.setItem('finance-auto-price-check:987', 'off');
    }, theme);
    const vault = await syntheticVault(page, { holdings: richHoldings, transactions: richLines });
    await vault.open('/have?t=gallery');
    const gallery = page.locator('app-treasury-gallery');
    await expect(gallery).not.toContainText('$');
    await expect(page.locator('details.activity-filters')).not.toHaveAttribute('open');
    const gap = await page.evaluate(() => {
      const plaques = [...document.querySelectorAll('[data-plaque]')];
      const line = document.querySelector('[data-ledger-line]');
      if (!plaques.length || !line) return null;
      const plaqueBottom = plaques.at(-1)!.getBoundingClientRect().bottom + window.scrollY;
      const lineTop = line.getBoundingClientRect().top + window.scrollY;
      return lineTop - plaqueBottom;
    });
    expect(gap).not.toBeNull();
    expect(gap!).toBeLessThan(480);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

    const plaque = page.locator('[data-plaque="12"]');
    await plaque.scrollIntoViewIfNeeded();
    const plaqueScroll = await page.evaluate(() => window.scrollY);
    if (width === 390) await plaque.tap();
    else {
      await plaque.focus();
      await page.keyboard.press('Enter');
    }
    const position = page.locator('[data-inspector-position]');
    await expect(position).toContainText('PIER11');
    await expect(position).toContainText('Shares 1');
    await expect(position).not.toContainText('Kiosk');
    await expect(plaque).toBeFocused();
    await page.waitForFunction(start => Math.abs(window.scrollY - start) < 80, plaqueScroll);
    const plaqueBox = await plaque.boundingBox();
    const positionBox = await position.boundingBox();
    expect(positionBox!.y - (plaqueBox!.y + plaqueBox!.height)).toBeLessThan(32);

    const line = page.locator('[data-ledger-line="117"]');
    await line.scrollIntoViewIfNeeded();
    const lineScroll = await page.evaluate(() => window.scrollY);
    if (width === 390) await line.tap();
    else {
      await line.focus();
      await page.keyboard.press('Enter');
    }
    const ledger = page.locator('[data-inspector-ledger]');
    await expect(ledger).toContainText('Kiosk 17');
    await expect(ledger).not.toContainText('PIER11');
    await expect(line).toBeFocused();
    await expect(page).toHaveURL(/ledger=117/);
    await expect(page).toHaveURL(/position=12/);
    await page.waitForFunction(start => Math.abs(window.scrollY - start) < 80, lineScroll);
    const lineScrollAfter = await page.evaluate(() => window.scrollY);
    const lineBox = await line.boundingBox();
    const ledgerBox = await ledger.boundingBox();
    expect(ledgerBox!.y - (lineBox!.y + lineBox!.height)).toBeLessThan(32);
    expect(vault.mutations.filter(change => change.path === '/api/vault/records/upsert')).toHaveLength(0);

    const returnUrl = page.url();
    await ledger.getByRole('link', { name: 'Edit in Activity', exact: true }).click();
    await expect(page).toHaveURL(/\/finance\/spending/);
    await expect(page).toHaveURL(/edit=117/);
    await expect(page).toHaveURL(/month=all/);
    const editor = page.getByRole('dialog', { name: 'Edit transaction' });
    await expect(editor.getByLabel('Description (optional)')).toHaveValue('Kiosk 17');
    expect(vault.mutations.filter(change => change.path === '/api/vault/records/upsert')).toHaveLength(0);
    await page.goBack();
    await expect(page).toHaveURL(returnUrl);
    await expect(page.locator('[data-inspector-ledger]')).toContainText('Kiosk 17');
    await expect(page.locator('[data-ledger-line="117"]')).toBeFocused();
    expect(Math.abs(await page.evaluate(() => window.scrollY) - lineScrollAfter)).toBeLessThan(120);
  });
}
