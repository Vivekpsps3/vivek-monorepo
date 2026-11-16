import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './frozen-clock';
import { syntheticRecoveryCollections } from './synthetic-vault';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';

const current = 'Current synthetic rotation passphrase';
const next = 'Next synthetic rotation passphrase';
const backupPassword = 'Separate synthetic rotation backup';
const endpoint = '/api/auth/passwordless/credentials';
test.setTimeout(120_000);

async function api(page: Page, path: string, method = 'GET', body?: unknown) {
  return page.evaluate(async ({ path, method, body }) => {
    const csrf = document.cookie.split('; ').find(part => part.startsWith('finance_csrf='))?.slice('finance_csrf='.length) ?? '';
    const response = await fetch(path, { method, credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }, { path, method, body });
}
async function account(page: Page) {
  const username = `rotation.${createHash('sha256').update(test.info().title).digest('hex').slice(0, 12)}`;
  await page.goto('/auth/login');
  const bootstrap = (await api(page, '/api/auth/bootstrap-status')).body.needs_setup;
  if (!bootstrap) await page.goto('/auth/signup');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel(bootstrap ? 'Display name' : 'Name', { exact: true }).fill('Synthetic rotation user');
  await page.getByLabel('Vault passphrase', { exact: true }).fill(current);
  await page.getByRole('button', { name: bootstrap ? 'Create admin account' : 'Sign up', exact: true }).click();
  await page.waitForURL(/\/hub$/);
  await page.goto('/settings/account');
  await page.getByRole('link', { name: 'Change your vault passphrase, manage locks, or back up and restore encrypted data' }).click();
  await expect(page.getByRole('heading', { name: 'Change vault passphrase', exact: true })).toBeVisible();
  return username;
}
async function signIn(page: Page, username: string, passphrase: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Vault passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function draft(page: Page, passphrase = current) {
  await page.getByLabel('Current passphrase', { exact: true }).fill(passphrase);
  await page.getByLabel('New passphrase', { exact: true }).fill(next);
  await page.getByLabel('Confirm new passphrase', { exact: true }).fill(next);
}
function unpack(packedB64: string, key: Buffer, aad?: Buffer) {
  const packed = Buffer.from(packedB64, 'base64'), cipher = createDecipheriv('aes-256-gcm', key, packed.subarray(0, 12));
  if (aad) cipher.setAAD(aad);
  cipher.setAuthTag(packed.subarray(-16));
  return Buffer.concat([cipher.update(packed.subarray(12, -16)), cipher.final()]);
}

async function seedEveryCollection(page: Page) {
  const wraps = (await api(page, endpoint)).body.vault;
  const key = unpack(wraps.wrapped_dek_b64, pbkdf2Sync(current, Buffer.from(wraps.kdf_salt_b64, 'base64'), wraps.kdf_iterations, 32, 'sha256'));
  const blind = createHmac('sha256', Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), Buffer.from('finance-blind-index-v1'), 32))).update('PRIVATE_ROTATION_DEDUPE').digest('base64');
  const records = syntheticRecoveryCollections().map(({ collection }) => {
    const client_id = `rotation_${collection}`, iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(JSON.stringify([collection, client_id, 2, 1])));
    const payload = { id: 1, marker: `PRIVATE_ROTATION_${collection}` };
    const ciphertext_b64 = Buffer.concat([iv, cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]).toString('base64');
    return { collection, client_id, ciphertext_b64, schema_version: 2, key_version: 1, indexes: [{ index_name: 'rotation', index_value_b64: blind }] };
  });
  const result = await api(page, '/api/vault/records/upsert', 'POST', { records });
  expect(result.status).toBe(200);
  key.fill(0);
  return { records, blind };
}

async function exportedMarkers(page: Page) {
  await page.getByLabel('Current vault passphrase', { exact: true }).fill(next);
  await page.getByLabel('Backup password', { exact: true }).fill(backupPassword);
  await page.getByLabel('Confirm backup password', { exact: true }).fill(backupPassword);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download encrypted backup', exact: true }).click();
  const { header, ciphertext_b64 } = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  const aad = Buffer.from(JSON.stringify([header.format, header.version, header.created_at, header.kdf, header.iterations, header.salt_b64, header.cipher]));
  return JSON.parse(unpack(ciphertext_b64, pbkdf2Sync(backupPassword, Buffer.from(header.salt_b64, 'base64'), header.iterations, 32, 'sha256'), aad).toString());
}

