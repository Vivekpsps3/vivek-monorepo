import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, frozenToday } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || path.resolve('test-results/finance/screenshots');
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;
const THEMES = ['light', 'dark'] as const;

const ROUTES: Array<{
  path: string; slug: string; hub: string; present: string[]; absent?: string[];
}> = [
  {
    path: '/have', slug: 'have', hub: 'app-have-hub',
    present: ['No assets yet', 'No debts recorded', 'Add checking, savings, property, or anything else you own.', 'Add a mortgage, loan, or card balance you owe.'],
    absent: ['Net worth'],
  },
  {
    path: '/have?t=holdings', slug: 'holdings', hub: 'app-have-hub',
    present: ['No holdings yet', 'Add a position by hand or import a Fidelity positions file.'],
  },
  {
    path: '/spending', slug: 'spending', hub: 'app-spending-hub',
    present: ['No transactions yet', 'Import a card statement or add one by hand.'],
  },
  {
    path: '/recurring?t=pay', slug: 'pay', hub: 'app-recurring-hub',
    present: ['No jobs yet', 'Add your salary and pay schedule to project income.'],
    absent: ['Yearly pay'],
  },
  {
    path: '/recurring?t=spend', slug: 'spend', hub: 'app-recurring-hub',
    present: ['No bills or subscriptions yet', 'Add rent, utilities, or a streaming plan to see what repeats each month.'],
    absent: ['Active monthly equivalent', 'Filter commitments'],
  },
  {
    path: '/planning', slug: 'planning', hub: 'app-planning-hub',
    present: ['Planning uses your balances, pay and bills', 'Add a balance or your pay, and Planning fills in from there.'],
    absent: ['Your current facts'],
  },
  {
    path: '/planning?t=growth', slug: 'growth', hub: 'app-planning-hub',
    present: ['No holdings to project', 'Add holdings or import from Fidelity to project growth.'],
  },
];

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`empty states [${viewport.width} ${theme}]`, () => {
      test.use({ viewport });
      test.beforeEach(async ({ page }) => {
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      });

      test('new vault: every screen leads with its next step', async ({ page }) => {
        const vault = await syntheticVault(page, {});
        for (const route of ROUTES) {
          await vault.open(route.path);
          const hub = page.locator(route.hub);
          await expect(hub).toBeVisible();
          for (const expected of route.present) {
            await expect(hub, `${route.path} should show "${expected}"`).toContainText(expected);
          }
          for (const missing of route.absent ?? []) {
            await expect(hub, `${route.path} should not show "${missing}"`).not.toContainText(missing);
          }
          await expect(hub).not.toContainText('No data yet.');
          await expect(hub).not.toContainText('Date unknown');
          await expect(hub).not.toContainText('0 matching');
          const emptyStateText = await page.locator('ui-empty-state').allInnerTexts().then(parts => parts.join(' '));
          expect(emptyStateText).not.toContain('$0.00');
          const scan = await new AxeBuilder({ page }).analyze();
          expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'),
            `axe on ${route.path}`).toEqual([]);
          fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, `empty-${route.slug}-${viewport.width}-${theme}.png`), fullPage: true });
        }
      });
    });
  }
}

test.describe('empty states behavior', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('route-level button counts and order', async ({ page }) => {
    const vault = await syntheticVault(page, {});
    await vault.open('/have');
    await expect(page.getByRole('button', { name: 'Add asset', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Add debt', exact: true })).toHaveCount(1);
    expect(await page.locator('.net-worth-hero').count()).toBe(0);

    await vault.open('/have?t=holdings');
    const actions = page.locator('.empty-actions').first();
    await expect(actions.getByRole('button')).toHaveText(['Add holding', 'Import from Fidelity']);

    await vault.open('/spending');
    const spendActions = page.locator('app-spending-hub .empty-actions').first();
    await expect(spendActions.getByRole('button')).toHaveText(['Import', 'Add transaction']);

    await vault.open('/recurring?t=pay');
    await expect(page.getByRole('button', { name: 'Add job', exact: true })).toHaveCount(1);

    await vault.open('/recurring?t=spend');
    await expect(page.getByRole('button', { name: 'Add bill', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Add subscription', exact: true })).toHaveCount(1);
    await expect(page.locator('.commitment-totals')).toHaveCount(0);
    await expect(page.locator('.commitment-filters')).toHaveCount(0);
  });

  test('no price refresh without tickers', async ({ page }) => {
    const vault = await syntheticVault(page, {});
    await vault.open('/have?t=holdings');
    await expect(page.getByText('No holdings yet')).toBeVisible();
    await page.clock.runFor(1000);
    expect(vault.quoteRequests).toEqual([]);
    await expect(page.getByText(/Updating prices/)).toHaveCount(0);
  });

  test('filtered transactions empty state restores via Clear filters', async ({ page }) => {
    const vault = await syntheticVault(page, {
      transactions: [{ id: 1, date: frozenToday(), type: 'expense', kind: 'purchase', category: 'Food', amount: 10, description: 'Coffee', bank_account_key: 'card-a', account_display: 'Daily card' }],
    });
    await vault.open('/spending');
    await expect(page.getByText('Coffee').first()).toBeVisible();
    // Category options are derived from the month's rows, so a category
    // with no rows can never be selected; search is the filter that can
    // exclude an existing row, and clearFilters() resets it.
    await page.getByRole('searchbox', { name: 'Search transactions' }).fill('No such purchase');
    await expect(page.getByText('Nothing matches these filters')).toBeVisible();
    await page.locator('.empty-actions').getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByText('Coffee').first()).toBeVisible();
  });

  test('filtered commitments empty state restores via Show all', async ({ page }) => {
    const vault = await syntheticVault(page, {
      fixed_expenses: [{ id: 80, name: 'Internet bill', category: 'Utilities', amount: 60, frequency: 'monthly', start_date: frozenToday(), due_day: 2, autopay: false, payment_account: 'Checking', is_active: true }],
    });
    await vault.open('/recurring?t=spend');
    await expect(page.getByText('Internet bill').first()).toBeVisible();
    await page.getByLabel('Type').selectOption('subscription');
    await expect(page.getByText('Nothing matches these filters')).toBeVisible();
    await page.locator('.empty-actions').getByRole('button', { name: 'Show all' }).click();
    await expect(page.getByText('Internet bill').first()).toBeVisible();
    await expect.poll(() => page.url()).toContain('kind=all');
    await expect.poll(() => page.url()).toContain('status=all');
  });

  test('the one Add job button opens the Add job dialog', async ({ page }) => {
    const vault = await syntheticVault(page, {});
    await vault.open('/recurring?t=pay');
    await page.getByRole('button', { name: 'Add job', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Add job' })).toBeVisible();
  });
});

test.describe('empty states [390 light] stacked actions', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('holdings actions stack full width', async ({ page }) => {
    const vault = await syntheticVault(page, {});
    await vault.open('/have?t=holdings');
    const buttons = page.locator('.empty-actions').first().getByRole('button');
    await expect(buttons).toHaveCount(2);
    for (let i = 0; i < 2; i += 1) {
      const box = await buttons.nth(i).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(300);
    }
  });
});
