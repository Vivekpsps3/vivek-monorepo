import { type Page, type Locator } from '@playwright/test';
import { test, expect, frozenToday } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

const day = frozenToday();

async function openImport(page: Page): Promise<Locator> {
  await page.locator('.header-actions').getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from bank', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

function column(dialog: Locator, label: string): Locator {
  return dialog.getByRole('combobox', { name: label, exact: true });
}

async function addCustomFile(dialog: Locator, name: string, csv: string): Promise<void> {
  await dialog.locator('#import-file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await dialog.getByLabel(`Bank for ${name}`, { exact: true }).selectOption('custom_csv');
  const date = column(dialog, `Date column for ${name}`);
  await expect(date.locator('option')).not.toHaveCount(1);
}

async function choose(dialog: Locator, label: string, value: string): Promise<void> {
  const control = column(dialog, label);
  await control.scrollIntoViewIfNeeded();
  await control.selectOption({ label: value });
}

test('CSV1 maps signed and debit-credit files, commits the selected rows, and reloads the receipt', async ({ page }) => {
  const signed = [
    'Date,Description,Amount,Account,Category,Note',
    `${day},Market refund,12.50,Checking,Food,SECRET-NOTE-77`,
    `${day},Costco gas,-42.12,Checking,Gas,SECRET-NOTE-77`,
    `${day},Costco gas,-42.12,Checking,Gas,SECRET-NOTE-77`,
    `${day},Bus fare,-3.00,Joint,Transit,SECRET-NOTE-77`,
  ].join('\n');
  const split = [
    'Posted;Details;Debit;Credit;Account;Category',
    '15/10/2026;Cafe;4.50;;Joint;Food',
    '15/10/2026;Store return;;9.00;Savings;Shopping',
  ].join('\n');
  const vault = await syntheticVault(page);
  await vault.open('/spending?t=imports', page, '/spending?t=activity&receipts=1');
  const dialog = await openImport(page);
  await addCustomFile(dialog, 'signed.csv', signed);
  await choose(dialog, 'Date column for signed.csv', 'Date');
  await choose(dialog, 'Description column for signed.csv', 'Description');
  await choose(dialog, 'Amount columns for signed.csv', 'One signed amount');
  await choose(dialog, 'Amount column for signed.csv', 'Amount');
  await choose(dialog, 'Purchases are for signed.csv', 'Negative amounts');
  await choose(dialog, 'Date format for signed.csv', 'Year-month-day');
  await choose(dialog, 'Refunds are for signed.csv', 'Described as refunds');
  await choose(dialog, 'Account column for signed.csv', 'Account');
  await choose(dialog, 'Category column for signed.csv', 'Category');
  await dialog.getByRole('textbox', { name: 'Mapping name for signed.csv', exact: true }).fill('Signed sample');

  await addCustomFile(dialog, 'split.csv', split);
  await choose(dialog, 'Date column for split.csv', 'Posted');
  await choose(dialog, 'Description column for split.csv', 'Details');
  await choose(dialog, 'Amount columns for split.csv', 'Debit and credit');
  await choose(dialog, 'Debit column for split.csv', 'Debit');
  await choose(dialog, 'Credit column for split.csv', 'Credit');
  await choose(dialog, 'Date format for split.csv', 'Day/month/year');
  await choose(dialog, 'Account column for split.csv', 'Account');
  await choose(dialog, 'Category column for split.csv', 'Category');
  await dialog.getByRole('textbox', { name: 'Mapping name for split.csv', exact: true }).fill('Split sample');

  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await expect(dialog.locator('.import-file-preview').filter({ hasText: 'signed.csv' })).toContainText('Market refund');
  await expect(dialog.locator('.import-file-preview').filter({ hasText: 'signed.csv' })).toContainText('Already imported');
  await expect(dialog.locator('.import-file-preview').filter({ hasText: 'split.csv' })).toContainText('Store return');
  await dialog.locator('tr', { hasText: 'Bus fare' }).locator('input[type=checkbox]').click();
  await dialog.getByRole('button', { name: 'Import 4 transactions', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => vault.data('transactions').length).toBe(4);

  await vault.reload();
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Market refund' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Costco gas' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Cafe' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Store return' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Bus fare' })).toHaveCount(0);

  const transactions = vault.data('transactions');
  expect(transactions.map(row => ({ description: row.description, amount: row.amount, kind: row.kind, account: row.account_display })).sort((a, b) => a.description.localeCompare(b.description))).toEqual([
    { description: 'Cafe', amount: 4.5, kind: 'purchase', account: 'Joint' },
    { description: 'Costco gas', amount: 42.12, kind: 'purchase', account: 'Checking' },
    { description: 'Market refund', amount: 12.5, kind: 'refund', account: 'Checking' },
    { description: 'Store return', amount: 9, kind: 'refund', account: 'Savings' },
  ]);
  const batches = vault.data('import_batches');
  const receipt = batches.find(row => row.record_type === 'bank_receipt');
  expect(receipt).toMatchObject({ status: 'complete', inserted_count: 4 });
  expect(receipt.filenames).toEqual(['signed.csv', 'split.csv']);
  const profiles = batches.filter(row => row.record_type === 'csv_mapping_profile');
  expect(profiles.map(row => row.name).sort()).toEqual(['Signed sample', 'Split sample']);
  expect(profiles.every(row => row.format_version === 1)).toBe(true);
  const stored = JSON.stringify(batches);
  expect(stored).not.toContain('SECRET-NOTE-77');
  expect(stored).not.toContain('15/10/2026;Cafe');
  const local = await page.evaluate(() => Object.values(localStorage).join('\n'));
  expect(local).not.toContain('SECRET-NOTE-77');
});

test('CSV2 shows actionable currency and mapping errors and commits only the corrected rows', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/spending?t=imports', page, '/spending?t=activity&receipts=1');
  let dialog = await openImport(page);
  await addCustomFile(dialog, 'empty.csv', 'Date,Description,Amount\n');
  await choose(dialog, 'Date column for empty.csv', 'Date');
  await choose(dialog, 'Description column for empty.csv', 'Description');
  await choose(dialog, 'Amount column for empty.csv', 'Amount');
  await dialog.getByLabel('Account name', { exact: true }).fill('Cash');
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await expect(dialog.locator('.import-file-preview')).toContainText('That file has no transactions in it.');
  await dialog.getByRole('button', { name: 'Nothing importable in these files', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('no transactions');
  expect(vault.data('transactions')).toEqual([]);
  expect(vault.data('import_batches')).toEqual([]);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

  const mixed = [
    'Date,Description,Amount,Currency',
    `${day},Taxi,-10.00,EUR`,
    `${day},Bus,-3.00,USD`,
  ].join('\n');
  dialog = await openImport(page);
  await addCustomFile(dialog, 'mixed.csv', mixed);
  await choose(dialog, 'Date column for mixed.csv', 'Description');
  await choose(dialog, 'Description column for mixed.csv', 'Date');
  await choose(dialog, 'Amount column for mixed.csv', 'Amount');
  await choose(dialog, 'Currency column for mixed.csv', 'Currency');
  await dialog.getByLabel('Account name', { exact: true }).fill('Cash');
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await dialog.getByRole('button', { name: 'Nothing importable in these files', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(vault.data('transactions')).toEqual([]);
  expect(vault.data('import_batches').filter(row => row.record_type === 'bank_receipt')).toEqual([]);

  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await choose(dialog, 'Date column for mixed.csv', 'Date');
  await choose(dialog, 'Description column for mixed.csv', 'Description');
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await expect(dialog.locator('.import-file-preview')).toContainText('Bus');
  await expect(dialog.locator('.import-file-preview')).toContainText('unsupported currency EUR');
  await expect(dialog.locator('tr', { hasText: 'Taxi' })).toHaveCount(0);
  await expect(dialog.locator('.import-summary').first()).not.toContainText('10.00');
  await dialog.getByRole('button', { name: 'Import 1 transaction', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => vault.data('transactions').length).toBe(1);
  expect(vault.data('transactions')[0]).toMatchObject({ description: 'Bus', amount: 3, kind: 'purchase' });
  expect(JSON.stringify(vault.data('transactions'))).not.toContain('Taxi');
  expect(JSON.stringify(vault.data('import_batches'))).not.toContain('Taxi');
});

test('CSV3 resumes a failed custom import and undo keeps the edited row', async ({ page }) => {
  const csv = [
    'Date,Description,Amount,Account',
    `${day},Source coffee,-10.00,Checking`,
    `${day},Source coffee,-10.00,Checking`,
    `${day},Source book,-20.00,Checking`,
  ].join('\n');
  const vault = await syntheticVault(page);
  await vault.open('/spending?t=imports', page, '/spending?t=activity&receipts=1');
  const dialog = await openImport(page);
  await addCustomFile(dialog, 'custom.csv', csv);
  await choose(dialog, 'Date column for custom.csv', 'Date');
  await choose(dialog, 'Description column for custom.csv', 'Description');
  await choose(dialog, 'Amount column for custom.csv', 'Amount');
  await choose(dialog, 'Date format for custom.csv', 'Year-month-day');
  await choose(dialog, 'Account column for custom.csv', 'Account');
  await dialog.getByLabel('Account name', { exact: true }).fill('Checking label');
  await dialog.getByLabel('From', { exact: true }).fill(`${day.slice(0, 8)}01`);
  await dialog.getByLabel('Through', { exact: true }).fill(day);
  await dialog.getByLabel("I confirm these dates are the statement's covered period").check();
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await expect(dialog.locator('.import-file-preview')).toContainText('Already imported');
  vault.failWriteIn('transactions', 2);
  await dialog.getByRole('button', { name: /^Import .*transaction/ }).click();
  await expect.poll(() => vault.data('transactions').length).toBe(1);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await vault.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(() => vault.data('transactions').length).toBe(2);
  expect(new Set(vault.data('transactions').map(row => row.import_receipt_id)).size).toBe(1);

  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  const historyRow = page.getByRole('row').filter({ hasText: 'Source coffee' });
  await historyRow.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit transaction' });
  await editor.getByLabel('Merchant (optional)', { exact: true }).fill('Coffee shop');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByText(/Import history \(/).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('dialog', { name: 'Undo this import?' }).getByRole('button', { name: 'Undo import', exact: true }).click();
  await expect.poll(() => vault.data('import_batches').find(row => row.status === 'withdrawn')?.undo_summary != null).toBe(true);
  expect(vault.data('transactions')).toHaveLength(1);
  expect(vault.data('transactions')[0]).toMatchObject({ description: 'Source coffee', merchant: 'Coffee shop' });
  const receipt = vault.data('import_batches').find(row => row.status === 'withdrawn');
  expect(receipt?.coverage?.length ?? 0).toBe(0);
  expect(receipt?.undo_summary?.edited).toBe(1);
  expect(JSON.stringify(vault.data('import_batches'))).not.toContain(`${day},Source coffee`);
});
