import AxeBuilder from '@axe-core/playwright';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { expect, type Page, test } from './frozen-clock';
import { moneyText } from './money-text';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from './synthetic-vault';

const positions = [
  { symbol: 'HARBOR', company_name: 'Harbor Infrastructure and Coastal Transport Fund', current_price: 124.56 },
  { symbol: 'TIDE', company_name: 'Tide Pool', current_price: 25.58, quote_date: '2026-10-01' },
  { symbol: 'BRASS', current_price: 205.25 },
  { symbol: 'BAY', current_price: 11.14 },
  { symbol: 'ISLE', current_price: 27.96 },
  { symbol: 'LANE', current_price: 195.13 },
  { symbol: 'FLAT', current_price: 0 },
  { symbol: 'UNLISTED', current_price: null, purchase_price: null, price_source: 'unavailable', quote_date: null },
].map((position, index) => ({
  id: index + 1, shares: 2, purchase_price: 12, purchase_date: '2025-01-02',
  position_as_of: '2026-10-14', quote_date: '2026-10-14', price_source: 'live_eod', ...position,
}));

async function configure(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(choice => {
    localStorage.setItem('suite-theme', choice);
    localStorage.setItem('finance-auto-price-check:987', 'off');
  }, theme);
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => {
    const containers = [document.documentElement, ...document.querySelectorAll('.main-content, app-portfolio .ui-data-table, #allocation-content .ui-data-table')];
    return containers.every(el => el.scrollWidth <= el.clientWidth + 1);
  })).toBe(true);
}

test.use({ hasTouch: true });

for (const [width, theme, zoom] of [
  [390, 'light', false], [390, 'dark', false],
  [1280, 'light', false], [1280, 'dark', false], [320, 'light', false], [390, 'dark', true],
] as const) {
  test('dense Holdings at ' + width + ' ' + theme + (zoom ? ' with 200% text' : ''), async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    await configure(page, theme);
    const vault = await syntheticVault(page, { holdings: positions });
    await vault.open('/have?t=holdings');
    if (zoom) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const table = page.getByRole('table', { name: 'Manual holdings' });
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(8);
    for (const row of positions) await expect(rows.filter({ hasText: row.symbol })).toHaveCount(1);
    const harbor = rows.filter({ hasText: 'HARBOR' });
    await expect(harbor.locator('[data-label="Value"]')).toHaveText(moneyText('$249.12'));
    await expect(harbor).toContainText('Position date');
    await expect(rows.filter({ hasText: 'TIDE' })).toContainText('Stale');
    await expect(rows.filter({ hasText: 'UNLISTED' }).locator('[data-label="Value"]')).toHaveText('Unavailable');
    await expectNoOverflow(page);
    await expect(page.locator('app-portfolio .summary-card')).not.toContainText('UNLISTED');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await info.attach('holdings', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await harbor.scrollIntoViewIfNeeded();
    await info.attach('holdings-rows', { body: await page.screenshot(), contentType: 'image/png' });

    const edit = harbor.getByRole('button', { name: 'Edit HARBOR' });
    for (const button of await harbor.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(Math.min(box!.height, box!.width)).toBeGreaterThanOrEqual(44);
    }
    await edit.focus();
    await page.keyboard.press('Enter');
    let dialog = page.getByRole('dialog', { name: 'Edit holding' });
    await expect(dialog.getByRole('textbox', { name: 'Symbol' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(edit).toBeFocused();

    const search = page.getByRole('searchbox', { name: 'Search holdings' });
    await search.fill('TIDE');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(moneyText('$51.16'));
    await search.fill('');
    await expect(rows).toHaveCount(8);
    expect(vault.mutations).toHaveLength(0);

    if (width === 390 && theme === 'light') {
      await edit.tap();
      dialog = page.getByRole('dialog', { name: 'Edit holding' });
      await dialog.getByRole('textbox', { name: 'Shares' }).fill('3');
      vault.failNextWrites();
      await dialog.getByRole('button', { name: 'Update' }).tap();
      await expect(dialog.getByRole('alert')).toBeVisible();
      await expect(dialog.getByRole('textbox', { name: 'Shares' })).toHaveValue('3');
      expect(vault.data('holdings').find(row => row.symbol === 'HARBOR')?.shares).toBe(2);
      await dialog.getByRole('button', { name: 'Update' }).tap();
      await expect(dialog).toHaveCount(0);
      await expect(edit).toBeFocused();
      await expect(harbor.locator('[data-label="Value"]')).toHaveText(moneyText('$373.68'));
      expect(Number(vault.data('holdings').find(row => row.symbol === 'HARBOR')?.shares)).toBe(3);
    }
  });
}

for (const [width, theme, incomplete] of [[390, 'dark', true], [1280, 'light', false], [1280, 'dark', false]] as const) {
  test('Holdings mix keeps quote truth at ' + width + ' ' + theme, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    await configure(page, theme);
    await page.addInitScript(() => localStorage.setItem('finance.chartTable.allocation', '0'));
    const holdings = incomplete ? positions : positions.filter(row => row.symbol !== 'UNLISTED');
    const vault = await syntheticVault(page, { holdings });
    await vault.open('/');
    const card = page.locator('app-charts ui-card').filter({ hasText: 'Holdings mix' });
    await expect(card.getByText('Includes saved values from stale quotes.')).toBeVisible();
    if (incomplete) {
      await expect(card.locator('canvas')).toHaveCount(0);
      await expect(card.getByText('Some position values are unavailable.', { exact: false })).toBeVisible();
    } else {
      const canvas = card.getByRole('img', { name: /Holdings mix/ });
      await expect(canvas).toBeVisible();
      await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
        const expected = getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim();
        const rgb = expected.slice(1).match(/.{2}/g)!.map(part => parseInt(part, 16));
        const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] === rgb[0] && pixels[i + 1] === rgb[1] && pixels[i + 2] === rgb[2] && pixels[i + 3] === 255) return true;
        }
        return false;
      })).toBe(true);
      await info.attach('allocation-chart', { body: await card.screenshot(), contentType: 'image/png' });
      const toggle = card.getByRole('button', { name: 'Show as table' });
      expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(card.getByRole('button', { name: 'Show as chart' })).toBeFocused();
    }
    const table = card.getByRole('table', { name: 'Holdings mix' });
    await expect(table.locator('tbody tr')).toHaveCount(holdings.length);
    const tide = table.getByRole('row').filter({ hasText: 'TIDE' });
    await expect(tide).toContainText('Stale · 14 days old');
    await expect(tide).toContainText(moneyText('$51.16'));
    await expect(table.getByRole('row').filter({ hasText: 'FLAT' })).toContainText(moneyText('$0.00'));
    if (incomplete) {
      const unknown = table.getByRole('row').filter({ hasText: 'UNLISTED' });
      await expect(unknown.getByText('Unavailable', { exact: true })).toHaveCount(2);
      await expect(unknown).not.toContainText(moneyText('$0.00'));
      await expect(tide.locator('[data-label="Share"]')).toHaveText('Unavailable');
    } else {
      await expect(tide.locator('[data-label="Share"]')).toContainText('%');
    }
    await expectNoOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await info.attach('allocation-table', { body: await card.screenshot(), contentType: 'image/png' });
    expect(vault.mutations).toHaveLength(0);
  });
}

