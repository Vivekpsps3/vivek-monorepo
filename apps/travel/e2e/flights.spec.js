import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';
import { openTripAdd } from './dates.mjs';

const morning = {
  ident: 'UAL837', ident_iata: 'UA837', status: 'Scheduled',
  origin_iata: 'SFO', origin_timezone: 'America/Los_Angeles',
  destination_iata: 'NRT', destination_timezone: 'Asia/Tokyo',
  scheduled_out: '2026-11-02T18:00:00Z', scheduled_in: '2026-11-03T22:30:00Z',
};
const evening = {
  ...morning, ident: 'UAL837E', ident_iata: 'UA837',
  origin_iata: 'LAX', destination_iata: 'HND',
  scheduled_out: '2026-11-02T23:00:00Z', scheduled_in: '2026-11-03T16:00:00Z',
};

async function openFlight(page, request) {
  const created = await request.post('/travel/api/trips', { data: {
    title: 'Flight trip', start_date: '2026-11-02', end_date: '2026-11-04',
    stays: [{ city: 'Tokyo', arrive_on: '2026-11-02', leave_on: '2026-11-04' }],
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const trip = await created.json();
  await page.goto('/travel/trips/' + trip.id);
  await openTripAdd(page, 'Transport');
  await page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('flight');
  return trip;
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

test('ambiguous flights stay unselected until a choice, and a typed time survives the next lookup', async ({ page, request }) => {
  await page.route('**/travel/api/flights/lookup', route => {
    const ident = route.request().postDataJSON().ident;
    const flights = ident === 'UA838' ? [{ ...morning, ident_iata: 'UA838', scheduled_out: '2026-11-02T19:00:00Z' }] : [morning, evening];
    return route.fulfill({ json: { flights } });
  });
  await openFlight(page, request);
  await page.getByLabel('Flight number').fill('UA 837');
  await expect(page.getByRole('status').filter({ hasText: 'Choose the matching flight.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /SFO → NRT/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /LAX → HND/ })).toBeVisible();
  await expect(page.getByLabel('Departure local date and time')).toHaveValue('');
  await page.getByRole('button', { name: /SFO → NRT/ }).click();
  await expect(page.getByRole('heading', { name: 'Flight schedule', exact: true })).toBeVisible();
  await page.getByLabel('Departure local date and time').fill('2026-11-02T09:15');
  await page.getByLabel('Flight number').fill('UA 838');
  await expect(page.getByText('Edited by you. New lookups preserve your times.')).toBeVisible();
  await expect(page.getByLabel('Departure local date and time')).toHaveValue('2026-11-02T09:15');
});

test('a date-line flight says the arrival is on an earlier local date', async ({ page, request }) => {
  const dateline = {
    ident: 'NH1', status: 'Scheduled',
    origin_iata: 'HND', origin_timezone: 'Asia/Tokyo',
    destination_iata: 'HNL', destination_timezone: 'Pacific/Honolulu',
    scheduled_out: '2026-11-02T15:00:00Z', scheduled_in: '2026-11-02T20:00:00Z',
  };
  await page.route('**/travel/api/flights/lookup', route => route.fulfill({ json: { flights: [dateline] } }));
  const created = await request.post('/travel/api/trips', { data: {
    title: 'Date line', start_date: '2026-11-03', end_date: '2026-11-04',
    stays: [{ city: 'Honolulu', arrive_on: '2026-11-03', leave_on: '2026-11-04' }],
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const trip = await created.json();
  await page.goto('/travel/trips/' + trip.id);
  await openTripAdd(page, 'Transport');
  await page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('flight');
  await page.getByLabel('Flight number').fill('NH 1');
  await expect(page.getByRole('heading', { name: 'Flight schedule', exact: true })).toBeVisible();
  await expect(page.getByText('Arrives on an earlier local date')).toBeVisible();
  await expect(page.getByLabel('Departure local date and time')).toHaveValue('2026-11-03T00:00');
  await expect(page.getByLabel('Arrival local date and time')).toHaveValue('2026-11-02T10:00');
});

test('a missing key, a timeout, and no match stay distinct and editable', async ({ page, request }) => {
  await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
  let mode = 'missing';
  let releaseTimeout;
  const timeoutGate = new Promise(resolve => { releaseTimeout = resolve; });
  let timeoutStarted;
  const pendingTimeout = new Promise(resolve => { timeoutStarted = resolve; });
  await page.route('**/travel/api/flights/lookup', async route => {
    if (mode === 'missing') {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
        code: 'provider_unconfigured', message: 'Add a FlightAware AeroAPI key in Settings. You can still type the flight yourself.',
      }) });
    }
    if (mode === 'timeout') {
      timeoutStarted();
      await timeoutGate;
      return route.abort().catch(() => {});
    }
    return route.fulfill({ json: { flights: [] } });
  });
  await openFlight(page, request);
  await page.getByLabel('Flight number').fill('UA 837');
  const problem = page.locator('.local-error');
  await expect(problem).toContainText('Add a FlightAware AeroAPI key in Settings');
  await expect(page.getByLabel('Departure local date and time')).toBeEnabled();
  mode = 'timeout';
  await page.clock.pauseAt(new Date('2026-11-01T12:01:00Z'));
  try {
    await page.getByRole('button', { name: 'Retry flight schedule' }).click();
    await pendingTimeout;
    await page.clock.runFor(5000);
    await expect(problem).toContainText('FlightAware took too long');
  } finally {
    releaseTimeout();
    await page.clock.resume();
  }
  mode = 'none';
  await page.getByRole('button', { name: 'Retry flight schedule' }).click();
  await expect(problem).toContainText('No matching flight on that date');
  await page.getByLabel('Departure local date and time').fill('2026-11-02T09:15');
  await expect(page.getByRole('button', { name: 'Save transport', exact: true })).toBeEnabled();
});

const settingsViews = [
  { name: 'phone', viewport: { width: 390, height: 844 }, theme: 'dark', hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, theme: 'light', hasTouch: false },
];

for (const view of settingsViews) {
  test.describe(view.name, () => {
    test.use({ viewport: view.viewport, hasTouch: view.hasTouch, reducedMotion: 'reduce' });

    test(`FlightAware settings returns to the editable trip at ${view.viewport.width}px in ${view.theme}`, async ({ page }) => {
      await page.route('**/travel/api/flights/lookup', route => route.fulfill({
        status: 503,
        json: { code: 'provider_unconfigured' },
      }));
      await page.goto('/travel/trips/new');
      await chooseColorTheme(page, view.theme);
      await page.getByLabel('Departure date', { exact: true }).fill('2026-11-02');
      await page.getByLabel('Return date').fill('2026-11-04');
      await page.getByLabel('Destination city').fill('Tokyo');
      await page.getByRole('button', { name: 'Add transport' }).click();
      const transport = page.getByRole('dialog', { name: 'Add transport' });
      await transport.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('flight');
      await transport.getByLabel('Flight number').fill('UA 837');
      await expect(transport.getByText(/Add a FlightAware AeroAPI key/)).toBeVisible();
      await transport.getByLabel('Departure local date and time').fill('2026-11-02T09:15');
      const settingsTrigger = transport.getByRole('button', { name: 'FlightAware settings' });
      if (view.hasTouch) await settingsTrigger.tap();
      else await settingsTrigger.press('Enter');
      const settings = page.getByRole('dialog', { name: 'FlightAware settings' });
      await expect(settings.getByRole('heading', { name: 'FlightAware settings' })).toBeFocused();
      const back = settings.getByRole('button', { name: 'Back to transport' });
      expect((await back.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations.filter(issue =>
        issue.id === 'color-contrast' || issue.impact === 'serious' || issue.impact === 'critical',
      )).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`flight-settings-${view.name}.png`) });
      await settings.getByLabel('New FlightAware API key').fill('synthetic-key-nav-04');
      await settings.getByRole('button', { name: 'Back to transport' }).click();
      const confirm = page.getByRole('dialog', { name: 'Leave this key draft?' });
      await confirm.getByRole('button', { name: 'Keep editing' }).click();
      await expect(settings.getByLabel('New FlightAware API key')).toHaveValue('synthetic-key-nav-04');
      await settings.getByRole('button', { name: 'Back to transport' }).click();
      await confirm.getByRole('button', { name: 'Leave settings' }).click();
      await expect(settings).toHaveCount(0);
      await expect(settingsTrigger).toBeFocused();
      await expect(transport.getByLabel('Flight number')).toHaveValue('UA 837');
      await expect(transport.getByLabel('Departure date')).toHaveValue('2026-11-02');
      await expect(transport.getByLabel('Departure local date and time')).toHaveValue('2026-11-02T09:15');
      await expect(page).toHaveURL(/\/travel\/trips\/new$/);
      const browserState = await page.evaluate(() => JSON.stringify([
        history.state, Object.entries(localStorage), Object.entries(sessionStorage),
      ]));
      for (const value of ['synthetic-key-nav-04', 'UA 837', 'Tokyo']) expect(browserState).not.toContain(value);
      await transport.getByRole('button', { name: 'Save transport', exact: true }).click();
      await expect(page.getByLabel('Destination city')).toHaveValue('Tokyo');
      await expect(page.getByText('flight · →')).toBeVisible();
    });
  });
}

test('opening FlightAware settings cancels a held lookup in an existing trip editor', async ({ page, request }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let held;
  const started = new Promise(resolve => { held = resolve; });
  await page.route('**/travel/api/flights/lookup', async route => {
    held();
    await gate;
    await route.fulfill({ json: { flights: [morning] } }).catch(() => {});
  });
  try {
    await openFlight(page, request);
    await page.getByLabel('Flight number').fill('UA 837');
    await started;
    await page.getByRole('button', { name: 'FlightAware settings' }).click();
    const settings = page.getByRole('dialog', { name: 'FlightAware settings' });
    await expect(settings).toBeVisible();
    release();
    await settings.getByRole('button', { name: 'Back to transport' }).click();
    await expect(page.getByLabel('Flight number')).toHaveValue('UA 837');
    await expect(page.getByRole('heading', { name: 'Flight schedule', exact: true })).toHaveCount(0);
    await expect(page.getByText('Finding the flight schedule…')).toHaveCount(0);
  } finally {
    release();
  }
});
