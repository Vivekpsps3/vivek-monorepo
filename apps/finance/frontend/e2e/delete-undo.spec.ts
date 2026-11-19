import { expect, test, frozenToday } from './frozen-clock';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from './synthetic-vault';

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

test.describe('Activity row recovery', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  const imported = {
    id: 412, date: '2026-10-15', type: 'expense', kind: 'purchase', category: 'Food',
    amount: 23.4, description: 'RAW BOARDWALK CAFE 123', merchant: 'Boardwalk Cafe',
    source: 'import', import_receipt_id: 6, bank_account_key: 'coffee-a', account_display: 'Cafe card', trip_id: 11,
  };

  test('keeps the draft, original amount and import identity through failed edit, delete and Undo', async ({ page }) => {
    const vault = await syntheticVault(page, { transactions: [imported] });
    await vault.open('/spending?date=2026-10-15');
    const row = page.getByRole('row', { name: /Boardwalk Cafe/ });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit transaction' });
    const category = editor.getByLabel('Category');
    await category.fill('Dining');
    await expect(editor.getByLabel('Description (optional)')).toHaveValue(imported.description);
    vault.failNextWrites();
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText(/save/i);
    await expect(category).toHaveValue('Dining');
    await expect(editor.getByLabel('Amount')).toHaveValue('23.4');
    expect(vault.data('transactions')[0]).toMatchObject(imported);
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(row).toContainText('Dining · Cafe card');
    const corrected = { ...imported, category: 'Dining', import_edited: true };
    expect(vault.data('transactions')[0]).toMatchObject(corrected);

    const remove = row.getByRole('button', { name: 'Delete', exact: true });
    const confirm = page.getByRole('dialog', { name: 'Delete transaction?' });
    await remove.click();
    vault.failNextWrites();
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    const retry = page.getByRole('button', { name: 'Try again', exact: true });
    await expect(page.getByText("Couldn't delete this transaction.")).toBeVisible();
    await expect(row).toBeVisible();
    expect(vault.data('transactions')[0]).toMatchObject(corrected);
    await retry.click();
    await expect(row).toHaveCount(0);
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    vault.failNextWrites();
    await undo.click();
    await expect(page.getByText("Couldn't restore this transaction.")).toBeVisible();
    expect(vault.data('transactions')).toHaveLength(0);
    await retry.click();
    await expect(row).toBeVisible();
    expect(vault.data('transactions')).toEqual([expect.objectContaining(corrected)]);
    expect(vault.mutations.filter(change => /records\/(upsert|delete)$/.test(change.path))).toHaveLength(6);
  });

  test('a held old-session save cannot publish its draft or feedback after lock', async ({ page }) => {
    const vault = await syntheticVault(page, { transactions: [imported] });
    const second = await page.context().newPage();
    await vault.open('/spending?date=2026-10-15');
    await vault.open('/', second);
    const row = page.getByRole('row', { name: /Boardwalk Cafe/ });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit transaction' });
    await editor.getByLabel('Category').fill('Unpublished harbor draft');
    vault.holdNextUpserts();
    vault.failNextWrites();
    try {
      await editor.getByRole('button', { name: 'Save', exact: true }).click();
      await vault.waitForHeldUpserts();
      const menu = await openUserMenu(second);
      await menu.getByRole('button', { name: 'Lock Finance', exact: true }).click();
      await expect(page).toHaveURL(/\/vault\/unlock/);
      await expect(editor).toHaveCount(0);
      await expect(row).toHaveCount(0);
    } finally {
      vault.releaseHeldUpserts();
    }
    await page.getByLabel('Vault passphrase').fill(SYNTHETIC_VAULT_PASSPHRASE);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === '/finance/spending' && url.searchParams.get('date') === imported.date);
    await expect(row).toContainText('Food · Cafe card');
    await expect(page.getByText(/Unpublished harbor draft|Couldn't save|Transaction saved/)).toHaveCount(0);
    expect(vault.data('transactions')[0]).toMatchObject(imported);

    const sections = page.getByRole('navigation', { name: 'Finance sections' });
    await sections.getByRole('link', { name: 'Home', exact: true }).click();
    await sections.getByRole('link', { name: 'Activity', exact: true }).click();
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete transaction?' });
    await expect(confirm).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/finance$/);
    await expect(confirm).toHaveCount(0);
    expect(vault.data('transactions')[0]).toMatchObject(imported);
  });
});
