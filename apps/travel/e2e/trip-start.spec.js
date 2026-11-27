import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';
import { chooseTripStart } from './dates.mjs';

const morning = {
  ident: 'UAL837',
  ident_iata: 'UA837',
  status: 'Scheduled',
  origin_iata: 'SFO',
  origin_timezone: 'America/Los_Angeles',
  destination_iata: 'NRT',
  destination_timezone: 'Asia/Tokyo',
  scheduled_out: '2026-11-02T18:00:00Z',
  scheduled_in: '2026-11-03T22:30:00Z',
  source: 'schedules',
  fa_flight_id: null,
};

const booking = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Synthetic//FIXUP-09//EN',
  'BEGIN:VEVENT',
  'UID:synthetic-ua837-20261102',
  'DTSTART;TZID=America/Los_Angeles:20261102T100000',
  'DTEND;TZID=Asia/Tokyo:20261104T073000',
  'SUMMARY:UA837 SFO-NRT',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

const choices = ['Flight/date', 'Calendar booking', 'Manual'];

function choice(page, name) {
  return page.getByRole('radio', { name, exact: true });
}

function calendarFile(page) {
  return page.getByLabel('Calendar booking', { exact: true });
}

async function expectInView(page, locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const nav = await page.locator('ui-section-nav').boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'control box').toBeTruthy();
  expect(nav, 'section nav').toBeTruthy();
  expect(viewport, 'viewport').toBeTruthy();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.y).toBeGreaterThanOrEqual(nav.y + nav.height - 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
}

async function expectArrival(page) {
  await expect(page.getByRole('radiogroup', { name: 'How should this trip start?' })).toBeVisible();
  for (const name of choices) {
    const radio = choice(page, name);
    await expect(radio).toHaveAttribute('aria-checked', 'false');
    await expectInView(page, radio);
  }
  await expect(page.locator('#trip-start-help')).toHaveText(
    'Choose a flight and date, a calendar booking, or dates you already know.',
  );
  await expect(page.locator('input[name="flightIdent"]')).toHaveCount(0);
  await expect(page.locator('input[name="calendarBooking"]')).toHaveCount(0);
  await expect(page.locator('input[name="start"]')).toHaveCount(0);
  await expect(page.locator('input[name="end"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Start with a flight' })).toHaveCount(0);
  await expect(page.getByText('You can still type the trip below.')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

function savedWrites(page) {
  const writes = [];
  page.on('request', (request) => {
    const url = request.url();
    if (request.method() !== 'POST' && request.method() !== 'PATCH') return;
    if (url.includes('/calendar-bookings/preview') || url.includes('/flights/lookup')) return;
    if (url.includes('/travel/api/trips') || url.includes('/travel/api/trip-drafts') || url.includes('/travel/api/pto')) {
      writes.push(`${request.method()} ${url}`);
    }
  });
  return writes;
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

const views = [
  { name: 'phone-night', viewport: { width: 390, height: 844 }, theme: 'dark', hasTouch: true },
  { name: 'phone-day', viewport: { width: 390, height: 844 }, theme: 'light', hasTouch: true },
  { name: 'desk-night', viewport: { width: 1280, height: 800 }, theme: 'dark', hasTouch: false },
  { name: 'desk-day', viewport: { width: 1280, height: 800 }, theme: 'light', hasTouch: false },
];

for (const view of views) {
  test.describe(view.name, () => {
    test.use({ viewport: view.viewport, hasTouch: view.hasTouch, reducedMotion: 'reduce' });

    test(`choices are visible and one form opens at ${view.viewport.width} in ${view.theme}`, async ({ page }) => {
      await page.goto('/travel/trips/new');
      await chooseColorTheme(page, view.theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', view.theme);
      await expectArrival(page);
      await expect(choice(page, 'Flight/date')).toHaveCSS('animation-name', 'none');
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations.filter((issue) =>
        issue.id === 'color-contrast' || issue.impact === 'serious' || issue.impact === 'critical',
      )).toEqual([]);

      const open = view.hasTouch
        ? (name) => choice(page, name).tap()
        : (name) => choice(page, name).click();
      await open('Flight/date');
      await expect(page.locator('#trip-start-help')).toContainText('Enter one flight number and date.');
      await expectInView(page, page.getByLabel('Flight number'));
      await expect(page.locator('input[name="calendarBooking"]')).toHaveCount(0);
      await expect(page.locator('input[name="start"]')).toHaveCount(0);

      await open('Calendar booking');
      await expect(page.locator('#trip-start-help')).toContainText('Choose one flight calendar file.');
      await expectInView(page, calendarFile(page));
      await expect(page.locator('input[name="flightIdent"]')).toHaveCount(0);
      await expect(page.locator('input[name="start"]')).toHaveCount(0);

      await open('Manual');
      await expect(page.locator('#trip-start-help')).toHaveText('Enter the dates and destination you already know.');
      await expectInView(page, page.getByLabel('Departure date'));
      await expect(page.getByLabel('Return date')).toBeVisible();
      await expect(page.locator('input[name="flightIdent"]')).toHaveCount(0);
      await expect(page.locator('input[name="calendarBooking"]')).toHaveCount(0);
    });
  });
}

test('keyboard moves from Flight/date to Manual and shows the departure date', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/travel/trips/new');
  await chooseColorTheme(page, 'light');
  await choice(page, 'Flight/date').focus();
  await page.keyboard.press('ArrowRight');
  await expect(choice(page, 'Calendar booking')).toBeChecked();
  await expectInView(page, calendarFile(page));
  await page.keyboard.press('ArrowRight');
  await expect(choice(page, 'Manual')).toBeChecked();
  await expectInView(page, page.getByLabel('Departure date'));
  await expect(page.locator('input[name="flightIdent"]')).toHaveCount(0);
  await expect(page.locator('input[name="calendarBooking"]')).toHaveCount(0);
});

test('a manual trip saves the typed dates and city', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/travel/trips/new');
  await chooseTripStart(page, 'manual');
  await page.getByLabel('Departure date').fill('2026-12-01');
  await page.getByLabel('Return date').fill('2026-12-03');
  await page.getByLabel('Destination city').fill('Kyoto');
  await expect(page.locator('input[name="flightIdent"]')).toHaveCount(0);
  const posted = page.waitForRequest((req) => req.method() === 'POST' && req.url().endsWith('/travel/api/trips'));
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  const body = (await posted).postDataJSON();
  expect(body.start_date).toBe('2026-12-01');
  expect(body.end_date).toBe('2026-12-03');
  expect(body.stays).toEqual([{ city: 'Kyoto', arrive_on: '2026-12-01', leave_on: '2026-12-03' }]);
  expect(body.transports).toEqual([]);
  await expect(page).toHaveURL(/\/travel\/trips\/\d+$/);
  const home = await (await request.get('/travel/api/home')).json();
  const trip = [...home.upcoming, ...home.in_progress, ...home.past].find((item) => item.title.includes('Kyoto') || item.start_date === '2026-12-01');
  expect(trip.start_date).toBe('2026-12-01');
  expect(trip.end_date).toBe('2026-12-03');
});

