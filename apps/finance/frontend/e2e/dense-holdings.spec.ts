import { readFile } from 'node:fs/promises';
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
    const harborValue = harbor.locator('[data-label="Value"]');
    await expect(harborValue).toHaveText(moneyText('$249.12'));
    if (!zoom && width >= 390) {
      await expect(harbor.getByText('HARBOR', { exact: true })).toBeInViewport({ ratio: 1 });
      await expect(harborValue).toBeInViewport({ ratio: 1 });
      await info.attach('holdings-first-screen', { body: await page.screenshot(), contentType: 'image/png' });
    }
    await expect(harbor).toContainText('Position date');
    await expect(rows.filter({ hasText: 'TIDE' })).toContainText('Stale');
    const unknown = rows.filter({ hasText: 'UNLISTED' });
    await expect(unknown.locator('[data-label="Value"]')).toHaveText('Unavailable');
    await expect(unknown).toContainText('Cost basis Unknown');
    await expect(page.locator('app-portfolio .summary-card')).toContainText('Known portfolio value');
    await expect(page.locator('app-portfolio .summary-card')).toContainText('1 position');
    await expect(page.locator('app-portfolio .summary-card')).toContainText('1 with no date');
    await expect(page.locator('app-portfolio .summary-card')).toContainText('1 stale quote');
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
    await search.fill('nonexistent market position');
    await expect(page.getByText('No matching holdings', { exact: true })).toBeVisible();
    await expect(page.getByText('No holdings yet', { exact: true })).toHaveCount(0);
    await search.fill('');
    await expect(rows).toHaveCount(8);
    expect(vault.mutations).toHaveLength(0);

    if (width === 390 && theme === 'light') {
      const tide = rows.filter({ hasText: 'TIDE' });
      vault.failQuote('TIDE');
      await tide.getByRole('button', { name: 'Refresh price for TIDE' }).tap();
      await expect(page.getByText('TIDE price could not be refreshed.')).toBeVisible();
      await expect(tide).toContainText('Stale · 14 days old');
      await expect(tide.locator('[data-label="Value"]')).toHaveText(moneyText('$51.16'));
      expect(vault.data('holdings').find(row => row.symbol === 'TIDE')).toMatchObject({
        current_price: 25.58, quote_date: '2026-10-01',
      });
      vault.failQuote('UNLISTED');
      await unknown.getByRole('button', { name: 'Refresh price for UNLISTED' }).tap();
      const quoteError = page.getByRole('alert').getByText('UNLISTED price could not be refreshed.');
      await expect(quoteError).toBeVisible();
      await expect(quoteError).not.toContainText('prior price');
      await expect(unknown.locator('[data-label="Price"]')).toContainText('Unavailable');
      expect(vault.mutations).toHaveLength(0);
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

test('Holdings tools and account search keep provenance and saved nicknames', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await configure(page, 'dark');
  const vault = await syntheticVault(page, {
    brokerage_accounts: [
      { id: 21, broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: 'SYN1', nickname: 'Harbor account' },
      { id: 22, broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: 'SYN2', nickname: 'Harbor account' },
    ],
    holdings: [
      { ...positions[0], brokerage_account_id: 21 },
      { ...positions[1], brokerage_account_id: 22 },
      ...positions.slice(2),
    ],
  });
  await vault.open('/have?t=holdings');
  const accountTables = page.getByRole('table', { name: 'Harbor account holdings', exact: true });
  await expect(accountTables).toHaveCount(2);
  await expect(accountTables.first().getByText('HARBOR', { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(accountTables.first().locator('[data-label="Value"]')).toBeInViewport({ ratio: 1 });

  const search = page.getByRole('searchbox', { name: 'Search holdings' });
  await search.fill(' HARBOR ACCOUNT ');
  await expect(accountTables).toHaveCount(2);
  await expect(page.getByRole('table', { name: 'Manual holdings' })).toHaveCount(0);
  await search.fill('Coastal Transport');
  await expect(accountTables).toHaveCount(1);
  await expect(accountTables).toContainText('Brokerage position');

  const tools = page.getByRole('button', { name: 'Holdings actions', exact: true });
  expect(Math.min((await tools.boundingBox())!.width, (await tools.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  await tools.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Holdings actions', exact: true });
  const importAction = menu.getByRole('menuitem', { name: 'Import from Fidelity', exact: true });
  await expect(importAction).toBeFocused();
  await expectNoOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await info.attach('holdings-actions', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(tools).toBeFocused();
  await tools.tap();
  const exportAction = menu.getByRole('menuitem', { name: 'Export CSV', exact: true });
  const [download] = await Promise.all([page.waitForEvent('download'), exportAction.tap()]);
  expect(download.suggestedFilename()).toBe('holdings.csv');
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('"Cost Basis","Current Price","Market Value","Gain","Price Source","Position As Of","Quote Date"');
  expect(csv).toContain('HARBOR');
  expect(csv).toContain('live_eod');
  expect(csv).not.toContain('TIDE');
  expect(vault.mutations).toHaveLength(0);

  const rename = page.getByRole('button', { name: 'Rename account Harbor account', exact: true });
  await rename.tap();
  const dialog = page.getByRole('dialog', { name: 'Rename account', exact: true });
  const nickname = dialog.getByRole('textbox', { name: 'Account nickname' });
  await expect(nickname).toBeFocused();
  await nickname.fill('Harbor tax account');
  vault.failNextWrites();
  await dialog.getByRole('button', { name: 'Save nickname' }).tap();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(nickname).toHaveValue('Harbor tax account');
  await dialog.getByRole('button', { name: 'Save nickname' }).tap();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rename account Harbor tax account', exact: true })).toBeFocused();
  await expect(page.getByRole('table', { name: 'Harbor tax account holdings', exact: true })).toBeVisible();
  expect(vault.data('brokerage_accounts').find(account => account.id === 21)?.nickname).toBe('Harbor tax account');
  expect(vault.data('brokerage_accounts').find(account => account.id === 22)?.nickname).toBe('Harbor account');
  expect(vault.data('holdings')).toHaveLength(8);
});

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

for (const refresh of ['row', 'all'] as const) {
  test(`a held Holdings ${refresh} refresh cannot publish after a vault lock`, async ({ page }) => {
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
    if (refresh === 'row') {
      await page.getByRole('button', { name: 'Refresh price for HARBOR' }).tap();
    } else {
      await page.getByRole('button', { name: 'Holdings actions', exact: true }).tap();
      await page.getByRole('menuitem', { name: 'Refresh prices', exact: true }).tap();
      await expect(page.getByText('Refreshing prices…', { exact: true })).toBeVisible();
    }
    await pending;
    await page.getByRole('button', { name: 'Edit HARBOR' }).tap();
    const draft = page.getByRole('dialog', { name: 'Edit holding' });
    await draft.getByRole('textbox', { name: 'Shares' }).fill('243');
    const menu = await openUserMenu(second);
    await menu.getByRole('button', { name: 'Lock Finance', exact: true }).click();
    await expect(page).toHaveURL(/\/vault\/unlock/);
    release();
    await expect(draft).toHaveCount(0);
    await expect(page.getByText(/HARBOR price (refreshed|could not be refreshed)|Updated .*holding price|[Pp]rices could not be refreshed/)).toHaveCount(0);
    await page.getByLabel('Vault passphrase').fill(SYNTHETIC_VAULT_PASSPHRASE);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Manual holdings' })).toContainText(moneyText('$249.12'));
    expect(vault.data('holdings')[0]).toMatchObject({ shares: 2, current_price: 124.56 });
    expect(vault.mutations).toHaveLength(0);
  });
}
