import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';
import { chooseTripStart } from './dates.mjs';

const booking = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Synthetic//TUX-05//EN',
  'BEGIN:VEVENT',
  'UID:synthetic-ua837-20261102',
  'DTSTART;TZID=America/Los_Angeles:20261102T100000',
  'DTEND;TZID=Asia/Tokyo:20261104T073000',
  'SUMMARY:UA837 SFO-NRT',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

const later = booking
  .replaceAll('synthetic-ua837-20261102', 'synthetic-ua838-20261102')
  .replaceAll('UA837 SFO-NRT', 'UA838 LAX-HND')
  .replaceAll('DTSTART;TZID=America/Los_Angeles:20261102T100000', 'DTSTART;TZID=America/Los_Angeles:20261102T150000')
  .replaceAll('DTEND;TZID=Asia/Tokyo:20261104T073000', 'DTEND;TZID=Asia/Tokyo:20261103T190000');

const floating = booking.replace(
  'DTSTART;TZID=America/Los_Angeles:20261102T100000',
  'DTSTART:20261102T100000',
);

function file(name, contents) {
  return { name, mimeType: 'text/calendar', buffer: Buffer.from(contents) };
}

function calendarFile(page) {
  return page.getByLabel('Calendar booking', { exact: true });
}

function savedWrites(page) {
  const writes = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/calendar-bookings/preview')) return;
    if (request.method() !== 'POST' && request.method() !== 'PATCH') return;
    if (url.includes('/travel/api/trips') || url.includes('/travel/api/trip-drafts')) writes.push(`${request.method()} ${url}`);
  });
  return writes;
}

