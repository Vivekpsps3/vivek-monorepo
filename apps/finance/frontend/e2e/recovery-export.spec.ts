import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from './frozen-clock';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticRecoveryCollections, syntheticVault } from './synthetic-vault';

import type { RecoveryBundle } from '../src/app/crypto/recovery-bundle';

interface EncryptionProbe { recoveryEncryptHeld?: boolean; releaseRecoveryEncrypt?: () => void }

const backupPassword = 'Separate synthetic recovery password';
async function enterPasswords(page: import('@playwright/test').Page, current = SYNTHETIC_VAULT_PASSPHRASE) {
  await page.getByLabel('Current vault passphrase', { exact: true }).fill(current);
  await page.getByLabel('Backup password', { exact: true }).fill(backupPassword);
  await page.getByLabel('Confirm backup password', { exact: true }).fill(backupPassword);
}

function openBundle(file: string): RecoveryBundle {
  const { header, ciphertext_b64 } = JSON.parse(file);
  const key = pbkdf2Sync(backupPassword, Buffer.from(header.salt_b64, 'base64'), header.iterations, 32, 'sha256');
  const packed = Buffer.from(ciphertext_b64, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', key, packed.subarray(0, 12));
  cipher.setAAD(Buffer.from(JSON.stringify([header.format, header.version, header.created_at, header.kdf, header.iterations, header.salt_b64, header.cipher])));
  cipher.setAuthTag(packed.subarray(-16));
  return JSON.parse(Buffer.concat([cipher.update(packed.subarray(12, -16)), cipher.final()]).toString('utf8'));
}

test('Settings downloads every allowed collection with encrypted counts and browser-local markers', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/');
  await page.goto('/settings/finance');
  await expect(page.getByRole('heading', { name: 'Encrypted recovery backup' })).toBeVisible();
  vault.seedRecoveryMarkers();
  const transmitted: string[] = [];
  const logged: string[] = [];
  page.on('request', request => transmitted.push(request.url() + (request.postData() ?? '')));
  page.on('console', message => logged.push(message.text()));
  await enterPasswords(page);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download encrypted backup', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^vault-recovery-.*\.vvr$/);
  const file = readFileSync((await download.path())!, 'utf8');
  expect(file).not.toContain('PRIVATE_RECOVERY_');
  expect(file).not.toContain('health_stats');
  const body = openBundle(file);
  const expected = syntheticRecoveryCollections().map(row => row.collection);
  expect(body.collections.map((row) => row.collection)).toEqual(expected);
  expect(body.collections.every((row) => row.count === 1)).toBe(true);
  expect(body.records.map((row) => row.collection).sort()).toEqual(expected);
  for (const row of body.records) expect(row.value.marker).toBe(`PRIVATE_RECOVERY_${row.collection}`);
  expect(transmitted.join('\n')).not.toMatch(/PRIVATE_RECOVERY_|Separate synthetic recovery password|Synthetic finance test passphrase/);
  expect(logged.join('\n')).not.toContain('PRIVATE_RECOVERY_');
  const stored = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
  expect(JSON.stringify(stored)).not.toContain('PRIVATE_RECOVERY_');
  for (const label of ['Current vault passphrase', 'Backup password', 'Confirm backup password']) await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
  await expect(page.getByRole('status').filter({ hasText: 'Encrypted backup downloaded' })).toBeVisible();
});

test('wrong current passphrase and invalid form never download or read the recovery snapshot', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/');
  await page.goto('/settings/finance');
  let snapshots = 0;
  let downloads = 0;
  page.on('request', request => { if (request.url().includes('/recovery-snapshot')) snapshots++; });
  page.on('download', () => downloads++);
  await page.getByRole('button', { name: 'Download encrypted backup', exact: true }).click();
  await expect(page.locator('app-finance-section [role=alert]')).toContainText('Enter your current vault passphrase');
  await expect(page.locator('app-finance-section [role=alert]')).toBeFocused();
  await enterPasswords(page, 'Wrong synthetic passphrase');
  await page.getByRole('button', { name: 'Download encrypted backup', exact: true }).click();
  await expect(page.locator('app-finance-section [role=alert]')).toContainText('could not be verified');
  expect(snapshots).toBe(0);
  expect(downloads).toBe(0);
});

for (const interruption of ['cancel', 'lock', 'route disposal']) {
  test(`held recovery read after ${interruption} cannot create a stale download`, async ({ page }) => {
    const vault = await syntheticVault(page);
    await vault.open('/');
    await page.goto('/settings/finance');
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let arrived!: () => void;
    const requested = new Promise<void>(resolve => { arrived = resolve; });
    await page.route('**/api/vault/recovery-snapshot', async route => {
      arrived();
      await gate;
      await route.fulfill({ json: { collections: syntheticRecoveryCollections().map(row => ({ ...row, count: 0 })), records: [] } });
    });
    let downloads = 0;
    page.on('download', () => downloads++);
    await enterPasswords(page);
    await page.getByRole('button', { name: 'Download encrypted backup', exact: true }).click();
    await requested;
    if (interruption === 'cancel') await page.getByRole('button', { name: 'Cancel backup', exact: true }).click();
    else if (interruption === 'lock') await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
    else await page.getByRole('link', { name: 'Appearance', exact: true }).click();
    release();
    if (interruption === 'lock') await expect(page.getByText('Finance is locked.')).toBeVisible();
    else if (interruption === 'cancel') await expect(page.getByRole('button', { name: 'Cancel backup', exact: true })).toHaveCount(0);
    else await expect(page.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(downloads).toBe(0);
  });
}

test('held bundle encryption followed by lock cannot download its late result', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/');
  await page.goto('/settings/finance');
  await page.evaluate(() => {
    const original = crypto.subtle.encrypt.bind(crypto.subtle);
    const state = window as typeof window & { recoveryEncryptHeld?: boolean; releaseRecoveryEncrypt?: () => void };
    crypto.subtle.encrypt = async (algorithm, key, data) => {
      const plain = new TextDecoder().decode(data);
      const result = await original(algorithm, key, data);
      if (!plain.includes('"collections"')) return result;
      state.recoveryEncryptHeld = true;
      await new Promise<void>(resolve => { state.releaseRecoveryEncrypt = resolve; });
      return result;
    };
  });
  let downloads = 0;
  page.on('download', () => downloads++);
  await enterPasswords(page);
  await page.getByRole('button', { name: 'Download encrypted backup', exact: true }).click();
  await page.waitForFunction(() => (window as typeof window & EncryptionProbe).recoveryEncryptHeld === true);
  await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page.getByText('Finance is locked.')).toBeVisible();
  await page.evaluate(() => (window as typeof window & EncryptionProbe).releaseRecoveryEncrypt?.());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(downloads).toBe(0);
});
