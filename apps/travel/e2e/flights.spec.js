import { expect, test } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Add transport', exact: true }).click();
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
  await page.getByRole('button', { name: 'Add transport', exact: true }).click();
  await page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('flight');
  await page.getByLabel('Flight number').fill('NH 1');
  await expect(page.getByRole('heading', { name: 'Flight schedule', exact: true })).toBeVisible();
  await expect(page.getByText('Arrives on an earlier local date')).toBeVisible();
  await expect(page.getByLabel('Departure local date and time')).toHaveValue('2026-11-03T00:00');
  await expect(page.getByLabel('Arrival local date and time')).toHaveValue('2026-11-02T10:00');
});

test('a missing key, a timeout, and no match stay distinct and editable', async ({ page, request }) => {
  let mode = 'missing';
  await page.route('**/travel/api/flights/lookup', async route => {
    if (mode === 'missing') {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
        code: 'provider_unconfigured', message: 'Add a FlightAware AeroAPI key in Settings. You can still type the flight yourself.',
      }) });
    }
    if (mode === 'timeout') {
      await new Promise(resolve => setTimeout(resolve, 7000));
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
  await page.getByRole('button', { name: 'Retry flight schedule' }).click();
  await expect(problem).toContainText('FlightAware took too long', { timeout: 8000 });
  mode = 'none';
  await page.getByRole('button', { name: 'Retry flight schedule' }).click();
  await expect(problem).toContainText('No matching flight on that date');
  await page.getByLabel('Departure local date and time').fill('2026-11-02T09:15');
  await expect(page.getByRole('button', { name: 'Save transport', exact: true })).toBeEnabled();
});
