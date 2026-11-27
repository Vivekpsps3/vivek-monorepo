import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';
import { chooseTripStart, formatDay, ptoChoice, ptoOption } from './dates.mjs';
import { longDate, overlapSentence } from '../frontend/src/pto-model.mjs';

const policy = {
  start_balance_hours: '80',
  balance_as_of: '2026-03-15',
  accrual_hours: '8',
  accrual_cadence: 'monthly',
  cap_hours: '40',
  year_start: '04-01',
  carry_forward: false,
};
const sick = {
  start_balance_hours: '16',
  balance_as_of: '2026-03-15',
  accrual_hours: '4',
  accrual_cadence: 'monthly',
  cap_hours: null,
  year_start: '04-01',
  carry_forward: true,
};

const views = [
  { name: 'phone', viewport: { width: 390, height: 844 }, theme: 'dark', hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, theme: 'light', hasTouch: false },
];

async function putBucket(request, bucket, body) {
  const response = await request.put('/travel/api/pto/policies/' + bucket, { data: body });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function createTrip(request, data) {
  const response = await request.post('/travel/api/trips', { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function expectTarget(locator) {
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
}

async function holdPatch(page, url) {
  let release;
  let received;
  const held = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { received = resolve; });
  await page.route(url, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const response = await route.fetch();
    received();
    await held;
    await route.fulfill({ response });
  });
  return { ready, release: () => release(), done: () => page.unroute(url) };
}

for (const view of views) {
  test.describe(`pto inspect at ${view.viewport.width}×${view.viewport.height} ${view.theme}`, () => {
    test.use({ viewport: view.viewport, hasTouch: view.hasTouch, reducedMotion: 'reduce' });

    test.beforeEach(async ({ request }) => {
      expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
    });

    test(`editing dates across a weekend keeps the intersecting selection (${view.name})`, async ({ page, request }) => {
      test.setTimeout(90_000);
      const trip = await createTrip(request, {
        title: 'Harbor week',
        start_date: '2026-12-11',
        end_date: '2026-12-15',
        stays: [],
        pto_dates: [
          { on_date: '2026-12-11', amount: '1' },
          { on_date: '2026-12-12', amount: '0.5' },
          { on_date: '2026-12-13', amount: '0' },
          { on_date: '2026-12-14', amount: '0.5' },
          { on_date: '2026-12-15', amount: '1' },
        ],
      });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/travel/trips/' + trip.id);
      await chooseColorTheme(page, view.theme);
      await expect(ptoOption(page, '2026-12-12', 'Half')).toBeChecked();
      await expect(ptoOption(page, '2026-12-13', 'None')).toBeChecked();
      const edit = page.getByRole('button', { name: 'Edit trip', exact: true });
      await expectTarget(edit);
      await expectTarget(ptoChoice(page, '2026-12-12').locator('label.pto-choice').filter({
        has: page.getByRole('radio', { name: 'Half', exact: true }),
      }));
      await edit.click();
      const dialog = page.getByRole('dialog', { name: 'Edit trip', exact: true });
      await dialog.getByLabel('Departure date', { exact: true }).fill('2026-12-12');
      await dialog.getByLabel('Return date', { exact: true }).fill('2026-12-16');
      await dialog.getByRole('button', { name: 'Save trip', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(edit).toBeFocused();
      await expect(page.getByRole('radiogroup', { name: formatDay('2026-12-11'), exact: true })).toHaveCount(0);
      await expect(ptoOption(page, '2026-12-12', 'Half')).toBeChecked();
      await expect(ptoOption(page, '2026-12-13', 'None')).toBeChecked();
      await expect(ptoOption(page, '2026-12-14', 'Half')).toBeChecked();
      await expect(ptoOption(page, '2026-12-15', 'Full')).toBeChecked();
      await expect(ptoOption(page, '2026-12-16', 'Full')).toBeChecked();
      const shifted = await (await request.get('/travel/api/trips/' + trip.id)).json();
      expect(shifted.pto_dates.map((row) => [row.on_date, row.amount])).toEqual([
        ['2026-12-12', '0.5'],
        ['2026-12-13', '0'],
        ['2026-12-14', '0.5'],
        ['2026-12-15', '1'],
        ['2026-12-16', '1'],
      ]);
      await expect(page.locator('.pto-day--weekend')).toHaveCount(2);
      expect(await page.locator('.pto-day--weekend').first().evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
      await page.reload();
      await expect(ptoOption(page, '2026-12-12', 'Half')).toBeChecked();
      await expect(ptoOption(page, '2026-12-15', 'Full')).toBeChecked();
      await expect(page.locator('main .save-status')).toHaveCount(0);

      if (view.hasTouch) await ptoOption(page, '2026-12-14', 'Half').tap();
      else {
        await ptoOption(page, '2026-12-15', 'Full').focus();
        await page.keyboard.press('ArrowRight');
        await expect(ptoOption(page, '2026-12-15', 'Half')).toBeChecked();
      }

      await ptoOption(page, '2026-12-16', 'None').click();
      let attempts = 0;
      await page.route('**/travel/api/trips/' + trip.id, async (route) => {
        if (route.request().method() !== 'PATCH') return route.continue();
        attempts += 1;
        if (attempts === 1) {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Save unavailable' }),
          });
          return;
        }
        await route.continue();
      });
      await page.getByRole('button', { name: 'Save PTO dates' }).click();
      await expect(page.locator('main [role=alert]')).toContainText('Save unavailable');
      await expect(ptoOption(page, '2026-12-16', 'None')).toBeChecked();
      await expect(ptoOption(page, '2026-12-12', 'Half')).toBeChecked();
      await expect(ptoOption(page, '2026-12-14', 'Half')).toBeChecked();
      await expect(page.locator('main .save-status')).toHaveCount(0);
      await page.getByRole('button', { name: 'Save PTO dates' }).click();
      await expect(page.locator('main [role=status]')).toContainText('Saved');
      const saved = await (await request.get('/travel/api/trips/' + trip.id)).json();
      const amounts = Object.fromEntries(saved.pto_dates.map((row) => [row.on_date, row.amount]));
      expect(amounts['2026-12-12']).toBe('0.5');
      expect(amounts['2026-12-13']).toBe('0');
      expect(amounts['2026-12-14']).toBe('0.5');
      expect(amounts['2026-12-16']).toBe('0');
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test(`forecast, policy, and overlap match the server points (${view.name})`, async ({ page, request }) => {
      test.setTimeout(90_000);
      await putBucket(request, 'pto', policy);
      await putBucket(request, 'sick', sick);
      const north = await createTrip(request, {
        title: 'North trip',
        start_date: '2026-12-14',
        end_date: '2026-12-16',
        stays: [],
      });
      await createTrip(request, {
        title: 'South trip',
        start_date: '2026-12-14',
        end_date: '2026-12-16',
        stays: [],
      });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/travel/pto');
      await chooseColorTheme(page, view.theme);
      await expect(page.locator('travel-pto-chart')).toHaveCount(1);
      const series = await (await request.get('/travel/api/pto/series')).json();
      const board = await (await request.get('/travel/api/pto')).json();
      for (const bucket of ['pto', 'sick']) {
        const point = series[bucket].points.find((item) => item.kinds.includes('as_of'));
        expect(point.on).toBe(board.buckets[bucket].balance_as_of);
        const row = page.locator('.pto-accrual-boundary').filter({ hasText: bucket === 'pto' ? 'PTO' : 'Sick' });
        await expect(row).toContainText('Accrual boundary');
        await expect(row).toContainText(`${point.days} days \u00b7 ${point.hours} h`);
        await expect(row).toContainText(longDate(point.on));
      }
      await expect(page.getByText('Unused hours reset at the policy year.')).toHaveCount(1);
      await expect(page.getByText('Unused hours carry into the next policy year.')).toHaveCount(1);
      await expect(page.getByText('Cap is 40 h.')).toHaveCount(1);
      await expect(page.getByText('No cap.')).toHaveCount(1);
      await expect(page.getByText('Policy year starts Apr 1.')).toHaveCount(2);
      await expect(page.getByText('Balance recorded through Mar 15, 2026. Accrual starts the next day.')).toHaveCount(2);
      const conflict = board.policy.conflicts.find((item) => item.on_date === '2026-12-14');
      expect(conflict.amount).toBeTruthy();
      await expect(page.getByText(overlapSentence(conflict))).toHaveCount(1);
      expect(await page.locator('.pto-history-row').first().evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      await page.goto('/travel/trips/' + north.id);
      const detail = await (await request.get('/travel/api/trips/' + north.id)).json();
      const tripConflict = detail.pto.conflicts.find((item) => item.on_date === '2026-12-14');
      await expect(page.getByText(overlapSentence(tripConflict))).toHaveCount(1);
      await page.goto('/travel');
      await expect(page.getByRole('heading', { level: 3, name: 'North trip' }).locator('xpath=..')).toContainText('PTO overlaps');
    });
  });
}

test('an unsaved date change keeps the overlapping choice', async ({ page, request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/travel/trips/new');
  await chooseTripStart(page, 'manual');
  await page.getByLabel('Departure date').fill('2026-12-14');
  await page.getByLabel('Return date').fill('2026-12-16');
  await page.getByRole('heading', { name: 'Time off', exact: true }).click();
  await expect(ptoOption(page, '2026-12-16', 'Full')).toBeChecked();
  await ptoOption(page, '2026-12-16', 'Half').click();
  await page.getByLabel('Return date').fill('2026-12-20');
  await expect(ptoOption(page, '2026-12-14', 'Full')).toBeChecked();
  await expect(ptoOption(page, '2026-12-16', 'Half')).toBeChecked();
  await expect(ptoOption(page, '2026-12-19', 'None')).toBeChecked();
  await expect(ptoOption(page, '2026-12-20', 'None')).toBeChecked();
});

test('a late PTO save keeps the newer choice', async ({ page, request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
  const trip = await createTrip(request, {
    title: 'Harbor weekend',
    start_date: '2026-12-12',
    end_date: '2026-12-13',
    stays: [],
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/travel/trips/' + trip.id);
  await ptoOption(page, '2026-12-12', 'Half').click();
  const held = await holdPatch(page, '**/travel/api/trips/' + trip.id);
  await page.getByRole('button', { name: 'Save PTO dates' }).click();
  await held.ready;
  await ptoOption(page, '2026-12-13', 'Full').click();
  held.release();
  await expect(page.getByRole('button', { name: 'Save PTO dates' })).toBeEnabled();
  await expect(ptoOption(page, '2026-12-12', 'Half')).toBeChecked();
  await expect(ptoOption(page, '2026-12-13', 'Full')).toBeChecked();
  const first = await (await request.get('/travel/api/trips/' + trip.id)).json();
  const firstAmounts = Object.fromEntries(first.pto_dates.map((row) => [row.on_date, row.amount]));
  expect(firstAmounts['2026-12-12']).toBe('0.5');
  expect(firstAmounts['2026-12-13']).toBe('0');
  await held.done();
  await page.getByRole('button', { name: 'Save PTO dates' }).click();
  await expect(page.locator('main [role=status]')).toContainText('Saved');
  const second = await (await request.get('/travel/api/trips/' + trip.id)).json();
  const secondAmounts = Object.fromEntries(second.pto_dates.map((row) => [row.on_date, row.amount]));
  expect(secondAmounts['2026-12-12']).toBe('0.5');
  expect(secondAmounts['2026-12-13']).toBe('1');
});

test('session expiry clears a private PTO draft', async ({ page, request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
  await putBucket(request, 'pto', { ...policy, cap_hours: null, carry_forward: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/travel/pto');
  await page.getByRole('button', { name: 'Edit PTO', exact: true }).click();
  await page.getByLabel('Starting balance').fill('12.5');
  await page.getByLabel('Name', { exact: true }).fill('Clinic draft');
  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Clinic draft');
  await page.route('**/travel/api/**', (route) => route.fulfill({
    status: 401,
    json: { message: 'Sign in again', code: 'session_expired' },
  }));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByText('Clinic draft')).toHaveCount(0);
  await expect(page.getByLabel('Starting balance')).toHaveCount(0);
});