async function chooseCalendar(page, name, contents) {
  await chooseTripStart(page, 'calendar');
  const response = page.waitForResponse((res) =>
    res.url().includes('/calendar-bookings/preview') && res.request().method() === 'POST');
  await calendarFile(page).setInputFiles(file(name, contents));
  return response;
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

test('a calendar booking previews the flight and saves only after confirmation', async ({ page, request }) => {
  const writes = savedWrites(page);
  await page.goto('/travel/trips/new');
  const preview = await chooseCalendar(page, 'synthetic-ua837.ics', booking);
  expect((await preview).ok()).toBeTruthy();
  const card = page.locator('.calendar-preview');
  await expect(card).toContainText('UA837 · SFO → NRT');
  await expect(card).toContainText('Booking synthetic-ua837-20261102');
  await expect(card).toContainText('Scheduled departure: 2026-11-02 10:00 America/Los_Angeles');
  await expect(card).toContainText('Scheduled arrival: 2026-11-04 07:30 Asia/Tokyo');
  await expect(card).toContainText('Proposed. Not saved yet.');
  await expect(page.locator('input[name="start"]')).toHaveCount(0);
  await expect(page.locator('input[name="end"]')).toHaveCount(0);
  await expect(page.locator('input[name="flightIdent"]')).toHaveCount(0);
  expect(writes).toEqual([]);

  const posted = page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/travel/api/trip-drafts'));
  await page.getByRole('button', { name: 'Save this booking as a draft', exact: true }).click();
  const body = (await posted).postDataJSON();
  expect(body.start_date).toBe('2026-11-02');
  expect(body.end_date).toBeNull();
  expect(body.destination_label).toBeNull();
  expect(body.counts_as_pto).toBeUndefined();
  expect(body.pto_dates).toBeUndefined();
  expect(body.legs).toHaveLength(1);
  expect(body.legs[0].number).toBe('UA837');
  expect(body.legs[0].confirmation).toBe('synthetic-ua837-20261102');
  expect(body.legs[0].depart_tz).toBe('America/Los_Angeles');
  expect(body.legs[0].arrive_tz).toBe('Asia/Tokyo');
  expect(body.legs[0].depart_at).toContain('2026-11-02T10:00');
  expect(body.legs[0].arrive_at).toContain('2026-11-04T07:30');
  await expect(page.getByText('The return date is still unknown, and this draft has no PTO charge.')).toBeVisible();
  await expect(page.locator('input[name="end"]')).toHaveCount(0);

  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toHaveLength(1);
  expect(drafts.drafts[0].end_date).toBeNull();
  expect(drafts.drafts[0].legs).toHaveLength(1);
  const home = await (await request.get('/travel/api/home')).json();
  expect([...home.upcoming, ...home.in_progress, ...home.past]).toEqual([]);
  const pto = await (await request.get('/travel/api/pto')).json();
  expect(pto.entries).toEqual([]);
});

test('importing the same booking again offers the existing leg', async ({ page, request }) => {
  await page.goto('/travel/trips/new');
  await chooseCalendar(page, 'synthetic-ua837.ics', booking);
  await page.getByRole('button', { name: 'Save this booking as a draft', exact: true }).click();
  await expect(page.getByText('The return date is still unknown, and this draft has no PTO charge.')).toBeVisible();
  const writes = savedWrites(page);
  await chooseCalendar(page, 'synthetic-ua837-again.ics', booking);
  const card = page.locator('.calendar-preview');
  await expect(card).toContainText('already the outbound leg on Flight UA837');
  await expect(page.getByRole('button', { name: 'Save this booking as a draft', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use the existing leg', exact: true }).click();
  await expect(card.getByRole('status')).toBeFocused();
  expect(writes).toEqual([]);
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toHaveLength(1);
  expect(drafts.drafts[0].legs).toHaveLength(1);
  expect(drafts.drafts[0].end_date).toBeNull();
  const pto = await (await request.get('/travel/api/pto')).json();
  expect(pto.entries).toEqual([]);
});

test('a bad calendar file stays in preview and writes nothing', async ({ page, request }) => {
  const writes = savedWrites(page);
  await page.goto('/travel/trips/new');
  const cases = [
    ['synthetic-broken.ics', 'hello', 'not a readable calendar booking'],
    ['synthetic-float.ics', floating, 'departure time has no single time zone'],
    ['synthetic-big.ics', 'x'.repeat(32769), 'larger than 32 KB'],
  ];
  for (const [name, contents, reason] of cases) {
    await chooseCalendar(page, name, contents);
    const card = page.locator('.calendar-preview');
    await expect(card).toContainText(reason);
    await expect(card).toContainText('Nothing was saved.');
    await expect(calendarFile(page)).toBeFocused();
    await expect(page.getByRole('button', { name: 'Save this booking as a draft', exact: true })).toHaveCount(0);
  }
  expect(writes).toEqual([]);
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toEqual([]);
  const home = await (await request.get('/travel/api/home')).json();
  expect([...home.upcoming, ...home.in_progress, ...home.past]).toEqual([]);
});

test('a late preview does not replace the booking on screen', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let held;
  const started = new Promise((resolve) => { held = resolve; });
  let finished;
  const firstFinished = new Promise((resolve) => { finished = resolve; });
  await page.route('**/travel/api/calendar-bookings/preview', async (route) => {
    const text = route.request().postDataJSON().text;
    if (text.includes('UID:synthetic-ua837-20261102')) {
      held();
      await gate;
      await route.continue();
      finished();
      return;
    }
    await route.continue();
  });
  try {
    await page.goto('/travel/trips/new');
    await chooseTripStart(page, 'calendar');
    await calendarFile(page).setInputFiles(file('synthetic-ua837.ics', booking));
    await started;
    await chooseCalendar(page, 'synthetic-ua838.ics', later);
    const card = page.locator('.calendar-preview');
    await expect(card).toContainText('LAX → HND');
    await expect(card).toContainText('2026-11-02 15:00 America/Los_Angeles');
    release();
    await firstFinished;
    await expect(card).toContainText('LAX → HND');
    await expect(card).not.toContainText('SFO');
  } finally {
    release();
  }
});

test('a failed save keeps the calendar text and the retry stores one draft', async ({ page, request }) => {
  let posts = 0;
  await page.route('**/travel/api/trip-drafts', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts += 1;
    if (posts === 1) {
      return route.fulfill({ status: 502, json: { message: 'Synthetic failure' } });
    }
    return route.continue();
  });
  await page.goto('/travel/trips/new');
  await chooseCalendar(page, 'synthetic-ua837.ics', booking);
  await page.getByRole('button', { name: 'Save this booking as a draft', exact: true }).click();
  await expect(page.locator('.calendar-import').getByRole('alert')).toContainText('Synthetic failure');
  await expect(page.locator('.calendar-preview')).toContainText('SFO → NRT');
  await expect(page.getByText('File: synthetic-ua837.ics')).toBeVisible();
  await page.getByRole('button', { name: 'Save this booking as a draft', exact: true }).click();
  await expect(page.getByText('The return date is still unknown, and this draft has no PTO charge.')).toBeVisible();
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toHaveLength(1);
  expect(drafts.drafts[0].end_date).toBeNull();
  expect(drafts.drafts[0].legs[0].confirmation).toBe('synthetic-ua837-20261102');
});

test('a late save does not mark the newer booking as saved', async ({ page, request }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let held;
  const started = new Promise((resolve) => { held = resolve; });
  await page.route('**/travel/api/trip-drafts', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    held();
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/travel/trips/new');
    await chooseCalendar(page, 'synthetic-ua837.ics', booking);
    await page.getByRole('button', { name: 'Save this booking as a draft', exact: true }).click();
    await started;
    await chooseCalendar(page, 'synthetic-ua838.ics', later);
    const card = page.locator('.calendar-preview');
    await expect(card).toContainText('LAX → HND');
    const saved = page.waitForResponse((res) =>
      res.url().includes('/travel/api/trip-drafts') && res.request().method() === 'POST');
    release();
    expect((await saved).ok()).toBeTruthy();
    await expect(card).toContainText('LAX → HND');
    await expect(card).toContainText('Proposed. Not saved yet.');
    await expect(page.getByText('Draft saved.')).toHaveCount(0);
    const drafts = await (await request.get('/travel/api/trip-drafts')).json();
    expect(drafts.drafts).toHaveLength(1);
    expect(drafts.drafts[0].legs[0].confirmation).toBe('synthetic-ua837-20261102');
    expect(drafts.drafts[0].end_date).toBeNull();
  } finally {
    release();
  }
});

test('session expiry clears the calendar booking without a discard prompt', async ({ page, request }) => {
  await page.goto('/travel/trips/new');
  await chooseCalendar(page, 'synthetic-ua837.ics', booking);
  await expect(page.locator('.calendar-preview')).toContainText('SFO → NRT');
  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  await page.route('**/travel/api/**', (route) => route.fulfill({
    status: 401,
    json: { message: 'Sign in again', code: 'session_expired' },
  }));
  await page.getByRole('button', { name: 'Save this booking as a draft', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('synthetic-ua837-20261102')).toHaveCount(0);
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toEqual([]);
});

test('an existing trip receives the booking once and keeps its dates', async ({ page, request }) => {
  const created = await request.post('/travel/api/trips', { data: {
    title: 'Lisbon week',
    start_date: '2026-04-06',
    end_date: '2026-04-10',
    stays: [{ city: 'Lisbon', arrive_on: '2026-04-06', leave_on: '2026-04-10' }],
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const trip = await created.json();
  const beforePto = await (await request.get('/travel/api/pto')).json();
  await page.goto('/travel/trips/new');
  await chooseCalendar(page, 'synthetic-ua837.ics', booking);
  await page.getByRole('button', { name: 'Add booking to an existing trip', exact: true }).click();
  await page.getByRole('button', { name: /Lisbon week/ }).click();
  await page.getByRole('button', { name: 'Add booking to this trip', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/travel/trips/${trip.id}$`));
  const after = await (await request.get('/travel/api/trips/' + trip.id)).json();
  expect(after.start_date).toBe('2026-04-06');
  expect(after.end_date).toBe('2026-04-10');
  expect(after.transports).toHaveLength(1);
  expect(after.transports[0].confirmation).toBe('synthetic-ua837-20261102');
  expect(after.transports[0].depart_place).toBe('SFO');
  const afterPto = await (await request.get('/travel/api/pto')).json();
  expect(afterPto.entries).toEqual(beforePto.entries);
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toEqual([]);

  await page.goto('/travel/trips/new');
  const writes = savedWrites(page);
  await chooseCalendar(page, 'synthetic-ua837-again.ics', booking);
  await expect(page.locator('.calendar-preview')).toContainText('already a leg on Lisbon week');
  await expect(page.getByRole('button', { name: 'Save this booking as a draft', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use the existing leg', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/travel/trips/${trip.id}$`));
  expect(writes).toEqual([]);
  const again = await (await request.get('/travel/api/trips/' + trip.id)).json();
  expect(again.transports).toHaveLength(1);
  expect(again.end_date).toBe('2026-04-10');
});

const views = [
  { name: 'phone', viewport: { width: 390, height: 844 }, theme: 'dark', hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, theme: 'light', hasTouch: false },
];

for (const view of views) {
  test.describe(view.name, () => {
    test.use({ viewport: view.viewport, hasTouch: view.hasTouch, reducedMotion: 'reduce' });

    test(`calendar preview and correction at ${view.viewport.width}px in ${view.theme}`, async ({ page, request }) => {
      await page.goto('/travel/trips/new');
      await chooseColorTheme(page, view.theme);
      await chooseCalendar(page, 'synthetic-float.ics', floating);
      const rejected = page.locator('.calendar-preview');
      await expect(rejected).toContainText('departure time has no single time zone');
      await expect(calendarFile(page)).toBeFocused();
      const correction = page.getByRole('button', { name: 'Choose a different booking', exact: true });
      expect((await correction.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      if (view.hasTouch) await correction.tap();
      else {
        await correction.focus();
        await page.keyboard.press('Enter');
      }
      await expect(calendarFile(page)).toBeFocused();

      await chooseCalendar(page, 'synthetic-ua837.ics', booking);
      const card = page.locator('.calendar-preview');
      await expect(card).toContainText('Scheduled departure: 2026-11-02 10:00 America/Los_Angeles');
      await expect(card).toContainText('Scheduled arrival: 2026-11-04 07:30 Asia/Tokyo');
      await expect(card).toHaveCSS('animation-name', 'none');
      const fileInput = calendarFile(page);
      const save = page.getByRole('button', { name: 'Save this booking as a draft', exact: true });
      expect((await fileInput.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      expect((await save.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      const result = await new AxeBuilder({ page }).include('.calendar-import').analyze();
      expect(result.violations.filter((issue) =>
        issue.id === 'color-contrast' || issue.impact === 'serious' || issue.impact === 'critical',
      )).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`calendar-import-${view.name}.png`) });
      await expect(page.locator('input[name="end"]')).toHaveCount(0);
      if (view.hasTouch) await save.tap();
      else {
        await save.focus();
        await page.keyboard.press('Enter');
      }
      await expect(page.getByText('The return date is still unknown, and this draft has no PTO charge.')).toBeVisible();
      await expect(page.locator('input[name="end"]')).toHaveCount(0);
      const drafts = await (await request.get('/travel/api/trip-drafts')).json();
      expect(drafts.drafts).toHaveLength(1);
      expect(drafts.drafts[0].end_date).toBeNull();
      const pto = await (await request.get('/travel/api/pto')).json();
      expect(pto.entries).toEqual([]);
    });
  });
}
