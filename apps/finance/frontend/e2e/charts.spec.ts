import { type Page } from '@playwright/test';
import { test, expect } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

/**
 * F11 acceptance: cashflow range/trimming, the remembered table toggle,
 * the HTML legend, the single-holding stat row, and no "Data" disclosure.
 * Canvas internals are covered in Karma; Playwright checks only the DOM.
 */

const cashflowSeed = {
  transactions: [
    { id: 1, date: '2026-05-10', type: 'income', kind: 'income', category: 'Salary', amount: 3000, description: 'Paycheck' },
    { id: 2, date: '2026-07-12', type: 'expense', kind: 'purchase', category: 'Food and Drink', amount: 120, description: 'Groceries' },
    { id: 3, date: '2026-10-03', type: 'income', kind: 'income', category: 'Salary', amount: 5000, description: 'Paycheck' },
    { id: 4, date: '2026-10-05', type: 'expense', kind: 'purchase', category: 'Food and Drink', amount: 17.25, description: 'Cafe' },
    { id: 5, date: '2026-10-09', type: 'expense', kind: 'purchase', category: 'Shopping', amount: 41.75, description: 'Shoes' },
  ],
  holdings: [{
    id: 10, symbol: 'VOO', shares: 1, purchase_price: 500, purchase_date: '2024-01-01',
    current_price: 700.86, price_source: 'manual', quote_date: '2026-10-14', position_as_of: '2026-10-14',
  }],
};

const plain = (text: string) => text.replace(/⁠/g, '');

function watchConsole(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', message => {
    const text = message.text();
    if (/Content Security Policy|Trusted Types|Refused to/i.test(text)) violations.push(text);
  });
  page.on('pageerror', error => {
    if (/Content Security Policy|Trusted Types|Refused to/i.test(error.message)) violations.push(error.message);
  });
  return violations;
}

async function expectCleanPage(page: Page, violations: string[]): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(overflow).toBe(true);
  expect(violations).toEqual([]);
}

async function setup(page: Page) {
  const vault = await syntheticVault(page, cashflowSeed);
  vault.setQuote('VOO', { price: 700.86 });
  await vault.open('/');
  return { vault, charts: page.locator('app-charts') };
}

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`[${width} ${theme}]`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
        await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      });

      test('Charts: cashflow range, table toggle and remembered choice', async ({ page }) => {
        const violations = watchConsole(page);
        const { vault, charts } = await setup(page);
        const cashflowCard = charts.locator('ui-card.chart-wide');

        const canvas = cashflowCard.locator('canvas');
        await expect(canvas).toBeVisible();
        const name = plain(await canvas.getAttribute('aria-label') ?? '');
        expect(name).toBe('Monthly cashflow, May to October 2026. Net highest in October, +$4,941.00.');

        const toggle = cashflowCard.getByRole('button', { name: 'Show as table' });
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await toggle.click();
        await expect(cashflowCard.getByRole('button', { name: 'Show as chart' })).toHaveAttribute('aria-expanded', 'true');
        await expect(cashflowCard.locator('canvas')).toHaveCount(0);

        const table = cashflowCard.getByRole('table', { name: 'Monthly cashflow' });
        await expect(table.locator('caption')).toHaveText('Monthly cashflow');
        const rows = table.locator('tbody tr');
        await expect(rows).toHaveCount(6);
        await expect(rows.first().locator('th[scope="row"]')).toHaveText('May 2026');
        await expect(rows.last().locator('th[scope="row"]')).toHaveText('October 2026');
        const june = table.getByRole('row', { name: /June 2026/ });
        await expect(june).toContainText('$0.00');
        const octoberNet = plain(await rows.last().locator('td').last().innerText());
        expect(octoberNet).toBe('+$4,941.00');
        expect(await page.evaluate(() => localStorage.getItem('finance.chartTable.cashflow'))).toBe('1');

        await vault.reload();
        const reopened = page.locator('app-charts ui-card.chart-wide');
        await expect(reopened.getByRole('table', { name: 'Monthly cashflow' })).toBeVisible();
        await expect(reopened.locator('canvas')).toHaveCount(0);
        await expectCleanPage(page, violations);
      });

      test('Charts: legend toggles Net', async ({ page }) => {
        const violations = watchConsole(page);
        const { charts } = await setup(page);
        const legend = charts.getByRole('group', { name: 'Show or hide series' });
        for (const label of ['Income', 'Spending', 'Net']) {
          await expect(legend.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
        }
        const net = legend.getByRole('button', { name: 'Net' });
        await net.click();
        await expect(net).toHaveAttribute('aria-pressed', 'false');
        await net.click();
        await expect(net).toHaveAttribute('aria-pressed', 'true');
        await expectCleanPage(page, violations);
      });

      test('Charts: single holding stat row', async ({ page }) => {
        const violations = watchConsole(page);
        const { charts } = await setup(page);
        const holdingsCard = charts.locator('ui-card').filter({ hasText: 'Holdings mix' });
        await expect(holdingsCard.locator('canvas')).toHaveCount(0);
        const stat = plain(await holdingsCard.locator('.chart-stat').innerText());
        expect(stat).toBe('VOO · 100.0% · $700.86');
        const table = holdingsCard.getByRole('table', { name: 'Holdings mix' });
        await expect(table.locator('caption')).toHaveText('Holdings mix');
        await expect(holdingsCard.getByRole('button', { name: /Show as (table|chart)/ })).toHaveCount(0);
        await expectCleanPage(page, violations);
      });

      test('Charts: no Data disclosure; table caption and row headers', async ({ page }) => {
        const violations = watchConsole(page);
        const { charts } = await setup(page);
        await expect(charts.getByText('Data', { exact: true })).toHaveCount(0);
        await charts.getByRole('button', { name: 'Show as table' }).first().click();
        const table = charts.getByRole('table', { name: 'Monthly cashflow' });
        await expect(table).toBeVisible();
        await expect(table.getByRole('rowheader', { name: 'May 2026' })).toBeVisible();
        await expect(table.getByRole('rowheader', { name: 'October 2026' })).toBeVisible();
        await expectCleanPage(page, violations);
      });
    });
  }
}
