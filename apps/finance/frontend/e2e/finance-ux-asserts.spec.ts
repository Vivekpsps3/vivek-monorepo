import { expect, test } from '@playwright/test';
import { syntheticVault } from './synthetic-vault';

test('a selected growth preset stays pressed with a heavier inset style', async ({ page }) => {
  const vault = await syntheticVault(page, {
    holdings: [{
      id: 10, symbol: 'VOO', shares: 2, purchase_price: 80, purchase_date: '2022-01-01',
      current_price: 100, price_source: 'manual', quote_date: '2026-10-08', position_as_of: '2026-10-10',
    }],
  });
  await vault.open('/planning?t=growth');
  const selected = page.getByRole('button', { name: '7% annual growth preset' });
  const other = page.getByRole('button', { name: '5% annual growth preset' });
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(other).toHaveAttribute('aria-pressed', 'false');
  const selectedStyle = await selected.evaluate(el => {
    const style = getComputedStyle(el);
    return { weight: style.fontWeight, shadow: style.boxShadow };
  });
  const otherWeight = await other.evaluate(el => getComputedStyle(el).fontWeight);
  expect(Number(selectedStyle.weight)).toBeGreaterThan(Number(otherWeight));
  expect(selectedStyle.shadow).toContain('inset');
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('unlocking the synthetic vault does not raise an error toast', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 1500, as_of_date: '2026-10-01' }],
  });
  await vault.open('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('home charts at 1280 have a real size and painted pixels', async ({ page }) => {
  const vault = await syntheticVault(page, {
    holdings: [{
      id: 10, symbol: 'VOO', shares: 2, purchase_price: 80, purchase_date: '2022-01-01',
      current_price: 100, price_source: 'manual', quote_date: '2026-10-08', position_as_of: '2026-10-10',
    }],
    transactions: [
      { id: 13, date: '2026-10-02', type: 'expense', kind: 'purchase', category: 'Food', amount: 40, description: 'Grocery' },
    ],
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await vault.open('/');
  await expect.poll(async () => page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')];
    if (canvases.length < 3) return false;
    return canvases.every(node => {
      const canvas = node as HTMLCanvasElement;
      if (canvas.width < 2 || canvas.height < 2 || canvas.clientWidth < 2 || canvas.clientHeight < 2) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 3; index < data.length; index += 64) {
        if (data[index] > 8) return true;
      }
      return false;
    });
  })).toBe(true);
  await expect(page.locator('.toast')).toHaveCount(0);
});
