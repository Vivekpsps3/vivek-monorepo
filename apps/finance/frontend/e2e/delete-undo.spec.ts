import { expect, test, frozenToday } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

// F21: deleting a transaction offers Undo for 8 seconds; Undo restores the
// exact record (same id and fields), exactly once.
test.describe('transaction delete undo (F21)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  const seed = {
    transactions: [{
      id: 4242, date: frozenToday(), type: 'expense', kind: 'purchase', category: 'Food',
      amount: 12.5, description: 'Bakery run', merchant: 'Bakery',
      bank_account_key: 'card-a', account_display: 'Daily card',
    }],
  };

  async function deleteSeeded(page: import('@playwright/test').Page): Promise<void> {
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Delete transaction?', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Transaction deleted', { exact: true })).toBeVisible();
  }

  test('undo restores the exact record once', async ({ page }) => {
    const vault = await syntheticVault(page, seed);
    await vault.open('/spending');
    const row = page.getByRole('row', { name: /Bakery/ });
    await expect(row).toBeVisible();
    await deleteSeeded(page);
    await expect.poll(() => vault.data('transactions')).toHaveLength(0);
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    await expect(undo).toBeVisible();
    await undo.focus();
    await expect(undo).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => vault.data('transactions')).toHaveLength(1);
    expect(vault.data('transactions')[0]).toMatchObject({
      id: 4242, description: 'Bakery run', merchant: 'Bakery', amount: 12.5,
      bank_account_key: 'card-a', account_display: 'Daily card', kind: 'purchase',
    });
    await expect(row).toBeVisible();
  });

  test('after 8 seconds the Undo offer is gone', async ({ page }) => {
    const vault = await syntheticVault(page, seed);
    await vault.open('/spending');
    await deleteSeeded(page);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
    await page.clock.fastForward(9000);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
    await expect.poll(() => vault.data('transactions')).toHaveLength(0);
  });
});
