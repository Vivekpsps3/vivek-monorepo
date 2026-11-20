import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

function card(page, title) {
  return page.getByRole('heading', { level: 2, name: title, exact: true }).locator('xpath=ancestor::article[1]');
}

async function createTrip(request, body) {
  const created = await request.post('/travel/api/trips', {
    data: { counts_as_pto: false, ...body },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json();
}

async function seedTrips(request) {
  const north = await createTrip(request, {
    title: 'Late north',
    start_date: '2020-03-01',
    end_date: '2020-03-10',
    status: 'booked',
    stays: [{ city: 'Oslo', arrive_on: '2020-03-01', leave_on: '2020-03-10' }],
  });
  const south = await createTrip(request, {
    title: 'Late south',
    start_date: '2020-03-08',
    end_date: '2020-03-15',
    status: 'done',
  });
  const harbor = await createTrip(request, {
    title: 'Planned harbor',
    start_date: '2090-04-01',
    end_date: '2090-04-05',
    status: 'planning',
    stays: [{ city: 'Lisbon', arrive_on: '2090-04-01', leave_on: '2090-04-05' }],
  });
  const coast = await createTrip(request, {
    title: 'Completed coast',
    start_date: '2090-08-01',
    end_date: '2090-08-06',
    status: 'done',
    stays: [{ city: 'Portland', arrive_on: '2090-08-01', leave_on: '2090-08-06' }],
  });
  const fjord = await createTrip(request, {
    title: 'Booked fjord',
    start_date: '2090-06-01',
    end_date: '2090-06-03',
    status: 'booked',
    stays: [{ city: 'Bergen', arrive_on: '2090-06-01', leave_on: '2090-06-03' }],
  });
  return { north, south, harbor, coast, fjord };
}

async function openMemories(page) {
  const ready = page.waitForResponse((response) => response.url().includes('/travel/api/memories') && response.ok());
  await page.goto('/travel/memories');
  await ready;
  await expect(page.getByRole('heading', { level: 1, name: 'Trip memories' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Travel sections' }).getByRole('link', { name: 'Memories', exact: true })).toHaveAttribute('aria-current', 'page');
}

async function expectHonestOverlaps(page) {
  const north = card(page, 'Late north');
  const south = card(page, 'Late south');
  await expect(north).toContainText('March 1, 2020 through March 10, 2020');
  await expect(north).toContainText('after this trip ended on March 10, 2020');
  await expect(north).toContainText('Town does not credit it.');
  await expect(north).toContainText('Overlaps Late south (March 8, 2020 through March 15, 2020). Both spans stay.');
  await expect(north).toContainText('The place is the saved destination Oslo.');
  await expect(south).toContainText('March 8, 2020 through March 15, 2020');
  await expect(south).toContainText('after this trip ended on March 15, 2020');
  await expect(south).toContainText('Town does not credit it.');
  await expect(south).toContainText('Overlaps Late north (March 1, 2020 through March 10, 2020). Both spans stay.');
  await expect(south).toContainText('No saved destination. This memory does not invent a place.');
  await expect(card(page, 'Planned harbor')).toContainText('This trip is planned. Town does not credit a planned trip.');
  await expect(card(page, 'Planned harbor')).toContainText('The place is the saved destination Lisbon.');
  await expect(card(page, 'Completed coast')).toContainText(
    'Town credits this completed trip once on August 7, 2090, the day after it ends.',
  );
  await expect(card(page, 'Completed coast')).toContainText(
    'That credit date is separate from the span August 1, 2090 through August 6, 2090.',
  );
  await expect(card(page, 'Booked fjord')).toContainText(
    'Town credits this booked trip once on June 4, 2090, the day after it ends.',
  );
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
}

async function expectReadable(page) {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact) || item.id === 'color-contrast')).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const motion = await page.locator('.memory-card').first().evaluate((node) => getComputedStyle(node).animationName);
  expect(motion).toBe('none');
  for (const name of ['Reload memories', 'Redate Late south', 'Delete Late south']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
  }
  const open = await page.getByRole('link', { name: 'Open Late south', exact: true }).boundingBox();
  expect(open?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(open?.width ?? 0).toBeGreaterThanOrEqual(44);
}

async function redateSouth(page, { activate }) {
  const opener = page.getByRole('button', { name: 'Redate Late south', exact: true });
  await activate(opener);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="start"]')).toBeFocused();
  await dialog.locator('input[name="start"]').fill('2090-09-01');
  await dialog.locator('input[name="end"]').fill('2090-09-04');
  await dialog.getByLabel('Private note').fill('pier light');
  const patch = page.waitForRequest((req) => req.method() === 'PATCH' && req.url().includes('/travel/api/trips/'));
  const save = dialog.getByRole('button', { name: 'Save dates', exact: true });
  await activate(save);
  const body = (await patch).postDataJSON();
  expect(body).toEqual({ start_date: '2090-09-01', end_date: '2090-09-04' });
  await expect(dialog).toBeHidden();
  const south = card(page, 'Late south');
  await expect(south).toContainText('September 1, 2090 through September 4, 2090');
  await expect(south).toContainText('Town credits this completed trip once on September 5, 2090');
  await expect(south).toContainText('No saved trip overlaps this span.');
  await expect(card(page, 'Late north')).toContainText('No saved trip overlaps this span.');
  await expect(south).toBeFocused();
  await expect(page.getByLabel('Private note')).toHaveCount(0);
}

test.describe('VIEW keyboard day', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, reducedMotion: 'reduce' });

  test('desktop light keyboard shows spans, credit dates, and derived updates', async ({ page, request }) => {
    test.setTimeout(90_000);
    const trips = await seedTrips(request);
    await openMemories(page);
    await chooseColorTheme(page, 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectHonestOverlaps(page);
    await expectReadable(page);

    const opener = page.getByRole('button', { name: 'Redate Late north', exact: true });
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('input[name="start"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    await redateSouth(page, {
      activate: async (control) => {
        await control.focus();
        await page.keyboard.press('Enter');
      },
    });

    const cancel = page.getByRole('button', { name: 'Cancel Completed coast', exact: true });
    await cancel.focus();
    await page.keyboard.press('Enter');
    const confirm = page.getByRole('dialog');
    await expect(confirm.getByRole('heading', { name: 'Cancel Completed coast?' })).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel trip', exact: true }).focus();
    await page.keyboard.press('Enter');
    const coast = card(page, 'Completed coast');
    await expect(coast).toContainText('This trip is planned. Town does not credit a planned trip.');
    await expect(coast).toContainText('August 1, 2090 through August 6, 2090');
    await expect(coast).toBeFocused();
    await expect(coast.getByRole('button', { name: 'Cancel Completed coast', exact: true })).toHaveCount(0);

    const remove = page.getByRole('button', { name: 'Delete Planned harbor', exact: true });
    await remove.focus();
    await page.keyboard.press('Enter');
    const typed = page.getByRole('dialog');
    await typed.getByLabel('Type Planned harbor to confirm').fill('Planned harbor');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'Planned harbor' })).toHaveCount(0);
    await expect(page.locator('#trip-memories')).toBeFocused();

    const listed = await (await request.get('/travel/api/memories?tz=UTC')).json();
    const south = listed.memories.find((item) => item.trip_id === trips.south.id);
    expect(south.span_start).toBe('2090-09-01');
    expect(south.credit_date).toBe('2090-09-05');
    expect(listed.memories.some((item) => item.trip_id === trips.harbor.id)).toBe(false);
    const coastRow = listed.memories.find((item) => item.trip_id === trips.coast.id);
    expect(coastRow.status).toBe('planning');
    expect(coastRow.credit_date).toBeNull();
  });
});

