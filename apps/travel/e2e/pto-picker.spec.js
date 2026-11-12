import { expect, test } from '../../../tests/e2e/fixtures';
import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';
import { formatDay, ptoOption } from './dates.mjs';

const START = '2026-12-14';
const MIDDLE = '2026-12-15';
const END = '2026-12-16';
const SAME = [[START, '1'], [MIDDLE, '0.5'], [END, '0']];

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

function dayAmounts(body) {
  return body.pto_dates.map((row) => [row.on_date, String(row.amount)]);
}

async function chooseSame(page) {
  await ptoOption(page, START, 'None').click();
  await ptoOption(page, START, 'Full').click();
  await expect(ptoOption(page, START, 'Full')).toBeChecked();
  await ptoOption(page, MIDDLE, 'Half').click();
  await expect(ptoOption(page, MIDDLE, 'Half')).toBeChecked();
  const full = ptoOption(page, END, 'Full');
  await full.focus();
  await expect(full).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(ptoOption(page, END, 'Half')).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(ptoOption(page, END, 'None')).toBeChecked();
  await expect(page.getByText('1.5 PTO days selected.')).toBeVisible();
  await expect(page.locator('.pto-day-date', { hasText: formatDay(START) })).toBeVisible();
}

test('PICK1 a new trip chooses Full, Half, and None and sends that allocation', async ({ page }) => {
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill(START);
  await page.getByLabel('Return date').fill(END);
  await page.getByLabel('Destination city').fill('Lisbon');
  await page.getByText('Time off', { exact: true }).click();
  await expect(page.getByText('3 PTO days selected.')).toBeVisible();
  let posted;
  await page.route('**/travel/api/trips', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posted = route.request().postDataJSON();
    await route.continue();
  });
  await chooseSame(page);
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lisbon', exact: true })).toBeVisible();
  expect(dayAmounts(posted)).toEqual(SAME);
  expect(posted.counts_as_pto).toBe(true);
});

test('PICK1 an existing trip sends the same Full, Half, and None allocation', async ({ page, request }) => {
  const created = await request.post('/travel/api/trips', {
    data: {
      title: 'Lisbon',
      start_date: START,
      end_date: END,
      stays: [{ city: 'Lisbon', arrive_on: START, leave_on: END }],
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const trip = await created.json();
  await page.goto('/travel/trips/' + trip.id);
  await page.getByText('PTO · 3 days', { exact: true }).click();
  await expect(page.getByText('3 PTO days selected.')).toBeVisible();
  let patched;
  await page.route('**/travel/api/trips/' + trip.id, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patched = route.request().postDataJSON();
    await route.continue();
  });
  await chooseSame(page);
  await page.getByRole('button', { name: 'Save PTO dates' }).click();
  await expect(page.locator('main [role=status]')).toContainText('Saved');
  expect(dayAmounts(patched)).toEqual(SAME);
  expect(patched.counts_as_pto).toBe(true);
});

test('PICK2 a 390px fractional allocation stays exact through failure and retry', async ({ page, request }) => {
  const created = await request.post('/travel/api/trips', {
    data: {
      title: 'Fraction',
      start_date: START,
      end_date: END,
      stays: [{ city: 'Porto', arrive_on: START, leave_on: END }],
      pto_dates: [
        { on_date: START, amount: '0.25' },
        { on_date: MIDDLE, amount: '1' },
        { on_date: END, amount: '0.1' },
      ],
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const trip = await created.json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/travel/trips/' + trip.id);
  for (const theme of ['light', 'dark']) {
    await chooseColorTheme(page, theme);
    await page.getByText(/^PTO ·/).click();
    await expect(ptoOption(page, START, '0.25')).toBeChecked();
    await expect(ptoOption(page, START, 'Half')).not.toBeChecked();
    await expect(ptoOption(page, END, '0.1')).toBeChecked();
    await expectFits(page);
  }
  await ptoOption(page, MIDDLE, 'Half').click();
  await expect(page.getByText('0.85 PTO days selected.')).toBeVisible();
  const bodies = [];
  await page.route('**/travel/api/trips/' + trip.id, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) {
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
  await expect(ptoOption(page, START, '0.25')).toBeChecked();
  await expect(ptoOption(page, MIDDLE, 'Half')).toBeChecked();
  await expect(ptoOption(page, END, '0.1')).toBeChecked();
  await expectFits(page);
  await ptoOption(page, END, 'None').click();
  await page.getByRole('button', { name: 'Save PTO dates' }).click();
  await expect(page.locator('main [role=status]')).toContainText('Saved');
  expect(dayAmounts(bodies[0])).toEqual([[START, '0.25'], [MIDDLE, '0.5'], [END, '0.1']]);
  expect(dayAmounts(bodies[1])).toEqual([[START, '0.25'], [MIDDLE, '0.5'], [END, '0']]);
  const saved = await (await request.get('/travel/api/trips/' + trip.id)).json();
  expect(saved.pto_dates.map((row) => [row.on_date, row.amount])).toEqual([
    [START, '0.25'],
    [MIDDLE, '0.5'],
    [END, '0'],
  ]);
});

async function expectFits(page) {
  const fit = await page.locator('.pto-dates').evaluate((el) => ({
    control: el.scrollWidth - el.clientWidth,
    choices: [...el.querySelectorAll('.pto-choices')].map((node) => node.scrollWidth - node.clientWidth),
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(fit.control).toBeLessThanOrEqual(1);
  expect(Math.max(...fit.choices, 0)).toBeLessThanOrEqual(1);
  expect(fit.page).toBeLessThanOrEqual(1);
  const width = page.viewportSize().width;
  for (const day of [START, MIDDLE, END]) {
    await expectReadable(page.locator('.pto-day-date', { hasText: formatDay(day) }), width);
    const labels = page.getByRole('radiogroup', { name: formatDay(day), exact: true }).locator('.pto-choice span');
    const count = await labels.count();
    for (let index = 0; index < count; index += 1) await expectReadable(labels.nth(index), width);
  }
}

async function expectReadable(locator, width) {
  await expect(locator).toBeVisible();
  expect((await locator.innerText()).trim().length).toBeGreaterThan(0);
  const box = await locator.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  expect(box.height).toBeGreaterThanOrEqual(14);
  const paint = await locator.evaluate((el) => {
    const style = getComputedStyle(el);
    let node = el;
    let background = 'rgb(0, 0, 0)';
    while (node) {
      const color = getComputedStyle(node).backgroundColor;
      const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(color);
      if (match && Number(match[4] ?? 1) > 0.5) {
        background = color;
        break;
      }
      node = node.parentElement;
    }
    return { color: style.color, background, size: parseFloat(style.fontSize) };
  });
  expect(paint.size).toBeGreaterThanOrEqual(13);
  const ink = rgb(paint.color);
  const paper = rgb(paint.background);
  const delta = Math.abs(ink[0] - paper[0]) + Math.abs(ink[1] - paper[1]) + Math.abs(ink[2] - paper[2]);
  expect(delta).toBeGreaterThan(80);
}

function rgb(value) {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (!match) throw new Error('No rgb colour in ' + value);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