test('an outbound flight confirms a proposal and saves a draft without a return or PTO', async ({ page, request }) => {
  await page.route('**/travel/api/flights/lookup', (route) => route.fulfill({
    json: { flights: [morning], fetched_at: '2026-11-19T15:00:00+00:00' },
  }));
  const writes = savedWrites(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/travel/trips/new');
  await chooseTripStart(page, 'flight');
  await expectInView(page, page.getByLabel('Flight number'));
  await page.getByLabel('Flight number').fill('UA 837');
  await page.getByLabel('Flight date').fill('2026-11-02');
  const card = page.locator('.flight-preview');
  await expect(card).toContainText('SFO → NRT');
  await expect(card).toContainText('Proposed. Not saved yet.');
  await expect(page.locator('input[name="start"]')).toHaveCount(0);
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Plan as a new trip', exact: true }).click();
  await expect(page.getByLabel('Departure date')).toHaveValue('2026-11-02');
  await expect(page.getByLabel('Return date')).toHaveValue('');
  const posted = page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/travel/api/trip-drafts'));
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const body = (await posted).postDataJSON();
  expect(body.start_date).toBe('2026-11-02');
  expect(body.end_date).toBeNull();
  expect(body.counts_as_pto).toBeUndefined();
  expect(body.pto_dates).toBeUndefined();
  expect(body.legs[0].number).toBe('UA837');
  await expect(page.getByText('The return date is still unknown, and this draft has no PTO charge.')).toBeVisible();
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toHaveLength(1);
  expect(drafts.drafts[0].end_date).toBeNull();
  const pto = await (await request.get('/travel/api/pto')).json();
  expect(pto.entries).toEqual([]);
});

test('a calendar file previews the leg before any draft or PTO write', async ({ page, request }) => {
  const writes = savedWrites(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/travel/trips/new');
  await chooseTripStart(page, 'calendar');
  await expectInView(page, calendarFile(page));
  const preview = page.waitForResponse((res) =>
    res.url().includes('/calendar-bookings/preview') && res.request().method() === 'POST');
  await calendarFile(page).setInputFiles({
    name: 'synthetic-ua837.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(booking),
  });
  expect((await preview).ok()).toBeTruthy();
  await expect(page.locator('.calendar-preview')).toContainText('UA837 · SFO → NRT');
  await expect(page.locator('.calendar-preview')).toContainText('Proposed. Not saved yet.');
  await expect(page.locator('input[name="start"]')).toHaveCount(0);
  await expect(page.locator('input[name="end"]')).toHaveCount(0);
  expect(writes).toEqual([]);
  const posted = page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/travel/api/trip-drafts'));
  await page.getByRole('button', { name: 'Save this booking as a draft', exact: true }).click();
  const body = (await posted).postDataJSON();
  expect(body.end_date).toBeNull();
  expect(body.counts_as_pto).toBeUndefined();
  expect(body.pto_dates).toBeUndefined();
  await expect(page.getByText('The return date is still unknown, and this draft has no PTO charge.')).toBeVisible();
  await expect(page.locator('input[name="end"]')).toHaveCount(0);
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toHaveLength(1);
  const pto = await (await request.get('/travel/api/pto')).json();
  expect(pto.entries).toEqual([]);
});

test('switching mode keeps manual dates, a flight preview, and a rejected calendar', async ({ page }) => {
  let lookups = 0;
  await page.route('**/travel/api/flights/lookup', (route) => {
    lookups += 1;
    return route.fulfill({ json: { flights: [morning] } });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/travel/trips/new');
  await chooseTripStart(page, 'manual');
  await page.getByLabel('Departure date').fill('2026-12-01');
  await page.getByLabel('Return date').fill('2026-12-05');
  await page.getByLabel('Destination city').fill('Kyoto');
  await chooseTripStart(page, 'flight');
  await expect(page.locator('input[name="start"]')).toHaveCount(0);
  await page.getByLabel('Flight number').fill('UA 837');
  await page.getByLabel('Flight date').fill('2026-11-02');
  await expect(page.locator('.flight-preview')).toContainText('SFO → NRT');
  expect(lookups).toBe(1);
  await chooseTripStart(page, 'calendar');
  await calendarFile(page).setInputFiles({
    name: 'synthetic-broken.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from('hello'),
  });
  await expect(page.locator('.calendar-preview')).toContainText('not a readable calendar booking');
  await expect(page.locator('.calendar-preview')).toContainText('Nothing was saved.');
  await chooseTripStart(page, 'manual');
  await expect(page.getByLabel('Departure date')).toHaveValue('2026-12-01');
  await expect(page.getByLabel('Return date')).toHaveValue('2026-12-05');
  await expect(page.getByLabel('Destination city')).toHaveValue('Kyoto');
  await expect(page.locator('input[name="flightIdent"]')).toHaveCount(0);
  await expect(page.locator('input[name="calendarBooking"]')).toHaveCount(0);
  await chooseTripStart(page, 'flight');
  await expect(page.getByLabel('Flight number')).toHaveValue('UA 837');
  await expect(page.getByLabel('Flight date')).toHaveValue('2026-11-02');
  await expect(page.locator('.flight-preview')).toContainText('SFO → NRT');
  expect(lookups).toBe(1);
  await expect(page.locator('input[name="start"]')).toHaveCount(0);
  await chooseTripStart(page, 'calendar');
  await expect(page.getByText('File: synthetic-broken.ics')).toBeVisible();
  await expect(page.locator('.calendar-preview')).toContainText('not a readable calendar booking');
  await expect(page.locator('input[name="start"]')).toHaveCount(0);
  const drafts = await (await page.request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toEqual([]);
  const pto = await (await page.request.get('/travel/api/pto')).json();
  expect(pto.entries).toEqual([]);
});

test('a missing FlightAware provider keeps the typed flight and writes nothing', async ({ page, request }) => {
  await page.route('**/travel/api/flights/lookup', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'provider_unconfigured' }),
  }));
  const writes = savedWrites(page);
  await page.goto('/travel/trips/new');
  await chooseTripStart(page, 'flight');
  await page.getByLabel('Flight number').fill('UA 837');
  await page.getByLabel('Flight date').fill('2026-11-02');
  await expect(page.getByText('Add a FlightAware AeroAPI key in Settings. Type the times yourself.')).toBeVisible();
  await expect(page.getByLabel('Flight number')).toHaveValue('UA 837');
  await expect(page.getByLabel('Flight date')).toHaveValue('2026-11-02');
  await chooseTripStart(page, 'manual');
  await expect(page.getByLabel('Departure date')).toHaveValue('');
  await expect(page.getByLabel('Return date')).toHaveValue('');
  await chooseTripStart(page, 'flight');
  await expect(page.getByLabel('Flight number')).toHaveValue('UA 837');
  await expect(page.getByLabel('Flight date')).toHaveValue('2026-11-02');
  await expect(page.getByText('Add a FlightAware AeroAPI key in Settings. Type the times yourself.')).toBeVisible();
  expect(writes).toEqual([]);
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toEqual([]);
  const home = await (await request.get('/travel/api/home')).json();
  expect([...home.upcoming, ...home.in_progress, ...home.past]).toEqual([]);
});

test('a failed trip save keeps the manual draft across a mode change', async ({ page, request }) => {
  await page.route('**/travel/api/trips', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({ status: 502, json: { message: 'Synthetic save failure' } });
  });
  await page.goto('/travel/trips/new');
  await chooseTripStart(page, 'manual');
  await page.getByLabel('Departure date').fill('2026-12-01');
  await page.getByLabel('Return date').fill('2026-12-03');
  await page.getByLabel('Destination city').fill('Kyoto');
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(page.locator('main [role="alert"]')).toContainText('Synthetic save failure');
  await chooseTripStart(page, 'flight');
  await expect(page.locator('input[name="start"]')).toHaveCount(0);
  await chooseTripStart(page, 'manual');
  await expect(page.getByLabel('Departure date')).toHaveValue('2026-12-01');
  await expect(page.getByLabel('Return date')).toHaveValue('2026-12-03');
  await expect(page.getByLabel('Destination city')).toHaveValue('Kyoto');
  await expect(page.locator('main [role="alert"]')).toContainText('Synthetic save failure');
  const home = await (await request.get('/travel/api/home')).json();
  expect([...home.upcoming, ...home.in_progress, ...home.past]).toEqual([]);
});

