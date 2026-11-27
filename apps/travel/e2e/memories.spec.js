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

function manageSummary(page, title) {
  return card(page, title).locator('summary');
}

async function revealManage(page, title, activate) {
  const root = card(page, title);
  const redate = root.getByRole('button', { name: `Redate ${title}`, exact: true });
  if (await redate.isVisible()) return;
  const manage = manageSummary(page, title);
  await expect(manage).toHaveText(`Manage ${title}`);
  if (activate) await activate(manage);
  else await manage.click();
  await expect(redate).toBeVisible();
}

async function expectHonestOverlaps(page) {
  const north = card(page, 'Late north');
  const south = card(page, 'Late south');
  const harbor = card(page, 'Planned harbor');
  const coast = card(page, 'Completed coast');
  const fjord = card(page, 'Booked fjord');
  await expect(north).toContainText('March 1, 2020 through March 10, 2020');
  await expect(north).toContainText('10 days');
  await expect(north).toContainText('Oslo');
  await expect(north).toContainText('No credit · logged late');
  await expect(north.locator('dt').filter({ hasText: /^Logged$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText(
    /^[A-Z][a-z]+ \d{1,2}, \d{4}$/,
  );
  await expect(harbor.locator('dt', { hasText: 'Logged' })).toHaveCount(0);
  await expect(coast.locator('dt', { hasText: 'Logged' })).toHaveCount(0);
  await expect(north).toContainText('Late south');
  await expect(north).not.toContainText('March 8, 2020 through March 15, 2020');
  await expect(north).not.toContainText('Both spans stay');
  await expect(north).not.toContainText('Source trip');
  await expect(south).toContainText('March 8, 2020 through March 15, 2020');
  await expect(south).toContainText('No saved city');
  await expect(south).toContainText('No credit · logged late');
  await expect(south).toContainText('Late north');
  await expect(south).not.toContainText('Oslo');
  await expect(south).not.toContainText('does not invent a place');
  await expect(harbor).toContainText('No credit · planned');
  await expect(harbor).toContainText('Lisbon');
  await expect(harbor).not.toContainText('Town does not credit a planned trip');
  await expect(coast).toContainText('August 1, 2090 through August 6, 2090');
  await expect(coast).toContainText('August 7, 2090');
  await expect(coast).toContainText('Portland');
  await expect(coast).not.toContainText('That credit date is separate');
  await expect(fjord).toContainText('June 1, 2090 through June 3, 2090');
  await expect(fjord).toContainText('June 4, 2090');
  await expect(fjord).toContainText('Bergen');
  await expect(page.locator('[data-difference]')).toHaveCount(3);
  await expect(north).not.toContainText('Pixels counts each civil day');
  const rules = page.locator('.memory-rules');
  await rules.locator('summary').click();
  await expect(rules).toContainText('Pixels counts each civil day a trip spans.');
  await expect(rules).toContainText('A missing city stays missing.');
  await expect(page.locator('.memory-rules')).toHaveCount(1);
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/Source trip \d+/);
  expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  await expect(north.getByRole('link', { name: 'Open Late north', exact: true })).toBeVisible();
  await expect(north.getByRole('button', { name: 'Redate Late north', exact: true })).toBeHidden();
  await expect(north.getByRole('button', { name: 'Delete Late north', exact: true })).toBeHidden();
}

async function expectReadable(page) {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact) || item.id === 'color-contrast')).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const motion = await page.locator('.memory-card').first().evaluate((node) => getComputedStyle(node).animationName);
  expect(motion).toBe('none');
  for (const name of ['Reload memories', 'Open Late south']) {
    const control = name.startsWith('Open')
      ? page.getByRole('link', { name, exact: true })
      : page.getByRole('button', { name, exact: true });
    const box = await control.boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
  }
  const manageBox = await manageSummary(page, 'Late south').boundingBox();
  expect(manageBox?.height ?? 0, 'Manage Late south').toBeGreaterThanOrEqual(44);
  expect(manageBox?.width ?? 0, 'Manage Late south').toBeGreaterThanOrEqual(44);
  await revealManage(page, 'Late south');
  for (const name of ['Redate Late south', 'Delete Late south']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
  }
}

