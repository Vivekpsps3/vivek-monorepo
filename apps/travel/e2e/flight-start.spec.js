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

const evening = {
  ...morning,
  ident: 'UAL837E',
  origin_iata: 'LAX',
  destination_iata: 'HND',
  scheduled_out: '2026-11-02T23:00:00Z',
  scheduled_in: '2026-11-03T16:00:00Z',
};

function savedWrites(page) {
  const writes = [];
  page.on('request', (request) => {
    const url = request.url();
    if (request.method() === 'POST' && (url.includes('/travel/api/trips') || url.includes('/travel/api/trip-drafts'))) {
      writes.push(url);
    }
  });
  return writes;
}

async function enterFlight(page, ident = 'UA 837', date = '2026-11-02') {
  await chooseTripStart(page, 'flight');
  await page.getByLabel('Flight number').fill(ident);
  await page.getByLabel('Flight date').fill(date);
  const card = page.locator('.flight-preview');
  await expect(card).toBeVisible();
  return card;
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

test('a flight and date proposes the route and saves only after review', async ({ page, request }) => {
  await page.route('**/travel/api/flights/lookup', (route) => route.fulfill({
    json: { flights: [morning], fetched_at: '2026-11-19T15:00:00+00:00' },
  }));
  const writes = savedWrites(page);
  await page.goto('/travel/trips/new');
  const card = await enterFlight(page);
  await expect(card).toContainText('SFO → NRT');
  await expect(card).toContainText('Scheduled departure: 2026-11-02 10:00 America/Los_Angeles');
  await expect(card).toContainText('Scheduled arrival: 2026-11-04 07:30 Asia/Tokyo');
  await expect(card).toContainText('Published timetable, not live status.');
  await expect(card).toContainText('Proposed. Not saved yet.');
  await expect(page.locator('input[name="start"]')).toHaveCount(0);
  await expect(page.locator('input[name="end"]')).toHaveCount(0);
  expect(writes).toEqual([]);

  await page.getByRole('button', { name: 'Plan as a new trip', exact: true }).click();
  await expect(page.getByText('This flight is on the new trip.')).toBeVisible();
  await expect(page.getByText('Proposed destination NRT.')).toBeVisible();
  await expect(page.getByLabel('Departure date')).toHaveValue('2026-11-02');
  await expect(page.getByLabel('Return date')).toHaveValue('');
  await expect(page.getByText('flight · SFO → NRT')).toBeVisible();
  expect(writes).toEqual([]);

  const posted = page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/travel/api/trip-drafts'));
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const body = (await posted).postDataJSON();
  expect(body.start_date).toBe('2026-11-02');
  expect(body.end_date).toBeNull();
  expect(body.destination_label).toBeNull();
  expect(body.counts_as_pto).toBeUndefined();
  expect(body.pto_dates).toBeUndefined();
  expect(body.legs).toHaveLength(1);
  expect(body.legs[0].number).toBe('UA837');
  expect(body.legs[0].depart_at).toContain('2026-11-02T10:00');
  expect(body.legs[0].arrive_at).toContain('2026-11-04T07:30');
  expect(body.legs[0].depart_place).toBe('SFO');
  expect(body.legs[0].arrive_place).toBe('NRT');
  expect(body.proposals).toEqual([
    { field: 'destination_city', value: 'NRT', source: 'inferred' },
  ]);
  await expect(page.getByText('The return date is still unknown, and this draft has no PTO charge.')).toBeVisible();
  await expect(page).toHaveURL(/\/travel\/trips\/new$/);

  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toHaveLength(1);
  expect(drafts.drafts[0].end_date).toBeNull();
  expect(drafts.drafts[0].lifecycle).toBe('draft');
  const home = await (await request.get('/travel/api/home')).json();
  const titles = [...home.upcoming, ...home.in_progress, ...home.past].map((trip) => trip.title);
  expect(titles).toEqual([]);
  const pto = await (await request.get('/travel/api/pto')).json();
  expect(pto.entries).toEqual([]);

  await page.getByRole('button', { name: 'Use proposed destination', exact: true }).click();
  await expect(page.getByText('NRT is the destination.')).toBeVisible();
  const patched = page.waitForRequest((req) => req.method() === 'PATCH' && req.url().includes('/travel/api/trip-drafts/'));
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const patch = (await patched).postDataJSON();
  expect(patch.destination_label).toBe('NRT');
  expect(patch.end_date).toBeNull();
  expect(patch.proposals).toEqual([]);
  expect(patch.counts_as_pto).toBeUndefined();
});

test('an edited local time is what gets saved, and the arrival day is not a return', async ({ page, request }) => {
  await page.route('**/travel/api/flights/lookup', (route) => route.fulfill({ json: { flights: [morning] } }));
  await page.goto('/travel/trips/new');
  await enterFlight(page);
  await page.getByRole('button', { name: 'Edit times manually', exact: true }).click();
  await expect(page.getByLabel('Your departure local date and time')).toHaveValue('2026-11-02T10:00');
  await page.getByLabel('Your departure local date and time').fill('2026-11-02T09:15');
  await page.getByRole('button', { name: 'Plan as a new trip', exact: true }).click();
  await expect(page.getByLabel('Return date')).toHaveValue('');
  const posted = page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/travel/api/trip-drafts'));
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const body = (await posted).postDataJSON();
  expect(body.end_date).toBeNull();
  expect(body.legs[0].depart_at).toContain('2026-11-02T09:15');
  expect(body.legs[0].fa_scheduled_out).toBe('2026-11-02T18:00:00Z');
  await expect(page.getByText('The return date is still unknown, and this draft has no PTO charge.')).toBeVisible();
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toHaveLength(1);
  expect(drafts.drafts[0].end_date).toBeNull();
});

test('ambiguous flights stay proposed until a choice, then the chosen route is the draft', async ({ page }) => {
  await page.route('**/travel/api/flights/lookup', (route) => route.fulfill({
    json: { flights: [morning, evening] },
  }));
  const writes = savedWrites(page);
  await page.goto('/travel/trips/new');
  await chooseTripStart(page, 'flight');
  await page.getByLabel('Flight number').fill('UA 837');
  await page.getByLabel('Flight date').fill('2026-11-02');
  await expect(page.getByRole('status').filter({ hasText: 'Choose the matching flight.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /SFO → NRT/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /LAX → HND/ })).toBeVisible();
  await expect(page.locator('.flight-preview')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Plan as a new trip', exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: /LAX → HND/ }).click();
  await expect(page.locator('.flight-preview')).toContainText('LAX → HND');
  await page.getByRole('button', { name: 'Plan as a new trip', exact: true }).click();
  await expect(page.getByText('flight · LAX → HND')).toBeVisible();
  await expect(page.getByText('Proposed destination HND.')).toBeVisible();
  expect(writes).toEqual([]);
});

test('an existing trip receives the accepted flight without a new return or PTO charge', async ({ page, request }) => {
  const created = await request.post('/travel/api/trips', { data: {
    title: 'Lisbon week',
    start_date: '2026-04-06',
    end_date: '2026-04-10',
    stays: [{ city: 'Lisbon', arrive_on: '2026-04-06', leave_on: '2026-04-10' }],
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const trip = await created.json();
  const before = await (await request.get('/travel/api/trips/' + trip.id)).json();
  const beforePto = await (await request.get('/travel/api/pto')).json();
  await page.route('**/travel/api/flights/lookup', (route) => route.fulfill({ json: { flights: [morning] } }));
  await page.goto('/travel/trips/new');
  await enterFlight(page);
  await page.getByRole('button', { name: 'Add to an existing trip', exact: true }).click();
  const choice = page.getByRole('button', { name: /Lisbon week/ });
  await expect(choice).toBeVisible();
  await choice.click();
  await page.getByRole('button', { name: 'Add flight to this trip', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/travel/trips/${trip.id}$`));
  const after = await (await request.get('/travel/api/trips/' + trip.id)).json();
  expect(after.end_date).toBe(before.end_date);
  expect(after.start_date).toBe(before.start_date);
  expect(after.counts_as_pto).toBe(before.counts_as_pto);
  expect(after.pto_dates).toEqual(before.pto_dates);
  expect(after.transports).toHaveLength(before.transports.length + 1);
  expect(after.transports.at(-1).depart_place).toBe('SFO');
  expect(after.transports.at(-1).arrive_place).toBe('NRT');
  const afterPto = await (await request.get('/travel/api/pto')).json();
  expect(afterPto.entries).toEqual(beforePto.entries);
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toEqual([]);
  const home = await (await request.get('/travel/api/home')).json();
  const titles = [...home.upcoming, ...home.in_progress, ...home.past].map((item) => item.title);
  expect(titles).toEqual(['Lisbon week']);
});

test('a failed draft save keeps the reviewed flight and a retry stores it once', async ({ page, request }) => {
  await page.route('**/travel/api/flights/lookup', (route) => route.fulfill({ json: { flights: [morning] } }));
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
  await page.goto('/travel/trips/new');
  await enterFlight(page);
  await page.getByRole('button', { name: 'Plan as a new trip', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('main .local-error')).toContainText('Travel is temporarily unavailable.');
  await expect(page.getByLabel('Departure date')).toHaveValue('2026-11-02');
  await expect(page.getByLabel('Return date')).toHaveValue('');
  await expect(page.getByText('flight · SFO → NRT')).toBeVisible();
  await expect(page.locator('input[name="flightIdent"]')).toHaveCount(0);
  await chooseTripStart(page, 'flight');
  await expect(page.getByLabel('Flight number')).toHaveValue('UA 837');
  await expect(page.getByLabel('Flight date')).toHaveValue('2026-11-02');
  await expect(page.locator('.flight-preview')).toContainText('SFO → NRT');
  await expect(page.locator('input[name="start"]')).toHaveCount(0);
  await chooseTripStart(page, 'manual');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('The return date is still unknown, and this draft has no PTO charge.')).toBeVisible();
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toHaveLength(1);
  expect(drafts.drafts[0].end_date).toBeNull();
  expect(posts).toBe(2);
  const pto = await (await request.get('/travel/api/pto')).json();
  expect(pto.entries).toEqual([]);
});

test('a late lookup does not replace the flight on screen', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let held;
  const started = new Promise((resolve) => { held = resolve; });
  let firstDone;
  const firstFinished = new Promise((resolve) => { firstDone = resolve; });
  await page.route('**/travel/api/flights/lookup', async (route) => {
    const ident = route.request().postDataJSON().ident;
    if (ident === 'UA837') {
      held();
      await gate;
      await route.fulfill({ json: { flights: [morning] } });
      firstDone();
      return;
    }
    await route.fulfill({ json: { flights: [{ ...evening, ident_iata: 'UA838' }] } });
  });
  await page.goto('/travel/trips/new');
  await chooseTripStart(page, 'flight');
  await page.getByLabel('Flight number').fill('UA 837');
  await page.getByLabel('Flight date').fill('2026-11-02');
  await started;
  await page.getByLabel('Flight number').fill('UA 838');
  const card = page.locator('.flight-preview');
  await expect(card).toContainText('LAX → HND');
  release();
  await firstFinished;
  await expect(card).toContainText('LAX → HND');
  await expect(card).not.toContainText('SFO');
});

test('opening FlightAware settings drops a held lookup and keeps the typed flight', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let held;
  const started = new Promise((resolve) => { held = resolve; });
  await page.route('**/travel/api/flights/lookup', async (route) => {
    held();
    await gate;
    await route.fulfill({ json: { flights: [morning] } }).catch(() => {});
  });
  try {
    await page.goto('/travel/trips/new');
    await chooseTripStart(page, 'flight');
    await page.getByLabel('Flight number').fill('UA 837');
    await page.getByLabel('Flight date').fill('2026-11-02');
    await started;
    await page.getByRole('button', { name: 'FlightAware settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'FlightAware settings' });
    await expect(settings).toBeVisible();
    release();
    await settings.getByRole('button', { name: 'Back to flight', exact: true }).click();
    await expect(page.getByLabel('Flight number')).toHaveValue('UA 837');
    await expect(page.getByLabel('Flight date')).toHaveValue('2026-11-02');
    await expect(page.getByRole('heading', { name: 'Proposed flight', exact: true })).toHaveCount(0);
    await expect(page.getByText('Finding the flight schedule…')).toHaveCount(0);
    const drafts = await (await page.request.get('/travel/api/trip-drafts')).json();
    expect(drafts.drafts).toEqual([]);
  } finally {
    release();
  }
});

const settingsViews = [
  { name: 'phone', viewport: { width: 390, height: 844 }, theme: 'dark', hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, theme: 'light', hasTouch: false },
];

for (const view of settingsViews) {
  test.describe(view.name, () => {
    test.use({ viewport: view.viewport, hasTouch: view.hasTouch, reducedMotion: 'reduce' });

    test(`flight review survives FlightAware settings at ${view.viewport.width}px in ${view.theme}`, async ({ page, request }) => {
      await page.route('**/travel/api/flights/lookup', (route) => route.fulfill({
        json: { flights: [morning], fetched_at: '2026-11-19T15:00:00+00:00' },
      }));
      await page.goto('/travel/trips/new');
      await chooseColorTheme(page, view.theme);
      const card = await enterFlight(page);
      await expect(card).toContainText('SFO → NRT');
      await expect(card).toContainText('2026-11-02 10:00 America/Los_Angeles');
      const settingsTrigger = page.getByRole('button', { name: 'FlightAware settings', exact: true });
      expect((await settingsTrigger.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      expect((await page.getByLabel('Flight number').boundingBox())?.height).toBeGreaterThanOrEqual(44);
      if (view.hasTouch) await settingsTrigger.tap();
      else {
        await settingsTrigger.focus();
        await page.keyboard.press('Enter');
      }
      const settings = page.getByRole('dialog', { name: 'FlightAware settings' });
      await expect(settings.getByRole('heading', { name: 'FlightAware settings' })).toBeFocused();
      await expect(settings).toHaveCSS('animation-name', 'none');
      const back = settings.getByRole('button', { name: 'Back to flight', exact: true });
      expect((await back.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations.filter((issue) =>
        issue.id === 'color-contrast' || issue.impact === 'serious' || issue.impact === 'critical',
      )).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`flight-start-settings-${view.name}.png`) });
      await settings.getByLabel('New FlightAware API key').fill('synthetic-key-tux-04');
      await back.click();
      const confirm = page.getByRole('dialog', { name: 'Leave this key draft?' });
      await confirm.getByRole('button', { name: 'Keep editing' }).click();
      await expect(settings.getByLabel('New FlightAware API key')).toHaveValue('synthetic-key-tux-04');
      await settings.getByRole('button', { name: 'Back to flight', exact: true }).click();
      await confirm.getByRole('button', { name: 'Leave settings' }).click();
      await expect(settings).toHaveCount(0);
      await expect(settingsTrigger).toBeFocused();
      await expect(page.getByLabel('Flight number')).toHaveValue('UA 837');
      await expect(page.getByLabel('Flight date')).toHaveValue('2026-11-02');
      await expect(card).toContainText('SFO → NRT');
      await expect(card).toContainText('2026-11-02 10:00 America/Los_Angeles');
      await expect(page.locator('input[name="start"]')).toHaveCount(0);
      await expect(page.locator('input[name="end"]')).toHaveCount(0);
      const drafts = await (await request.get('/travel/api/trip-drafts')).json();
      expect(drafts.drafts).toEqual([]);
      const home = await (await request.get('/travel/api/home')).json();
      expect([...home.upcoming, ...home.in_progress, ...home.past]).toEqual([]);
    });
  });
}
