import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';

test.use({ hasTouch: true });

const policy = {
  start_balance_hours: '80',
  balance_as_of: '2026-01-01',
  accrual_hours: '8',
  accrual_cadence: 'monthly',
  cap_hours: null,
  year_start: '01-01',
};

async function putBucket(request, extra = {}) {
  const response = await request.put('/travel/api/pto/policies/pto', { data: { ...policy, ...extra } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

function inside(box, viewport) {
  expect(box).toBeTruthy();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

for (const view of [
  { width: 390, height: 844, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
  { width: 1280, height: 800, theme: 'light' },
  { width: 1280, height: 800, theme: 'dark' },
]) {
  test(`PTO leads with setup or booking at ${view.width} ${view.theme}`, async ({ page, request }) => {
    test.setTimeout(60_000);
    expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/travel/pto');
    await chooseColorTheme(page, view.theme);
    const start = page.getByLabel('Starting balance');
    await expect(start).toBeFocused();
    inside(await start.boundingBox(), view);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(8);
    await expect(page.getByRole('heading', { name: 'Add time off', exact: true })).toHaveCount(0);
    const save = page.locator('main button.ui-btn--primary');
    await expect(save).toHaveCount(1);
    await expect(save).toHaveText('Save');
    expect((await save.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const setup = await page.getByRole('heading', { name: 'Set up PTO', exact: true }).boundingBox();
    const sick = await page.getByRole('heading', { name: 'Track sick time too', exact: true }).boundingBox();
    expect(sick.y).toBeGreaterThan(setup.y + setup.height - 1);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Balance as of')).toBeFocused();
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact))).toEqual([]);

    await putBucket(request);
    await page.goto('/travel/pto');
    const balance = page.getByRole('heading', { name: 'Balance today', exact: true });
    const add = page.getByRole('heading', { name: 'Add time off', exact: true });
    await expect(balance).toBeVisible();
    await expect(add).toBeVisible();
    const balanceBox = await balance.boundingBox();
    const addBox = await add.boundingBox();
    if (view.width < 800) {
      inside(balanceBox, view);
      inside(addBox, view);
      expect(addBox.y).toBeGreaterThan(balanceBox.y);
      expect(await page.evaluate(() => window.scrollY)).toBeLessThan(8);
    } else {
      expect(addBox.x).toBeGreaterThan(balanceBox.x + balanceBox.width - 1);
    }
    const sickBox = await page.getByRole('heading', { name: 'Track sick time too', exact: true }).boundingBox();
    expect(sickBox.y).toBeGreaterThan(addBox.y);
    await expect(page.getByRole('button', { name: 'Edit PTO', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Edit PTO policy', exact: true })).toHaveCount(0);
    await expect(page.locator('main button.ui-btn--primary')).toHaveText('Add');
    const addButton = page.getByRole('button', { name: 'Add', exact: true });
    expect((await addButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
    if (view.width < 800) await addButton.tap();
    else {
      await addButton.focus();
      await page.keyboard.press('Enter');
    }
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
    const configured = await new AxeBuilder({ page }).analyze();
    expect(configured.violations.filter((item) => ['serious', 'critical'].includes(item.impact))).toEqual([]);
  });
}

test('a half-day request previews, survives a failed add, and stays on the plan', async ({ page, request }) => {
  test.setTimeout(60_000);
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await putBucket(request, { start_balance_hours: '40', accrual_hours: '0' });
  const trip = await request.post('/travel/api/trips', {
    data: { title: 'Harbor week', start_date: '2026-12-14', end_date: '2026-12-16', counts_as_pto: true },
  });
  expect(trip.ok(), await trip.text()).toBeTruthy();
  await page.goto('/travel/pto');
  await expect(page.getByRole('heading', { name: 'Harbor week', exact: true })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Clinic');
  await page.getByLabel('First day', { exact: true }).fill('2026-12-01');
  await page.getByLabel('Last day', { exact: true }).fill('2026-12-01');
  await page.getByText('Optional day total', { exact: true }).click();
  const days = page.getByLabel(/Days \(blank uses weekdays\)/);
  await days.fill('0.5');
  await page.getByRole('button', { name: 'Preview balance', exact: true }).click();
  await expect(page.getByText(/Before:/)).toBeVisible();
  let attempts = 0;
  await page.route('**/travel/api/pto/entries', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 502, json: { message: 'down' } })
      : route.continue();
  });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't add this time off.");
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Clinic');
  await expect(days).toHaveValue('0.5');
  await alert.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clinic', exact: true })).toBeVisible();
  const saved = await (await request.get('/travel/api/pto')).json();
  const clinic = saved.entries.find((entry) => entry.label === 'Clinic');
  expect(Number(clinic.days)).toBe(0.5);
  expect(clinic.bucket).toBe('pto');
  await expect(page.getByRole('heading', { name: 'Clinic', exact: true }).locator('xpath=..')).toContainText(`${clinic.days} days`);
  await expect(page.getByRole('heading', { name: 'Balance forecast', exact: true })).toBeVisible();
  await expect(page.locator('travel-pto-chart')).toHaveCount(1);
});

test('setup stays in the page at 320px and at 200% text', async ({ page, request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/travel/pto');
  await expect(page.getByLabel('Starting balance')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
  });
  await expect(page.getByLabel('Starting balance')).toBeVisible();
  const overflow = await page.evaluate(() => {
    const root = document.querySelector('.pto-page');
    return root.scrollWidth <= root.clientWidth + 1;
  });
  expect(overflow).toBe(true);
});
