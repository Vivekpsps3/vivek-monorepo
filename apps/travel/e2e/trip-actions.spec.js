import { expect, test } from '../../../tests/e2e/fixtures';
import { expectSectionHeading, openTripAdd } from './dates.mjs';

const ADD_ITEMS = [
  ['Transport', 'combobox', 'Mode'],
  ['Activity', 'textbox', 'Activity title'],
  ['Destination', 'textbox', 'Destination city'],
  ['Parking', 'textbox', 'Parking place'],
  ['Reminder', 'textbox', 'Reminder'],
  ['Note', 'textbox', 'Note'],
  ['Cost', 'textbox', 'Cost label'],
];

async function createTrip(request, title = 'Action trip') {
  const created = await request.post('/travel/api/trips', {
    data: { title, start_date: '2026-12-12', end_date: '2026-12-14' },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json();
}

async function seedRows(request, trip) {
  const base = '/travel/api/trips/' + trip.id;
  const posts = [
    ['/stays', { city: 'Lisbon', arrive_on: '2026-12-12', leave_on: '2026-12-14' }],
    ['/transports', { mode: 'train', role: 'outbound', depart_place: 'Home', arrive_place: 'Lisbon' }],
    ['/plans', { title: 'Museum', kind: 'activity', on_date: '2026-12-12' }],
    ['/parking', { place_name: 'Airport lot', necessary: 'yes', booked: true }],
    ['/notes', { body: 'Window seat' }],
    ['/reminders', { title: 'Pack charger' }],
    ['/budget-lines', { label: 'Museum pass', amount: '12.00', category: 'activity', currency: 'EUR', paid: false }],
  ];
  for (const [suffix, data] of posts) {
    const added = await request.post(base + suffix, { data });
    expect(added.ok(), await added.text()).toBeTruthy();
  }
}

async function discard(page) {
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('dialog', { name: 'Discard this draft?' }).getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

test('ACT1 keyboard opens every Add command on an empty trip', async ({ page, request }) => {
  const trip = await createTrip(request, 'Empty actions');
  await page.goto('/travel/trips/' + trip.id);
  const trigger = page.getByRole('button', { name: 'Add', exact: true });
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu', { name: 'Add' });
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Transport', 'Activity', 'Destination', 'Parking', 'Reminder', 'Note', 'Cost',
  ]);
  await expect(menu.getByRole('menuitem', { name: 'Transport', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();

  for (const [name, role, field] of ADD_ITEMS) {
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole(role, { name: field, exact: true })).toBeVisible();
    await discard(page);
  }
});

test.describe('ACT1 touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('touch opens Add and a row menu once', async ({ page, request }) => {
    const trip = await createTrip(request);
    await seedRows(request, trip);
    await page.goto('/travel/trips/' + trip.id);
    await page.getByRole('button', { name: 'Add', exact: true }).tap();
    const menu = page.getByRole('menu', { name: 'Add' });
    await expect(menu.getByRole('menuitem')).toHaveCount(7);
    await menu.getByRole('menuitem', { name: 'Note', exact: true }).tap();
    await expect(page.getByRole('dialog').getByLabel('Note', { exact: true })).toBeVisible();
    await discard(page);

    const note = page.locator('article').filter({ hasText: 'Window seat' });
    await note.getByRole('button', { name: 'Actions for Window seat', exact: true }).tap();
    await expect(note.getByRole('menuitem')).toHaveText(['Remove note']);
    await page.keyboard.press('Escape');
    await expect(note.getByRole('menuitem')).toHaveCount(0);
  });
});

