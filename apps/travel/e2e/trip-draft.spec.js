import { expect, test } from '../../../tests/e2e/fixtures';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

async function addOutbound(page) {
  await page.getByRole('button', { name: 'Add transport' }).click();
  const transport = page.getByRole('dialog', { name: 'Add transport' });
  await transport.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('drive');
  await transport.getByLabel('From', { exact: true }).fill('SFO');
  await transport.getByLabel('To', { exact: true }).fill('NRT');
  await transport.getByLabel('Arrival local date and time').fill('2026-06-02T14:30');
  await transport.getByRole('button', { name: 'Save transport', exact: true }).click();
  await expect(transport).toHaveCount(0);
  await expect(page.getByText('drive · SFO → NRT')).toBeVisible();
}

function holdDraft(page) {
  let release;
  let received;
  const held = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { received = resolve; });
  const routePromise = page.route('**/travel/api/trip-drafts', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    received();
    await held;
    await route.fulfill({ response });
  });
  return routePromise.then(() => ({ ready, release: () => release() }));
}

test('an outbound draft saves no invented return and no PTO charge', async ({ page, request }) => {
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill('2026-06-01');
  await addOutbound(page);
  const posted = page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/travel/api/trip-drafts'));
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const body = (await posted).postDataJSON();
  expect(body.start_date).toBe('2026-06-01');
  expect(body.end_date).toBeNull();
  expect(body.destination_label).toBeNull();
  expect(body.title).toBe('Draft');
  expect(body.counts_as_pto).toBeUndefined();
  expect(body.stays).toBeUndefined();
  expect(body.pto_dates).toBeUndefined();
  expect(body.legs[0].arrive_place).toBe('NRT');
  expect(String(body.legs[0].arrive_at)).toContain('2026-06-02');
  await expect(page.getByText('The return date is still unknown, and this draft has no PTO charge.')).toBeVisible();
  await expect(page).toHaveURL(/\/travel\/trips\/new$/);
  await expect(page.getByLabel('Departure date')).toHaveValue('2026-06-01');
  await expect(page.getByLabel('Return date')).toHaveValue('');

  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toHaveLength(1);
  expect(drafts.drafts[0].end_date).toBeNull();
  expect(drafts.drafts[0].lifecycle).toBe('draft');
  const home = await (await request.get('/travel/api/home')).json();
  const titles = [...home.upcoming, ...home.in_progress, ...home.past].map((trip) => trip.title);
  expect(titles).toEqual([]);
  const pto = await (await request.get('/travel/api/pto')).json();
  expect(pto.entries).toEqual([]);
});

test('a failed draft save keeps the outbound leg and a retry stores it once', async ({ page, request }) => {
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill('2026-06-01');
  await addOutbound(page);
  let posts = 0;
  await page.route('**/travel/api/trip-drafts', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts += 1;
    if (posts === 1) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Travel is temporarily unavailable.' }),
      });
      return;
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('main .local-error')).toContainText('Travel is temporarily unavailable.');
  await expect(page.getByLabel('Departure date')).toHaveValue('2026-06-01');
  await expect(page.getByText('drive · SFO → NRT')).toBeVisible();
  await expect(page.getByLabel('Return date')).toHaveValue('');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('The return date is still unknown, and this draft has no PTO charge.')).toBeVisible();
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toHaveLength(1);
  expect(drafts.drafts[0].end_date).toBeNull();
  expect(posts).toBe(2);
  const pto = await (await request.get('/travel/api/pto')).json();
  expect(pto.entries).toEqual([]);
});

test('a late draft response keeps newer departure input', async ({ page, request }) => {
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill('2026-06-01');
  await addOutbound(page);
  const held = await holdDraft(page);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await held.ready;
  await page.getByLabel('Departure date').fill('2026-06-03');
  held.release();
  await expect(page.getByText('Your newer edits still need saving.')).toBeVisible();
  await expect(page.getByLabel('Departure date')).toHaveValue('2026-06-03');
  await expect(page.getByText('drive · SFO → NRT')).toBeVisible();
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toHaveLength(1);
  expect(drafts.drafts[0].start_date).toBe('2026-06-01');
  expect(drafts.drafts[0].end_date).toBeNull();
});

test('session expiry clears an unsaved trip draft without a discard prompt', async ({ page }) => {
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill('2026-06-01');
  await addOutbound(page);
  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  await page.route('**/travel/api/**', (route) => route.fulfill({
    status: 401,
    json: { message: 'Sign in again', code: 'session_expired' },
  }));
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Departure date')).toHaveCount(0);
});
