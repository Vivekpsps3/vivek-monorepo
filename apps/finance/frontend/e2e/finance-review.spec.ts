import { expect, test } from '@playwright/test';
import { syntheticVault } from './synthetic-vault';

const month = '2026-10';

test('a failed asset save stays in the dialog with the draft', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 1500, as_of_date: '2026-10-01' }],
  });
  await vault.open('/have?t=assets');
  await page.getByRole('button', { name: 'Add asset' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add asset' });
  await dialog.getByLabel('Name', { exact: true }).fill('Savings');
  await dialog.getByLabel('Value', { exact: true }).fill('250');
  vault.failNextWrites(1);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveText("Couldn't save. Something went wrong. Try again.");
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Savings');
  await expect(dialog.getByLabel('Value', { exact: true })).toHaveValue('250');
  await expect(page.locator('.toast')).toHaveCount(0);
  expect(vault.data('assets').some(row => row.name === 'Savings')).toBe(false);
});

test('an empty job form focuses the summary once', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/recurring');
  await page.locator('header').getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add job' });
  await dialog.getByRole('button', { name: 'Save' }).click();
  const summary = dialog.locator('[data-error-summary]');
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(summary).toContainText('Employer');
  await expect(dialog).toContainText('Enter the employer.');
  await expect(dialog).toContainText('Enter yearly pay above $0.');
  for (const [field, message] of [
    ['employer', 'Enter the employer.'],
    ['basePay', 'Enter yearly pay above $0.'],
  ] as const) {
    const input = dialog.locator(`[data-field="${field}"]`);
    const describedBy = await input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const error = dialog.locator(`[id="${describedBy}"]`);
    await expect(error).toContainText(message);
    await expect(error).toContainText('⚠');
    expect(await input.evaluate(el => !!el.closest('label')?.querySelector('.ui-field__error'))).toBe(false);
  }
});

test('a negative subscription is rejected in the dialog', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/recurring?t=spend');
  await page.getByRole('button', { name: 'Add subscription' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add subscription' });
  await dialog.getByLabel('Name', { exact: true }).fill('Stream');
  await dialog.getByLabel('Amount', { exact: true }).fill('-40');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-error-summary]')).toBeFocused();
  await expect(dialog).toContainText('Enter an amount above $0.');
  expect(vault.data('subscriptions')).toHaveLength(0);
});

test('home, planning, and activity agree on a negative subscription and a negative transaction', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 1500, as_of_date: '2026-10-01' }],
    liabilities: [{ id: 2, name: 'Card', category: 'credit_card', balance_owed: 100, as_of_date: '2026-10-01' }],
    subscriptions: [
      { id: 3, name: 'Cloud', category: 'software', amount: 15.99, frequency: 'monthly', next_bill_date: `${month}-15`, is_active: true },
      { id: 4, name: 'Legacy credit', category: 'software', amount: -480, frequency: 'monthly', next_bill_date: `${month}-15`, is_active: true },
    ],
    transactions: [
      { id: 5, date: `${month}-02`, type: 'expense', kind: 'purchase', category: 'Food', amount: 40, description: 'Grocery' },
      { id: 6, date: `${month}-03`, type: 'expense', kind: 'purchase', category: 'Food', amount: -45.67, description: 'Legacy return' },
    ],
  });

  await vault.open('/');
  const home = page.locator('.home-tile--activity');
  await expect(home).toContainText('$55.99');
  await expect(home).not.toContainText('−$464.01');
  await expect(page.locator('.home-tile').filter({ hasText: 'What you have' })).toContainText('$1,400.00');

  await vault.open('/planning');
  await expect(page.getByText('Current net worth').locator('..')).toContainText('$1,400.00');
  await expect(page.getByText('Subscriptions: $191.88')).toBeVisible();
  await expect(page.locator('.planning-facts-grid')).not.toContainText('$480.00');

  await vault.open('/spending?t=activity');
  await expect(page.getByText('Needs fixing').first()).toBeVisible();
  await expect(page.locator('.month-total__note')).toContainText('Excludes 1 entry');
  await expect(page.locator('.month-total--expense')).toContainText('$40.00');
});
