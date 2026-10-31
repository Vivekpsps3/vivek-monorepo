import { expect, test } from '@playwright/test';
import { formatDateRange, formatDay, ptoChoice, tripHeader } from './dates.mjs';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

test('overlapping PTO is named on the trip and the home card', async ({ page, request }) => {
  const first = await createTrip(request, 'North trip', '2026-12-07', '2026-12-09');
  await createTrip(request, 'South trip', '2026-12-07', '2026-12-09');
  const detail = await request.get('/travel/api/trips/' + first.id);
  expect(detail.ok()).toBeTruthy();
  const conflict = (await detail.json()).pto.conflicts.find(item => item.on_date === '2026-12-07');
  expect(conflict.amount).toBe('2');
  await page.goto('/travel/trips/' + first.id);
  await expect(page.getByText(`${formatDay(conflict.on_date)} counts ${conflict.amount} PTO days across ${conflict.labels.join(', ')}.`)).toBeVisible();
  await page.goto('/travel');
  await expect(page.getByRole('heading', { level: 3, name: 'North trip' }).locator('xpath=..')).toContainText('PTO overlaps');
  await expect(page.getByRole('heading', { level: 3, name: 'South trip' }).locator('xpath=..')).toContainText('PTO overlaps');
});

test('a same-day trip says same day', async ({ page }) => {
  await plan(page, '2026-12-14', '2026-12-14', 'Lisbon');
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  const sameDay = header(page, 'Lisbon');
  await expect(sameDay).toContainText('· same day ·');
  await expect(sameDay).toContainText(formatDateRange('2026-12-14', '2026-12-14'));
});

test('a one-night trip says 1 night', async ({ page }) => {
  await plan(page, '2026-12-16', '2026-12-17', 'Porto');
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(header(page, 'Porto')).toContainText('· 1 night ·');
});

test('home lists an open reminder and unbooked necessary parking', async ({ page, request }) => {
  const created = await createTrip(request, 'Lisbon week', '2026-12-16', '2026-12-18');
  expect((await request.post('/travel/api/trips/' + created.id + '/parking', {
    data: { place_name: 'Airport lot', necessary: 'yes', booked: false },
  })).ok()).toBeTruthy();
  expect((await request.post('/travel/api/trips/' + created.id + '/reminders', {
    data: { title: 'Renew passport' },
  })).ok()).toBeTruthy();
  await page.goto('/travel');
  const attention = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Needs a look', exact: true }) });
  await expect(attention).toContainText('Airport lot is marked necessary and is not booked.');
  await expect(attention).toContainText('Renew passport');
  await attention.getByRole('link', { name: 'Lisbon week' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lisbon week' })).toBeVisible();
});

test('a two-city trip saves both cities under one name', async ({ page }) => {
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill('2026-12-01');
  await page.getByLabel('Return date').fill('2026-12-05');
  await page.getByLabel('Destination city').fill('Kyoto');
  await page.locator('details').filter({ hasText: 'Choose the first day at your next destination.' }).locator('summary').click();
  await page.getByLabel('Change city on date').fill('2026-12-03');
  await page.getByRole('button', { name: 'Add destination', exact: true }).click();
  await page.getByLabel('Next destination city').fill('Osaka');
  await expect(page.getByText('Trip: Kyoto and Osaka', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Kyoto and Osaka' })).toBeVisible();
  await expect(page.getByText('Kyoto → Osaka')).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Kyoto' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Osaka' })).toBeVisible();
});

test('a return before departure stays on the draft', async ({ page }) => {
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill('2026-12-20');
  await page.getByLabel('Return date').fill('2026-12-10');
  await expect(page.locator('main .local-error')).toHaveText('Return date must be on or after departure.');
  await expect(page.getByRole('button', { name: 'Save trip', exact: true })).toBeDisabled();
  await expect(page.getByText('Now pick the day you come back.', { exact: true })).toBeVisible();
  await page.getByLabel('Return date').fill('2026-12-22');
  await expect(page.locator('main .local-error')).toHaveCount(0);
  await page.getByLabel('Destination city').fill('Oslo');
  await expect(page.getByRole('button', { name: 'Save trip', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(header(page, 'Oslo')).toContainText(formatDateRange('2026-12-20', '2026-12-22'));
});

test('a leap-day trip keeps February 29 and weekday PTO across March', async ({ page }) => {
  await plan(page, '2028-02-29', '2028-03-01', 'Reykjavik');
  await page.getByText('Time off', { exact: true }).click();
  await expectChoice(page, '2028-02-29', 'PTO');
  await expectChoice(page, '2028-03-01', 'PTO');
  await expect(page.getByText('2 PTO days selected.')).toBeVisible();
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  const saved = header(page, 'Reykjavik');
  await expect(saved).toContainText(formatDateRange('2028-02-29', '2028-03-01'));
  await expect(saved).toContainText('· 1 night ·');
  await expect(saved).toContainText('2 PTO days');
  await page.getByText('PTO · 2 days', { exact: true }).click();
  await expectChoice(page, '2028-02-29', 'PTO');
  await expectChoice(page, '2028-03-01', 'PTO');
});

test('a half-day PTO choice saves as 0.5', async ({ page }) => {
  await plan(page, '2026-12-15', '2026-12-15', 'Coimbra');
  await page.getByText('Time off', { exact: true }).click();
  await ptoChoice(page, '2026-12-15').selectOption({ label: 'Half day' });
  await expectChoice(page, '2026-12-15', 'Half day');
  await expect(page.getByText('0.5 PTO days selected.')).toBeVisible();
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(header(page, 'Coimbra')).toContainText('0.5 PTO days');
  await page.getByText('PTO · 0.5 days', { exact: true }).click();
  await expectChoice(page, '2026-12-15', 'Half day');
});

async function plan(page, start, end, city) {
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill(start);
  await page.getByLabel('Return date').fill(end);
  await page.getByLabel('Destination city').fill(city);
}

function header(page, title) {
  return tripHeader(page, title);
}

async function expectChoice(page, day, label) {
  await expect(ptoChoice(page, day).locator('option:checked')).toHaveText(label);
}

async function createTrip(request, title, start, end) {
  const response = await request.post('/travel/api/trips', { data: {
    title, start_date: start, end_date: end,
    stays: [{ city: title, arrive_on: start, leave_on: end }],
  } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
