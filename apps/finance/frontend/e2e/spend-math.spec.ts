import { test, expect } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';
import { refundMonthSeed } from './fixtures/refund-month';
import { moneyText } from './money-text';

// F8: refund-aware spend math — Spent 14.00, Scheduled 45, Net +4,986.

test('Home and Calendar agree on posted spend, scheduled and net for a refund month', async ({ page }) => {
  const vault = await syntheticVault(page, refundMonthSeed());
  await vault.open('/');

  const activityTile = page.locator('.home-tile--activity');
  await expect(activityTile).toContainText(moneyText('$14.00'));
  await expect(activityTile).toContainText(moneyText('$45.00'));
  await expect(activityTile).toContainText('Spent');
  await expect(activityTile).toContainText('Scheduled');

  await vault.open('/spending?t=calendar');
  const totals = page.locator('.month-totals');
  await expect(totals).toContainText('Spent');
  await expect(totals).toContainText(moneyText('$14.00'));
  await expect(totals).toContainText('Scheduled');
  await expect(totals).toContainText(moneyText('$45.00'));
  await expect(totals).toContainText('Income');
  await expect(totals).toContainText(moneyText('$5,000.00'));
  await expect(totals).toContainText('Net');
  await expect(totals).toContainText(moneyText('$4,986.00'));
});

test('the category table keeps refunds signed while the chart clamps them', async ({ page }) => {
  const vault = await syntheticVault(page, refundMonthSeed());
  await vault.open('/');

  const table = page.locator('app-category-spend-table');
  await expect(table).toContainText('Food');
  await expect(table).toContainText(moneyText('$17.25'));
  await expect(table).toContainText('Shopping');
  await expect(table).toContainText(moneyText('−$3.25'));
});
