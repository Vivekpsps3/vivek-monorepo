import { expect, test } from '../../../tests/e2e/fixtures';

function iso(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

async function putBucket(request, bucket, extra = {}) {
  const today = new Date();
  today.setDate(today.getDate() - 40);
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const response = await request.put('/travel/api/pto/policies/' + bucket, {
    data: {
      start_balance_hours: '80',
      balance_as_of: `${today.getFullYear()}-${month}-${day}`,
      accrual_hours: '0',
      accrual_cadence: 'yearly',
      cap_hours: null,
      year_start: '01-01',
      carry_forward: true,
      ...extra,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

function phrase(days, hours) {
  return `${days} days · ${hours} h`;
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

test('home balances match the PTO page before and after an allocation change', async ({ page, request }) => {
  await putBucket(request, 'pto', { start_balance_hours: '80' });
  await putBucket(request, 'sick', { start_balance_hours: '40' });
  const created = await request.post('/travel/api/trips', {
    data: { title: 'Kyoto', start_date: iso(-6), end_date: iso(2) },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const trip = await created.json();
  expect((await request.post(`/travel/api/trips/${trip.id}/budget-lines`, {
    data: { label: 'Museum pass', amount: '80', category: 'activity', currency: 'EUR', paid: false },
  })).ok()).toBeTruthy();

  const beforeBoard = await (await request.get('/travel/api/pto')).json();
  const beforeHome = await (await request.get('/travel/api/home')).json();
  const ptoPhrase = phrase(beforeBoard.buckets.pto.balance_today_days, beforeBoard.buckets.pto.balance_today_hours);
  const sickPhrase = phrase(beforeBoard.buckets.sick.balance_today_days, beforeBoard.buckets.sick.balance_today_hours);

  await page.goto('/travel');
  const timeOff = page.locator('.time-off');
  await expect(timeOff).toContainText(ptoPhrase);
  await expect(timeOff).toContainText(sickPhrase);
  await expect(timeOff).toContainText(`Next trip Kyoto uses ${beforeHome.next_pto.days} days · ${beforeHome.next_pto.hours} h.`);
  await expect(timeOff).toContainText(`${beforeHome.next_pto.leftover_after} days · ${beforeHome.next_pto.leftover_after_hours} h after`);
  await expect(timeOff).not.toContainText('€');
  await expect(page.locator('a.trip-card', { hasText: 'Kyoto' })).toContainText('€');

  await page.goto('/travel/pto');
  const tiles = page.locator('.tile-balance');
  await expect(tiles.nth(0)).toHaveText(ptoPhrase);
  await expect(tiles.nth(1)).toHaveText(sickPhrase);

  const detail = await (await request.get(`/travel/api/trips/${trip.id}`)).json();
  const today = beforeHome.today;
  const charged = detail.pto_dates.find((row) => Number(row.amount) > 0 && row.on_date <= today);
  expect(charged).toBeTruthy();
  const patched = await request.patch(`/travel/api/trips/${trip.id}`, {
    data: { pto_dates: [{ on_date: charged.on_date, amount: '0' }] },
  });
  expect(patched.ok(), await patched.text()).toBeTruthy();
  const afterBoard = await (await request.get('/travel/api/pto')).json();
  const afterHome = await (await request.get('/travel/api/home')).json();
  const afterPto = phrase(afterBoard.buckets.pto.balance_today_days, afterBoard.buckets.pto.balance_today_hours);
  expect(afterPto).not.toBe(ptoPhrase);
  expect(phrase(afterBoard.buckets.sick.balance_today_days, afterBoard.buckets.sick.balance_today_hours)).toBe(sickPhrase);
  expect(afterHome.next_pto.days).not.toBe(beforeHome.next_pto.days);

  await page.goto('/travel');
  await expect(page.locator('.time-off')).toContainText(afterPto);
  await expect(page.locator('.time-off')).toContainText(sickPhrase);
  await expect(page.locator('.time-off')).toContainText(`uses ${afterHome.next_pto.days} days · ${afterHome.next_pto.hours} h.`);
  await page.goto('/travel/pto');
  await expect(page.locator('.tile-balance').nth(0)).toHaveText(afterPto);
  await expect(page.locator('.tile-balance').nth(1)).toHaveText(sickPhrase);
});

test('unconfigured, one bucket, and a failed summary keep trip cards usable', async ({ page, request }) => {
  const created = await request.post('/travel/api/trips', {
    data: { title: 'Osaka', start_date: iso(4), end_date: iso(6) },
  });
  expect(created.ok(), await created.text()).toBeTruthy();

  await page.goto('/travel');
  await expect(page.locator('.time-off')).toContainText('PTO and Sick are not set up.');
  await expect(page.locator('.time-off').getByRole('link', { name: 'Set up PTO', exact: true })).toHaveAttribute('href', '/travel/pto');
  await expect(page.locator('a.trip-card', { hasText: 'Osaka' })).toBeVisible();

  await putBucket(request, 'sick', { start_balance_hours: '24' });
  await page.reload();
  await expect(page.locator('.time-off')).toContainText('3 days · 24 h');
  await expect(page.locator('.time-off')).not.toContainText('PTO balance today');
  await expect(page.locator('.time-off').getByRole('link', { name: 'Set up PTO', exact: true })).toHaveAttribute('href', '/travel/pto');
  await page.locator('.time-off').getByRole('link', { name: 'Set up PTO', exact: true }).click();
  await expect(page).toHaveURL(/\/travel\/pto$/);
  await expect(page.getByRole('heading', { level: 1, name: 'PTO', exact: true })).toBeVisible();

  await page.route('**/travel/api/pto', (route) => (
    route.request().method() === 'GET' && route.request().url().endsWith('/travel/api/pto')
      ? route.fulfill({ status: 500, json: { message: 'Time off unavailable' } })
      : route.continue()
  ));
  await page.goto('/travel');
  await expect(page.locator('.time-off')).toContainText("Couldn't load time off.");
  const card = page.locator('a.trip-card', { hasText: 'Osaka' });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/travel\/trips\/\d+$/);
  await page.goto('/travel');
  await expect(page.locator('.time-off')).toContainText("Couldn't load time off.");
  await page.unroute('**/travel/api/pto');
  await page.getByRole('button', { name: 'Retry time off', exact: true }).click();
  await expect(page.locator('.time-off')).toContainText('3 days · 24 h');
  await expect(card).toBeVisible();
});
