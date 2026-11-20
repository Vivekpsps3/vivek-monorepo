import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';

async function createTrip(request, title, start, end) {
  const created = await request.post('/travel/api/trips', {
    data: { title, start_date: start, end_date: end },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json();
}

function tripDay(page, iso) {
  return page.locator('#itinerary-day-' + iso);
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

test('DAY1 red-eye, unscheduled, and out-of-range records stay in order', async ({ page, request }) => {
  const trip = await createTrip(request, 'Red eye', '2026-12-12', '2026-12-14');
  expect((await request.post(`/travel/api/trips/${trip.id}/transports`, {
    data: {
      mode: 'flight',
      role: 'outbound',
      depart_place: 'Home',
      arrive_place: 'Lisbon',
      depart_at: '2026-12-12T23:40',
      arrive_at: '2026-12-13T06:10',
    },
  })).ok()).toBeTruthy();
  const savedFlight = await (await request.get('/travel/api/trips/' + trip.id)).json();
  expect((await request.post(`/travel/api/trips/${trip.id}/parking`, {
    data: {
      place_name: 'Garage',
      necessary: 'yes',
      booked: true,
      transport_id: savedFlight.transports[0].id,
    },
  })).ok()).toBeTruthy();
  expect((await request.post(`/travel/api/trips/${trip.id}/plans`, {
    data: { title: 'Museum', kind: 'activity', on_date: '2026-12-13', start_time: '09:00' },
  })).ok()).toBeTruthy();
  expect((await request.post(`/travel/api/trips/${trip.id}/plans`, {
    data: { title: 'Wander', kind: 'activity', on_date: '2026-12-13' },
  })).ok()).toBeTruthy();
  expect((await request.post(`/travel/api/trips/${trip.id}/plans`, {
    data: { title: 'Earlier', kind: 'activity', on_date: '2026-12-01', start_time: '08:00' },
  })).ok()).toBeTruthy();

  await page.goto('/travel/trips/' + trip.id);
  await expect(page.getByRole('tab', { name: /December 12, 2026, Leave day, busy/ })).toBeVisible();
  const leave = await tripDay(page, '2026-12-12').innerText();
  expect(leave.indexOf('Garage')).toBeGreaterThanOrEqual(0);
  expect(leave.indexOf('Garage')).toBeLessThan(leave.indexOf('11:40 PM'));
  const next = await tripDay(page, '2026-12-13').innerText();
  expect(next.indexOf('Arrives')).toBeLessThan(next.indexOf('Museum'));
  expect(next.indexOf('Museum')).toBeLessThan(next.indexOf('Unscheduled'));
  expect(next.indexOf('Unscheduled')).toBeLessThan(next.indexOf('Wander'));
  const outside = page.getByRole('heading', { name: 'Outside trip dates (1)' });
  await expect(outside).toBeVisible();
  const outsideText = await outside.locator('xpath=..').innerText();
  expect(outsideText).toContain('Earlier');
  expect(outsideText).not.toContain('Museum');
});

test('DAY2 one roving tab stop selects the day and Add a plan keeps that date', async ({ page, request }) => {
  const trip = await createTrip(request, 'Free days', '2026-12-12', '2026-12-14');
  await page.goto('/travel/trips/' + trip.id);
  const strip = page.getByRole('tablist', { name: 'Trip dates' });
  const tabs = strip.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  await tabs.first().focus();
  await page.keyboard.press('End');
  await expect(tabs.nth(2)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect.poll(async () => tabs.evaluateAll((nodes) => nodes.filter((node) => node.tabIndex === 0).length)).toBe(1);
  // Hold rendering until after the selection timer would have fired. Empty
  // days do not have a panel yet; focus must follow its first rendered frame.
  await page.clock.install({ time: new Date('2026-12-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-12-01T12:01:00Z'));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/day=2026-12-13/);
  await page.clock.runFor(50);
  await expect(tripDay(page, '2026-12-13')).toBeFocused();
  await page.clock.resume();
  await page.getByRole('button', { name: 'Add a plan', exact: true }).click();
  await expect(page.locator('input[name="date"]')).toHaveValue('2026-12-13');
  await page.locator('input[name="title"]').fill('Free day plan');
  await page.getByRole('button', { name: 'Save activity' }).click();
  await expect.poll(async () => {
    const saved = await (await request.get('/travel/api/trips/' + trip.id)).json();
    return saved.days.find((day) => day.on_date === '2026-12-13')?.items[0]?.title || '';
  }).toBe('Free day plan');
});

test('DAY3 selection survives reload and back-forward while phone and desktop differ', async ({ page, request }) => {
  const trip = await createTrip(request, 'Formatted trip', '2026-12-12', '2026-12-14');
  expect((await request.post(`/travel/api/trips/${trip.id}/transports`, {
    data: {
      mode: 'flight',
      role: 'outbound',
      depart_place: 'Home',
      arrive_place: 'Lisbon',
      depart_at: '2026-12-12T09:00',
      arrive_at: '2026-12-12T11:40',
      cost: '1240',
      currency: 'USD',
      paid: true,
    },
  })).ok()).toBeTruthy();
  expect((await request.post(`/travel/api/trips/${trip.id}/parking`, {
    data: {
      place_name: 'Airport lot',
      necessary: 'yes',
      booked: true,
      address: '1 Airport Way',
      cost: '25.50',
      currency: 'USD',
    },
  })).ok()).toBeTruthy();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/travel/trips/' + trip.id);
  await page.getByRole('tab', { name: /December 14, 2026, Return day, free/ }).click();
  await expect(page).toHaveURL(/day=2026-12-14/);
  await page.reload();
  await expect(page.getByRole('tab', { name: /December 14/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: /December 12/ }).click();
  await expect(page).toHaveURL(/day=2026-12-12/);
  await page.goBack();
  await expect(page).toHaveURL(/day=2026-12-14/);
  await expect(page.getByRole('tab', { name: /December 14/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { level: 2, name: 'Transport', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'Parking', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit transport' }).first()).toBeVisible();
  const menus = page.locator('.itinerary-actions--menu');
  expect(await menus.count()).toBeGreaterThan(0);
  for (const menu of await menus.all()) await expect(menu).toBeHidden();
  expect((await page.locator('main').innerText()).replaceAll('\u2060', '')).toContain('9:00 AM → 11:40 AM');
  let axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { level: 2, name: 'Transport', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'Parking', exact: true })).toHaveCount(0);
  const card = page.locator('ui-card').filter({ has: page.getByRole('heading', { level: 2, name: 'Itinerary' }) });
  const phone = (await card.innerText()).replaceAll('\u2060', '');
  expect(phone.match(/9:00 AM → 11:40 AM/g)).toHaveLength(1);
  expect(phone.match(/\$1,240\.00/g)).toHaveLength(1);
  expect(phone.match(/Booked · 1 Airport Way · \$25\.50/g)).toHaveLength(1);
  const inlineActions = page.locator('.itinerary-actions--inline');
  expect(await inlineActions.count()).toBeGreaterThan(0);
  for (const row of await inlineActions.all()) await expect(row).toBeHidden();
  await page.locator('.itinerary-actions--menu').first().getByRole('button').click();
  await expect(page.getByRole('menuitem', { name: 'Edit transport' })).toBeVisible();
  await page.keyboard.press('Escape');
  axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

function daySection(page, iso) {
  return page.locator('#itinerary-day-' + iso);
}

async function discardEditor(page) {
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('dialog', { name: 'Discard this draft?' }).getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function chooseDay(page, iso) {
  await page.locator('#trip-day-' + iso).click();
  await expect(page).toHaveURL(new RegExp('day=' + iso));
  return daySection(page, iso);
}

test('a chosen day accepts transport and an activity, then undo and a failed save keep that day', async ({ page, request }) => {
  const trip = await createTrip(request, 'Chosen day', '2026-12-12', '2026-12-14');
  await page.goto('/travel/trips/' + trip.id);
  const day = await chooseDay(page, '2026-12-13');
  await day.getByRole('button', { name: /Add on / }).click();
  await page.getByRole('menuitem', { name: 'Transport', exact: true }).click();
  const transport = page.getByRole('dialog');
  await expect(transport.getByLabel('Trip name')).toHaveCount(0);
  await expect(transport.getByLabel('Return date')).toHaveCount(0);
  await transport.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('drive');
  await expect(transport.getByLabel('Departure date')).toHaveValue('2026-12-13');
  await transport.getByLabel('From', { exact: true }).fill('Harbor');
  await transport.getByLabel('To', { exact: true }).fill('Museum');
  await transport.getByRole('button', { name: 'Save transport', exact: true }).click();
  await expect(transport).toBeHidden();

  await day.getByRole('button', { name: /Add on / }).click();
  await page.getByRole('menuitem', { name: 'Activity', exact: true }).click();
  const activity = page.getByRole('dialog');
  await expect(activity.getByLabel('Trip name')).toHaveCount(0);
  await expect(activity.locator('input[name="date"]')).toHaveValue('2026-12-13');
  await activity.getByLabel('Activity title').fill('Harbor walk');
  await activity.getByRole('button', { name: 'Save activity', exact: true }).click();
  await expect(activity).toBeHidden();
  await expect(day.getByRole('heading', { name: 'Drive', exact: true })).toHaveCount(1);
  await expect(day.getByText('Harbor walk', { exact: true })).toBeVisible();
  const saved = await (await request.get('/travel/api/trips/' + trip.id)).json();
  expect(saved.title).toBe('Chosen day');
  expect(saved.start_date).toBe('2026-12-12');
  expect(saved.end_date).toBe('2026-12-14');
  expect(String(saved.transports[0].depart_at)).toContain('2026-12-13');
  expect(saved.days.find((item) => item.on_date === '2026-12-13').items[0]).toMatchObject({
    title: 'Harbor walk',
    on_date: '2026-12-13',
  });

  const walk = day.locator('article').filter({ hasText: 'Harbor walk' });
  await walk.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(walk).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(walk).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id || '')).toBe('itinerary-day-2026-12-13');

  let failed = false;
  await page.route('**/travel/api/trips/' + trip.id + '/plans', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
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
  await day.getByRole('button', { name: /Add on / }).click();
  await page.getByRole('menuitem', { name: 'Activity', exact: true }).click();
  const retry = page.getByRole('dialog');
  const title = retry.getByLabel('Activity title');
  await title.fill('Keep this draft');
  await expect(retry.locator('input[name="date"]')).toHaveValue('2026-12-13');
  await retry.getByRole('button', { name: 'Save activity', exact: true }).click();
  await expect(retry.getByRole('alert')).toContainText('Save unavailable');
  await expect(title).toHaveValue('Keep this draft');
  await expect(retry.locator('input[name="date"]')).toHaveValue('2026-12-13');
  await expect.poll(() => retry.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await retry.getByRole('button', { name: 'Save activity', exact: true }).click();
  await expect(retry).toBeHidden();
  await expect(day.getByText('Keep this draft', { exact: true })).toBeVisible();
});

test('a late activity response keeps the newer draft', async ({ page, request }) => {
  const trip = await createTrip(request, 'Late day', '2026-12-12', '2026-12-14');
  await page.goto('/travel/trips/' + trip.id);
  const day = await chooseDay(page, '2026-12-13');
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let seen;
  const ready = new Promise((resolve) => { seen = resolve; });
  await page.route('**/travel/api/trips/' + trip.id + '/plans', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    seen();
    await held;
    await route.fulfill({ response });
  });
  await day.getByRole('button', { name: /Add on / }).click();
  await page.getByRole('menuitem', { name: 'Activity', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const title = dialog.getByLabel('Activity title');
  await title.fill('First title');
  await dialog.getByRole('button', { name: 'Save activity', exact: true }).click();
  await ready;
  await title.fill('Second title');
  release();
  await expect(dialog).toBeVisible();
  await expect(title).toHaveValue('Second title');
  await expect(dialog.locator('input[name="date"]')).toHaveValue('2026-12-13');
});

test('session expiry clears a private activity draft without a discard prompt', async ({ page, request }) => {
  const trip = await createTrip(request, 'Private day', '2026-12-12', '2026-12-14');
  await page.goto('/travel/trips/' + trip.id);
  const day = await chooseDay(page, '2026-12-13');
  await day.getByRole('button', { name: /Add on / }).click();
  await page.getByRole('menuitem', { name: 'Activity', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Activity title').fill('Harbor walk');
  await dialog.getByText('Optional details', { exact: true }).click();
  await dialog.getByLabel('Notes').fill('private harbor note');
  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  await page.route('**/travel/api/**', (route) => route.fulfill({
    status: 401,
    json: { message: 'Sign in again', code: 'session_expired' },
  }));
  await dialog.getByRole('button', { name: 'Save activity', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Notes')).toHaveCount(0);
});

test('a date-line arrival stays on the earlier local day', async ({ page, request }) => {
  const trip = await createTrip(request, 'Date line', '2026-12-12', '2026-12-14');
  expect((await request.post('/travel/api/trips/' + trip.id + '/transports', {
    data: {
      mode: 'flight',
      role: 'outbound',
      depart_place: 'Harbor',
      arrive_place: 'Island',
      depart_at: '2026-12-13T10:00',
      arrive_at: '2026-12-12T18:00',
    },
  })).ok()).toBeTruthy();
  await page.goto('/travel/trips/' + trip.id);
  const earlier = await daySection(page, '2026-12-12').innerText();
  const later = await daySection(page, '2026-12-13').innerText();
  expect(earlier).toContain('Arrives on an earlier local date');
  expect(earlier).toContain('6:00 PM');
  expect(later).toContain('10:00 AM');
  expect(later.indexOf('10:00 AM')).toBeLessThan(later.indexOf('6:00 PM'));
  expect((earlier.match(/Arrives on an earlier local date/g) || []).length).toBe(1);
});

async function seedReadableDay(request) {
  const trip = await createTrip(request, 'Readable day', '2026-12-12', '2026-12-14');
  expect((await request.post('/travel/api/trips/' + trip.id + '/transports', {
    data: { mode: 'drive', role: 'local', depart_place: 'Harbor', arrive_place: 'Museum', depart_at: '2026-12-13T00:00' },
  })).ok()).toBeTruthy();
  expect((await request.post('/travel/api/trips/' + trip.id + '/plans', {
    data: { title: 'Harbor walk', kind: 'activity', on_date: '2026-12-13' },
  })).ok()).toBeTruthy();
  return trip;
}

async function expectReadable(page) {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact) || item.id === 'color-contrast')).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const motion = await page.locator('.itinerary-day').first().evaluate((node) => getComputedStyle(node).animationName);
  expect(motion).toBe('none');
  const day = daySection(page, '2026-12-13');
  await expect(day.getByRole('heading', { name: 'Drive', exact: true })).toHaveCount(1);
  await expect(day.getByText('Harbor walk', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2, name: 'Transport', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'Parking', exact: true })).toHaveCount(0);
  for (const locator of [
    page.getByRole('button', { name: 'Add', exact: true }),
    page.locator('#trip-day-2026-12-13'),
    day.getByRole('button', { name: /Add on / }),
  ]) {
    const box = await locator.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
}

test.describe('VIEW touch night', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });

  test('phone night touch reads one local day', async ({ page, request }) => {
    const trip = await seedReadableDay(request);
    await page.goto('/travel/trips/' + trip.id);
    await chooseColorTheme(page, 'dark');
    await expectReadable(page);
    const tab = page.locator('#trip-day-2026-12-13');
    await tab.tap();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(tab).toBeFocused();
    const day = daySection(page, '2026-12-13');
    await day.getByRole('button', { name: /Add on / }).tap();
    await page.getByRole('menuitem', { name: 'Activity', exact: true }).tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('input[name="date"]')).toHaveValue('2026-12-13');
    const save = dialog.getByRole('button', { name: 'Save activity', exact: true });
    const box = await save.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await discardEditor(page);
    await expect(day.getByRole('button', { name: /Add on / })).toBeFocused();
  });
});

test.describe('VIEW keyboard day', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, reducedMotion: 'reduce' });

  test('desktop light keyboard reads one local day', async ({ page, request }) => {
    const trip = await seedReadableDay(request);
    await page.goto('/travel/trips/' + trip.id);
    await chooseColorTheme(page, 'light');
    await expectReadable(page);
    const tabs = page.getByRole('tablist', { name: 'Trip dates' }).getByRole('tab');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(daySection(page, '2026-12-13')).toBeFocused();
    const add = daySection(page, '2026-12-13').getByRole('button', { name: /Add on / });
    for (let step = 0; step < 12 && !(await add.evaluate((node) => node === document.activeElement)); step += 1) {
      await page.keyboard.press('Tab');
    }
    await expect(add).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Transport', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Activity', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Activity title')).toBeFocused();
    await expect(dialog.locator('input[name="date"]')).toHaveValue('2026-12-13');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Discard this draft?' }).getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(add).toBeFocused();
  });
});
