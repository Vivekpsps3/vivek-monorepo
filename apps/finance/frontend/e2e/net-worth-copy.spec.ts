import { expect, test } from './frozen-clock';
import { moneyText } from './money-text';
import { syntheticVault } from './synthetic-vault';
import { chooseColorTheme } from '../../../../tests/e2e/user-menu.mjs';

// F22: the Net worth summary card uses the one-line breakdown
// ("Assets $X · Investments $Y · Debts −$Z") with a single
// "Balances as of" line, and the balance dialogs save with
// "Save asset" / "Save debt". Matrix: 390/1280 × light/dark.
const viewports = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;
const themes = ['light', 'dark'] as const;

for (const viewport of viewports) {
  for (const theme of themes) {
    test(`[${viewport.width} ${theme}] net worth summary and save copy`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const vault = await syntheticVault(page, {
        assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 2000, as_of_date: '2026-10-01' }],
        liabilities: [{ id: 2, name: 'Card', category: 'credit_card', balance_owed: 500, as_of_date: '2026-10-22' }],
      });
      await vault.open('/have?t=assets');
      await chooseColorTheme(page, theme);
      await vault.reload(page);
      await vault.open('/have?t=assets');

      const card = page.locator('.summary-card');
      const line = card.locator('.summary-line');
      await expect(line).toContainText('Assets');
      await expect(line).toContainText(moneyText('$2,000.00'));
      await expect(line).toContainText('Investments');
      await expect(line).toContainText('Debts');
      await expect(line).toContainText(moneyText('−$500.00'));
      await expect(card.locator('.source-dates')).toContainText('Balances as of');
      await expect(card.locator('.source-dates')).toContainText('Oct 1');
      await expect(card.locator('.source-dates')).toContainText('Oct 22');
      await expect(card).not.toContainText('Asset dates');
      await expect(card).not.toContainText('Liability dates');
      await expect(card).not.toContainText('Other assets');

      await page.getByRole('button', { name: 'Add asset' }).first().click();
      const assetDialog = page.getByRole('dialog', { name: 'Add asset' });
      await expect(assetDialog.getByRole('button', { name: 'Save asset', exact: true })).toBeVisible();
      await assetDialog.getByRole('button', { name: 'Cancel' }).click();

      await page.getByRole('button', { name: 'Add debt', exact: true }).first().click();
      const debtDialog = page.getByRole('dialog', { name: 'Add debt' });
      await expect(debtDialog.getByRole('button', { name: 'Save debt', exact: true })).toBeVisible();
      await debtDialog.getByRole('button', { name: 'Cancel' }).click();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(overflow).toBe(true);
    });
  }
}
