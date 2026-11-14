import { type Page } from '@playwright/test';
import { test, expect } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';
import { moneyText } from './money-text';

/**
 * F12 acceptance: header action order, the period summary with per-type
 * counts, the Filters panel and chips, the four-column table and the
 * mobile rows. The row-menu test lands with K1's ui-menu (not on main).
 */

const activitySeed = {
  bank_accounts: [{ id: 40, bank_slug: 'chase', account_mask: '1111', account_key: 'card-a', display_name: 'Daily card', confirmed: true }],
  transactions: [
    { id: 1, date: '2026-10-05', type: 'expense', kind: 'purchase', category: 'Food and Drink', amount: 10, description: 'CORNER CAFE 123', merchant: 'Corner Cafe', bank_account_key: 'card-a', account_display: 'Daily card', source: 'import' },
    { id: 2, date: '2026-10-12', type: 'expense', kind: 'purchase', category: 'Shopping', amount: 9, description: 'HARDWARE STORE 22' },
    { id: 3, date: '2026-10-15', type: 'expense', kind: 'refund', category: 'Shopping', amount: 5, description: 'HARDWARE STORE 22 REFUND' },
    { id: 4, date: '2026-10-01', type: 'income', kind: 'income', category: 'Salary', amount: 5000, description: 'Paycheck' },
    { id: 5, date: '2026-07-04', type: 'expense', kind: 'purchase', category: 'Travel', amount: 120, description: 'Flight' },
  ],
};

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
  const vault = await syntheticVault(page, activitySeed);
  await vault.open('/spending?t=activity&month=2026-10');
  return vault;
}

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`[${width} ${theme}]`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
        await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
        await page.emulateMedia({ colorScheme: theme });
      });

      test('actions order', async ({ page }) => {
        const violations = watchConsole(page);
        await setup(page);
        const actions = page.locator('.header-actions');
        const buttons = actions.getByRole('button');
        await expect(buttons.nth(0)).toHaveText('Add transaction');
        await expect(buttons.nth(1)).toHaveText('Import');
        if (width === 390) {
          const first = await buttons.nth(0).boundingBox();
          const second = await buttons.nth(1).boundingBox();
          expect(Math.abs((first?.y ?? 0) - (second?.y ?? 0))).toBeLessThanOrEqual(2);
          expect(first?.width ?? 999).toBeLessThanOrEqual(195);
          expect(second?.width ?? 999).toBeLessThanOrEqual(195);
        }
        await expectCleanPage(page, violations);
      });

      test('period summary', async ({ page }) => {
        const violations = watchConsole(page);
        await setup(page);
        await expect(page.locator('#period-eyebrow')).toHaveText('October 2026');
        const spent = page.locator('.month-total--expense');
        await expect(spent).toContainText(moneyText('$14.00'));
        await expect(spent).toContainText('2 purchases, 1 refund');
        const income = page.locator('.month-total--income');
        await expect(income).toContainText(moneyText('$5,000.00'));
        await expect(income).toContainText('1 deposit');
        await expect(page.locator('.month-total--net')).toContainText(moneyText('+$4,986.00'));
        await expectCleanPage(page, violations);
      });

      test('All months', async ({ page }) => {
        const violations = watchConsole(page);
        await setup(page);
        await page.getByRole('button', { name: 'All months' }).click();
        await expect(page.locator('#period-eyebrow')).toHaveText('All time');
        await expect(page.locator('.month-total--expense')).toContainText(moneyText('$134.00'));
        await expectCleanPage(page, violations);
      });

      test('empty month', async ({ page }) => {
        const violations = watchConsole(page);
        const vault = await syntheticVault(page, activitySeed);
        await vault.open('/spending?t=activity&month=2026-09');
        await expect(page.getByText('No activity in September.', { exact: true })).toBeVisible();
        await expect(page.locator('.month-totals')).toHaveCount(0);
        await expectCleanPage(page, violations);
      });

      test('filters panel and chips', async ({ page }) => {
        const violations = watchConsole(page);
        await setup(page);
        const toggle = page.getByRole('button', { name: 'Filters', exact: true });
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#activity-filters')).toBeHidden();
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#tx-type-filter')).toBeFocused();
        await page.locator('#tx-category-filter').selectOption('shopping');
        await expect(page.getByRole('button', { name: 'Filters (1)' })).toBeVisible();
        const chip = page.getByRole('button', { name: 'Remove filter Category: Shopping' });
        await expect(chip).toBeVisible();
        await expect(page.locator('#period-eyebrow')).toHaveText('October 2026 · filtered');
        await chip.click();
        await expect(page.locator('.filter-chip')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();
        await expectCleanPage(page, violations);
      });

      test('one toolbar row', async ({ page }) => {
        test.skip(width !== 1280, 'desktop layout only');
        const violations = watchConsole(page);
        await setup(page);
        const search = page.getByLabel('Search transactions');
        const filters = page.getByRole('button', { name: 'Filters', exact: true });
        const exportCsv = page.getByRole('button', { name: 'Export CSV' });
        const ys = await Promise.all([search, filters, exportCsv].map(async locator => (await locator.boundingBox())?.y ?? 0));
        expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(2);
        await expect(page.locator('#tx-category-filter')).toBeHidden();
        await expectCleanPage(page, violations);
      });

      test('table', async ({ page }) => {
        test.skip(width !== 1280, 'desktop layout only');
        const violations = watchConsole(page);
        await setup(page);
        const table = page.getByRole('table', { name: 'Transactions history' });
        await expect(table.getByRole('columnheader')).toHaveText([
          /Date/, 'Description', /Amount/, 'Actions',
        ]);
        const cafeRow = table.getByRole('row').filter({ hasText: 'Corner Cafe' });
        await expect(cafeRow).toContainText('Food and Drink · Daily card');
        await expect(cafeRow).toContainText('Imported');
        const refundRow = table.getByRole('row').filter({ hasText: 'HARDWARE STORE 22 REFUND' });
        await expect(refundRow).toContainText('Refund');
        await expect(refundRow).toContainText(moneyText('+$5.00'));
        await expectCleanPage(page, violations);
        await page.setViewportSize({ width: 1024, height: 768 });
        await expectCleanPage(page, violations);
      });

      test('mobile row', async ({ page }) => {
        test.skip(width !== 390, 'phone layout only');
        const violations = watchConsole(page);
        await setup(page);
        const row = page.locator('.tx-mobile-row').filter({ hasText: 'Corner Cafe' });
        await expect(row).toContainText('Imported');
        await row.locator('summary').click();
        await expect(row.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
        await expectCleanPage(page, violations);
      });
    });
  }
}