test('FlightAware settings keeps a key draft and the flight when the mode stays put', async ({ page }) => {
  await page.route('**/travel/api/flights/lookup', (route) => route.fulfill({ json: { flights: [morning] } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/travel/trips/new');
  await chooseTripStart(page, 'flight');
  await page.getByLabel('Flight number').fill('UA 837');
  await page.getByLabel('Flight date').fill('2026-11-02');
  await expect(page.locator('.flight-preview')).toContainText('SFO → NRT');
  await page.getByRole('button', { name: 'FlightAware settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'FlightAware settings' });
  await settings.getByLabel('New FlightAware API key').fill('synthetic-key-fixup-09');
  await settings.getByRole('button', { name: 'Back to flight', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Leave this key draft?' });
  await confirm.getByRole('button', { name: 'Keep editing' }).click();
  await expect(settings.getByLabel('New FlightAware API key')).toHaveValue('synthetic-key-fixup-09');
  await expect(choice(page, 'Flight/date')).toBeChecked();
  await settings.getByRole('button', { name: 'Back to flight', exact: true }).click();
  await confirm.getByRole('button', { name: 'Leave settings' }).click();
  await expect(settings).toHaveCount(0);
  await expect(page.getByLabel('Flight number')).toHaveValue('UA 837');
  await expect(page.locator('.flight-preview')).toContainText('SFO → NRT');
  await chooseTripStart(page, 'manual');
  await expect(page.locator('input[name="flightIdent"]')).toHaveCount(0);
  await chooseTripStart(page, 'flight');
  await expect(page.getByLabel('Flight number')).toHaveValue('UA 837');
  await expect(page.locator('.flight-preview')).toContainText('SFO → NRT');
});

test('320px and 200 percent text keep the three choices usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/travel/trips/new');
  await expectArrival(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const name of choices) {
    const radio = choice(page, name);
    await radio.scrollIntoViewIfNeeded();
    await expect(radio).toBeVisible();
    const box = await radio.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  }
});
