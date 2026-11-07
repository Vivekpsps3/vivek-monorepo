import { expect, test } from '@playwright/test';

const policy = { balance_days: '10', balance_as_of: '2026-01-01', accrual_amount: '1', accrual_unit: 'day', accrual_cadence: 'monthly', hours_per_day: '8' };
const travelNav = page => page.getByRole('navigation', { name: 'Travel sections', exact: true });

async function openPolicy(page) {
  await page.goto('/travel/pto');
  await page.getByText('PTO policy and starting balance', { exact: true }).click();
}

async function leaveDraft(page, label = 'Family visit') {
  await page.getByLabel('Start date', { exact: true }).fill('2026-12-01');
  await page.getByLabel('End date', { exact: true }).fill('2026-12-02');
  await page.getByText('Save other leave', { exact: true }).click();
  await page.getByLabel('Leave label').fill(label);
  await page.getByLabel('Notes (optional)').fill('Keep this draft');
}

async function blocksUnload(page) {
  return page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })));
}

// Hold a successful server response so edits really happen after submission.
async function holdResponse(page, url) {
  let release, received;
  const held = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { received = resolve; });
  await page.route(url, async route => {
    const response = await route.fetch();
    received();
    await held;
    await route.fulfill({ response });
  });
  return { ready, release: () => release() };
}

for (const width of [390, 1280]) test.describe(`draft protection at ${width}px`, () => {
test.use({ viewport: { width, height: 900 } });

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
  expect((await request.put('/travel/api/pto/policy', { data: policy })).ok()).toBeTruthy();
});

