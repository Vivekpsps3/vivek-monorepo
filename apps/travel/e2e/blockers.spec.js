import { expect, test } from '@playwright/test';

async function trip(request, extra = {}) {
  const response = await request.post('/travel/api/trips', { data: {
    title: 'Kyoto', start_date: '2026-10-24', end_date: '2026-10-30',
    stays: [{ city: 'Kyoto', arrive_on: '2026-10-24', leave_on: '2026-10-30' }], ...extra,
  } });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.beforeEach(async ({ page, request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
});

test('phone navigation stays visible, fits the viewport and offers every Travel section', async ({ page }) => {
  await page.goto('/travel');
  const nav = page.getByRole('navigation', { name: 'Travel', exact: true });
  await expect(nav).toBeVisible();
  for (const link of await nav.getByRole('link').all()) {
    const box = await link.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
  }
  await nav.getByRole('link', { name: 'PTO', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Time off', exact: true })).toBeVisible();
});

test('quick transport starts with a visible mode choice and hides flight fields until chosen', async ({ page, request }) => {
  const created = await trip(request);
  await page.goto('/travel/trips/' + created.id);
  await expect(page.locator('travel-transport-editor')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add transport', exact: true }).click();
  const mode = page.getByRole('combobox', { name: 'Mode', exact: true });
  await expect(mode).toHaveValue('');
  await expect(page.getByLabel('Flight number')).toHaveCount(0);
  await mode.selectOption('drive');
  await expect(page.getByLabel('Flight number')).toHaveCount(0);
  await mode.selectOption('flight');
  await expect(page.getByLabel('Flight number')).toBeVisible();
});

test('retrying parking preserves the Booked value that was chosen', async ({ page, request }) => {
  const created = await trip(request);
  await request.post('/travel/api/trips/' + created.id + '/parking', { data: { place_name: 'Garage', booked: false, necessary: 'yes' } });
  await page.goto('/travel/trips/' + created.id);
  await page.getByRole('button', { name: 'Edit parking' }).click();
  const bodies = [];
  await page.route('**/travel/api/parking/**', route => {
    bodies.push(route.request().postDataJSON());
    return bodies.length === 1 ? route.fulfill({ status: 502, json: { message: 'Parking save unavailable' } }) : route.continue();
  });
  await page.getByRole('checkbox', { name: 'Booked', exact: true }).check();
  await page.getByRole('button', { name: 'Save parking' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('Parking save unavailable');
  await expect(page.getByRole('checkbox', { name: 'Booked', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Save parking' }).click();
  await expect(dialog).toBeHidden();
  expect(bodies.map(body => body.booked)).toEqual([true, true]);
  await expect(page.getByRole('heading', { name: 'Garage' }).locator('..')).toContainText('Booked');
});

test('native date controls support keyboard entry and preserve range through resize', async ({ page }) => {
  await page.goto('/travel/trips/new');
  const departure = page.getByLabel('Departure date');
  const returning = page.getByLabel('Return date');
  await departure.fill('2026-11-10');
  await returning.fill('2026-11-12');
  await departure.focus();
  for(let step=0;step<8 && !await returning.evaluate(node=>node===document.activeElement);step++)await page.keyboard.press('Tab');
  await expect(returning).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(departure).toHaveValue('2026-11-10');
  await expect(returning).toHaveValue('2026-11-12');
  await expect(page.locator('main [role=status]')).toContainText('Nov');
});

test('changing PTO cadence keeps a typed balance and native dates ignore unrelated pointer events', async ({ page, request }) => {
  await request.put('/travel/api/pto/policy', { data: {
    accrual_amount: '1', accrual_unit: 'day', accrual_cadence: 'yearly',
    hours_per_day: '8', balance_days: '10', balance_as_of: '2026-01-01',
  } });
  await page.goto('/travel/pto');
  await page.getByText('PTO policy and starting balance', { exact: true }).click();
  const balance = page.getByLabel('Known balance (days)');
  await balance.fill('12.5');
  await page.getByLabel('Accrual cadence').selectOption('monthly');
  await expect(balance).toHaveValue('12.5');
  await page.getByLabel('Start date', { exact: true }).fill('2026-12-01');
  await page.mouse.click(2, 400);
  await expect(page.getByLabel('Start date', { exact: true })).toHaveValue('2026-12-01');
  await page.getByRole('button', { name: 'Save PTO policy' }).click();
  await expect(page.locator('main [role=status]')).toContainText('PTO saved');
  // The independent unsaved leave dates now require deliberate reload approval.
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await page.getByText('PTO policy and starting balance', { exact: true }).click();
  await expect(balance).toHaveValue('12.5');
  await expect(page.getByLabel('Accrual cadence')).toHaveValue('monthly');
});

test('delete cancellation preserves a trip, failure is local, and success closes the dialog', async ({ page, request }) => {
  const created = await trip(request);
  await page.goto('/travel/trips/' + created.id);
  await page.getByRole('button', { name: 'Delete trip', exact: true }).click();
  await page.getByRole('button', { name: 'Keep trip', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await request.get('/travel/api/trips/' + created.id)).ok()).toBeTruthy();
  await page.route('**/travel/api/trips/' + created.id, route => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 502, json: { message: 'Delete unavailable' } }) : route.continue());
  await page.getByRole('button', { name: 'Delete trip', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete trip', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('main [role=alert]')).toContainText('Delete unavailable');
  await page.unroute('**/travel/api/trips/' + created.id);
  await page.getByRole('button', { name: 'Delete trip', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete trip', exact: true }).click();
  await expect(page).toHaveURL(/\/travel$/);
  await expect(page.getByRole('heading', { name: 'Trips', exact: true })).toBeFocused();
});

test('successful trip retry clears its error and never creates a second trip', async ({ page, request }) => {
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill('2026-11-01');
  await page.getByLabel('Return date').fill('2026-11-02');
  await page.getByLabel('Destination city').fill('Kyoto');
  let failures = 0;
  await page.route('**/travel/api/trips', route => ++failures === 1
    ? route.fulfill({ status: 502, json: { message: 'Trip save unavailable' } }) : route.continue());
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText('Trip save unavailable');
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(page).toHaveURL(/\/travel\/trips\/\d+$/);
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
  const home = await (await request.get('/travel/api/home')).json();
  expect([...home.upcoming, ...home.in_progress, ...home.past].filter(item => item.title === 'Kyoto')).toHaveLength(1);
});

test('an unnamed retained city blocks saving through resize and does not lose a renamed title', async ({ page }) => {
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill('2026-11-01');
  await page.getByLabel('Return date').fill('2026-11-03');
  await page.getByLabel('Destination city').fill('Kyoto');
  await page.getByText('Rename trip', { exact: true }).click();
  await page.getByLabel('Trip name').fill('Autumn');
  await page.getByText('Add destination', { exact: true }).first().click();
  await page.getByLabel('Change city on date').fill('2026-11-02');
  await page.getByRole('button', { name: 'Add destination', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save trip', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 768, height: 900 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Next destination city')).toHaveValue('');
  await expect(page.getByLabel('Trip name')).toHaveValue('Autumn');
  await page.getByLabel('Next destination city').fill('Osaka');
  await expect(page.getByRole('button', { name: 'Save trip', exact: true })).toBeEnabled();
});

test('keyboard destination changes and shortened dates require deliberate handling', async ({ page }) => {
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill('2026-11-01');
  await page.getByLabel('Return date').fill('2026-11-05');
  await page.getByLabel('Destination city').fill('Kyoto');
  await page.getByText('Add destination', { exact: true }).first().click();
  await page.getByLabel('Change city on date').fill('2026-11-04');
  await expect(page.getByRole('button', { name: 'Add destination', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add destination', exact: true }).focus();
  await expect(page.getByRole('button', { name: 'Add destination', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByLabel('Next destination city').fill('Osaka');
  await page.getByLabel('Return date').fill('2026-11-02');
  await expect(page.getByRole('dialog')).toContainText('Osaka');
  await page.getByRole('button', { name: 'Keep dates', exact: true }).click();
  await expect(page.getByLabel('Return date')).toHaveValue('2026-11-05');
  await expect(page.getByLabel('Next destination city')).toHaveValue('Osaka');
});

test('legacy aggregate PTO stays recorded until a confirmed dated allocation and protects unsaved choices', async ({ page, request }) => {
  const created = await trip(request, { pto_days: '1.5' });
  expect(created.pto_mode).toBe('legacy');
  await page.goto('/travel/trips/' + created.id);
  await page.getByText('PTO · 1.5 days', { exact: true }).click();
  await expect(page.locator('.pto-dates select')).toHaveCount(7);
  await page.locator('label').filter({ hasText: '2026-10-26' }).getByRole('combobox').selectOption({ label: 'PTO' });
  await page.getByRole('navigation', { name: 'Travel', exact: true }).getByRole('link', { name: 'PTO', exact: true }).click();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.locator('.pto-dates select').nth(2).locator('option:checked')).toHaveText('PTO');
  expect((await (await request.get('/travel/api/trips/' + created.id)).json()).pto_days_effective).toBe('1.5');
  await page.getByRole('button', { name: 'Save PTO dates' }).click();
  await page.getByRole('button', { name: 'Keep legacy total' }).click();
  expect((await (await request.get('/travel/api/trips/' + created.id)).json()).pto_mode).toBe('legacy');
  await page.getByRole('button', { name: 'Save PTO dates' }).click();
  await page.getByRole('button', { name: 'Save dated PTO' }).click();
  await expect(page.locator('main [role=status]')).toContainText('Saved');
  const saved = await (await request.get('/travel/api/trips/' + created.id)).json();
  expect(saved.pto_mode).toBe('dates');
  expect(saved.pto_days_effective).toBe('1');
});
