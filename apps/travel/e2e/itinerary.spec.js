import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';

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
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/day=2026-12-13/);
  await expect(tripDay(page, '2026-12-13')).toBeFocused();
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
  await expect(page.getByRole('heading', { level: 2, name: 'Transport', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Parking', exact: true })).toBeVisible();
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
