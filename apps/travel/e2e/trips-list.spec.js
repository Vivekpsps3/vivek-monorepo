import { expect, test } from '@playwright/test';
import { formatDateRange } from './dates.mjs';

// Dates are built from the browser-local calendar day (the same localToday
// rule the list uses), so "Day 2 of 4" and "In 43 days" hold in any zone.
function iso(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

async function createTrip(request, title, start, end) {
  const created = await request.post('/travel/api/trips', {
    data: { title, start_date: start, end_date: end },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json();
}

async function seed(request) {
  const away = await createTrip(request, 'Away now trip', iso(-1), iso(2));
  const upcoming = await createTrip(request, 'Future trip', iso(43), iso(45));
  expect((await request.post(`/travel/api/trips/${upcoming.id}/transports`, {
    data: {
      mode: 'flight',
      role: 'outbound',
      depart_place: 'Home',
      arrive_place: 'Far',
      cost: '1240',
      currency: 'USD',
      paid: false,
    },
  })).ok()).toBeTruthy();
  expect((await request.post(`/travel/api/trips/${upcoming.id}/budget-lines`, {
    data: { label: 'Museum pass', amount: '80', category: 'activity', currency: 'EUR', paid: false },
  })).ok()).toBeTruthy();
  for (let index = 0; index < 7; index += 1) {
    await createTrip(request, `Past trip ${index + 1}`, iso(-40 - index * 10), iso(-38 - index * 10));
  }
  return { away, upcoming };
}

function card(page, title) {
  return page.locator('a.trip-card').filter({
    has: page.getByRole('heading', { level: 3, name: title, exact: true }),
  });
}

async function expectCleanLayout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

for (const [width, theme] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']]) {
  test.describe(`trips list at ${width}px ${theme}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 800 } });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('suite-theme', value);
      }, theme);
    });

    test(`[${width} ${theme}] in progress card says Day 2 of 4 and Open today's plan`, async ({ page, request }) => {
      await seed(request);
      await page.goto('/travel');
      const awayCard = card(page, 'Away now trip');
      await expect(awayCard).toContainText('Day 2 of 4');
      await expect(awayCard).toContainText("Open today's plan");
      await expectCleanLayout(page);
    });

    test(`[${width} ${theme}] upcoming card shows In 43 days, formatted range, per-currency totals and Review the plan`, async ({ page, request }) => {
      await seed(request);
      await page.goto('/travel');
      const future = card(page, 'Future trip');
      await expect(future).toContainText('In 43 days');
      await expect(future).toContainText(formatDateRange(iso(43), iso(45)));
      await expect(future).toContainText('Review the plan');
      const text = (await future.textContent()).replaceAll('\u2060', '');
      expect(text).toContain('$1,240.00 · €80.00');
      await expectCleanLayout(page);
    });

    test(`[${width} ${theme}] groups are Away now, Upcoming and Past in order`, async ({ page, request }) => {
      await seed(request);
      await page.goto('/travel');
      const headings = await page.locator('main h2').allTextContents();
      const wanted = ['Away now', 'Upcoming', 'Past'];
      expect(headings.filter((text) => wanted.includes(text.trim())).map((text) => text.trim())).toEqual(wanted);
      await expectCleanLayout(page);
    });

    test(`[${width} ${theme}] past shows six and Show all 7 past trips expands and collapses`, async ({ page, request }) => {
      await seed(request);
      await page.goto('/travel');
      const past = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Past', exact: true }),
      });
      await expect(past.locator('a.trip-card')).toHaveCount(6);
      const toggle = past.getByRole('button', { name: 'Show all 7 past trips', exact: true });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(past.locator('a.trip-card')).toHaveCount(7);
      const fewer = past.getByRole('button', { name: 'Show fewer', exact: true });
      await expect(fewer).toHaveAttribute('aria-expanded', 'true');
      await fewer.click();
      await expect(past.locator('a.trip-card')).toHaveCount(6);
      await expect(past.getByRole('button')).toBeFocused();
      await expectCleanLayout(page);
    });

    test(`[${width} ${theme}] no raw ISO dates on the list`, async ({ page, request }) => {
      await seed(request);
      await page.goto('/travel');
      const text = await page.locator('main').textContent();
      expect(text).not.toMatch(/\b\d{4}-\d{2}-\d{2}/);
      await expectCleanLayout(page);
    });
  });
}

test('empty: no header New trip and primary Plan a trip', async ({ page }) => {
  await page.goto('/travel');
  await expect(page.getByRole('link', { name: 'New trip', exact: true })).toHaveCount(0);
  const cta = page.getByRole('link', { name: 'Plan a trip', exact: true });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveClass(/ui-btn--primary/);
  await cta.click();
  await expect(page).toHaveURL(/\/travel\/trips\/new$/);
});
