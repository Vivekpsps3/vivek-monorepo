import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import { runRowAction } from './dates.mjs';

const DAY = '2026-11-23';
const NEXT = '2026-11-24';
const START = '2026-11-18';
const END = '2026-11-26';
const EARLIER = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];

const VIEWS = [
  { name: 'phone night', width: 390, height: 844, theme: 'dark', touch: true },
  { name: 'phone light', width: 390, height: 844, theme: 'light', touch: true },
  { name: 'desktop light', width: 1280, height: 800, theme: 'light', touch: false },
  { name: 'desktop night', width: 1280, height: 800, theme: 'dark', touch: false },
];

function watchConsole(page) {
  const violations = [];
  page.on('console', (message) => {
    if (/content security policy|trusted types|violates/i.test(message.text())) violations.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (/content security policy|trusted types/i.test(String(error))) violations.push(String(error));
  });
  return violations;
}

async function expectClean(page, violations) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(violations).toEqual([]);
}

async function createTrip(request, data) {
  const created = await request.post('/travel/api/trips', { data });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json();
}

async function seedBooked(request) {
  const trip = await createTrip(request, {
    title: 'Harbor week',
    start_date: START,
    end_date: END,
    status: 'booked',
    stays: [{ city: 'Lisbon', arrive_on: START, leave_on: END, lodging_name: 'Paper Inn' }],
  });
  const base = '/travel/api/trips/' + trip.id;
  expect((await request.post(base + '/transports', {
    data: {
      mode: 'flight',
      role: 'outbound',
      depart_place: 'SFO',
      arrive_place: 'LIS',
      depart_at: DAY + 'T09:00',
      arrive_at: DAY + 'T18:00',
      depart_tz: 'America/Los_Angeles',
      arrive_tz: 'Europe/Lisbon',
    },
  })).ok()).toBeTruthy();
  expect((await request.post(base + '/plans', {
    data: { title: 'Museum hour', kind: 'activity', on_date: DAY, start_time: '10:00' },
  })).ok()).toBeTruthy();
  expect((await request.post(base + '/budget-lines', {
    data: { label: 'Museum pass', amount: '12.00', category: 'activity', currency: 'EUR', paid: false },
  })).ok()).toBeTruthy();
  return request.get(base).then(async (response) => {
    expect(response.ok()).toBeTruthy();
    return response.json();
  });
}

async function seedDraft(request) {
  return createTrip(request, {
    title: 'Open draft',
    start_date: START,
    end_date: END,
    status: 'planning',
  });
}

function daySection(page, iso) {
  return page.locator('#itinerary-day-' + iso);
}

async function expectInView(page, locator) {
  await expect(locator).toBeVisible();
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    const header = await page.locator('.suite-header').boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) return 'missing';
    const top = (header?.height ?? 0) - 2;
    const bottom = viewport.height + 2;
    if (box.y < top) return 'above ' + box.y;
    if (box.y + box.height > bottom) return 'below ' + (box.y + box.height);
    return 'in';
  }).toBe('in');
  return locator.boundingBox();
}

