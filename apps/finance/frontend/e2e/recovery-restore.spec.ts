import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './frozen-clock';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticRecoveryCollections, syntheticVault } from './synthetic-vault';

const password = 'Synthetic separate portable backup password';
async function settings(page: Page) {
  const vault = await syntheticVault(page);
  await vault.open('/'); await page.goto('/settings/finance');
  await expect(page.getByRole('heading', { name: 'Restore encrypted backup' })).toBeVisible();
  return vault;
}
async function exportFile(page: Page): Promise<Buffer> {
  await page.getByLabel('Current vault passphrase', { exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByLabel('Backup password', { exact: true }).fill(password);
  await page.getByLabel('Confirm backup password', { exact: true }).fill(password);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download encrypted backup', exact: true }).click();
  return readFileSync((await (await downloaded).path())!);
}
async function preview(page: Page, file: Buffer, mode: 'merge' | 'replace' = 'merge', secret = password) {
  await page.getByLabel('Encrypted backup file', { exact: false }).setInputFiles({ name: 'synthetic.vvr', mimeType: 'application/json', buffer: file });
  await page.getByLabel('Restore backup password', { exact: true }).fill(secret);
  await page.getByRole('radio', { name: mode === 'merge' ? 'Merge: skip existing IDs' : 'Replace the active vault', exact: true }).check();
  await page.getByRole('button', { name: 'Preview encrypted backup', exact: true }).click();
}
async function stageAndActivate(page: Page) {
  await page.getByRole('button', { name: 'Stage encrypted restore', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Activate restore', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activate restore', exact: true }).click();
  await expect(page.getByText('Finance is locked. Unlock to see settings.', { exact: true })).toBeVisible();
}

test('export -> merge restores every collection under a different DEK and keeps existing IDs', async ({ page, browser, baseURL }) => {
  const source = await settings(page); source.seedRecoveryMarkers(2);
  const file = await exportFile(page);
  const context = await browser.newContext({ baseURL }); const destination = await context.newPage();
  try {
    const target = await settings(destination); target.seedRecoveryMarkers(1, 'DESTINATION_KEEP_');
    const privateRequests: string[] = []; const logged: string[] = [];
    destination.on('request', request => privateRequests.push(request.url() + (request.postData() ?? '')));
    destination.on('console', message => logged.push(message.text()));
    await preview(destination, file);
    const names = syntheticRecoveryCollections().map(row => row.collection);
    await expect(destination.getByRole('region', { name: 'Restore collection preview' }).locator('tbody tr')).toHaveCount(names.length);
    await expect(destination.getByText(`Merge: ${names.length} records to restore; ${names.length} existing IDs.`, { exact: true })).toBeVisible();
    expect(target.mutations.filter(row => row.path.includes('/restore/'))).toHaveLength(0);
    await destination.getByRole('button', { name: 'Stage encrypted restore', exact: true }).click();
    await expect(destination.getByRole('button', { name: 'Activate restore', exact: true })).toBeVisible();
    for (const name of names) expect(target.data(name)).toHaveLength(1);
    await destination.getByRole('button', { name: 'Activate restore', exact: true }).click();
    await expect(destination.getByText('Finance is locked. Unlock to see settings.', { exact: true })).toBeVisible();
    for (const name of names) {
      const rows = target.data(name);
      expect(rows).toHaveLength(2);
      expect(rows.find(row => row.id === 1)?.marker).toBe(`DESTINATION_KEEP_${name}`);
      expect(rows.find(row => row.id === 2)).toEqual(source.data(name).find(row => row.id === 2));
    }
    expect(privateRequests.join('\n')).not.toMatch(/PRIVATE_RECOVERY_|DESTINATION_KEEP_|Synthetic separate portable backup password/);
    expect(logged.join('\n')).not.toMatch(/PRIVATE_RECOVERY_|DESTINATION_KEEP_/);
    expect(await destination.evaluate(() => JSON.stringify({ local: localStorage, session: sessionStorage }))).not.toMatch(/PRIVATE_RECOVERY_|DESTINATION_KEEP_/);
  } finally { await context.close(); }
});

test('replace offers a pre-import backup, requires typed confirmation, and activates the complete staged set', async ({ page }) => {
  const vault = await settings(page); vault.seedRecoveryMarkers();
  const original = new Map(syntheticRecoveryCollections().map(row => [row.collection, vault.data(row.collection)]));
  const file = await exportFile(page); vault.seedRecoveryMarkers(2, 'DESTINATION_REPLACED_');
  await preview(page, file, 'replace');
  await expect(page.getByRole('button', { name: 'Create pre-restore backup', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create pre-restore backup', exact: true }).click();
  await expect(page.getByLabel('Current vault passphrase', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Stage encrypted restore', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Activate restore', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activate restore', exact: true }).click();
  await expect(page.locator('app-finance-section [role=alert]')).toContainText('type REPLACE');
  for (const row of syntheticRecoveryCollections()) expect(vault.data(row.collection)).toHaveLength(2);
  await page.getByLabel('I saved a backup or choose to continue without one.', { exact: true }).check();
  await page.getByLabel('Type REPLACE to confirm', { exact: true }).fill('REPLACE');
  await page.getByRole('button', { name: 'Activate restore', exact: true }).click();
  await expect(page.getByText('Finance is locked. Unlock to see settings.', { exact: true })).toBeVisible();
  for (const [name, rows] of original) expect(vault.data(name)).toEqual(rows);
});

test('wrong password, tamper, unknown version and oversized file have zero mutating requests', async ({ page }) => {
  const vault = await settings(page); vault.seedRecoveryMarkers(); const file = await exportFile(page);
  const outer = JSON.parse(file.toString()); outer.header.version = 99;
  const damaged = JSON.parse(file.toString()); damaged.ciphertext_b64 = (damaged.ciphertext_b64[0] === 'A' ? 'B' : 'A') + damaged.ciphertext_b64.slice(1);
  const before = vault.mutations.length;
  for (const [input, secret] of [[file, 'Wrong synthetic backup password'], [Buffer.from(JSON.stringify(outer)), password], [Buffer.from(JSON.stringify(damaged)), password], [Buffer.alloc(24 * 1024 * 1024 + 1), password]] as const) {
    await preview(page, input, 'merge', secret);
    await expect(page.locator('app-finance-section [role=alert]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Preview encrypted backup', exact: true })).toBeEnabled();
  }
  expect(vault.mutations).toHaveLength(before);
});

test('interrupted upload survives refresh and resumes completed batches without duplicate active writes', async ({ page }) => {
  const vault = await settings(page); vault.seedRecoveryMarkers(15); const file = await exportFile(page);
  // Merge targets an empty ciphertext vault in a second browser context.
  const context = await page.context().browser()!.newContext({ baseURL: new URL(page.url()).origin });
  const targetPage = await context.newPage();
  try {
    const target = await settings(targetPage); target.failRestoreBatch(1);
    await preview(targetPage, file);
    await targetPage.getByRole('button', { name: 'Stage encrypted restore', exact: true }).click();
    await expect(targetPage.locator('app-finance-section [role=alert]')).toContainText('could not finish');
    for (const row of syntheticRecoveryCollections()) expect(target.data(row.collection)).toHaveLength(0);
    expect(target.stagedRestoreCount()).toBe(1);
    await targetPage.reload();
    await preview(targetPage, file);
    await expect(targetPage.getByText(/An unfinished merge restore is available/)).toBeVisible();
    await stageAndActivate(targetPage);
    for (const row of syntheticRecoveryCollections()) expect(target.data(row.collection)).toEqual(vault.data(row.collection));
    const uploads = target.mutations.filter(row => /\/batches\/0$/.test(row.path));
    expect(uploads).toHaveLength(1);
  } finally { await context.close(); }
});

for (const interruption of ['lock', 'route disposal', 'cancel']) {
  test(`held stage upload after ${interruption} cannot activate or replace existing data`, async ({ page }) => {
    const vault = await settings(page); vault.seedRecoveryMarkers(); const file = await exportFile(page);
    vault.seedRecoveryMarkers(2, 'DESTINATION_KEEP_'); vault.holdRestoreBatch();
    const before = new Map(syntheticRecoveryCollections().map(row => [row.collection, vault.data(row.collection)]));
    await preview(page, file, 'replace');
    await page.getByRole('button', { name: 'Stage encrypted restore', exact: true }).click(); await vault.waitForRestoreBatch();
    if (interruption === 'lock') await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
    else if (interruption === 'route disposal') await page.getByRole('link', { name: 'Appearance', exact: true }).click();
    else await page.getByRole('button', { name: 'Cancel restore', exact: true }).click();
    vault.releaseRestoreBatch();
    if (interruption === 'lock') await expect(page.getByText('Finance is locked. Unlock to see settings.', { exact: true })).toBeVisible();
    else if (interruption === 'route disposal') await expect(page.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
    else await expect(page.getByRole('button', { name: 'Preview encrypted backup', exact: true })).toBeVisible();
    for (const [name, rows] of before) expect(vault.data(name)).toEqual(rows);
    expect(vault.mutations.filter(row => row.path.endsWith('/activate'))).toHaveLength(0);
  });
}
