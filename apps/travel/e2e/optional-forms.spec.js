import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

async function openTrip(page, request) {
  const created = await request.post('/travel/api/trips', { data: {
    title: 'Optional forms', start_date: '2026-12-01', end_date: '2026-12-03',
    stays: [{ city: 'Kyoto', arrive_on: '2026-12-01', leave_on: '2026-12-03' }],
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const trip = await created.json();
  await page.goto('/travel/trips/' + trip.id);
  await expect(page.getByRole('heading', { name: 'Optional forms', exact: true })).toBeVisible();
  return trip;
}

function dialog(page) {
  return page.getByRole('dialog');
}

function field(page, name) {
  return dialog(page).getByLabel(name);
}

async function more(page, name) {
  const menu = page.locator('details.add-menu');
  if (await menu.getAttribute('open') === null) await menu.locator('summary').click();
  await page.getByRole('button', { name, exact: true }).click();
}

async function retrySave(page, saveName, input, value) {
  await page.getByRole('button', { name: saveName, exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Save unavailable' })).toBeVisible();
  await expect(input).toHaveValue(value);
  await page.getByRole('button', { name: saveName, exact: true }).click();
  await expect(page.getByRole('button', { name: saveName, exact: true })).toHaveCount(0);
}

test('failed optional editors keep their draft and a retry saves one item', async ({ page, request }) => {
  const failed = new Set();
  await page.route(/\/travel\/api\/trips\/\d+\/(notes|reminders|plans|parking|budget-lines|stays|transports)$/, route => {
    if (route.request().method() !== 'POST') return route.continue();
    const url = new URL(route.request().url()).pathname;
    if (!failed.has(url)) {
      failed.add(url);
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Save unavailable' }) });
    }
    return route.continue();
  });
  await openTrip(page, request);

  await page.getByRole('button', { name: 'Add transport', exact: true }).click();
  await page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('drive');
  await page.getByLabel('From', { exact: true }).fill('Kyoto');
  await page.getByLabel('To', { exact: true }).fill('Osaka');
  await retrySave(page, 'Save transport', page.getByLabel('From', { exact: true }), 'Kyoto');
  await expect(page.getByRole('heading', { name: 'Drive', exact: true })).toHaveCount(1);

  await page.getByRole('button', { name: 'Add activity', exact: true }).click();
  await field(page, 'Activity title').fill('Tea');
  await dialog(page).getByText('Optional details', { exact: true }).click();
  await field(page, 'Place').fill('Gion');
  await retrySave(page, 'Save activity', field(page, 'Activity title'), 'Tea');
  await expect(page.getByText('Tea', { exact: true })).toBeVisible();
  await expect(page.getByText('Gion', { exact: true })).toBeVisible();

  await more(page, 'Add note');
  await field(page, 'Note').fill('Keep this note');
  await dialog(page).getByText('Optional date', { exact: true }).click();
  await field(page, 'Date').fill('2026-12-02');
  await retrySave(page, 'Save note', field(page, 'Note'), 'Keep this note');
  await expect(page.getByText('Keep this note', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove note', exact: true })).toHaveCount(1);

  await more(page, 'Add reminder');
  await field(page, 'Reminder').fill('Pack');
  await retrySave(page, 'Save reminder', field(page, 'Reminder'), 'Pack');
  await expect(page.getByRole('heading', { name: 'Pack', exact: true })).toHaveCount(1);

  await more(page, 'Add parking');
  await field(page, 'Parking place').fill('Garage');
  await field(page, 'Is parking needed?').selectOption('yes');
  await retrySave(page, 'Save parking', field(page, 'Parking place'), 'Garage');
  await expect(page.getByRole('heading', { name: 'Garage', exact: true })).toHaveCount(1);

  await more(page, 'Add cost');
  await field(page, 'Cost label').fill('Museum');
  await field(page, 'Amount').fill('12.50');
  await retrySave(page, 'Save cost', field(page, 'Cost label'), 'Museum');
  await expect(page.getByRole('button', { name: 'Remove cost', exact: true })).toHaveCount(1);

  await more(page, 'Add destination');
  await field(page, 'Destination city').fill('Osaka');
  await retrySave(page, 'Save destination', field(page, 'Destination city'), 'Osaka');
  await expect(page.getByRole('heading', { name: 'Osaka', exact: true })).toHaveCount(1);
});

test('keeping an open note retains it until the user discards it', async ({ page, request }) => {
  const trip = await openTrip(page, request);
  await more(page, 'Add note');
  const note = field(page, 'Note');
  await note.fill('Still typing');
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Discard this draft?' });
  await confirm.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/travel/trips/' + trip.id + '$'));
  await expect(note).toHaveValue('Still typing');
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await confirm.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove note', exact: true })).toHaveCount(0);
  const saved = await (await request.get('/travel/api/trips/' + trip.id)).json();
  expect(saved.note_entries).toEqual([]);
});