test('PTO drafts protect navigation and reload; Keep editing preserves both forms and focus', async ({ page, request }) => {
  await openPolicy(page);
  expect(await blocksUnload(page)).toBe(false);
  await page.getByLabel('Known balance (days)').fill('12.5');
  await leaveDraft(page);
  expect(await blocksUnload(page)).toBe(true);
  const trips = travelNav(page).getByRole('link', { name: 'Trips', exact: true });
  await trips.click();
  await page.screenshot({ path: test.info().outputPath('unsaved-pto-dialog.png'), fullPage: true });
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page).toHaveURL(/\/travel\/pto$/);
  await expect(trips).toBeFocused();
  await expect(page.getByLabel('Known balance (days)')).toHaveValue('12.5');
  await expect(page.getByLabel('Leave label')).toHaveValue('Family visit');
  await expect(page.getByLabel('Notes (optional)')).toHaveValue('Keep this draft');
  expect((await (await request.get('/travel/api/pto')).json()).policy.balance_saved).toBe('10.0000');
  await trips.click();
  await page.getByRole('button', { name: 'Leave time off', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trips', exact: true })).toBeFocused();
  await travelNav(page).getByRole('link', { name: 'PTO', exact: true }).click();
  await page.getByText('PTO policy and starting balance', { exact: true }).click();
  await expect(page.getByLabel('Known balance (days)')).toHaveValue('10');
  await page.getByText('Save other leave', { exact: true }).click();
  await expect(page.getByLabel('Leave label')).toHaveValue('');
});

test('saving and removing leave refreshes totals without replacing an unsaved policy', async ({ page, request }) => {
  await openPolicy(page);
  await page.getByLabel('Known balance (days)').fill('12.5');
  await leaveDraft(page);
  await page.getByRole('button', { name: 'Save leave', exact: true }).click();
  await expect(page.locator('main [role=status]')).toContainText('other edits still need saving');
  await expect(page.getByLabel('Known balance (days)')).toHaveValue('12.5');
  await expect(page.getByLabel('Leave label')).toHaveValue('');
  const saved = await (await request.get('/travel/api/pto')).json();
  expect(saved.entries.map(entry => entry.label)).toEqual(['Family visit']);
  expect(saved.policy.balance_saved).toBe('10.0000');
  await page.getByRole('button', { name: 'Remove leave', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove leave', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Family visit', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Known balance (days)')).toHaveValue('12.5');
  await page.getByRole('button', { name: 'Save PTO policy' }).click();
  await expect(page.locator('main [role=status]')).toHaveText('PTO saved.');
  expect(await blocksUnload(page)).toBe(false);
  await travelNav(page).getByRole('link', { name: 'Trips', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trips', exact: true })).toBeVisible();
  expect((await (await request.get('/travel/api/pto')).json()).policy.balance_saved).toBe('12.5000');
});

test('failed PTO save and retry retain both drafts; success saves only the submitted policy', async ({ page, request }) => {
  await openPolicy(page);
  await page.getByLabel('Known balance (days)').fill('12.5');
  await leaveDraft(page);
  let attempts = 0;
  await page.route('**/travel/api/pto/policy', route => ++attempts === 1
    ? route.fulfill({ status: 502, json: { message: 'Policy temporarily unavailable' } }) : route.continue());
  await page.getByRole('button', { name: 'Save PTO policy' }).click();
  await expect(page.locator('main [role=alert]')).toContainText('Policy temporarily unavailable');
  await page.getByRole('button', { name: 'Retry PTO' }).click();
  await expect(page.getByLabel('Known balance (days)')).toHaveValue('12.5');
  await expect(page.getByLabel('Leave label')).toHaveValue('Family visit');
  const held = await holdResponse(page, '**/travel/api/pto/policy');
  await page.getByRole('button', { name: 'Save PTO policy' }).click();
  await held.ready;
  await page.getByLabel('Known balance (days)').fill('15');
  held.release();
  await expect(page.locator('main [role=status]')).toContainText('other edits still need saving');
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
  await expect(page.getByLabel('Known balance (days)')).toHaveValue('15');
  await expect(page.getByLabel('Leave label')).toHaveValue('Family visit');
  expect((await (await request.get('/travel/api/pto')).json()).policy.balance_saved).toBe('12.5000');
  expect(await blocksUnload(page)).toBe(true);
});

test('settings draft protects navigation and unload, stays out of browser storage, and retries a failed save', async ({ page }) => {
  await page.goto('/travel/settings');
  const key = page.getByLabel('New FlightAware API key');
  await key.fill('synthetic-private-draft-4321');
  expect(await blocksUnload(page)).toBe(true);
  await travelNav(page).getByRole('link', { name: 'Trips', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('unsaved-key-dialog.png'), fullPage: true });
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(key).toHaveValue('synthetic-private-draft-4321');
  expect(await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]))).not.toContain('synthetic-private-draft-4321');
  let attempts = 0;
  await page.route('**/travel/api/settings/flightaware', route => ++attempts === 1
    ? route.fulfill({ status: 502, json: { message: 'Key save unavailable' } }) : route.continue());
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText('Key save unavailable');
  await expect(key).toHaveValue('synthetic-private-draft-4321');
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  await expect(page.locator('main [role=status]')).toHaveText('Key saved.');
  await expect(key).toHaveValue('');
  expect(await blocksUnload(page)).toBe(false);
  await travelNav(page).getByRole('link', { name: 'Trips', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trips', exact: true })).toBeVisible();
});

test('a late key save and personal-key removal preserve a newer typed key', async ({ page }) => {
  await page.goto('/travel/settings');
  const key = page.getByLabel('New FlightAware API key');
  await key.fill('synthetic-first-1234');
  const held = await holdResponse(page, '**/travel/api/settings/flightaware');
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  await held.ready;
  await expect(page.getByRole('button', { name: 'Save key', exact: true })).toBeDisabled();
  await key.fill('synthetic-newer-5678');
  held.release();
  await expect(page.locator('main [role=status]')).toContainText('newer key draft still needs saving');
  await expect(key).toHaveValue('synthetic-newer-5678');
  await page.getByRole('button', { name: 'Remove personal key' }).click();
  await page.getByRole('button', { name: 'Remove key', exact: true }).click();
  await expect(page.locator('main [role=status]')).toContainText('new key draft still needs saving');
  await expect(key).toHaveValue('synthetic-newer-5678');
  await travelNav(page).getByRole('link', { name: 'Trips', exact: true }).click();
  await page.getByRole('button', { name: 'Leave settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trips', exact: true })).toBeVisible();
  // The user menu no longer has a Travel settings item; /travel/settings still does.
  await page.goto('/travel/settings');
  await expect(key).toHaveValue('');
});

for (const screen of ['pto', 'settings']) {
  test(`session expiry clears a dirty ${screen} screen without a discard prompt`, async ({ page }) => {
    if (screen === 'pto') {
      await openPolicy(page);
      await page.getByLabel('Known balance (days)').fill('14');
    } else {
      await page.goto('/travel/settings');
      await page.getByLabel('New FlightAware API key').fill('synthetic-expired-key');
    }
    const ended = await page.request.post('/api/auth/logout', { headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin } });
    expect(ended.ok(), await ended.text()).toBeTruthy();
    expect((await page.request.get('/api/auth/me')).status()).toBe(401);
    await page.route('**/travel/api/**', route => route.fulfill({ status: 401, json: { message: 'Sign in again', code: 'session_expired' } }));
    await page.getByRole('button', { name: screen === 'pto' ? 'Save PTO policy' : 'Save key', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel(screen === 'pto' ? 'Known balance (days)' : 'New FlightAware API key')).toHaveCount(0);
  });
}
});
