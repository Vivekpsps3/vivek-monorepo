import { expect, test } from './frozen-clock';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { syntheticVault } from './synthetic-vault';

const LABELS = ['Home', 'Net worth', 'Spending', 'Recurring', 'Planning'];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;
const THEMES = ['light', 'dark'] as const;

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`navigation [${viewport.width} ${theme}]`, () => {
      test.use({ viewport });

      test.beforeEach(async ({ page }) => {
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      });

      test('five tabs, same words', async ({ page }) => {
        const vault = await syntheticVault(page);
        await vault.open('/');
        const nav = page.getByRole('navigation', { name: 'Finance sections' });
        await expect(page.locator('.mobile-tabbar')).toHaveCount(0);
        for (const label of LABELS) {
          const link = nav.getByRole('link', { name: label, exact: true });
          await link.scrollIntoViewIfNeeded();
          await expect(link).toBeVisible();
          const box = await link.boundingBox();
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      });

      test('document title matches the section', async ({ page }) => {
        const vault = await syntheticVault(page);
        for (const [path, label] of [
          ['/', 'Home'],
          ['/have', 'Net worth'],
          ['/spending', 'Spending'],
          ['/recurring', 'Recurring'],
          ['/planning', 'Planning'],
        ] as const) {
          await vault.open(path);
          await expect(page).toHaveTitle(`${label} · Finance`);
        }
      });

      test('sub-tabs are canonical', async ({ page }) => {
        const vault = await syntheticVault(page);
        await vault.open('/have');
        await page.getByRole('link', { name: 'Holdings', exact: true }).click();
        await expect(page).toHaveURL(/\/finance\/have\?t=holdings$/);
        await page.getByRole('link', { name: 'Assets and debts', exact: true }).click();
        await expect(page).toHaveURL(/\/finance\/have$/);
        await expect(page.locator('.hub-tabs a[aria-current="page"]')).toHaveCount(1);

        await vault.open('/spending');
        await page.getByRole('link', { name: 'Calendar', exact: true }).click();
        await expect(page).toHaveURL(/\/finance\/spending\?t=calendar$/);
        await page.getByRole('link', { name: 'Activity', exact: true }).click();
        await expect(page).toHaveURL(/\/finance\/spending$/);
        await expect(page.locator('.hub-tabs a[aria-current="page"]')).toHaveCount(1);

        await vault.open('/recurring');
        await page.getByRole('link', { name: 'Bills and subscriptions', exact: true }).click();
        await expect(page).toHaveURL(/\/finance\/recurring\?t=spend/);
        await page.getByRole('link', { name: 'Pay', exact: true }).click();
        await expect(page).toHaveURL(/\/finance\/recurring$/);
        await expect(page.locator('.hub-tabs a[aria-current="page"]')).toHaveCount(1);

        await vault.open('/planning');
        await page.getByRole('link', { name: 'Portfolio projection', exact: true }).click();
        await expect(page).toHaveURL(/\/finance\/planning\?t=growth$/);
        await page.getByRole('link', { name: 'Retirement and goals', exact: true }).click();
        await expect(page).toHaveURL(/\/finance\/planning$/);
        await expect(page.locator('.hub-tabs a[aria-current="page"]')).toHaveCount(1);
      });

      test('legacy params still resolve', async ({ page }) => {
        const vault = await syntheticVault(page);
        await vault.open('/have?t=assets');
        await expect(page.getByRole('link', { name: 'Assets and debts', exact: true })).toHaveAttribute('aria-current', 'page');

        await vault.open('/spending?t=pay', page, '/spending?t=activity&v=income');
        await expect(page).toHaveURL(/v=income/);

        await vault.open('/recurring?t=pay');
        await expect(page.getByRole('link', { name: 'Pay', exact: true })).toHaveAttribute('aria-current', 'page');

        await vault.open('/planning?t=path');
        await expect(page.getByRole('link', { name: 'Retirement and goals', exact: true })).toHaveAttribute('aria-current', 'page');
      });

      test('guide', async ({ page }) => {
        const vault = await syntheticVault(page, {
          assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 100, as_of_date: '2026-10-01' }],
        });
        await vault.open('/');
        const menu = await openUserMenu(page);
        await menu.getByRole('button', { name: 'Guide', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'How Finance works' });
        await expect(dialog).toBeVisible();
        await expect(page).toHaveURL(/\/finance\/?$/);
        await expect(dialog.getByRole('heading', { name: 'How Finance works' })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();

        const menuAgain = await openUserMenu(page);
        await menuAgain.getByRole('button', { name: 'Guide', exact: true }).click();
        await expect(dialog).toBeVisible();
        await dialog.getByRole('link', { name: 'Open Spending', exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(/\/finance\/spending/);

        await vault.open('/');
        const menuThird = await openUserMenu(page);
        await menuThird.getByRole('button', { name: 'Guide', exact: true }).click();
        await expect(dialog).toBeVisible();
        if (viewport.width <= 640) {
          for (const button of await dialog.locator('.tutorial-footer button').all()) {
            const box = await button.boundingBox();
            expect(box?.width ?? 0).toBeGreaterThanOrEqual(300);
          }
        }
        await dialog.getByRole('button', { name: 'Show first steps on Home', exact: true }).click();
        await expect(page).toHaveURL(/\/finance\/?$/);
        await expect(page.getByRole('heading', { name: 'First steps', exact: true })).toBeVisible();
      });
    });
  }
}