async function redateSouth(page, { activate }) {
  await revealManage(page, 'Late south', activate);
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
  await expect(south).toContainText('September 5, 2090');
  await expect(south).not.toContainText('That credit date is separate');
  await expect(south.locator('dt', { hasText: 'Overlaps' })).toHaveCount(0);
  await expect(card(page, 'Late north').locator('dt', { hasText: 'Overlaps' })).toHaveCount(0);
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

    await revealManage(page, 'Late north', async (control) => {
      await control.focus();
      await page.keyboard.press('Enter');
    });
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

    await revealManage(page, 'Completed coast', async (control) => {
      await control.focus();
      await page.keyboard.press('Enter');
    });
    const cancel = page.getByRole('button', { name: 'Cancel Completed coast', exact: true });
    await cancel.focus();
    await page.keyboard.press('Enter');
    const confirm = page.getByRole('dialog');
    await expect(confirm.getByRole('heading', { name: 'Cancel Completed coast?' })).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel trip', exact: true }).focus();
    await page.keyboard.press('Enter');
    const coast = card(page, 'Completed coast');
    await expect(coast).toContainText('No credit · planned');
    await expect(coast).toContainText('August 1, 2090 through August 6, 2090');
    await expect(coast).not.toContainText('August 7, 2090');
    await expect(coast).toBeFocused();
    await expect(coast.getByRole('button', { name: 'Cancel Completed coast', exact: true })).toHaveCount(0);

    await revealManage(page, 'Planned harbor', async (control) => {
      await control.focus();
      await page.keyboard.press('Enter');
    });
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
    await revealManage(page, 'Late north', async (control) => control.tap());
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
  await revealManage(page, 'Late south');
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
  await revealManage(page, 'Late south');
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
  await revealManage(page, 'Late south');
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
  await revealManage(page, 'Late south');
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

async function expectArrival(page, title) {
  const heading = page.getByRole('heading', { level: 2, name: title, exact: true });
  const open = page.getByRole('link', { name: `Open ${title}`, exact: true });
  await expect(heading).toBeVisible();
  await expect(open).toBeVisible();
  const metrics = await heading.evaluate((node) => {
    const titleBox = node.getBoundingClientRect();
    const link = node.closest('article')?.querySelector('a.ui-btn');
    const openBox = link?.getBoundingClientRect();
    return {
      titleTop: titleBox.top,
      titleBottom: titleBox.bottom,
      openTop: openBox?.top ?? -1,
      openBottom: openBox?.bottom ?? -1,
      height: window.innerHeight,
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(metrics.scrollWidth, `${metrics.width}px scroll`).toBeLessThanOrEqual(metrics.width + 1);
  expect(metrics.titleTop).toBeGreaterThanOrEqual(0);
  expect(metrics.titleBottom).toBeLessThanOrEqual(metrics.height);
  expect(metrics.openTop).toBeGreaterThanOrEqual(0);
  expect(metrics.openBottom).toBeLessThanOrEqual(metrics.height);
  console.log(
    `FIXUP-14 arrival ${metrics.width}x${metrics.height} titleTop=${Math.round(metrics.titleTop)} openBottom=${Math.round(metrics.openBottom)}`,
  );
}

test('two past trips lead with the first open action', async ({ page, request }) => {
  test.setTimeout(90_000);
  const harbor = await createTrip(request, {
    title: 'Leap harbor',
    start_date: '2024-02-28',
    end_date: '2024-03-05',
    status: 'done',
  });
  await createTrip(request, {
    title: 'Portland',
    start_date: '2024-02-27',
    end_date: '2024-03-02',
    status: 'done',
    stays: [{ city: 'Portland', arrive_on: '2024-02-27', leave_on: '2024-03-02' }],
  });
  await openMemories(page);
  for (const view of [
    { width: 390, height: 844, theme: 'dark' },
    { width: 1280, height: 800, theme: 'light' },
  ]) {
    await page.setViewportSize({ width: view.width, height: view.height });
    await chooseColorTheme(page, view.theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', view.theme);
    await expectArrival(page, 'Leap harbor');
    const first = card(page, 'Leap harbor');
    await expect(first).toContainText('February 28, 2024 through March 5, 2024');
    await expect(first).toContainText('7 days');
    await expect(first).toContainText('No saved city');
    await expect(first).toContainText('No credit · logged late');
    await expect(first).toContainText('Portland');
    await expect(first).not.toContainText('February 27, 2024 through March 2, 2024');
    const reading = await first.innerText();
    expect(reading).not.toContain(`Source trip ${harbor.id}`);
    expect(reading.split('\n').map((line) => line.trim())).not.toContain(String(harbor.id));
    await expect(first.getByRole('link', { name: 'Open Leap harbor', exact: true })).toHaveClass(/ui-btn--primary/);
    await expect(first.getByRole('button', { name: 'Redate Leap harbor', exact: true })).toBeHidden();
    const second = card(page, 'Portland');
    await expect(second).toContainText('February 27, 2024 through March 2, 2024');
    await expect(second).toContainText('Portland');
    await expect(second).toContainText('Leap harbor');
    await expect(second.locator('dd', { hasText: 'No saved city' })).toHaveCount(0);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Open Leap harbor', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/travel/trips/${harbor.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Leap harbor', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/travel\/memories/);
  await expect(page.locator(`article[data-trip="${harbor.id}"]`)).toBeVisible();
  await expect(card(page, 'Leap harbor')).toBeVisible();

  await page.setViewportSize({ width: 320, height: 844 });
  const narrowCard = page.locator('.memory-card').first();
  await expect.poll(async () => narrowCard.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
  });
  await expect.poll(async () => narrowCard.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const open = page.getByRole('link', { name: 'Open Leap harbor', exact: true });
  await open.scrollIntoViewIfNeeded();
  const box = await open.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const motion = await page.locator('.memory-card').first().evaluate((node) => getComputedStyle(node).animationName);
  expect(motion).toBe('none');
});
