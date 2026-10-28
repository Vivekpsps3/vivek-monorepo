import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { expect, Page, test } from '@playwright/test';
import { syntheticVault } from './synthetic-vault';

async function expectFits(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('.main-content') as HTMLElement | null;
    const viewWidth = document.documentElement.clientWidth;
    let right = 0;
    let edge = '';
    for (const node of Array.from(document.querySelectorAll('body *'))) {
      const el = node as HTMLElement;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 8 || box.height < 8) continue;
      if (box.right > right) {
        right = box.right;
        edge = `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} ${box.left.toFixed(0)}+${box.width.toFixed(0)}`;
      }
    }
    const scrolling = document.scrollingElement || document.documentElement;
    return {
      main: main ? main.scrollWidth - main.clientWidth : 0,
      page: scrolling.scrollWidth,
      innerWidth: window.innerWidth,
      right,
      viewWidth,
      edge,
    };
  });
  expect(overflow.main, `${label} horizontal scroll`).toBeLessThanOrEqual(1);
  expect(overflow.page, `${label} document scrollWidth`).toBeLessThanOrEqual(overflow.innerWidth);
  expect(overflow.right, `${label} right edge ${overflow.edge}`).toBeLessThanOrEqual(overflow.viewWidth + 1);
}

test('phone shell scrolls in one column and does not count refreshed tickers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 1000, as_of_date: '2026-10-01' }],
    liabilities: [{ id: 2, name: 'Card', category: 'credit_card', balance_owed: 100, as_of_date: '2026-10-01' }],
    holdings: [{
      id: 10, symbol: 'VOO', shares: 2, purchase_price: 80, purchase_date: '2022-01-01',
      current_price: 100, price_source: 'manual', position_as_of: '2026-10-10', company_name: 'Vanguard 500',
    }],
    transactions: [{ id: 3, date: '2026-10-02', type: 'expense', kind: 'purchase', category: 'Food', amount: 40, description: 'Grocery' }],
  });

  await vault.open('/');
  await expect.poll(() => vault.data('holdings')[0]?.current_price).toBe(125);
  await expect(page.locator('.market-banner')).toHaveCount(0);
  await expect(page.getByText(/of \d+ tickers/)).toHaveCount(0);
  await expect(page.locator('.mobile-tabbar')).toBeVisible();
  await expect(page.locator('.nav-tabs')).toBeHidden();
  await expectFits(page, 'home');

  await page.locator('.mobile-tab', { hasText: 'Have' }).click();
  await expect(page).toHaveURL(/\/have/);
  await expectFits(page, 'assets');
  await page.getByRole('link', { name: 'Holdings' }).click();
  await expect(page.locator('td[data-label="Shares"]').first()).toBeVisible();
  await expectFits(page, 'holdings');
  await page.getByRole('button', { name: 'Add Holding' }).click();
  const dialog = page.locator('.ui-dialog-panel');
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(el => getComputedStyle(el).transform)).toBe('none');
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox?.width ?? 999).toBeLessThanOrEqual(390);
  expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(844);
  await page.keyboard.press('Escape');

  await page.locator('.mobile-tab', { hasText: 'Spend' }).click();
  await expect(page).toHaveURL(/\/spending/);
  await expectFits(page, 'spending');
  const activity = page.locator('.tx-mobile-row').first();
  await activity.scrollIntoViewIfNeeded();
  await expect(activity).toContainText('Food');
  await activity.locator('summary').click();
  await expect(activity).toContainText('Grocery');
  await expectFits(page, 'transaction');
  await page.getByRole('link', { name: 'Calendar' }).click();
  await expect(page.locator('.calendar-grid')).toBeVisible();
  await expectFits(page, 'calendar');

  await page.locator('.mobile-tab', { hasText: 'Repeat' }).click();
  await expect(page).toHaveURL(/\/recurring/);
  await expectFits(page, 'recurring');

  await page.locator('.mobile-tab', { hasText: 'Plan' }).click();
  await expect(page).toHaveURL(/\/planning/);
  await expectFits(page, 'planning');
  const scrolled = await page.evaluate(() => {
    const main = document.querySelector('.main-content') as HTMLElement;
    const before = main.scrollTop;
    main.scrollTop = main.scrollHeight;
    return { before, after: main.scrollTop, height: main.scrollHeight, client: main.clientHeight };
  });
  expect(scrolled.height).toBeGreaterThan(scrolled.client);
  expect(scrolled.after).toBeGreaterThan(scrolled.before);

  await page.locator('.mobile-tab', { hasText: 'Home' }).click();
  await openUserMenu(page);
  await page.getByRole('button', { name: 'Guide' }).click();
  const tutorial = page.locator('.tutorial-panel');
  await expect(tutorial).toBeVisible();
  const tutorialBox = await tutorial.boundingBox();
  expect(tutorialBox?.width ?? 999).toBeLessThanOrEqual(390);
  expect(tutorialBox?.height ?? 999).toBeLessThanOrEqual(844);
  await expect(tutorial).toContainText('Only ticker symbols are sent for market quotes');
  await page.getByRole('button', { name: 'Close' }).click();

  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.locator('.mobile-tabbar')).toBeVisible();
  await expect(page.locator('.nav-tabs')).toBeHidden();
  await expectFits(page, 'narrow home');
});
