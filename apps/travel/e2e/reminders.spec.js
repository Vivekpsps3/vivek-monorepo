import { expect, test } from '../../../tests/e2e/fixtures';
import { removeRow } from './dates.mjs';

// T3 e2e. Seeded through the API like undo.spec.js. Due dates are built
// relative to the test's Date.now() in local time, matching the component's
// local wall-time "now" (never a server date).
// Playwright matrix: every test runs at 390x844 and 1280x800, light and dark.

const COMBOS = [
  { width: 390, height: 844, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
  { width: 1280, height: 800, theme: 'light' },
  { width: 1280, height: 800, theme: 'dark' },
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

function localMinute(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function daysFromNow(days, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return localMinute(date);
}

async function seedTrip(request, reminders = []) {
  const created = await request.post('/travel/api/trips', {
    data: { title: 'Reminders trip', start_date: '2027-01-01', end_date: '2027-01-03' },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const trip = await created.json();
  for (const reminder of reminders) {
    const added = await request.post('/travel/api/trips/' + trip.id + '/reminders', { data: reminder });
    expect(added.ok(), await added.text()).toBeTruthy();
  }
  return trip;
}

async function openReminders(page, trip) {
  await page.goto('/travel/trips/' + trip.id);
  const section = page.locator('travel-trip-reminders');
  await expect(section.getByRole('heading', { name: 'Reminders', exact: true })).toBeVisible();
  return section;
}

function groupList(section, heading) {
  return section.locator(`h3:text-is("${heading}") + ul`);
}

for (const combo of COMBOS) {
  test.describe(`reminders [${combo.width} ${combo.theme}]`, () => {
    test.use({ viewport: { width: combo.width, height: combo.height } });

    test.beforeEach(async ({ page, request }) => {
      expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
      await page.addInitScript((theme) => {
        try {
          localStorage.setItem('suite-theme', theme);
        } catch {
          // Storage may be unavailable before the first navigation.
        }
      }, combo.theme);
    });

    test(`[${combo.width} ${combo.theme}] due soon group shows overdue badge and sorts by due`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const trip = await seedTrip(request, [
        { title: 'Later one', due_at: daysFromNow(20) },
        { title: 'Soon one', due_at: daysFromNow(2) },
        { title: 'Overdue one', due_at: daysFromNow(-1) },
      ]);
      const section = await openReminders(page, trip);
      const soon = groupList(section, 'Due soon');
      await expect(soon.locator('label')).toHaveText(['Overdue one', 'Soon one']);
      const overdueRow = soon.locator('article.trip-row').filter({ hasText: 'Overdue one' });
      await expect(overdueRow.getByText('Overdue', { exact: true })).toHaveCount(1);
      const soonRow = soon.locator('article.trip-row').filter({ hasText: 'Soon one' });
      await expect(soonRow.getByText('Overdue', { exact: true })).toHaveCount(0);
      const later = groupList(section, 'Later');
      await expect(later.locator('label')).toHaveText(['Later one']);
      await expectClean(page, violations);
    });

    test(`[${combo.width} ${combo.theme}] checkbox marks done in one tap and moves to Done`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const trip = await seedTrip(request, [{ title: 'Tap done', due_at: daysFromNow(20) }]);
      const section = await openReminders(page, trip);
      await section.getByRole('checkbox', { name: 'Tap done', exact: true }).check();
      const done = groupList(section, 'Done');
      await expect(done.locator('label')).toHaveText(['Tap done']);
      await expect(done.getByRole('checkbox', { name: 'Tap done', exact: true })).toBeChecked();
      await page.reload();
      const reloaded = page.locator('travel-trip-reminders');
      await expect(groupList(reloaded, 'Done').locator('label')).toHaveText(['Tap done']);
      await expect(groupList(reloaded, 'Done').getByRole('checkbox', { name: 'Tap done', exact: true })).toBeChecked();
      const saved = await (await request.get('/travel/api/trips/' + trip.id)).json();
      expect(saved.reminders.find((row) => row.title === 'Tap done').done).toBe(true);
      await expectClean(page, violations);
    });

    test(`[${combo.width} ${combo.theme}] failed toggle reverts`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const trip = await seedTrip(request, [{ title: 'Fragile', due_at: daysFromNow(20) }]);
      await page.route('**/travel/api/reminders/*', async (route) => {
        if (route.request().method() !== 'PATCH') return route.continue();
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Toggle unavailable' }),
        });
      });
      const section = await openReminders(page, trip);
      await section.getByRole('checkbox', { name: 'Fragile', exact: true }).check();
      const tripAlert = page.locator('main').getByRole('alert').filter({ hasText: 'Toggle unavailable' });
      await expect(tripAlert).toHaveCount(1);
      await expect(tripAlert).toContainText('Toggle unavailable');
      await expect(page.locator('.toast-region[role="alert"]')).not.toContainText('Toggle unavailable');
      await expect(section.getByRole('checkbox', { name: 'Fragile', exact: true })).not.toBeChecked();
      await expect(section.getByRole('heading', { name: 'Done', exact: true })).toHaveCount(0);
      await expectClean(page, violations);
    });

    test(`[${combo.width} ${combo.theme}] inline add posts title only and clears`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const trip = await seedTrip(request);
      let posted = null;
      await page.route('**/travel/api/trips/' + trip.id + '/reminders', async (route) => {
        if (route.request().method() === 'POST') posted = route.request().postDataJSON();
        await route.continue();
      });
      const section = await openReminders(page, trip);
      await section.getByLabel('New reminder').fill('Book the airport shuttle');
      await section.getByRole('button', { name: 'Add to list', exact: true }).click();
      // No Due soon group, so the new row lands in the unheaded Later list.
      await expect(section.locator('ul.reminder-list label')).toHaveText(['Book the airport shuttle']);
      await expect(section.getByLabel('New reminder')).toHaveValue('');
      expect(posted).toEqual({ title: 'Book the airport shuttle' });
      const row = section.locator('article.trip-row').filter({ hasText: 'Book the airport shuttle' });
      await expect(row.locator('.reminder-due')).toBeEmpty();
      await expectClean(page, violations);
    });

    test(`[${combo.width} ${combo.theme}] inline add validates`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const trip = await seedTrip(request);
      const section = await openReminders(page, trip);
      const input = section.getByLabel('New reminder');
      await section.getByRole('button', { name: 'Add to list', exact: true }).click();
      await expect(section.getByText('Enter a reminder.', { exact: true })).toBeVisible();
      await expect(input).toBeFocused();
      await input.fill('x'.repeat(201));
      await section.getByRole('button', { name: 'Add to list', exact: true }).click();
      await expect(section.getByText('Keep it under 200 characters.', { exact: true })).toBeVisible();
      await expect(input).toBeFocused();
      await expectClean(page, violations);
    });

    test(`[${combo.width} ${combo.theme}] no raw ISO due text`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const trip = await seedTrip(request, [
        { title: 'Dated', due_at: daysFromNow(2) },
        { title: 'Undated' },
      ]);
      const section = await openReminders(page, trip);
      await expect(section.locator('ul.reminder-list label')).toHaveCount(2);
      const text = await section.innerText();
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      await expectClean(page, violations);
    });

    test(`[${combo.width} ${combo.theme}] empty state then first reminder`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const trip = await seedTrip(request);
      const section = await openReminders(page, trip);
      await expect(section.getByText("No reminders yet. Add the things you don't want to forget.", { exact: true })).toBeVisible();
      await section.getByLabel('New reminder').fill('First one');
      await section.getByRole('button', { name: 'Add to list', exact: true }).click();
      await expect(section.locator('ul.reminder-list label')).toHaveText(['First one']);
      await expect(section.getByText("No reminders yet. Add the things you don't want to forget.", { exact: true })).toHaveCount(0);
      await expectClean(page, violations);
    });

    test(`[${combo.width} ${combo.theme}] failed restore keeps the reminder gone until retry`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const trip = await seedTrip(request, [{ title: 'Restore reminder', done: false }]);
      const section = await openReminders(page, trip);
      const row = section.locator('article').filter({ hasText: 'Restore reminder' });
      await expect(row).toHaveCount(1);
      if (combo.width <= 640) {
        await expect(row.locator('.row-actions--menu')).toBeVisible();
        await expect(row.locator('.row-actions--inline')).toBeHidden();
      } else {
        await expect(row.locator('.row-actions--inline')).toBeVisible();
        await expect(row.locator('.row-actions--menu')).toBeHidden();
      }
      let posted = null;
      let failed = false;
      await page.route('**/travel/api/trips/' + trip.id + '/reminders', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        posted = route.request().postDataJSON();
        if (!failed) {
          failed = true;
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Restore unavailable' }) });
        }
        return route.continue();
      });
      await removeRow(row);
      await expect(row).toHaveCount(0);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      const restoreAlert = page.getByRole('alert').filter({ hasText: 'Restore unavailable' });
      await expect(restoreAlert).toHaveCount(1);
      await expect(restoreAlert).toContainText('Restore unavailable');
      await expect(page.locator('main').getByRole('alert').filter({ hasText: 'Restore unavailable' })).toHaveCount(0);
      await expect(row).toHaveCount(0);
      await restoreAlert.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(section.getByRole('checkbox', { name: 'Restore reminder', exact: true })).toBeVisible();
      expect(posted).toMatchObject({ title: 'Restore reminder', done: false });
      await expectClean(page, violations);
    });
  });
}