test.describe('VIEW touch night', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });

  test('phone night touch shows overlapping spans and updates a redate', async ({ page, request }) => {
    test.setTimeout(90_000);
    await seedTrips(request);
    await openMemories(page);
    await chooseColorTheme(page, 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectHonestOverlaps(page);
    await expectReadable(page);
    await redateSouth(page, { activate: async (control) => control.tap() });
    const saveBox = await page.getByRole('button', { name: 'Redate Late north', exact: true }).boundingBox();
    expect(saveBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

test('a late redate response keeps the newer draft and the previous card', async ({ page, request }) => {
  const south = await createTrip(request, {
    title: 'Late south',
    start_date: '2020-03-08',
    end_date: '2020-03-15',
    status: 'done',
  });
  await openMemories(page);
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let seen;
  const ready = new Promise((resolve) => { seen = resolve; });
  let fulfilled;
  const didFulfill = new Promise((resolve) => { fulfilled = resolve; });
  await page.route('**/travel/api/trips/' + south.id, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const response = await route.fetch();
    seen();
    await held;
    await route.fulfill({ response });
    fulfilled();
  });
  await page.getByRole('button', { name: 'Redate Late south', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="start"]').fill('2090-09-01');
  await dialog.locator('input[name="end"]').fill('2090-09-04');
  await dialog.getByLabel('Private note').fill('pier light');
  await dialog.getByRole('button', { name: 'Save dates', exact: true }).click();
  await ready;
  await dialog.locator('input[name="start"]').fill('2090-11-02');
  await dialog.getByLabel('Private note').fill('pier light kept');
  release();
  await didFulfill;
  const start = Date.now();
  await expect.poll(async () => {
    const open = await dialog.isVisible();
    const note = await dialog.getByLabel('Private note').inputValue().catch(() => '');
    const draft = await dialog.locator('input[name="start"]').inputValue().catch(() => '');
    const text = await card(page, 'Late south').innerText();
    if (!open || note !== 'pier light kept' || draft !== '2090-11-02') return 'lost';
    if (text.includes('September 1, 2090')) return 'applied';
    if (!text.includes('March 8, 2020 through March 15, 2020')) return 'missing';
    return Date.now() - start < 400 ? 'waiting' : 'kept';
  }).toBe('kept');
  const saved = await (await request.get('/travel/api/trips/' + south.id)).json();
  expect(saved.start_date).toBe('2090-09-01');
  expect(saved.notes ?? '').not.toContain('pier light');
});

test('a failed redate keeps the private note and the next save clears it', async ({ page, request }) => {
  const south = await createTrip(request, {
    title: 'Late south',
    start_date: '2020-03-08',
    end_date: '2020-03-15',
    status: 'done',
  });
  await openMemories(page);
  let failed = false;
  await page.route('**/travel/api/trips/' + south.id, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const body = route.request().postDataJSON();
    expect(body.notes).toBeUndefined();
    if (!failed) {
      failed = true;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Save unavailable' }),
      });
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Redate Late south', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="start"]').fill('2090-09-01');
  await dialog.locator('input[name="end"]').fill('2090-09-04');
  const note = dialog.getByLabel('Private note');
  await note.fill('pier light');
  await dialog.getByRole('button', { name: 'Save dates', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Save unavailable');
  await expect(note).toHaveValue('pier light');
  await expect(dialog.locator('input[name="start"]')).toHaveValue('2090-09-01');
  await expect(card(page, 'Late south')).toContainText('March 8, 2020 through March 15, 2020');
  await dialog.getByRole('button', { name: 'Save dates', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, 'Late south')).toContainText('September 1, 2090 through September 4, 2090');
  await expect(page.getByLabel('Private note')).toHaveCount(0);
  const saved = await (await request.get('/travel/api/trips/' + south.id)).json();
  expect(saved.start_date).toBe('2090-09-01');
  expect(saved.notes ?? '').not.toContain('pier light');
});

test('session expiry clears a private redate note without a discard prompt', async ({ page, request }) => {
  await createTrip(request, {
    title: 'Late south',
    start_date: '2020-03-08',
    end_date: '2020-03-15',
    status: 'done',
  });
  await openMemories(page);
  await page.getByRole('button', { name: 'Redate Late south', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Private note').fill('pier light');
  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  await page.route('**/travel/api/**', (route) => route.fulfill({
    status: 401,
    json: { message: 'Sign in again', code: 'session_expired' },
  }));
  await dialog.getByRole('button', { name: 'Save dates', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Leave this editor?')).toHaveCount(0);
  await expect(page.getByLabel('Private note')).toHaveCount(0);
});

test('a stale memories response does not replace a newer list', async ({ page, request }) => {
  const south = await createTrip(request, {
    title: 'Late south',
    start_date: '2020-03-08',
    end_date: '2020-03-15',
    status: 'done',
  });
  await openMemories(page);
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let seen;
  const ready = new Promise((resolve) => { seen = resolve; });
  let fulfilled;
  const didFulfill = new Promise((resolve) => { fulfilled = resolve; });
  let heldOnce = false;
  await page.route('**/travel/api/memories**', async (route) => {
    if (route.request().method() !== 'GET' || heldOnce) return route.continue();
    heldOnce = true;
    const response = await route.fetch();
    seen();
    await held;
    await route.fulfill({ response });
    fulfilled();
  });
  await page.getByRole('button', { name: 'Reload memories', exact: true }).click();
  await ready;
  await page.getByRole('button', { name: 'Redate Late south', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="start"]').fill('2090-09-01');
  await dialog.locator('input[name="end"]').fill('2090-09-04');
  await dialog.getByRole('button', { name: 'Save dates', exact: true }).click();
  await expect(card(page, 'Late south')).toContainText('September 1, 2090 through September 4, 2090');
  release();
  await didFulfill;
  const start = Date.now();
  await expect.poll(async () => {
    const text = await card(page, 'Late south').innerText();
    if (text.includes('March 8, 2020 through March 15, 2020')) return 'reverted';
    if (!text.includes('September 1, 2090 through September 4, 2090')) return 'missing';
    return Date.now() - start < 400 ? 'waiting' : 'kept';
  }).toBe('kept');
  const saved = await (await request.get('/travel/api/trips/' + south.id)).json();
  expect(saved.end_date).toBe('2090-09-04');
});