test('one rotation keeps every collection and blind index, locks tabs, retains its session and signs in with the new passphrase in a fresh browser', async ({ page, browser, baseURL }) => {
  const username = await account(page);
  const { records, blind } = await seedEveryCollection(page);
  const before = (await api(page, '/api/vault/recovery-snapshot')).body;
  const otherContext = await browser.newContext({ baseURL }), freshContext = await browser.newContext({ baseURL });
  const otherBrowser = await otherContext.newPage(), fresh = await freshContext.newPage();
  const tab = await page.context().newPage();
  try {
    await signIn(otherBrowser, username, current); await otherBrowser.waitForURL(/\/hub$/);
    await tab.goto('/settings/finance'); await expect(tab.getByRole('heading', { name: 'Change vault passphrase', exact: true })).toBeVisible();
    await draft(tab);
    const requests: string[] = [], logs: string[] = [], mutations: string[] = [];
    page.on('request', request => { requests.push(request.url() + (request.postData() ?? '')); if (request.method() !== 'GET') mutations.push(new URL(request.url()).pathname); });
    page.on('console', message => logs.push(message.text()));
    await draft(page);
    await page.getByRole('button', { name: 'Change passphrase', exact: true }).click();
    await expect(page.getByText('Finance is locked. Unlock to see settings.', { exact: true })).toBeVisible();
    await expect(tab.getByText('Finance is locked. Unlock to see settings.', { exact: true })).toBeVisible();
    expect(mutations.filter(path => path === endpoint)).toHaveLength(1);
    expect(mutations.some(path => path.includes('/records') || path.endsWith('/wraps'))).toBe(false);
    expect((await api(page, '/api/auth/me')).status).toBe(200);
    expect((await api(otherBrowser, '/api/auth/me')).status).toBe(401);
    expect((await api(page, '/api/vault/recovery-snapshot')).body).toEqual(before);
    for (const row of records) {
      const lookup = await api(page, '/api/vault/indexes/lookup', 'POST', { collection: row.collection, index_name: 'rotation', index_value_b64: blind });
      expect(lookup.status).toBe(200); expect(lookup.body.client_ids).toContain(row.client_id);
    }
    await page.reload();
    await page.getByRole('link', { name: 'Unlock', exact: true }).click();
    await page.getByLabel('Vault passphrase', { exact: true }).fill(current);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.locator('#vault-unlock-error')).toContainText("didn't unlock");
    await page.getByLabel('Vault passphrase', { exact: true }).fill(next);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await page.waitForURL(/\/settings\/finance$/);
    await expect(page.getByLabel('Current passphrase', { exact: true })).toHaveValue('');
    const restored = await exportedMarkers(page);
    for (const row of restored.records) expect(row.value.marker).toBe(`PRIVATE_ROTATION_${row.collection}`);
    expect(restored.records).toHaveLength(records.length);
    await signIn(fresh, username, current);
    await expect(fresh.locator('.login-error')).toBeVisible();
    await fresh.getByLabel('Vault passphrase', { exact: true }).fill(next);
    await fresh.getByRole('button', { name: 'Sign in', exact: true }).click();
    await fresh.waitForURL(/\/hub$/);
    await fresh.goto('/settings/finance');
    await expect(fresh.getByRole('heading', { name: 'Change vault passphrase', exact: true })).toBeVisible();
    const freshExport = await exportedMarkers(fresh);
    expect(freshExport.records).toHaveLength(records.length);
    for (const row of freshExport.records) expect(row.value.marker).toBe(`PRIVATE_ROTATION_${row.collection}`);
    expect((await api(fresh, '/api/vault/recovery-snapshot')).body).toEqual(before);
    expect(requests.join('\n')).not.toMatch(/Current synthetic rotation passphrase|Next synthetic rotation passphrase|PRIVATE_ROTATION_|Separate synthetic rotation backup/);
    expect(logs.join('\n')).not.toMatch(/synthetic rotation passphrase|PRIVATE_ROTATION_/);
    for (const target of [page, tab, fresh]) {
      expect(await target.evaluate(() => JSON.stringify({ local: localStorage, session: sessionStorage }))).not.toMatch(/synthetic rotation passphrase|PRIVATE_ROTATION_/);
    }
  } finally { await tab.close(); await otherContext.close(); await freshContext.close(); }
});

