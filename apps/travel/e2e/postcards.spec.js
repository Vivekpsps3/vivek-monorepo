import AxeBuilder from '@axe-core/playwright';
import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';
import { expect, test } from '../../../tests/e2e/fixtures';
import { formatDateRange, openTripAdd, runRowAction } from './dates.mjs';

function iso(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function card(page, title) {
  return page.locator('a.trip-card').filter({
    has: page.getByRole('heading', { level: 3, name: title, exact: true }),
  });
}

async function createTrip(request, data) {
  const created = await request.post('/travel/api/trips', { data });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json();
}

async function expectTarget(locator) {
  const box = await locator.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

const views = [
  { name: 'phone', viewport: { width: 390, height: 844 }, theme: 'dark', hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, theme: 'light', hasTouch: false },
];

for (const view of views) {
  test.describe(`postcards at ${view.viewport.width}×${view.viewport.height} ${view.theme}`, () => {
    test.use({ viewport: view.viewport, hasTouch: view.hasTouch, reducedMotion: 'reduce' });

    test(`upcoming and past cards state the saved span and open that trip (${view.name})`, async ({ page, request }) => {
      test.setTimeout(90_000);
      const upcomingStart = iso(10);
      const upcomingEnd = iso(12);
      const pastStart = iso(-20);
      const pastEnd = iso(-18);
      const upcomingTrip = await createTrip(request, {
        title: 'Untitled harbor',
        start_date: upcomingStart,
        end_date: upcomingEnd,
      });
      const pastTrip = await createTrip(request, {
        title: 'Past harbor',
        start_date: pastStart,
        end_date: pastEnd,
        stays: [{
          city: 'Paper City',
          arrive_on: pastStart,
          leave_on: pastEnd,
          lodging_name: 'Paper Inn',
        }],
      });
      expect((await request.post(`/travel/api/trips/${pastTrip.id}/transports`, {
        data: { mode: 'flight', role: 'outbound', arrive_place: 'PAP' },
      })).ok()).toBeTruthy();

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/travel');
      await chooseColorTheme(page, view.theme);
      const upcoming = card(page, 'Untitled harbor');
      const past = card(page, 'Past harbor');
      await expect(upcoming).toBeVisible();
      await expect(upcoming.getByText('Upcoming', { exact: true })).toBeVisible();
      await expect(upcoming).toContainText(formatDateRange(upcomingStart, upcomingEnd));
      await expect(upcoming.getByText('No destination saved.', { exact: true })).toBeVisible();
      await expect(upcoming).toContainText('Review the plan');
      await expect(upcoming.getByText('City', { exact: true })).toHaveCount(0);
      await expect(upcoming.getByRole('heading', { level: 3 })).toHaveText('Untitled harbor');

      await expect(past.getByText('Past', { exact: true })).toBeVisible();
      await expect(past).toContainText(formatDateRange(pastStart, pastEnd));
      await expect(past.getByText('City', { exact: true })).toBeVisible();
      await expect(past.getByText('Lodging', { exact: true })).toBeVisible();
      await expect(past.getByText('Airport', { exact: true })).toBeVisible();
      await expect(past).toContainText('Paper City');
      await expect(past).toContainText('Paper Inn');
      await expect(past).toContainText('PAP');
      await expect(past).toContainText('Open this trip');
      await expect(past.getByRole('heading', { level: 3 })).toHaveText('Past harbor');

      await expectTarget(upcoming);
      await expectTarget(past);
      expect(await upcoming.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const homeAxe = await new AxeBuilder({ page }).analyze();
      expect(homeAxe.violations.filter((item) => ['serious', 'critical'].includes(item.impact))).toEqual([]);

      if (view.hasTouch) await upcoming.tap();
      else {
        await upcoming.focus();
        await page.keyboard.press('Enter');
      }
      await expect(page).toHaveURL(new RegExp(`/travel/trips/${upcomingTrip.id}$`));
      await expect(page.getByRole('heading', { level: 1, name: 'Untitled harbor', exact: true })).toBeVisible();
      await expect(page.getByText(formatDateRange(upcomingStart, upcomingEnd)).first()).toBeVisible();
      await expect(page.getByText('No destinations saved. Add one when you know where you\'re staying.', { exact: true })).toBeVisible();
      await expect(page.getByText('No activities yet. Your dates are saved.', { exact: true })).toBeVisible();
      const back = page.getByRole('link', { name: '← Trips', exact: true });
      await expectTarget(back);
      if (view.hasTouch) await back.tap();
      else {
        await back.focus();
        await page.keyboard.press('Enter');
      }
      await expect(page).toHaveURL(/\/travel\/?$/);
      await expect(upcoming).toBeFocused();

      if (view.hasTouch) await past.tap();
      else await past.click();
      await expect(page).toHaveURL(new RegExp(`/travel/trips/${pastTrip.id}$`));
      await expect(page.getByRole('heading', { level: 1, name: 'Past harbor', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 3, name: 'Paper City', exact: true })).toBeVisible();
      await expect(page.getByText('Lodging Paper Inn', { exact: true })).toBeVisible();
      await expect(page.getByText('Airport PAP', { exact: true })).toBeVisible();
      await expect(page.getByText(formatDateRange(pastStart, pastEnd)).first()).toBeVisible();
    });

    test(`missing coordinates and failed tiles still open the trip text (${view.name})`, async ({ page, request }) => {
      test.setTimeout(90_000);
      const openStart = iso(20);
      const openEnd = iso(22);
      const mappedStart = iso(30);
      const mappedEnd = iso(32);
      await createTrip(request, {
        title: 'Open harbor',
        start_date: openStart,
        end_date: openEnd,
        stays: [{ city: 'Springfield', arrive_on: openStart, leave_on: openEnd }],
      });
      const mapped = await createTrip(request, {
        title: 'Mapped harbor',
        start_date: mappedStart,
        end_date: mappedEnd,
        stays: [{
          city: 'Paper Harbor',
          arrive_on: mappedStart,
          leave_on: mappedEnd,
          lat: 1,
          lng: 2,
        }],
      });
      let tiles = 0;
      await page.route('https://tile.openstreetmap.org/**', (route) => {
        tiles += 1;
        return route.abort('failed');
      });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/travel');
      await chooseColorTheme(page, view.theme);
      const openCard = card(page, 'Open harbor');
      await expect(openCard.getByText('City', { exact: true })).toBeVisible();
      await expect(openCard).toContainText('Springfield');
      await expect(openCard).toContainText(formatDateRange(openStart, openEnd));
      if (view.hasTouch) await openCard.tap();
      else await openCard.click();
      await expect(page.getByRole('heading', { level: 3, name: 'Springfield', exact: true })).toBeVisible();
      await expect(page.getByText('Location has not been chosen.', { exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: 'Show map', exact: true }).click();
      const map = page.getByRole('region', { name: 'Trip map', exact: true });
      await expect(map.getByText('Springfield', { exact: true })).toBeVisible();
      await expect(map.getByText('Location has not been chosen.', { exact: true })).toBeVisible();
      await expect(map.locator('.leaflet-interactive')).toHaveCount(0);
      expect(tiles).toBe(0);
      await expect(page.getByRole('heading', { level: 1, name: 'Open harbor', exact: true })).toBeVisible();
      await expect(page.getByText(formatDateRange(openStart, openEnd)).first()).toBeVisible();

      await page.getByRole('link', { name: '← Trips', exact: true }).click();
      await expect(page).toHaveURL(/\/travel\/?$/);
      const mappedCard = card(page, 'Mapped harbor');
      await expect(mappedCard.getByText('City', { exact: true })).toBeVisible();
      await expect(mappedCard).toContainText('Paper Harbor');
      if (view.hasTouch) await mappedCard.tap();
      else await mappedCard.click();
      await expect(page).toHaveURL(new RegExp(`/travel/trips/${mapped.id}$`));
      await expect(page.getByRole('heading', { level: 3, name: 'Paper Harbor', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Show map', exact: true }).click();
      const failed = page.getByRole('region', { name: 'Trip map', exact: true });
      await expect(failed.getByRole('status')).toContainText('Map tiles could not load', { timeout: 8_000 });
      await expect(failed.getByRole('status')).toContainText('place list and map links are still available');
      await expect(page.getByRole('heading', { level: 1, name: 'Mapped harbor', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 3, name: 'Paper Harbor', exact: true })).toBeVisible();
      await expect(page.getByText(formatDateRange(mappedStart, mappedEnd)).first()).toBeVisible();
      await expectTarget(page.getByRole('button', { name: 'Hide map', exact: true }));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}

test('a failed destination save keeps the city and lodging for retry', async ({ page, request }) => {
  const start = iso(14);
  const end = iso(16);
  const trip = await createTrip(request, { title: 'Draft harbor', start_date: start, end_date: end });
  let failed = false;
  await page.route(`**/travel/api/trips/${trip.id}/stays`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    if (!failed) {
      failed = true;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Save unavailable' }),
      });
    }
    return route.continue();
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/travel/trips/${trip.id}`);
  await openTripAdd(page, 'Destination');
  const dialog = page.getByRole('dialog', { name: 'Add destination', exact: true });
  await dialog.getByLabel('Destination city', { exact: true }).fill('Paper City');
  await dialog.getByText('Optional lodging details', { exact: true }).click();
  const lodging = dialog.getByLabel('Lodging name', { exact: true });
  await lodging.fill('Paper Inn');
  await dialog.getByRole('button', { name: 'Save destination', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Save unavailable');
  await expect(dialog.getByLabel('Destination city', { exact: true })).toHaveValue('Paper City');
  await expect(lodging).toHaveValue('Paper Inn');
  await expect(dialog.locator('input[name="arrive"]')).toHaveValue(start);
  await expect(dialog.locator('input[name="leave"]')).toHaveValue(end);
  await dialog.getByRole('button', { name: 'Save destination', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 3, name: 'Paper City', exact: true })).toBeVisible();
  await expect(page.getByText('Lodging Paper Inn', { exact: true })).toBeVisible();
});

test('a late destination response keeps the newer lodging', async ({ page, request }) => {
  const start = iso(14);
  const end = iso(16);
  const trip = await createTrip(request, { title: 'Late harbor', start_date: start, end_date: end });
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let seen;
  const ready = new Promise((resolve) => { seen = resolve; });
  await page.route(`**/travel/api/trips/${trip.id}/stays`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    seen();
    await held;
    await route.fulfill({ response });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/travel/trips/${trip.id}`);
  await openTripAdd(page, 'Destination');
  const dialog = page.getByRole('dialog', { name: 'Add destination', exact: true });
  await dialog.getByLabel('Destination city', { exact: true }).fill('Paper City');
  await dialog.getByText('Optional lodging details', { exact: true }).click();
  const lodging = dialog.getByLabel('Lodging name', { exact: true });
  await lodging.fill('First Inn');
  await dialog.getByRole('button', { name: 'Save destination', exact: true }).click();
  await ready;
  await lodging.fill('Second Inn');
  release();
  await expect(dialog).toBeVisible();
  await expect(lodging).toHaveValue('Second Inn');
  await expect(dialog.getByLabel('Destination city', { exact: true })).toHaveValue('Paper City');
  await expect(page.getByRole('heading', { level: 3, name: 'Paper City', exact: true })).toHaveCount(0);
});

test('session expiry clears a private place search', async ({ page, request }) => {
  const start = iso(18);
  const end = iso(19);
  const trip = await createTrip(request, {
    title: 'Search harbor',
    start_date: start,
    end_date: end,
    stays: [{ city: 'Springfield', arrive_on: start, leave_on: end }],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/travel/trips/${trip.id}`);
  const stay = page.locator('article').filter({
    has: page.getByRole('heading', { level: 3, name: 'Springfield', exact: true }),
  });
  await expect(stay).toBeVisible();
  await runRowAction(stay, 'Choose location');
  const dialog = page.getByRole('dialog', { name: 'Choose location', exact: true });
  const query = dialog.getByLabel('Place search', { exact: true });
  await query.fill('synthetic quay');
  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  await expect(query).toHaveValue('synthetic quay');
  await page.route('**/travel/api/**', (route) => route.fulfill({
    status: 401,
    json: { message: 'Sign in again', code: 'session_expired' },
  }));
  await dialog.getByRole('button', { name: 'Find places' }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Place search')).toHaveCount(0);
  await expect(page.getByText('synthetic quay')).toHaveCount(0);
});