test('a held Holdings row refresh cannot publish after a vault lock', async ({ page }) => {
  await configure(page, 'light');
  const holding = positions[0];
  const vault = await syntheticVault(page, { holdings: [holding] });
  const second = await page.context().newPage();
  await vault.open('/have?t=holdings');
  await vault.open('/have?t=holdings', second);
  let release!: () => void;
  const held = new Promise<void>(done => { release = done; });
  await page.route('**/api/market/price/HARBOR?*', async route => {
    await held;
    await route.fulfill({ json: { symbol: 'HARBOR', valid: true, price: 450, quote_date: '2026-10-14' } }).catch(() => {});
  });
  const pending = page.waitForRequest('**/api/market/price/HARBOR?*');
  await page.getByRole('button', { name: 'Refresh price for HARBOR' }).tap();
  await pending;
  await page.getByRole('button', { name: 'Edit HARBOR' }).tap();
  const draft = page.getByRole('dialog', { name: 'Edit holding' });
  await draft.getByRole('textbox', { name: 'Shares' }).fill('243');
  const menu = await openUserMenu(second);
  await menu.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page).toHaveURL(/\/vault\/unlock/);
  release();
  await expect(draft).toHaveCount(0);
  await expect(page.getByText(/HARBOR price (refreshed|could not be refreshed)/)).toHaveCount(0);
  await page.getByLabel('Vault passphrase').fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Manual holdings' })).toContainText(moneyText('$249.12'));
  expect(vault.data('holdings')[0]).toMatchObject({ shares: 2, current_price: 124.56 });
  expect(vault.mutations).toHaveLength(0);
});
