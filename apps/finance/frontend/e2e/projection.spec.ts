import { expect, test } from '@playwright/test';
import { syntheticVault } from './synthetic-vault';

// F20: the projection leads with a plain-language answer, an HTML legend,
// and a yearly table behind "Show as table".
test('projection answer, legend and yearly table', async ({ page }) => {
  const vault = await syntheticVault(page, {
    holdings: [{ id: 1, symbol: 'VOO', shares: 1, cost_basis: 500, position_date: '2026-01-01' }],
  });
  vault.setQuote('VOO', { price: 700.86 });
  await vault.open('/planning?t=growth');

  await expect(page.getByRole('heading', { name: 'About $5,689 in 30 years' })).toBeVisible();
  await expect(page.getByText('Starting from $700.86 · 7% a year · $0.00 a month')).toBeVisible();

  // HTML legend toggles series visibility state.
  const projectedToggle = page.getByRole('button', { name: 'Projected value' });
  await expect(projectedToggle).toBeVisible();
  await projectedToggle.click();
  await expect(projectedToggle).toHaveAttribute('aria-pressed', 'false');
  await projectedToggle.click();
  await expect(projectedToggle).toHaveAttribute('aria-pressed', 'true');

  // Yearly table.
  await page.getByRole('button', { name: 'Show as table' }).click();
  const table = page.getByRole('table', { name: 'Projection by year' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(31); // header + 30 years
  await expect(table).toContainText('$5,689');

  // Presets and the Custom path (focus moves to the growth input).
  await page.getByRole('button', { name: '10% annual growth preset' }).click();
  await expect(page.getByRole('heading', { name: /in 30 years/ })).not.toHaveText('About $5,689 in 30 years');
  await page.getByRole('button', { name: 'Custom annual growth' }).click();
  const growthInput = page.locator('#growthInput');
  await expect(growthInput).toBeFocused();
  await growthInput.fill('6');
  await expect(page.getByText(/6% a year/)).toBeVisible();
});
