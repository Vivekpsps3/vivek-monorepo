import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';

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

const views = [
  { name: 'phone', viewport: { width: 390, height: 844 }, theme: 'dark', hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, theme: 'light', hasTouch: false },
];

function tripIds(home) {
  return [...home.in_progress, ...home.upcoming, ...home.past].map((trip) => trip.id);
}

async function press(page, locator, touch) {
  if (touch) await locator.tap();
  else {
    await locator.focus();
    await page.keyboard.press('Enter');
  }
}

async function expectTarget(locator) {
  const box = await locator.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
}

async function discardEditor(page) {
  await page.keyboard.press('Escape');
  const confirm = page.getByRole('dialog', { name: 'Discard this draft?' });
  await confirm.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

for (const view of views) {
  test.describe(`terminal hall ${view.name}`, () => {
    test.use({ viewport: view.viewport, hasTouch: view.hasTouch, reducedMotion: 'reduce' });

    test(`books an incomplete flight, then opens the saved departure, return, and day (${view.name})`, async ({ page, request }) => {
      test.setTimeout(90_000);
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: view.theme === 'dark' ? 'dark' : 'light' });
      await page.route('**/travel/api/flights/lookup', async (route) => {
        const ident = String(route.request().postDataJSON()?.ident || '').replace(/\s+/g, '').toUpperCase();
        if (ident === 'UA837') {
          await route.fulfill({
            json: { flights: [morning], fetched_at: '2026-11-19T15:00:00+00:00' },
          });
          return;
        }
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      });

      await page.goto('/travel/terminal');
      await expect(page.getByRole('heading', { level: 1, name: 'Terminal', exact: true })).toBeVisible();
      await expect(page.getByText('No saved departures', { exact: false })).toBeVisible();
      await expect(page.getByLabel('Flight number')).toBeFocused();
      await chooseColorTheme(page, view.theme);
      await expect(page.getByLabel('Flight number')).toBeFocused();
      await expect(page.getByRole('button', { name: 'Edit times manually', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Departure board', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Itinerary table', exact: true })).toBeVisible();

      const board = page.getByRole('button', { name: 'Departure board', exact: true });
      const desk = page.getByRole('button', { name: 'Booking desk', exact: true });
      const table = page.getByRole('button', { name: 'Itinerary table', exact: true });
      await expectTarget(board);
      await expectTarget(page.getByLabel('Flight number'));
      await expectTarget(page.getByRole('button', { name: 'Edit times manually', exact: true }));
      expect(await page.locator('.terminal-hall').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect.poll(() => page.locator('body').evaluate((node) => getComputedStyle(node).color)).toBe(
        view.theme === 'dark' ? 'rgb(255, 240, 212)' : 'rgb(24, 46, 64)',
      );

      await page.getByLabel('Flight number').fill('UA 837');
      await page.getByLabel('Flight date').fill('2026-11-02');
      await expect(page.locator('.flight-preview')).toContainText('SFO → NRT');
      await press(page, page.getByRole('button', { name: 'Add to an existing trip', exact: true }), view.hasTouch);
      await expect(page.getByText('No saved trips yet. Plan this as a new trip.', { exact: true })).toBeVisible();
      await press(page, page.getByRole('button', { name: 'Edit times manually', exact: true }), view.hasTouch);
      await page.getByLabel('Your departure local date and time').fill('2026-11-02T09:15');
      await press(page, page.getByRole('button', { name: 'Plan as a new trip', exact: true }), view.hasTouch);
      await expect(page).toHaveURL(/\/travel\/trips\/new$/);
      await expect(page.getByText('This flight is on the new trip.')).toBeVisible();
      await expect(page.getByLabel('Departure date')).toHaveValue('2026-11-02');
      await expect(page.getByLabel('Return date')).toHaveValue('');

      const posted = page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/travel/api/trip-drafts'));
      await press(page, page.getByRole('button', { name: 'Save draft', exact: true }), view.hasTouch);
      const body = (await posted).postDataJSON();
      expect(body.start_date).toBe('2026-11-02');
      expect(body.end_date).toBeNull();
      expect(body.counts_as_pto).toBeUndefined();
      expect(body.pto_dates).toBeUndefined();
      expect(body.legs).toHaveLength(1);
      expect(body.legs[0].number).toBe('UA837');
      expect(String(body.legs[0].depart_at)).toContain('2026-11-02T09:15');
      await expect(page.getByText('The return date is still unknown, and this draft has no PTO charge.')).toBeVisible();
      const drafts = await (await request.get('/travel/api/trip-drafts')).json();
      expect(drafts.drafts).toHaveLength(1);
      expect(drafts.drafts[0].end_date).toBeNull();
      const ptoAfterDraft = await (await request.get('/travel/api/pto')).json();
      expect(ptoAfterDraft.entries).toEqual([]);
      let home = await (await request.get('/travel/api/home')).json();
      expect(tripIds(home)).toEqual([]);

      await page.goto('/travel/terminal');
      await expect(page.getByText('No saved departures', { exact: false })).toBeVisible();
      await expect(page.getByText('No trip days yet', { exact: false })).toBeVisible();

      const created = await request.post('/travel/api/trips', {
        data: {
          title: 'Harbor week',
          start_date: '2026-12-12',
          end_date: '2026-12-14',
          counts_as_pto: false,
          stays: [{ city: 'Harbor', arrive_on: '2026-12-12', leave_on: '2026-12-14' }],
        },
      });
      expect(created.ok(), await created.text()).toBeTruthy();
      const trip = await created.json();
      expect((await request.post(`/travel/api/trips/${trip.id}/transports`, {
        data: {
          mode: 'flight',
          role: 'outbound',
          number: 'UA100',
          depart_place: 'SFO',
          arrive_place: 'HND',
          depart_at: '2026-12-12T09:00',
          arrive_at: '2026-12-12T11:40',
        },
      })).ok()).toBeTruthy();
      expect((await request.post(`/travel/api/trips/${trip.id}/transports`, {
        data: {
          mode: 'flight',
          role: 'inbound',
          number: 'UA200',
          depart_place: 'HND',
          arrive_place: 'SFO',
          depart_at: '2026-12-14T18:10',
          arrive_at: '2026-12-14T11:20',
        },
      })).ok()).toBeTruthy();
      const saved = await (await request.get('/travel/api/trips/' + trip.id)).json();
      const transportIds = saved.transports.map((row) => row.id);
      expect(transportIds).toHaveLength(2);
      const ptoBefore = await (await request.get('/travel/api/pto')).json();

      const writes = [];
      page.on('request', (req) => {
        const url = req.url();
        if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method()) && url.includes('/travel/api/') && !url.includes('/flights/lookup')) {
          writes.push(req.method() + ' ' + new URL(url).pathname);
        }
      });

      await page.goto('/travel/terminal');
      const departure = page.getByRole('button', { name: 'Open departure UA100, SFO to HND, 2026-12-12, Harbor week', exact: true });
      const returning = page.getByRole('button', { name: 'Open return UA200, HND to SFO, 2026-12-14, Harbor week', exact: true });
      const day = page.getByRole('button', { name: 'Open day 2026-12-13, Harbor week, Harbor', exact: true });
      await expect(departure).toBeVisible();
      await expect(returning).toBeVisible();
      await expect(day).toBeVisible();
      await expectTarget(departure);
      await expectTarget(day);
      await expectTarget(table);

      await press(page, departure, view.hasTouch);
      const outbound = page.getByRole('dialog', { name: 'Transport' });
      await expect(outbound.getByRole('heading', { name: 'Edit transport', exact: true })).toBeVisible();
      await expect(outbound.getByLabel('From', { exact: true })).toHaveValue('SFO');
      await expect(outbound.getByLabel('To', { exact: true })).toHaveValue('HND');
      await expect(outbound.getByLabel('Flight number', { exact: true })).toHaveValue('UA100');
      await expect(outbound.getByLabel('Departure local date and time')).toHaveValue('2026-12-12T09:00');
      await expect(outbound.getByLabel('Leg', { exact: true })).toHaveValue('outbound');
      await expect(page).toHaveURL(new RegExp(`/travel/trips/${trip.id}\\?.*transport=`));
      await discardEditor(page);
      const back = page.getByRole('link', { name: '← Terminal', exact: true });
      await expectTarget(back);
      await press(page, back, view.hasTouch);
      await expect(page).toHaveURL(new RegExp(`/travel/terminal\\?object=board&trip=${trip.id}&leg=\\d+&day=2026-12-12`));
      await expect(departure).toBeFocused();

      await press(page, returning, view.hasTouch);
      const inbound = page.getByRole('dialog', { name: 'Transport' });
      await expect(inbound.getByLabel('From', { exact: true })).toHaveValue('HND');
      await expect(inbound.getByLabel('To', { exact: true })).toHaveValue('SFO');
      await expect(inbound.getByLabel('Flight number', { exact: true })).toHaveValue('UA200');
      await expect(inbound.getByLabel('Departure local date and time')).toHaveValue('2026-12-14T18:10');
      await expect(inbound.getByLabel('Leg', { exact: true })).toHaveValue('inbound');
      await discardEditor(page);
      await press(page, page.getByRole('link', { name: '← Terminal', exact: true }), view.hasTouch);
      await expect(page).toHaveURL(new RegExp(`/travel/terminal\\?object=board&trip=${trip.id}&leg=\\d+&day=2026-12-14`));
      await expect(returning).toBeFocused();

      await press(page, desk, view.hasTouch);
      await expect(page.locator('#terminal-desk input[name="flightIdent"]')).toBeFocused();
      await press(page, table, view.hasTouch);
      await expect(page.locator('#terminal-table')).toBeFocused();
      await press(page, day, view.hasTouch);
      await expect(page).toHaveURL(new RegExp(`/travel/trips/${trip.id}\\?day=2026-12-13`));
      await expect(page.getByRole('tab', { name: /December 13, 2026/ })).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#itinerary-day-2026-12-13')).toBeVisible();
      await press(page, page.getByRole('link', { name: '← Terminal', exact: true }), view.hasTouch);
      await expect(page).toHaveURL(new RegExp(`/travel/terminal\\?object=table&trip=${trip.id}&day=2026-12-13`));
      await expect(day).toBeFocused();
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/travel/terminal\\?object=table&trip=${trip.id}&day=2026-12-13`));
      await expect(day).toBeFocused();

      const after = await (await request.get('/travel/api/trips/' + trip.id)).json();
      expect(after.transports.map((row) => row.id)).toEqual(transportIds);
      expect(after.end_date).toBe('2026-12-14');
      expect(after.counts_as_pto).toBe(saved.counts_as_pto);
      home = await (await request.get('/travel/api/home')).json();
      expect(tripIds(home)).toEqual([trip.id]);
      const ptoAfter = await (await request.get('/travel/api/pto')).json();
      expect(ptoAfter.entries).toEqual(ptoBefore.entries);
      expect(writes).toEqual([]);

      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations.filter((item) => item.id === 'color-contrast' || ['serious', 'critical'].includes(item.impact))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`terminal-hall-${view.name}.png`), fullPage: true });
      const tripsBack = page.getByRole('link', { name: '← Trips', exact: true });
      await press(page, tripsBack, view.hasTouch);
      await expect(page).toHaveURL(/\/travel$/);
      await press(page, page.getByRole('link', { name: 'Terminal', exact: true }), view.hasTouch);
      await expect(page).toHaveURL(/\/travel\/terminal$/);
      await expect(tripsBack).toHaveAttribute('href', '/travel');
      await press(page, tripsBack, view.hasTouch);
      await expect(page).toHaveURL(/\/travel$/);
    });
  });
}

test('a failed flight lookup keeps the typed number on the desk', async ({ page, request }) => {
  await page.route('**/travel/api/flights/lookup', (route) => route.fulfill({
    status: 502,
    contentType: 'application/json',
    body: JSON.stringify({}),
  }));
  await page.goto('/travel/terminal');
  await page.getByLabel('Flight number').fill('UA 404');
  await page.getByLabel('Flight date').fill('2026-11-02');
  await expect(page.getByText('FlightAware could not look up that flight. You can still type it yourself.')).toBeVisible();
  await expect(page.getByLabel('Flight number')).toHaveValue('UA 404');
  await expect(page.getByLabel('Flight date')).toHaveValue('2026-11-02');
  await expect(page.getByRole('button', { name: 'Edit times manually', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/travel\/terminal$/);
  const home = await (await request.get('/travel/api/home')).json();
  expect(tripIds(home)).toEqual([]);
  const drafts = await (await request.get('/travel/api/trip-drafts')).json();
  expect(drafts.drafts).toEqual([]);
});

test('a late home response does not restore a flight draft after sign-out', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let held;
  const started = new Promise((resolve) => { held = resolve; });
  await page.route('**/travel/api/home', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    held();
    await gate;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        in_progress: [],
        upcoming: [{ id: 9, title: 'Secret harbor', transports: [], days: [] }],
        past: [],
      }),
    });
  });
  const loading = page.goto('/travel/terminal');
  await started;
  await page.getByLabel('Flight number').fill('UA 404');
  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  release();
  await loading;
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByLabel('Flight number')).toHaveCount(0);
  await expect(page.getByText('Secret harbor')).toHaveCount(0);
  await expect(page.getByText('UA 404')).toHaveCount(0);
});
