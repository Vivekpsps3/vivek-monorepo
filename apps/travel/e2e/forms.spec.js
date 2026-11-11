import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../../tests/e2e/fixtures';
import { openTripAdd } from './dates.mjs';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

function trackWrites(page) {
  const writes = [];
  page.on('request', (request) => {
    const method = request.method();
    if ((method === 'POST' || method === 'PATCH') && request.url().includes('/travel/api/')) {
      writes.push({ method, url: new URL(request.url()).pathname, body: request.postDataJSON() });
    }
  });
  return writes;
}

async function linked(control, message) {
  await expect(control).toBeFocused();
  await expect(control).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await control.getAttribute('aria-describedby');
  expect(describedBy, 'the error is linked from the field').toBeTruthy();
  const id = describedBy.split(/\s+/).find((part) => part.endsWith('-error'));
  await expect(control.page().locator(`[id="${id}"]`)).toContainText(message);
}

async function requestSubmit(form) {
  await expect(form).toHaveJSProperty('noValidate', true);
  await form.evaluate((node) => node.requestSubmit());
}

async function discard(page) {
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Discard this draft?' });
  await confirm.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function createTrip(request) {
  const response = await request.post('/travel/api/trips', {
    data: {
      title: 'Form trip',
      start_date: '2026-12-01',
      end_date: '2026-12-03',
      stays: [{ city: 'Kyoto', arrive_on: '2026-12-01', leave_on: '2026-12-03' }],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test.describe('FORM1 empty trip forms', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('new trip explains dates and the city, then a fresh visit has no errors', async ({ page }) => {
    const writes = trackWrites(page);
    await page.goto('/travel/trips/new');
    const form = page.locator('form.travel-form');
    const save = page.getByRole('button', { name: 'Save trip', exact: true });
    await expect(save).toBeEnabled();
    const departure = page.getByLabel('Departure date');
    await requestSubmit(form);
    await linked(departure, 'Pick the day you leave and the day you come back.');
    expect(writes).toEqual([]);
    await departure.fill('2026-12-01');
    await expect(departure).not.toHaveAttribute('aria-invalid', 'true');
    const returning = page.getByLabel('Return date');
    await requestSubmit(form);
    await linked(returning, 'Pick the day you leave and the day you come back.');
    expect(writes).toEqual([]);
    await returning.fill('2026-12-03');
    const city = page.getByLabel('Destination city');
    await expect(city).toBeVisible();
    await requestSubmit(form);
    await linked(city, 'Name every destination.');
    expect(writes).toEqual([]);
    await page.getByRole('link', { name: 'Cancel', exact: true }).click();
    await page.getByRole('dialog', { name: 'Leave this trip draft?' }).getByRole('button', { name: 'Leave draft', exact: true }).click();
    await page.goto('/travel/trips/new');
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(page.getByLabel('Departure date')).toHaveValue('');
  });

  test('edit trip, activity, destination, and cost clear the first error and reset on reopen', async ({ page, request }) => {
    const trip = await createTrip(request);
    expect((await request.post(`/travel/api/trips/${trip.id}/plans`, {
      data: { on_date: '2026-12-01', title: 'Tea', kind: 'activity' },
    })).ok()).toBeTruthy();
    expect((await request.post(`/travel/api/trips/${trip.id}/budget-lines`, {
      data: { category: 'other', label: 'Museum', amount: '12.00', currency: 'USD' },
    })).ok()).toBeTruthy();
    const writes = trackWrites(page);
    await page.goto('/travel/trips/' + trip.id);
    await expect(page.getByRole('heading', { name: 'Form trip', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const edit = dialog.locator('form');
    await dialog.getByLabel('Trip name').fill('');
    await dialog.getByLabel('Departure date').fill('');
    await dialog.getByLabel('Return date').fill('');
    await requestSubmit(edit);
    const title = dialog.getByLabel('Trip name');
    await linked(title, 'Give the trip a name.');
    expect(writes.filter((item) => item.method === 'PATCH')).toEqual([]);
    await title.fill('Form trip');
    await expect(title).not.toHaveAttribute('aria-invalid', 'true');
    await requestSubmit(edit);
    await linked(dialog.getByLabel('Departure date'), 'Pick the day you leave and the day you come back.');
    expect(writes.filter((item) => item.method === 'PATCH')).toEqual([]);
    await discard(page);
    await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(dialog.getByLabel('Trip name')).toHaveValue('Form trip');
    await discard(page);

    await page.getByRole('button', { name: 'Edit activity', exact: true }).click();
    const activity = dialog.locator('form');
    await dialog.getByLabel('Activity title').fill('');
    await dialog.getByLabel('Date', { exact: true }).fill('');
    await requestSubmit(activity);
    const activityTitle = dialog.getByLabel('Activity title');
    await linked(activityTitle, 'Name this plan.');
    expect(writes.filter((item) => item.url.includes('/plans'))).toEqual([]);
    await activityTitle.fill('Tea');
    await expect(activityTitle).not.toHaveAttribute('aria-invalid', 'true');
    await requestSubmit(activity);
    await linked(dialog.getByLabel('Date', { exact: true }), 'Pick the date.');
    expect(writes.filter((item) => item.url.includes('/plans'))).toEqual([]);
    await discard(page);
    await page.getByRole('button', { name: 'Edit activity', exact: true }).click();
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await discard(page);

    await page.getByRole('button', { name: 'Edit destination', exact: true }).click();
    const stay = dialog.locator('form');
    await dialog.getByLabel('Destination city').fill('');
    await dialog.getByLabel('First day').fill('');
    await dialog.getByLabel('Last day').fill('');
    await requestSubmit(stay);
    const city = dialog.getByLabel('Destination city');
    await linked(city, 'Name the city.');
    expect(writes.filter((item) => item.url.includes('/stays'))).toEqual([]);
    await city.fill('Kyoto');
    await expect(city).not.toHaveAttribute('aria-invalid', 'true');
    await requestSubmit(stay);
    await linked(dialog.getByLabel('First day'), 'Pick the first day and the last day.');
    expect(writes.filter((item) => item.url.includes('/stays'))).toEqual([]);
    await discard(page);
    await page.getByRole('button', { name: 'Edit destination', exact: true }).click();
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await discard(page);

    await page.getByRole('button', { name: 'Edit cost', exact: true }).click();
    const cost = dialog.locator('form');
    await dialog.getByLabel('Cost label').fill('');
    await dialog.getByLabel('Amount').fill('');
    await requestSubmit(cost);
    const label = dialog.getByLabel('Cost label');
    await linked(label, 'Name this cost.');
    expect(writes.filter((item) => item.url.includes('/budget-lines'))).toEqual([]);
    await label.fill('Museum');
    await expect(label).not.toHaveAttribute('aria-invalid', 'true');
    await requestSubmit(cost);
    await linked(dialog.getByLabel('Amount'), 'Enter an amount.');
    expect(writes.filter((item) => item.url.includes('/budget-lines'))).toEqual([]);
    await discard(page);
    await page.getByRole('button', { name: 'Edit cost', exact: true }).click();
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await discard(page);
  });

  test('note, reminder, activity, and place search explain on submit and reset when reopened', async ({ page, request }) => {
    const trip = await createTrip(request);
    const writes = trackWrites(page);
    const reads = [];
    page.on('request', (request) => {
      if (request.method() === 'GET' && request.url().includes('/places/search')) reads.push(request.url());
    });
    await page.goto('/travel/trips/' + trip.id);
    const dialog = page.getByRole('dialog');

    await openTripAdd(page, 'Note');
    const noteForm = dialog.locator('form');
    await requestSubmit(noteForm);
    const note = dialog.getByLabel('Note', { exact: true });
    await linked(note, 'Write the note.');
    expect(writes.filter((item) => item.url.includes('/notes'))).toEqual([]);
    await note.fill('Keep this note');
    await expect(note).not.toHaveAttribute('aria-invalid', 'true');
    await discard(page);
    await openTripAdd(page, 'Note');
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(dialog.getByLabel('Note', { exact: true })).toHaveValue('');
    await discard(page);

    await openTripAdd(page, 'Reminder');
    const reminderForm = dialog.locator('form');
    await requestSubmit(reminderForm);
    const reminder = dialog.getByLabel('Reminder', { exact: true });
    await linked(reminder, 'Name the reminder.');
    expect(writes.filter((item) => item.url.includes('/reminders'))).toEqual([]);
    await reminder.fill('Pack');
    await expect(reminder).not.toHaveAttribute('aria-invalid', 'true');
    await discard(page);
    await openTripAdd(page, 'Reminder');
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await discard(page);

    await openTripAdd(page, 'Activity');
    const activity = dialog.locator('form');
    await dialog.getByLabel('Date', { exact: true }).fill('');
    await requestSubmit(activity);
    const activityTitle = dialog.getByLabel('Activity title');
    await linked(activityTitle, 'Name this plan.');
    await activityTitle.fill('Walk');
    await expect(activityTitle).not.toHaveAttribute('aria-invalid', 'true');
    await requestSubmit(activity);
    await linked(dialog.getByLabel('Date', { exact: true }), 'Pick the date.');
    expect(writes.filter((item) => item.url.includes('/plans'))).toEqual([]);
    await discard(page);
    await openTripAdd(page, 'Activity');
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await discard(page);

    await page.getByRole('button', { name: 'Choose location', exact: true }).click();
    const search = dialog.locator('form');
    const query = dialog.getByLabel('Place search');
    await query.fill('');
    await requestSubmit(search);
    await linked(query, 'Enter a place name between 2 and 200 characters.');
    expect(reads).toEqual([]);
    await query.fill('Ky');
    await expect(query).not.toHaveAttribute('aria-invalid', 'true');
    await discard(page);
    await page.getByRole('button', { name: 'Choose location', exact: true }).click();
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await discard(page);
  });
});

test('FORM2 an unchosen transport mode cannot save and omitted parking can', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const trip = await createTrip(request);
  const writes = trackWrites(page);
  await page.goto('/travel/trips/' + trip.id);
  await openTripAdd(page, 'Transport');
  const dialog = page.getByRole('dialog');
  const form = dialog.locator('form');
  const mode = dialog.getByRole('combobox', { name: 'Mode', exact: true });
  await expect(mode).toBeVisible();
  await expect(mode).toHaveValue('');
  await expect(dialog.getByLabel('Flight number')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Save transport', exact: true })).toBeEnabled();
  await requestSubmit(form);
  await linked(mode, 'Choose a way to travel.');
  expect(writes.filter((item) => item.url.includes('/transports'))).toEqual([]);
  await mode.evaluate((node) => {
    const option = document.createElement('option');
    option.value = 'rocket';
    option.textContent = 'Rocket';
    node.append(option);
    node.value = 'rocket';
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await requestSubmit(form);
  await linked(mode, 'Choose a way to travel.');
  expect(writes.filter((item) => item.url.includes('/transports'))).toEqual([]);
  await mode.selectOption('drive');
  await expect(mode).not.toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByLabel('Flight number')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save transport', exact: true }).click();
  await expect(dialog).toBeHidden();
  const transportWrites = writes.filter((item) => item.url.includes('/transports'));
  expect(transportWrites).toHaveLength(1);
  expect(transportWrites[0].body.mode).toBe('drive');
  expect(transportWrites[0].body.depart_place ?? null).toBeNull();
  await openTripAdd(page, 'Transport');
  await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Mode', exact: true })).toHaveValue('');
  await discard(page);

  await openTripAdd(page, 'Parking');
  await expect(dialog.getByText('Name this parking.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save parking', exact: true }).click();
  await expect(dialog).toBeHidden();
  const parkingWrites = writes.filter((item) => item.url.endsWith('/parking'));
  expect(parkingWrites).toHaveLength(1);
  expect(parkingWrites[0].body.place_name ?? null).toBeNull();
  const saved = await (await request.get('/travel/api/trips/' + trip.id)).json();
  expect(saved.transports.map((item) => item.mode)).toEqual(['drive']);
  expect(saved.parking).toHaveLength(1);
  expect(saved.parking[0].place_name).toBeFalsy();
});

test('FORM3 a failed note save keeps the draft and the retry sends that body', async ({ page, request }) => {
  const trip = await createTrip(request);
  const bodies = [];
  await page.route(/\/travel\/api\/trips\/\d+\/notes$/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON();
    bodies.push(body);
    if (bodies.length === 1) {
      return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ message: 'Save unavailable' }) });
    }
    return route.continue();
  });
  await page.goto('/travel/trips/' + trip.id);
  await openTripAdd(page, 'Note');
  const dialog = page.getByRole('dialog');
  const note = dialog.getByLabel('Note', { exact: true });
  await note.fill('Keep this note');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Save unavailable');
  await expect(note).toHaveValue('Keep this note');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(bodies.map((body) => body.body)).toEqual(['Keep this note', 'Keep this note']);
  await expect(page.getByText('Keep this note', { exact: true })).toBeVisible();
});

test('FORM3 skip link, focus, day choice, mobile controls, and screenshot path', async ({ page, request }) => {
  const trip = await createTrip(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/travel/trips/' + trip.id);
  await expect(page.getByRole('heading', { name: 'Form trip', exact: true })).toBeVisible();

  const skip = page.locator('.skip-link');
  await skip.focus();
  const skipBox = await skip.boundingBox();
  expect(skipBox.height).toBeGreaterThanOrEqual(44);
  expect(skipBox.y).toBeGreaterThanOrEqual(0);
  expect(skipBox.x).toBeGreaterThanOrEqual(0);
  expect(skipBox.x + skipBox.width).toBeLessThanOrEqual(391);
  const skipRing = await skip.evaluate((node) => {
    const style = getComputedStyle(node);
    return node.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  });
  expect(skipRing).toBe(true);
  // The document base is "/", so activating this hash leaves the trip route.
  // The retained check is the named target and that the target can take focus.
  await expect(skip).toHaveAttribute('href', '#workspace-content');
  const target = page.locator('#workspace-content');
  await expect(target).toHaveAttribute('tabindex', '-1');
  await skip.evaluate((node) => {
    const id = node.getAttribute('href').replace(/^#/, '');
    document.getElementById(id).focus();
  });
  await expect(target).toBeFocused();

  const day = page.locator('.day-strip-tab').first();
  await expect(day).toBeVisible();
  const dayBox = await day.boundingBox();
  expect(dayBox.height).toBeGreaterThanOrEqual(44);
  const dayStyle = await day.evaluate((node) => {
    const style = getComputedStyle(node);
    return { minHeight: parseFloat(style.minHeight), border: parseFloat(style.borderTopWidth) };
  });
  expect(dayStyle.minHeight).toBeGreaterThanOrEqual(44);
  expect(dayStyle.border).toBeGreaterThan(0);
  await day.focus();
  const dayRing = await day.evaluate((node) => node.matches(':focus-visible') && parseFloat(getComputedStyle(node).outlineWidth) > 0);
  expect(dayRing).toBe(true);

  await page.goto('/travel/trips/new');
  const save = page.getByRole('button', { name: 'Save trip', exact: true });
  await expect(save).toBeEnabled();
  const saveBox = await save.boundingBox();
  expect(saveBox.height).toBeGreaterThanOrEqual(44);
  expect(saveBox.x).toBeGreaterThanOrEqual(0);
  expect(saveBox.x + saveBox.width).toBeLessThanOrEqual(391);
  const departure = page.getByLabel('Departure date');
  await departure.focus();
  const fieldRing = await departure.evaluate((node) => node.matches(':focus-visible') && parseFloat(getComputedStyle(node).outlineWidth) > 0);
  expect(fieldRing).toBe(true);

  const dir = process.env.SCREENSHOT_DIR || test.info().outputPath('shots');
  fs.mkdirSync(dir, { recursive: true });
  const widths = (process.env.SHOT_WIDTHS || '390').split(',').map(Number);
  const width = widths[0];
  await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
  const file = path.join(dir, `form-check-${width}.png`);
  await page.screenshot({ path: file, fullPage: true });
  expect(fs.existsSync(file)).toBe(true);
  expect(fs.statSync(file).size).toBeGreaterThan(100);
});
