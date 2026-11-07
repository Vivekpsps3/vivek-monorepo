import { type Page } from '@playwright/test';
import { test, expect } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';
import { chaseEmpty, chaseGood, chaseWrong } from './fixtures/bank-csv';

// F9: bank first, plain errors, usable preview, Undo with counts, delete receipt.

async function openImport(page: Page) {
  await page.goto('/finance/spending?t=imports');
  await page.getByRole('button', { name: /import/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Import from bank' })).toBeVisible();
}

/** Add a file and complete the bank-first step the way a user does: pick the
 * file's bank, then name the new account identity for it. */
async function addFileAndChooseBank(page: Page, name: string, csv: string) {
  await page.locator('#import-file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByLabel(`Bank for ${name}`, { exact: true }).selectOption('chase');
  await page.getByLabel('Account name', { exact: true }).fill('Chase card');
}

test('a wrong-shape CSV gets the plain not-a-bank-export sentence, never raw parser text', async ({ page }) => {
  const vault = await syntheticVault(page, {});
  await vault.open('/spending?t=imports');
  await openImport(page);
  await addFileAndChooseBank(page, 'wrong.csv', chaseWrong);
  await expect(page.locator('.import-file-entry')).toContainText('wrong.csv');
  await page.getByRole('button', { name: 'Preview all files' }).click();
  await expect(page.locator('.import-file-preview')).toContainText("This file doesn't look like a bank export.");
});

test('an empty CSV says the file has no transactions', async ({ page }) => {
  const vault = await syntheticVault(page, {});
  await vault.open('/spending?t=imports');
  await openImport(page);
  await addFileAndChooseBank(page, 'empty.csv', chaseEmpty);
  await page.getByRole('button', { name: 'Preview all files' }).click();
  await expect(page.locator('.import-file-preview')).toContainText('That file has no transactions in it.');
});

test('a good Chase CSV previews with the shared summary line and imports', async ({ page }) => {
  const vault = await syntheticVault(page, {});
  await vault.open('/spending?t=imports');
  await openImport(page);
  await addFileAndChooseBank(page, 'chase.csv', chaseGood);
  await page.getByRole('button', { name: 'Preview all files' }).click();
  await expect(page.locator('.import-summary').first()).toContainText('read ·');
  await expect(page.locator('.import-summary').first()).toContainText('new');
  const importButton = page.getByRole('button', { name: /Import \d+ transaction/ });
  await expect(importButton).toBeVisible();
});