for (const failure of ['conflict', 'network', 'server']) {
  test(`wrong current/confirm and ${failure} preserve old credentials and a retryable draft`, async ({ page, browser, baseURL }) => {
    const username = await account(page), before = (await api(page, endpoint)).body;
    let writes = 0;
    page.on('request', request => { if (request.url().endsWith(endpoint) && request.method() === 'POST') writes++; });
    await draft(page, 'Wrong synthetic current passphrase');
    await page.getByLabel('Confirm new passphrase', { exact: true }).fill('Mismatch');
    await page.getByRole('button', { name: 'Change passphrase', exact: true }).click();
    await expect(page.getByLabel('Confirm new passphrase', { exact: true })).toBeFocused(); expect(writes).toBe(0);
    await page.getByLabel('Confirm new passphrase', { exact: true }).fill(next);
    await page.getByRole('button', { name: 'Change passphrase', exact: true }).click();
    await expect(page.locator('#passphrase-error')).toContainText('could not be verified');
    await expect(page.getByLabel('Current passphrase', { exact: true })).toBeFocused(); expect(writes).toBe(0);
    await page.route(`**${endpoint}`, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      if (failure === 'network') return route.abort('failed');
      return route.fulfill({ status: failure === 'conflict' ? 409 : 503, json: { detail: 'Synthetic failure' } });
    });
    await draft(page); await page.getByRole('button', { name: 'Change passphrase', exact: true }).click();
    await expect(page.locator('#passphrase-error')).toBeFocused();
    await expect(page.getByLabel('New passphrase', { exact: true })).toHaveValue(next);
    await expect(page.getByLabel('Current passphrase', { exact: true })).toHaveValue(current);
    expect((await api(page, endpoint)).body).toEqual(before);
    const context = await browser.newContext({ baseURL });
    try { const other = await context.newPage(); await signIn(other, username, current); await other.waitForURL(/\/hub$/); }
    finally { await context.close(); }
    await page.unroute(`**${endpoint}`);
    await page.getByRole('button', { name: 'Change passphrase', exact: true }).click();
    await expect(page.getByText('Finance is locked. Unlock to see settings.', { exact: true })).toBeVisible();
    expect(writes).toBe(2);
  });
}

for (const interruption of ['lock', 'sign out', 'route disposal']) {
  test(`a committed response held across ${interruption} cannot restore drafts or sensitive UI`, async ({ page }) => {
    await account(page);
    let release!: () => void, arrived!: () => void, delivered!: () => void;
    const completed = new Promise<void>(resolve => { delivered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; }), committed = new Promise<void>(resolve => { arrived = resolve; });
    await page.route(`**${endpoint}`, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch(); expect(response.status()).toBe(200); arrived(); await gate;
      await route.fulfill({ response }).catch(() => undefined);
      delivered();
    });
    const logs: string[] = []; page.on('console', message => logs.push(message.text()));
    await draft(page); await page.getByRole('button', { name: 'Change passphrase', exact: true }).click(); await committed;
    if (interruption === 'lock') await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
    if (interruption === 'sign out') { await openUserMenu(page); await page.getByRole('banner').getByRole('button', { name: 'Sign out', exact: true }).click(); }
    if (interruption === 'route disposal') {
      await page.getByRole('link', { name: 'Appearance', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Appearance', exact: true })).toBeVisible();
      await expect(page.getByLabel('New passphrase', { exact: true })).toHaveCount(0);
    }
    release(); await completed;
    if (interruption === 'sign out') {
      await page.waitForURL(/\/auth\/login/);
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in', exact: true })).toBeVisible();
    }
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    if (interruption === 'lock') await expect(page.getByText('Finance is locked. Unlock to see settings.', { exact: true })).toBeVisible();
    if (interruption === 'sign out') await page.waitForURL(/\/auth\/login/);
    if (interruption === 'route disposal') { await page.getByRole('navigation', { name: 'Settings', exact: true }).getByRole('link', { name: 'Finance', exact: true }).click(); await expect(page.getByLabel('New passphrase', { exact: true })).toHaveValue(''); }
    await expect(page.locator('.toast-copy').filter({ hasText: 'Passphrase changed.' })).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify({ local: localStorage, session: sessionStorage }))).not.toContain(next);
    expect(logs.join('\n')).not.toContain(next);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`phone ${theme} passphrase controls keep linked error focus, fit the viewport and complete a change`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
    await account(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await draft(page, 'Wrong synthetic phone passphrase');
    await page.getByRole('button', { name: 'Change passphrase', exact: true }).click();
    const control = page.getByLabel('Current passphrase', { exact: true });
    await expect(control).toBeFocused();
    await expect(control).toHaveAttribute('aria-invalid', 'true');
    await expect(control).toHaveAttribute('aria-describedby', 'passphrase-error');
    await expect(page.locator('#passphrase-error')).toContainText('could not be verified');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ['Current passphrase', 'New passphrase', 'Confirm new passphrase']) {
      expect((await page.getByLabel(name, { exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: test.info().outputPath(`passphrase-phone-${theme}.png`), fullPage: true });
    await draft(page);
    await page.getByRole('button', { name: 'Change passphrase', exact: true }).click();
    await expect(page.getByText('Finance is locked. Unlock to see settings.', { exact: true })).toBeVisible();
  });
}
