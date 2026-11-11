import { expect, test } from './frozen-clock';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { syntheticVault } from './synthetic-vault';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;
const THEMES = ['light', 'dark'] as const;

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`clear data [${viewport.width} ${theme}]`, () => {
      test.use({ viewport });
      test.beforeEach(async ({ page }) => {
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      });

      test(`Clear data dialog starts on Cancel and never on the danger button [${viewport.width} ${theme}]`, async ({ page }) => {
        const vault = await syntheticVault(page, {});
        await vault.open('/');
        const menu = await openUserMenu(page);
        await menu.getByRole('button', { name: 'Clear data…', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Clear all Finance data?', exact: true });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
        await expect(dialog.getByRole('button', { name: 'Clear data', exact: true })).not.toBeFocused();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      });

      test(`price-check Details opens the disclosure and returns focus [${viewport.width} ${theme}]`, async ({ page }) => {
        const vault = await syntheticVault(page, {});
        await vault.open('/');
        const trigger = page.getByRole('banner').getByRole('button', { name: 'synthetic', exact: true });
        const menu = await openUserMenu(page);
        await menu.getByRole('button', { name: 'About price checks', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'About price checks' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText('Price checks send ticker symbols only. Shares, balances and plans stay encrypted in this browser.')).toBeVisible();
        await expect(dialog.getByText("Prices come from a public market-data service, requested by Finance's server.")).toBeVisible();
        await dialog.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(trigger).toBeFocused();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      });

      test(`menu fits at ${viewport.width} [${viewport.width} ${theme}]`, async ({ page }) => {
        const vault = await syntheticVault(page, {});
        await vault.open('/');
        const menu = await openUserMenu(page);
        const fits = await menu.evaluate(el => el.scrollWidth <= el.clientWidth);
        expect(fits).toBe(true);
        const heights = await menu.locator('.finance-user-actions').getByRole('button').evaluateAll(
          buttons => buttons.map(b => b.getBoundingClientRect().height),
        );
        expect(heights.length).toBeGreaterThan(0);
        // Sub-pixel rounding can report 43.9999 for a 44px min-height.
        for (const height of heights) expect(Math.round(height)).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      });
    });
  }
}
