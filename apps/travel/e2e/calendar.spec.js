import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

test.describe('local calendar month', () => {
  test.use({ timezoneId: 'Pacific/Honolulu' });

  test('the default month follows local time across the UTC boundary', async ({ page }) => {
    await page.addInitScript(() => {
      const fixed = Date.parse('2026-11-01T07:30:00Z');
      const NativeDate = Date;
      function PatchedDate(...args) {
        if (!new.target) return NativeDate();
        if (args.length === 0) return new NativeDate(fixed);
        return new NativeDate(...args);
      }
      PatchedDate.now = () => fixed;
      PatchedDate.parse = NativeDate.parse;
      PatchedDate.UTC = NativeDate.UTC;
      PatchedDate.prototype = NativeDate.prototype;
      window.Date = PatchedDate;
    });
    await page.goto('/travel/calendar');
    await expect(page.getByLabel('Month')).toHaveValue('2026-10');
    await expect(page).toHaveURL(/month=2026-10/);
  });
});

test('retry reloads the same month after the calendar request fails', async ({ page, request }) => {
  const created = await request.post('/travel/api/trips', { data: {
    title: 'October trip', start_date: '2026-10-10', end_date: '2026-10-12',
    stays: [{ city: 'Lisbon', arrive_on: '2026-10-10', leave_on: '2026-10-12' }],
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  let failed = false;
  let calls = 0;
  await page.route('**/travel/api/calendar**', route => {
    calls += 1;
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Calendar offline', code: 'unavailable' }) });
    }
    return route.continue();
  });
  await page.goto('/travel/calendar?month=2026-10');
  await expect(page.getByRole('alert').filter({ hasText: 'Calendar offline' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry calendar' }).click();
  await expect(page.getByRole('heading', { name: 'October trip', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/month=2026-10/);
  expect(calls).toBe(2);
});
