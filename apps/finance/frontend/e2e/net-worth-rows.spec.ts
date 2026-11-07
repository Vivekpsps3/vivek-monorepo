import { expect, test } from '@playwright/test';
import { syntheticVault } from './synthetic-vault';

// F16: debt labels, header order, delete copy, and the holdings details row.
// (The ⋯ row menus arrive with K1's ui-menu; Edit/Delete buttons serve
// until then, so these tests use the buttons.)
test('assets and debts use the plain labels and delete copy', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 4200, as_of_date: '2026-10-01' }],
    liabilities: [{ id: 2, name: 'Card', category: 'credit_card', balance_owed: 250, as_of_date: '2026-10-01' }],
  });
  await vault.open('/have?t=assets');

  const actions = page.locator('.header-actions');
  await expect(actions.getByRole('button')).toHaveText(['Add asset', 'Add debt']);
  await expect(page.getByRole('table', { name: 'Debts' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Owed' })).toBeVisible();
  await expect(page.getByText('Liabilities', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Debt dates')).toBeVisible();

  const debts = page.getByRole('table', { name: 'Debts' });
  await debts.getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText('Delete Card?');
  await expect(confirm).toContainText("This removes it from your net worth. Past activity isn't affected.");
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Card deleted')).toBeVisible();
});

test('holdings show one table shape with a details row', async ({ page }) => {
  const vault = await syntheticVault(page, {
    holdings: [{ id: 1, symbol: 'VOO', shares: 3, purchase_price: 100, purchase_date: '2026-01-01', position_as_of: '2026-01-01' }],
  });
  vault.setQuote('VOO', { price: 700.86 });
  await vault.open('/have?t=holdings');

  const actions = page.locator('.header-actions');
  await expect(actions.getByRole('button').first()).toHaveText('Add holding');
  await expect(page.getByText('Portfolio value')).toBeVisible();
  await expect(page.getByText('Unrealized gain')).toBeVisible();

  const table = page.getByRole('table', { name: 'Manual holdings' });
  await expect(table.getByRole('columnheader')).toHaveText(['Symbol', 'Shares', 'Value', 'Gain', 'Price', 'Actions']);
  await expect(table).toContainText('Cost basis $100.00 · Position date Jan 1 · Manual');
});
