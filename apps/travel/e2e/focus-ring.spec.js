import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('PTO checkbox has a visible keyboard focus ring and Space changes its selection', async ({ page, request }) => {
  await request.post('/e2e/reset');
  const trip = await (await request.post('/travel/api/trips', { data: { title: 'Kyoto', start_date: '2026-10-24', end_date: '2026-10-30' } })).json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/travel/trips/' + trip.id);
  await expect(page.getByRole('heading', { name: 'Kyoto', exact: true })).toBeVisible();
  await page.locator('summary').filter({hasText:/^PTO ·/}).click();
  const box = page.getByRole('checkbox', { name: 'Count selected dates as PTO' });
  await box.scrollIntoViewIfNeeded();
  await page.locator('h1').click();
  const plain = test.info().outputPath('plain.png');
  const focused = test.info().outputPath('focused.png');
  await page.screenshot({ path: plain });
  await box.focus();
  await expect(box).toBeFocused();
  await page.screenshot({ path: focused });
  expect(readFileSync(plain).equals(readFileSync(focused))).toBe(false);
  await page.keyboard.press('Space');
  await expect(box).not.toBeChecked();
});
