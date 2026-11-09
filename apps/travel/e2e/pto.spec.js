import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { expect, test } from '../../../tests/e2e/fixtures';
import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';
import {
  ACCRUAL_COPY,
  CAP_COPY,
  HPD_COPY,
  NAME_COPY,
  RANGE_COPY,
  START_COPY,
} from '../frontend/src/pto-model.mjs';

const shotDir = process.env.SCREENSHOT_DIR || '';
const base = {
  start_balance_hours: '80',
  balance_as_of: '2026-01-01',
  accrual_hours: '8',
  accrual_cadence: 'monthly',
  cap_hours: null,
  year_start: '01-01',
};

async function putBucket(request, bucket = 'pto', extra = {}) {
  const response = await request.put('/travel/api/pto/policies/' + bucket, { data: { ...base, ...extra } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function shot(page, name) {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  const width = page.viewportSize().width;
  const theme = (await page.locator('html').getAttribute('data-theme')) || 'light';
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(shotDir, name + '-' + width + '-' + theme + '.png'), fullPage: true });
}

for (const width of [390, 1280]) {
  test.describe('pto forms at ' + width, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 800 } });
    test.beforeEach(async ({ request }) => {
      expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
    });

    test('empty, loading, and load error', async ({ page }) => {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      await page.route('**/travel/api/pto', async route => {
        if (route.request().method() !== 'GET' || !route.request().url().endsWith('/travel/api/pto')) return route.continue();
        await gate;
        await route.continue();
      });
      await page.goto('/travel/pto');
      await expect(page.locator('.pto-skel[aria-busy="true"]')).toBeVisible();
      await expect(page.locator('.pto-tiles ui-skeleton')).toHaveCount(2);
      release();
      await expect(page.getByText('Set up PTO', { exact: true })).toBeVisible();
      await expect(page.getByText("Tell Travel your balance and how fast you earn time off, and it will project what's left after each trip.")).toBeVisible();
      await expect(page.getByLabel('Starting balance')).toBeVisible();
      await page.unroute('**/travel/api/pto');
      await page.route('**/travel/api/pto', route => route.request().method() === 'GET' && route.request().url().endsWith('/travel/api/pto')
        ? route.fulfill({ status: 500, json: { message: 'PTO unavailable' } })
        : route.continue());
      await page.reload();
      await expect(page.getByRole('heading', { name: "Couldn't load PTO", exact: true })).toBeVisible();
      await page.unroute('**/travel/api/pto');
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'PTO', exact: true })).toBeVisible();
      await expect(page.getByLabel('Starting balance')).toBeVisible();
    });

    test('hard limits, a server 422, a blank cap, and a soft warning', async ({ page }) => {
      await page.goto('/travel/pto');
      const start = page.getByLabel('Starting balance');
      await start.fill('9000');
      await start.blur();
      await expect(page.getByText(START_COPY)).toBeVisible();
      await expect(start).toHaveAttribute('aria-invalid', 'true');
      let puts = 0;
      await page.route('**/travel/api/pto/policies/**', route => {
        if (route.request().method() === 'PUT') puts += 1;
        return route.continue();
      });
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      expect(puts).toBe(0);
      await expect(start).toBeFocused();
      await start.fill('2001');
      await start.blur();
      await expect(page.getByText("That's 250.13 days. Double-check the hours.")).toBeVisible();
      await expect(start).not.toHaveAttribute('aria-invalid', 'true');
      const cap = page.getByLabel('Cap');
      await cap.fill('0');
      await cap.blur();
      await expect(page.getByText(CAP_COPY)).toBeVisible();
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      expect(puts).toBe(0);
      await cap.fill('');
      await cap.blur();
      await page.getByLabel('You earn').fill('8');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('PTO policy saved.', { exact: true })).toBeVisible();
      expect(puts).toBe(1);
      const saved = await (await page.request.get('/travel/api/pto')).json();
      expect(saved.buckets.pto.cap_hours).toBeNull();
      expect(saved.buckets.pto.start_balance_hours).toBe('2001');
      await page.route('**/travel/api/pto/policies/sick', route => route.request().method() === 'PUT'
        ? route.fulfill({ status: 422, json: { code: 'validation_error', message: 'Check the form and try again.', field_errors: { accrual_hours: ACCRUAL_COPY } } })
        : route.continue());
      await page.getByRole('button', { name: 'Set up Sick', exact: true }).click();
      await expect(page.getByLabel('Starting balance')).toBeFocused();
      await page.getByLabel('Starting balance').fill('16');
      await page.getByLabel('You earn').fill('4');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText(ACCRUAL_COPY)).toBeVisible();
      await expect(page.getByLabel('You earn')).toHaveValue('4');
      await expect(page.getByLabel('Starting balance')).toHaveValue('16');
    });

    test('save failure keeps the draft and retry resends it', async ({ page }) => {
      await putBucket(page.request);
      await page.goto('/travel/pto');
      await page.getByRole('button', { name: 'Edit PTO', exact: true }).click();
      await page.getByLabel('Starting balance').fill('40');
      const bodies = [];
      let attempts = 0;
      await page.route('**/travel/api/pto/policies/pto', async route => {
        if (route.request().method() !== 'PUT') return route.continue();
        bodies.push(route.request().postDataJSON());
        attempts += 1;
        if (attempts === 1) return route.fulfill({ status: 502, json: { message: 'down' } });
        return route.continue();
      });
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      const alert = page.getByRole('alert');
      await expect(alert).toContainText("Couldn't save your PTO policy.");
      await expect(alert.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
      await expect(page.getByLabel('Starting balance')).toHaveValue('40');
      await alert.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(page.getByText('PTO policy saved.', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit PTO', exact: true })).toBeFocused();
      expect(bodies[0]).toEqual(bodies[1]);
      expect(bodies[0].start_balance_hours).toBe('40');
    });

    test('entries, chips, client errors, and add retry', async ({ page, request }) => {
      await putBucket(request);
      const trip = await request.post('/travel/api/trips', { data: {
        title: 'Kyoto', start_date: '2026-12-10', end_date: '2026-12-12',
        stays: [{ city: 'Kyoto', arrive_on: '2026-12-10', leave_on: '2026-12-12' }],
      } });
      expect(trip.ok(), await trip.text()).toBeTruthy();
      await page.goto('/travel/pto');
      const counts = page.getByRole('radiogroup', { name: 'Counts against' });
      await expect(counts.getByRole('radio', { name: 'PTO', exact: true })).toBeChecked();
      await counts.getByRole('radio', { name: 'Sick', exact: true }).check();
      await expect(page.getByText('Set up Sick to track this balance.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.getByText(NAME_COPY)).toBeVisible();
      await page.getByLabel('Name', { exact: true }).fill('Clinic');
      await page.getByLabel('First day', { exact: true }).fill('2026-12-04');
      await page.getByLabel('Last day', { exact: true }).fill('2026-12-02');
      await page.getByLabel('Last day').blur();
      await expect(page.getByText(RANGE_COPY)).toBeVisible();
      await page.getByLabel('Last day', { exact: true }).fill('2026-12-05');
      let entryAttempts = 0;
      await page.route('**/travel/api/pto/entries', route => {
        if (route.request().method() !== 'POST') return route.continue();
        entryAttempts += 1;
        return entryAttempts === 1
          ? route.fulfill({ status: 502, json: { message: 'down' } })
          : route.continue();
      });
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      const alert = page.getByRole('alert');
      await expect(alert).toContainText("Couldn't add this time off.");
      await alert.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(page.locator('.chip').filter({ hasText: 'Sick' })).toBeVisible();
      await expect(page.locator('.chip').filter({ hasText: 'PTO · Trip' })).toBeVisible();
      const saved = await (await request.get('/travel/api/pto')).json();
      expect(saved.entries.find(entry => entry.label === 'Clinic').bucket).toBe('sick');
    });

    test('first-run card dismisses and reports a failed dismiss', async ({ page }) => {
      await putBucket(page.request);
      await page.goto('/travel/pto');
      await expect(page.getByRole('heading', { name: 'Track sick time too', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sick: not set up · Set up', exact: true })).toBeVisible();
      await page.route('**/travel/api/settings/pto', route => route.request().method() === 'PUT'
        ? route.fulfill({ status: 502, json: { message: 'down' } })
        : route.continue());
      await page.getByRole('button', { name: 'Not now', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText("Couldn't save that. Retry");
      await page.unroute('**/travel/api/settings/pto');
      await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Track sick time too', exact: true })).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Track sick time too', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Sick: not set up · Set up', exact: true })).toBeVisible();
    });

    test('keyboard order, arrow keys, 44px targets, and the cadence wrap', async ({ page, request }) => {
      await putBucket(request);
      await page.goto('/travel/pto');
      await page.locator('.skip-link').focus();
      const seen = [];
      // Chart markers are focusable so each balance can be read. The app
      // switcher and those points sit before the form, so the scan has to
      // walk past them to reach Last day, Add, and the policy buttons.
      for (let step = 0; step < 80; step += 1) {
        seen.push(await page.evaluate(() => {
          const el = document.activeElement;
          if (!el) return '';
          const aria = el.getAttribute('aria-label');
          const fromLabel = aria || (el.labels && el.labels[0] && el.labels[0].innerText) || (el.closest('label') && el.closest('label').innerText) || el.innerText || '';
          const kind = el.tagName === 'INPUT' ? el.type : el.tagName.toLowerCase();
          return kind + ':' + fromLabel.replace(/\s+/g, ' ').trim();
        }));
        await page.keyboard.press('Tab');
      }
      const at = token => seen.indexOf(token);
      const order = [
        'a:Skip to content',
        'button:Set up Sick',
        'button:Not now',
        'button:Edit PTO',
        'radio:PTO',
        'text:Name',
        'date:First day',
        'date:Last day',
        'button:Add',
        'button:Edit PTO policy',
        'button:Sick: not set up · Set up',
      ].map(at);
      expect(order, seen.join(' | ')).not.toContain(-1);
      for (let index = 1; index < order.length; index += 1) expect(order[index]).toBeGreaterThan(order[index - 1]);
      const counts = page.getByRole('radiogroup', { name: 'Counts against' });
      await counts.getByRole('radio', { name: 'PTO', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(counts.getByRole('radio', { name: 'Sick', exact: true })).toBeChecked();
      await page.getByRole('button', { name: 'Edit PTO', exact: true }).click();
      await expect(page.getByLabel('Starting balance')).toBeFocused();
      const cadence = page.getByRole('radiogroup', { name: 'How often' });
      const tops = [];
      for (let index = 0; index < 5; index += 1) {
        const box = await cadence.locator('.segment').nth(index).boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        tops.push(box.y);
      }
      for (const segment of await counts.locator('.segment').all()) {
        expect((await segment.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
      expect((await page.getByRole('button', { name: 'Add', exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(44);
      if (width === 390) {
        expect(Math.abs(tops[0] - tops[2])).toBeLessThan(2);
        expect(tops[3]).toBeGreaterThan(tops[0] + 20);
        expect(Math.abs(tops[3] - tops[4])).toBeLessThan(2);
      } else {
        expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Edit PTO', exact: true })).toBeFocused();
    });

    test('hours in a workday save and change the days figure only', async ({ page, request }) => {
      await putBucket(request, 'pto', { start_balance_hours: '100', accrual_hours: '0' });
      await page.goto('/travel/pto');
      await expect(page.getByText('12.5 days · 100 h', { exact: true })).toHaveCount(2);
      await page.goto('/travel/settings');
      const hours = page.getByLabel('Hours in a workday');
      await expect(hours).toHaveValue('8');
      await hours.fill('7.125');
      await hours.blur();
      await expect(page.getByText(HPD_COPY)).toBeVisible();
      await hours.fill('25');
      await hours.blur();
      await expect(page.getByText(HPD_COPY)).toBeVisible();
      await page.getByRole('button', { name: 'Save hours', exact: true }).click();
      await expect(page.getByText(HPD_COPY)).toBeVisible();
      expect((await (await request.get('/travel/api/settings')).json()).pto.hours_per_day).toBe('8');
      await hours.fill('7.5');
      await page.getByRole('button', { name: 'Save hours', exact: true }).click();
      await expect(page.getByText('Hours in a workday saved.', { exact: true })).toBeVisible();
      const link = page.getByRole('link', { name: 'PTO policy', exact: true });
      expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await link.click();
      await expect(page.getByText('13.33 days · 100 h', { exact: true })).toHaveCount(2);
      expect((await (await request.get('/travel/api/pto')).json()).buckets.pto.start_balance_hours).toBe('100');
    });

    test('preview stays tied to the dates and the selected bucket', async ({ page }) => {
      await putBucket(page.request, 'pto', { start_balance_hours: '80', accrual_hours: '0' });
      await page.goto('/travel/pto');
      await page.getByLabel('Name', { exact: true }).fill('Family visit');
      await page.getByLabel('First day', { exact: true }).fill('2026-12-01');
      await page.getByLabel('Last day', { exact: true }).fill('2026-12-02');
      const seen = [];
      page.on('request', request => {
        if (request.url().includes('/travel/api/pto/preview')) seen.push(new URL(request.url()).searchParams.get('bucket'));
      });
      await page.getByRole('button', { name: 'Preview balance', exact: true }).click();
      await expect(page.getByText(/Before:/)).toBeVisible();
      await page.getByLabel('Last day', { exact: true }).fill('2026-12-03');
      await expect(page.getByText(/Before:/)).toHaveCount(0);
      await page.getByRole('radio', { name: 'Sick', exact: true }).check();
      await page.getByRole('button', { name: 'Preview balance', exact: true }).click();
      await expect.poll(() => seen).toEqual(['pto', 'sick']);
    });
  });
}

test('painter scenes for the stacked review', async ({ page, request }) => {
  test.setTimeout(180_000);
  const widths = (process.env.SHOT_WIDTHS || '390,1280').split(',').map(Number);
  const themes = (process.env.SHOT_THEMES || 'light,dark').split(',');
  for (const width of widths) for (const theme of themes) {
    expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.goto('/travel/pto');
    await chooseColorTheme(page, theme);
    await expect(page.getByText('Set up PTO', { exact: true })).toBeVisible();
    await shot(page, 'pto-empty');
    await putBucket(request, 'pto', { start_balance_hours: '100', accrual_hours: '8' });
    await page.goto('/travel/pto');
    await expect(page.getByRole('heading', { name: 'Track sick time too', exact: true })).toBeVisible();
    await shot(page, 'pto-first-run');
    await putBucket(request, 'sick', { start_balance_hours: '24', accrual_hours: '4' });
    await page.goto('/travel/pto');
    await expect(page.getByText('Sick', { exact: true }).first()).toBeVisible();
    await shot(page, 'pto-both');
    await page.route('**/travel/api/pto/policies/sick', route => route.request().method() === 'PUT'
      ? route.fulfill({ status: 422, json: { code: 'validation_error', message: 'Check the form and try again.', field_errors: { accrual_hours: ACCRUAL_COPY } } })
      : route.continue());
    await page.getByRole('button', { name: 'Edit Sick', exact: true }).click();
    await page.getByLabel('Starting balance').fill('2001');
    await page.getByLabel('Starting balance').blur();
    await page.getByLabel('You earn').fill('4');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(ACCRUAL_COPY)).toBeVisible();
    await expect(page.getByText(/That's 250\.13 days/)).toBeVisible();
    await shot(page, 'pto-sick-422');
    await page.unroute('**/travel/api/pto/policies/sick');
    await page.goto('/travel/settings');
    await expect(page.getByLabel('Hours in a workday')).toHaveValue('8');
    await shot(page, 'settings-hours');
  }
});