async function expectDayReady(page, iso) {
  const day = daySection(page, iso);
  const tab = page.locator('#trip-day-' + iso);
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(new RegExp('day=' + iso));
  const add = day.getByRole('button', { name: /Add on / });
  await expectInView(page, day.getByRole('heading', { level: 3, name: /Nov / }));
  const addBox = await expectInView(page, add);
  expect(addBox.height).toBeGreaterThanOrEqual(44);
  expect((await tab.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  return day;
}

async function press(locator, touch) {
  if (touch) await locator.tap();
  else await locator.click();
}

async function openDayReminder(page, day, touch) {
  const add = day.getByRole('button', { name: /Add on / });
  if (touch) {
    await add.tap();
    await page.getByRole('menuitem', { name: 'Reminder', exact: true }).tap();
    return;
  }
  await add.focus();
  await page.keyboard.press('Enter');
  const item = page.getByRole('menuitem', { name: 'Reminder', exact: true });
  for (let step = 0; step < 8 && !(await item.evaluate((node) => node === document.activeElement)); step += 1) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(item).toBeFocused();
  await page.keyboard.press('Enter');
}

for (const view of VIEWS) {
  test.describe(`selected day [${view.name}]`, () => {
    test.use({
      viewport: { width: view.width, height: view.height },
      hasTouch: view.touch,
      reducedMotion: 'reduce',
    });

    test.beforeEach(async ({ page, request }) => {
      expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
      await page.addInitScript((theme) => {
        try {
          localStorage.setItem('suite-theme', theme);
        } catch {
          // Storage may be unavailable before the first navigation.
        }
      }, view.theme);
    });

    test(`the named day, edit, and reminder stay together at ${view.width}px`, async ({ page, request }) => {
      test.setTimeout(90_000);
      const violations = watchConsole(page);
      const financeWrites = [];
      page.on('request', (req) => {
        if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method()) && req.url().includes('/finance')) {
          financeWrites.push(req.method() + ' ' + req.url());
        }
      });
      const booked = await seedBooked(request);
      const pto = booked.pto_days_effective;
      await page.goto('/travel/trips/' + booked.id + '?day=' + DAY);
      await expect(page.getByRole('heading', { level: 1, name: 'Harbor week', exact: true })).toBeVisible();
      const named = await expectDayReady(page, DAY);
      await expect(named).toContainText('Museum hour');
      await expect(named).toContainText('Paper Inn');
      await expect(named).toContainText('America/Los_Angeles');
      await expect(named).toContainText('Europe/Lisbon');
      for (const iso of EARLIER) await expect(daySection(page, iso)).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Add activity on / })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Add a plan', exact: true })).toHaveCount(0);
      await expect(page.locator('travel-trip-reminders')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'PTO · ' + pto + ' days', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Unlock Finance to see card spend', exact: true })).toBeVisible();
      expect(await named.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
      const axe = await new AxeBuilder({ page }).include('main').analyze();
      expect(axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact) || item.id === 'color-contrast')).toEqual([]);

      if (view.touch) await page.locator('#trip-day-' + NEXT).tap();
      else {
        await page.locator('#trip-day-' + DAY).focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#trip-day-' + NEXT)).toBeFocused();
        await page.keyboard.press('Enter');
      }
      const next = await expectDayReady(page, NEXT);
      await expect(next).toContainText('Paper Inn');
      await expect(daySection(page, DAY)).toBeVisible();
      if (view.touch) await page.locator('#trip-day-' + DAY).tap();
      else {
        await page.locator('#trip-day-' + DAY).focus();
        await page.keyboard.press('Enter');
      }
      await expectDayReady(page, DAY);

      const activity = named.locator('article').filter({ hasText: 'Museum hour' });
      await runRowAction(activity, 'Edit activity');
      const editor = page.getByRole('dialog', { name: 'Edit activity', exact: true });
      await expect(editor).toBeVisible();
      await expect(editor.getByRole('heading', { name: 'Add activity', exact: true })).toHaveCount(0);
      await expect(editor.locator('input[name="date"]')).toHaveValue(DAY);
      await editor.getByLabel('Activity title').fill('Museum visit');
      await editor.getByRole('button', { name: 'Save activity', exact: true }).click();
      await expect(editor).toBeHidden();
      await expect(page).toHaveURL(new RegExp('day=' + DAY));
      await expect.poll(() => page.evaluate(() => document.activeElement?.id || '')).toBe('itinerary-day-' + DAY);
      await expect(named.getByText('10:00 Museum visit', { exact: true })).toBeVisible();

      const draft = await seedDraft(request);
      const draftPto = draft.pto_days_effective;
      await page.goto('/travel/trips/' + draft.id + '?day=' + DAY);
      const open = await expectDayReady(page, DAY);
      await expect(open.getByText('A free day. Add something when you\'re ready.', { exact: true })).toBeVisible();
      for (const iso of EARLIER) await expect(daySection(page, iso)).toHaveCount(0);
      await expect(page.locator('travel-trip-reminders')).toHaveCount(0);

      let failed = false;
      await page.route('**/travel/api/trips/' + draft.id + '/reminders', async (route) => {
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
      await openDayReminder(page, open, view.touch);
      const dialog = page.getByRole('dialog', { name: 'Add reminder', exact: true });
      const title = dialog.getByLabel('Reminder', { exact: true });
      await expect(title).toBeFocused();
      await dialog.getByRole('button', { name: 'Save reminder', exact: true }).click();
      const fieldError = dialog.locator('.ui-field__error', { hasText: 'Name the reminder.' });
      await expect(fieldError).toBeVisible();
      await expect(title).toBeFocused();
      const titleBox = await title.boundingBox();
      const errorBox = await fieldError.boundingBox();
      expect(Math.abs(errorBox.y - (titleBox.y + titleBox.height))).toBeLessThan(80);
      await title.fill('Pack light');
      await expect(dialog.locator('input[name="due"]')).toHaveValue(DAY + 'T00:00');
      await dialog.getByRole('button', { name: 'Save reminder', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('Save unavailable');
      await expect(title).toHaveValue('Pack light');
      const alertBox = await dialog.getByRole('alert').boundingBox();
      const dialogBox = await dialog.boundingBox();
      expect(alertBox.y).toBeGreaterThanOrEqual(dialogBox.y);
      expect(alertBox.y + alertBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height + 2);
      await dialog.getByRole('button', { name: 'Save reminder', exact: true }).click();
      await expect(dialog).toBeHidden();
      const row = open.getByRole('checkbox', { name: 'Pack light', exact: true });
      await expect(row).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.activeElement?.id || '')).toBe('itinerary-day-' + DAY);
      const addBox = await open.locator('.itinerary-day-add').boundingBox();
      const rowBox = await row.boundingBox();
      expect(Math.abs(rowBox.y - addBox.y)).toBeLessThan(480);
      await expectInView(page, row);

      const reminderRow = open.locator('article').filter({ hasText: 'Pack light' });
      await runRowAction(reminderRow, 'Edit reminder');
      const edit = page.getByRole('dialog', { name: 'Edit reminder', exact: true });
      const edited = edit.getByLabel('Reminder', { exact: true });
      await expect(edited).toHaveValue('Pack light');
      await expect(edit.locator('input[name="due"]')).toHaveValue(DAY + 'T00:00');
      await edited.fill('Pack lighter');
      await edit.getByRole('button', { name: 'Save reminder', exact: true }).click();
      await expect(edit).toBeHidden();
      await expect(open.getByRole('checkbox', { name: 'Pack lighter', exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.activeElement?.id || '')).toBe('itinerary-day-' + DAY);

      const saved = await (await request.get('/travel/api/trips/' + draft.id)).json();
      expect(saved.start_date).toBe(START);
      expect(saved.end_date).toBe(END);
      expect(saved.pto_days_effective).toBe(draftPto);
      expect(saved.days).toHaveLength(9);
      expect(saved.reminders).toHaveLength(1);
      expect(saved.reminders[0].title).toBe('Pack lighter');
      expect(String(saved.reminders[0].due_at)).toBe(DAY + 'T00:00');
      const bookedAfter = await (await request.get('/travel/api/trips/' + booked.id)).json();
      expect(bookedAfter.start_date).toBe(START);
      expect(bookedAfter.end_date).toBe(END);
      expect(bookedAfter.pto_days_effective).toBe(pto);
      expect(bookedAfter.transports[0].depart_tz).toBe('America/Los_Angeles');
      expect(bookedAfter.transports[0].arrive_tz).toBe('Europe/Lisbon');
      expect(bookedAfter.days.find((day) => day.on_date === DAY).items[0].title).toBe('Museum visit');
      expect(financeWrites).toEqual([]);
      await expectClean(page, violations);
    });

    test(`a held or failed load can be retried at ${view.width}px`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const trip = await seedDraft(request);
      const pending = [];
      await page.route('**/travel/api/trips/*', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().method() !== 'GET' || !path.endsWith('/trips/' + trip.id)) return route.continue();
        pending.push(route);
      });
      await page.goto('/travel/trips/' + trip.id + '?day=' + DAY);
      await expect.poll(() => pending.length).toBe(1);
      await expect(page.locator('main').getByRole('status', { name: 'Loading trip…', exact: true })).toBeVisible();
      const retry = page.getByRole('button', { name: 'Retry trip', exact: true });
      await expect(retry).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Open draft', exact: true })).toHaveCount(0);
      await retry.click();
      await expect.poll(() => pending.length).toBe(2);
      await pending[0].abort().catch(() => {});
      await pending[1].fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Trip unavailable' }),
      });
      const alert = page.getByRole('alert').filter({ hasText: "Couldn't load this trip." });
      await expect(alert).toContainText('Trip unavailable');
      await alert.getByRole('button', { name: 'Retry trip', exact: true }).click();
      await expect.poll(() => pending.length).toBe(3);
      await pending[2].continue();
      await expect(page.getByRole('heading', { level: 1, name: 'Open draft', exact: true })).toBeVisible();
      await expectDayReady(page, DAY);
      await expectClean(page, violations);
    });
  });
}
