import { expect, test } from '@playwright/test';

const cases = [
  ['stays', 'destination', { city: 'Restore destination', arrive_on: '2026-12-01', leave_on: '2026-12-03', notes: 'Keep lodging note' }],
  ['transports', 'transport', { mode: 'train', role: 'outbound', depart_place: 'Restore transport', arrive_place: 'Osaka', cost: '25.50', currency: 'JPY', paid: true }],
  ['plans', 'activity', { title: 'Restore activity', kind: 'restaurant', on_date: '2026-12-02', notes: 'Keep activity note' }],
  ['parking', 'parking', { place_name: 'Restore parking', necessary: 'yes', booked: true, cost: '10', currency: 'USD', confirmation: 'ABC' }],
  ['notes', 'note', { body: 'Restore note', on_date: '2026-12-02' }],
  ['reminders', 'reminder', { title: 'Restore reminder', done: true, kind: 'packing', notes: 'Keep reminder note' }],
  ['budget-lines', 'cost', { label: 'Restore cost', amount: '12.50', category: 'food', currency: 'JPY', paid: true }],
];
const rows = (trip, collection) => ({ stays: trip.stays, transports: trip.transports, plans: trip.days.flatMap(day => day.items), parking: trip.parking, notes: trip.note_entries, reminders: trip.reminders, 'budget-lines': trip.budget.manual })[collection];

test.beforeEach(async ({ request }) => { expect((await request.post('/e2e/reset')).ok()).toBeTruthy(); });
for (const [collection, label, body] of cases) test(`removing ${label} offers Undo and a failed restore can retry once`, async ({ page, request }) => {
  const created = await request.post('/travel/api/trips', { data: { title: 'Undo trip', start_date: '2026-12-01', end_date: '2026-12-03' } });
  const trip = await created.json();
  const endpoint = '/travel/api/trips/' + trip.id + '/' + collection;
  const added = await request.post(endpoint, { data: body });
  expect(added.ok(), await added.text()).toBeTruthy();
  const before = rows(await added.json(), collection)[0];
  await page.goto('/travel/trips/' + trip.id);
  const row = page.locator('article.trip-row').filter({ hasText: 'Restore ' + label });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: /^Remove/ }).click();
  await expect(row).toHaveCount(0);
  let failed = false;
  await page.route('**' + endpoint, async route => {
    if (failed) return route.continue();
    failed = true;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Restore unavailable' }) });
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Restore unavailable');
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(row).toHaveCount(1);
  const saved = await (await request.get('/travel/api/trips/' + trip.id)).json();
  expect(rows(saved, collection)).toHaveLength(1);
  const restored = rows(saved, collection)[0];
  const { id: _id, created_at: _createdAt, ...fields } = before;
  expect(restored).toMatchObject(fields);
});

test('PTO typed during a save stays a draft until the next save', async ({ page, request }) => {
  const trip = await (await request.post('/travel/api/trips', { data: { title: 'PTO save race', start_date: '2026-12-01', end_date: '2026-12-02' } })).json();
  await page.goto('/travel/trips/' + trip.id);
  await page.locator('summary').filter({ hasText: /^PTO ·/ }).click();
  const choice = page.getByRole('combobox', { name: '2026-12-01', exact: true });
  await choice.selectOption({ label: 'Half day' });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let stored;
  const saved = new Promise(resolve => { stored = resolve; });
  await page.route('**/travel/api/trips/' + trip.id, async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const response = await route.fetch();
    stored();
    await gate;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Save PTO dates' }).click();
  await saved;
  await choice.selectOption({ label: 'Not PTO' });
  release();
  await expect(page.getByRole('button', { name: 'Save PTO dates' })).toBeEnabled();
  await expect(choice.locator('option:checked')).toHaveText('Not PTO');
  let persisted = await (await request.get('/travel/api/trips/' + trip.id)).json();
  expect(Number(persisted.pto_dates.find(day => day.on_date === '2026-12-01').amount)).toBe(0.5);
  await page.getByRole('button', { name: 'Save PTO dates' }).click();
  await expect.poll(async () => {
    persisted = await (await request.get('/travel/api/trips/' + trip.id)).json();
    return Number(persisted.pto_dates.find(day => day.on_date === '2026-12-01').amount);
  }).toBe(0);
});
