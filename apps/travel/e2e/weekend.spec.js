import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

test('a Saturday to Sunday trip saves with weekends left off PTO', async ({ page }) => {
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill('2026-11-07');
  await page.getByLabel('Return date').fill('2026-11-08');
  await page.getByLabel('Destination city').fill('Honolulu');
  await page.getByText('Time off', { exact: true }).click();
  await expect(page.getByText('0 PTO days selected.')).toBeVisible();
  await expectNotPto(page, '2026-11-07');
  await expectNotPto(page, '2026-11-08');
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Honolulu', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Honolulu' }).locator('xpath=following-sibling::p').first()).toContainText('0 PTO days');
  await page.getByText('PTO · 0 days', { exact: true }).click();
  await expectNotPto(page, '2026-11-07');
  await expectNotPto(page, '2026-11-08');
  await expect(page.getByText('0 PTO days selected.')).toBeVisible();
});

async function expectNotPto(page, day) {
  await expect(page.locator('label').filter({ hasText: day }).getByRole('combobox').locator('option:checked')).toHaveText('Not PTO');
}