for (const width of [390, 1280]) {
  test.describe(`ACT2 row actions at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 800 } });

    test(`one action per row, cards and currency totals stay at ${width}`, async ({ page, request }) => {
      const trip = await createTrip(request);
      await seedRows(request, trip);
      await page.goto('/travel/trips/' + trip.id);
      for (const name of ['Destinations', 'Itinerary', 'Notes', 'Reminders', 'Trip costs']) {
        await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
      }
      const narrow = width <= 640;
      await expect(page.getByRole('heading', { level: 2, name: 'Transport', exact: true })).toHaveCount(narrow ? 0 : 1);
      await expect(page.getByRole('heading', { level: 2, name: 'Parking', exact: true })).toHaveCount(narrow ? 0 : 1);
      await expect(page.locator('travel-trip-costs .cost-total')).toContainText('12.00');

      const rows = [
        ['Lisbon', ['Choose location', 'Edit destination', 'Remove']],
        ['Train', ['Edit transport', 'Remove']],
        ['Museum', ['Edit activity', 'Remove']],
        ['Airport lot', ['Edit parking', 'Remove']],
        ['Window seat', ['Remove note']],
        ['Pack charger', ['Remove']],
        ['Museum pass', ['Edit cost', 'Remove cost']],
      ];
      for (const [label, actions] of rows) {
        const row = page.locator('article').filter({ hasText: label }).filter({
          has: page.locator('.row-actions--menu, .itinerary-actions--menu'),
        }).first();
        const trigger = row.getByRole('button', { name: 'Actions for ' + label, exact: true });
        if (narrow) {
          await expect(trigger).toBeVisible();
          await expect(row.locator('.row-actions--inline, .itinerary-actions--inline')).toBeHidden();
          await trigger.focus();
          await page.keyboard.press('ArrowDown');
          await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(actions);
          await expect(page.getByRole('menuitem').first()).toBeFocused();
          await page.keyboard.press('Escape');
          await expect(trigger).toBeFocused();
        } else {
          await expect(trigger).toHaveCount(0);
          await expect(row.locator('.row-actions--menu, .itinerary-actions--menu')).toBeHidden();
          await expect(row.getByRole('button', { name: actions[0], exact: true })).toBeVisible();
        }
      }
      await expect(page.getByRole('menuitem')).toHaveCount(0);

      const deleteTrip = page.getByRole('button', { name: 'Delete trip', exact: true });
      await expect(deleteTrip).toBeVisible();
      expect(await deleteTrip.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}

test('DELETE1 cancel, wrong text, failed delete, and retry focus Trips', async ({ page, request }) => {
  const trip = await createTrip(request, 'Kyoto Week');
  await page.goto('/travel/trips/' + trip.id);
  const deletes = [];
  await page.route('**/travel/api/trips/' + trip.id, async route => {
    if (route.request().method() !== 'DELETE') return route.continue();
    deletes.push({ method: route.request().method(), body: route.request().postData() });
    if (deletes.length === 1) {
      return route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Delete unavailable' }),
      });
    }
    return route.continue();
  });

  await page.getByRole('button', { name: 'Delete trip', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete Kyoto Week?', exact: true });
  await dialog.getByRole('button', { name: 'Keep trip', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(deletes).toEqual([]);

  await page.getByRole('button', { name: 'Delete trip', exact: true }).click();
  const phrase = dialog.getByRole('textbox', { name: 'Type Kyoto Week to confirm', exact: true });
  const confirm = dialog.getByRole('button', { name: 'Delete trip', exact: true });
  await expect(confirm).toHaveAttribute('aria-disabled', 'true');
  await phrase.fill('Kyoto week');
  await expect(confirm).toHaveAttribute('aria-disabled', 'true');
  await confirm.click({ force: true });
  await phrase.press('Enter');
  await expect(dialog).toBeVisible();
  expect(deletes).toEqual([]);
  expect((await request.get('/travel/api/trips/' + trip.id)).ok()).toBeTruthy();

  await phrase.fill('Kyoto Week');
  await expect(confirm).not.toHaveAttribute('aria-disabled', 'true');
  await confirm.click();
  const failure = dialog.getByRole('alert');
  await expect(failure).toHaveCount(1);
  await expect(failure).toHaveText("Couldn't delete this trip. Nothing was deleted. Try again.");
  await expect(phrase).toHaveValue('Kyoto Week');
  await expect(phrase).toBeFocused();
  expect(deletes).toEqual([{ method: 'DELETE', body: null }]);

  await confirm.click();
  await expect(page).toHaveURL(/\/travel$/);
  await expect(await expectSectionHeading(page, 'Trips')).toBeFocused();
  expect(deletes).toHaveLength(2);
  expect(deletes[1]).toEqual({ method: 'DELETE', body: null });
  expect((await request.get('/travel/api/trips/' + trip.id)).status()).toBe(404);
});

test('ACT1 menu item opens the matching editor from the keyboard', async ({ page, request }) => {
  const trip = await createTrip(request);
  await page.goto('/travel/trips/' + trip.id);
  await page.getByRole('button', { name: 'Add', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Transport', exact: true })).toBeFocused();
  for (let step = 0; step < 6; step += 1) await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Cost', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByLabel('Cost label', { exact: true })).toBeVisible();
  await discard(page);
  await openTripAdd(page, 'Reminder');
  await expect(page.getByRole('dialog').getByLabel('Reminder', { exact: true })).toBeVisible();
});
