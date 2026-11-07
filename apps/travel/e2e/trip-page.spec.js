import { expect, test } from '@playwright/test';
import { formatDateRange, tripHeader } from './dates.mjs';

// Only the T5 acceptance that is built on this branch: the Add menu, the
// phone row menus and the typed delete are blocked on K1 (ui-menu) and
// K2 (confirmAction), which are not on main yet.

async function createTrip(request, title, start, end) {
  const created = await request.post('/travel/api/trips', {
    data: { title, start_date: start, end_date: end },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json();
}

async function addStay(request, tripId, city, arrive, leave) {
  const added = await request.post(`/travel/api/trips/${tripId}/stays`, {
    data: { city, arrive_on: arrive, leave_on: leave },
  });
  expect(added.ok(), await added.text()).toBeTruthy();
}

async function expectCleanLayout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

for (const [width, theme] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']]) {
  test.describe(`trip page at ${width}px ${theme}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 800 } });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('suite-theme', value);
      }, theme);
    });

    test(`[${width} ${theme}] header shows formatted range and hides duplicate subtitle`, async ({ page, request }) => {
      const trip = await createTrip(request, 'Lisbon', '2026-12-12', '2026-12-14');
      await addStay(request, trip.id, 'Lisbon', '2026-12-12', '2026-12-14');
      await page.goto('/travel/trips/' + trip.id);
      const header = tripHeader(page, 'Lisbon');
      await expect(header).toContainText(formatDateRange('2026-12-12', '2026-12-14'));
      await expect(header).toContainText('· 2 nights ·');
      await expect(header.locator('p.muted')).toHaveCount(0);
      await expectCleanLayout(page);
    });

    test(`[${width} ${theme}] header shows subtitle when the title differs from the city`, async ({ page, request }) => {
      const trip = await createTrip(request, 'Lisbon week', '2026-12-12', '2026-12-14');
      await addStay(request, trip.id, 'Lisbon', '2026-12-12', '2026-12-14');
      await page.goto('/travel/trips/' + trip.id);
      const header = tripHeader(page, 'Lisbon week');
      await expect(header.locator('p.muted')).toHaveText('Lisbon');
      await expectCleanLayout(page);
    });

    test(`[${width} ${theme}] transport and parking money formatted, no raw money or ISO dates on the page`, async ({ page, request }) => {
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
      await page.goto('/travel/trips/' + trip.id);
      const main = page.locator('main');
      const text = (await main.textContent()).replaceAll('⁠', '');
      expect(text).not.toMatch(/\b\d{4}-\d{2}-\d{2}/);
      expect(text).not.toMatch(/\b\d+\.\d{2} [A-Z]{3}\b/);
      expect(text).not.toContain(' · · ');
      expect(text).toContain('9:00 AM → 11:40 AM');
      expect(text).toContain('$1,240.00');
      expect(text).toContain('Booked · 1 Airport Way · $25.50');
      await expectCleanLayout(page);
    });

    test(`[${width} ${theme}] delete trip is not solid danger at rest`, async ({ page, request }) => {
      const trip = await createTrip(request, 'Delete styling trip', '2026-12-12', '2026-12-14');
      await page.goto('/travel/trips/' + trip.id);
      const button = page.getByRole('button', { name: 'Delete trip', exact: true });
      await expect(button).toBeVisible();
      const background = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(background).toBe('rgba(0, 0, 0, 0)');
      await expectCleanLayout(page);
    });
  });
}
