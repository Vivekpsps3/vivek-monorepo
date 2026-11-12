import { expect, test, frozenToday } from './frozen-clock';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from './synthetic-vault';

const fallback = 'Something went wrong. Reload the page if this keeps happening.';

test('FQA2 a held legacy rewrite released after lock does not toast or replace the next session', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{
      id: 4, name: 'Cash marker', category: 'cash', current_value: 10, as_of_date: '2026-01-01',
      schema_version: 1,
    }],
    transactions: [{
      id: 8, date: frozenToday(), type: 'expense', kind: 'purchase', category: 'Food',
      amount: 4, description: 'Tea marker',
    }],
    holdings: [{
      id: 9, symbol: 'VOO', shares: 1, purchase_price: 80, purchase_date: '2026-01-01',
      current_price: 100, price_source: 'manual',
    }],
  });
  vault.holdNextUpserts(1);
  const opening = vault.open('/');
  await vault.waitForHeldUpserts();
  const rewrite = vault.mutations.filter(change => change.path.endsWith('/upsert'));
  expect(rewrite).toHaveLength(1);
  expect(rewrite[0].body.records[0]).toMatchObject({ collection: 'assets', schema_version: 2 });
  await expect(page.locator('.user-menu-toggle')).toBeVisible();
  const menu = await openUserMenu(page);
  await menu.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page).toHaveURL(/\/vault\/unlock/);
  vault.releaseHeldUpserts();
  await expect(page.getByText(fallback)).toHaveCount(0);
  await opening.catch(() => undefined);

  await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/?$/);
  await expect(page.getByText(fallback)).toHaveCount(0);
  expect(vault.data('assets').filter(row => row.name === 'Cash marker')).toEqual([
    expect.objectContaining({ id: 4, current_value: 10 }),
  ]);
  expect(vault.data('transactions')).toEqual([
    expect.objectContaining({ id: 8, description: 'Tea marker', amount: 4 }),
  ]);
  expect(vault.data('holdings').some(row => row.id === 9 && row.symbol === 'VOO')).toBe(true);
});

test('FQA3 deleting a holding then a transaction leaves the other records after reload', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Cash marker', category: 'cash', current_value: 10, as_of_date: '2026-01-01' }],
    holdings: [
      { id: 9, symbol: 'MSFT', shares: 2, purchase_price: 10, purchase_date: '2024-01-02', current_price: 12, price_source: 'manual' },
      { id: 10, symbol: 'VOO', shares: 1, purchase_price: 80, purchase_date: '2026-01-01', current_price: 100, price_source: 'manual' },
    ],
    transactions: [
      { id: 8, date: frozenToday(), type: 'expense', kind: 'purchase', category: 'Food', amount: 4, description: 'Tea marker', merchant: 'Tea' },
      { id: 7, date: frozenToday(), type: 'expense', kind: 'purchase', category: 'Food', amount: 12.5, description: 'Bakery marker', merchant: 'Bakery' },
    ],
  });
  await vault.open('/have?t=holdings');
  await page.getByRole('button', { name: 'Delete MSFT', exact: true }).click();
  const holdingDialog = page.getByRole('dialog', { name: 'Delete MSFT?', exact: true });
  await holdingDialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(() => vault.data('holdings').map(row => row.symbol).sort()).toEqual(['VOO']);
  await vault.reload();
  await expect(page.getByRole('button', { name: 'Delete VOO', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete MSFT', exact: true })).toHaveCount(0);

  await vault.open('/spending');
  const bakery = page.getByRole('row', { name: /Bakery/ });
  await bakery.getByRole('button', { name: 'Delete', exact: true }).click();
  const transactionDialog = page.getByRole('dialog', { name: 'Delete transaction?', exact: true });
  await transactionDialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(() => vault.data('transactions').map(row => row.description)).toEqual(['Tea marker']);
  await vault.reload();
  await expect(page.getByRole('row', { name: /Tea/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Bakery/ })).toHaveCount(0);

  expect(vault.data('assets')).toEqual([expect.objectContaining({ id: 1, name: 'Cash marker', current_value: 10 })]);
  expect(vault.data('holdings').map(row => row.id)).toEqual([10]);
  const deleted = vault.mutations.filter(change => change.path.endsWith('/delete'));
  expect(deleted.map(change => change.body.records.map((row: { collection: string }) => row.collection))).toEqual([
    ['holdings'],
    ['transactions'],
  ]);
});
