import { type Page } from '@playwright/test';
import { test, expect } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

/**
 * F1 acceptance: one h1 per Finance route, focus lands on it after
 * navigation, zero is never red, invalid borders win, fields show the 2px
 * focus ring, and targets are at least 44px. Each test also covers the
 * shared matrix checks: no horizontal scroll, no CSP or Trusted Types
 * console violations.
 */

const seed = {
  assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 1500, as_of_date: '2026-10-01' }],
  holdings: [{
    id: 10, symbol: 'VOO', shares: 2, purchase_price: 80, purchase_date: '2022-01-01',
    current_price: 100, price_source: 'manual', quote_date: '2026-10-08', position_as_of: '2026-10-10',
  }],
  transactions: [{ id: 3, date: '2026-10-02', type: 'expense', kind: 'purchase', category: 'Food', amount: 40, description: 'Grocery' }],
  fixed_expenses: [{
    id: 80, name: 'Internet bill', category: 'Utilities', amount: 60, frequency: 'monthly',
    start_date: '2026-10-01', due_day: 2, autopay: false, payment_account: 'Checking', is_active: true,
  }],
  job_incomes: [{
    id: 20, employer: 'Northwind', role_title: 'Engineer', pay_frequency: 'annual', base_pay: 120000,
    annual_bonus: 0, annual_equity: 0, annual_other: 0, annual_taxes: 30000, annual_deductions: 0,
    taxes_per_period: 0, deductions_per_period: 0, effective_date: '2026-01-01',
    is_active: true, pay_periods_per_year: 1, annual_base_pay: 120000,
  }],
};

const routes: Array<{ path: string; h1: string }> = [
  { path: '/', h1: 'Home' },
  { path: '/have?t=assets', h1: 'What you have' },
  { path: '/have?t=holdings', h1: 'What you have' },
  { path: '/spending?t=activity', h1: 'Spending' },
  { path: '/spending?t=calendar', h1: 'Spending' },
  { path: '/recurring?t=pay', h1: 'Recurring' },
  { path: '/recurring?t=spend', h1: 'Recurring' },
  { path: '/planning?t=path', h1: 'Planning' },
  { path: '/planning?t=growth', h1: 'Planning' },
  { path: '/planning?t=stocks', h1: 'Planning' },
];

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

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`[${width} ${theme}]`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      });

      test('every Finance route has exactly one h1 with the tab label', async ({ page }) => {
        const violations = watchConsole(page);
        const vault = await syntheticVault(page, seed);
        for (const route of routes) {
          await vault.open(route.path);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await expect(page.locator('h1')).toHaveCount(1);
          await expect(page.locator('h1')).toHaveText(route.h1);
          await expectCleanPage(page, violations);
        }
      });

      test('navigating between sections moves focus to the h1', async ({ page }) => {
        const violations = watchConsole(page);
        const vault = await syntheticVault(page, seed);
        await vault.open('/');
        const tabSelector = width === 390 ? '.mobile-tab' : '.nav-tab';
        const sections: Array<{ tab: string; h1: string }> = [
          { tab: 'Have', h1: 'What you have' },
          { tab: 'Spend', h1: 'Spending' },
          { tab: 'Repeat', h1: 'Recurring' },
          { tab: 'Plan', h1: 'Planning' },
          { tab: 'Home', h1: 'Home' },
        ];
        const desktopLabels: Record<string, string> = {
          Have: 'What you have', Spend: 'Spending', Repeat: 'Recurring', Plan: 'Planning', Home: 'Home',
        };
        for (const section of sections) {
          const label = width === 390 ? section.tab : desktopLabels[section.tab];
          await page.locator(tabSelector, { hasText: label }).first().click();
          await expect(page.locator('h1')).toHaveText(section.h1);
          await expect(page.locator('h1')).toBeFocused();
        }
        await expectCleanPage(page, violations);
      });

      test('switching a sub-tab keeps focus on the tab link', async ({ page }) => {
        const violations = watchConsole(page);
        const vault = await syntheticVault(page, seed);
        await vault.open('/spending?t=activity');
        const calendar = page.locator('app-spending-hub nav.hub-tabs').getByRole('link', { name: 'Calendar' });
        await calendar.click();
        await expect(page.locator('app-calendar')).toBeVisible();
        await expect(calendar).toBeFocused();
        await expectCleanPage(page, violations);
      });

      test('zero spending is not red', async ({ page }) => {
        const violations = watchConsole(page);
        const vault = await syntheticVault(page, {});
        await vault.open('/');
        const tile = page.locator('.home-tile--activity');
        await expect(tile).toBeVisible();
        const colours = await tile.evaluate(el => {
          const spending = el.querySelector('.home-split strong');
          if (!spending) throw new Error('spending value missing');
          return {
            value: getComputedStyle(spending).color,
            body: getComputedStyle(document.body).color,
            danger: getComputedStyle(document.documentElement).getPropertyValue('--danger'),
          };
        });
        expect(colours.value).toBe(colours.body);
        expect(colours.danger.trim()).not.toBe('');
        await expectCleanPage(page, violations);
      });

      test('invalid field border wins over the base rule', async ({ page }) => {
        const violations = watchConsole(page);
        const vault = await syntheticVault(page, seed);
        await vault.open('/planning?t=path');
        const field = page.locator('.mc-field input').first();
        await expect(field).toBeVisible();
        const borders = await field.evaluate(el => {
          const input = el as HTMLInputElement;
          const before = getComputedStyle(input).borderColor;
          input.setAttribute('aria-invalid', 'true');
          const after = getComputedStyle(input).borderColor;
          const probe = document.createElement('div');
          probe.style.borderColor = 'var(--danger)';
          document.body.appendChild(probe);
          const danger = getComputedStyle(probe).borderColor;
          probe.remove();
          input.removeAttribute('aria-invalid');
          return { before, after, danger };
        });
        expect(borders.after).toBe(borders.danger);
        expect(borders.after).not.toBe(borders.before);
        await expectCleanPage(page, violations);
      });

      test('planning, quick-tools and insights fields show a 2px focus ring', async ({ page }) => {
        const violations = watchConsole(page);
        const vault = await syntheticVault(page, seed);
        await vault.open('/planning?t=path');
        const targets = [
          page.locator('app-planning .mc-field input, app-planning .mc-field select').first(),
          page.locator('app-planning-quick-tools .mc-field input, app-planning-quick-tools .mc-field select').first(),
        ];
        for (const target of targets) {
          await expect(target).toBeVisible();
          await target.focus();
          const outline = await target.evaluate(el => {
            const style = getComputedStyle(el);
            return { width: style.outlineWidth, style: style.outlineStyle };
          });
          expect(outline).toEqual({ width: '2px', style: 'solid' });
        }
        await vault.open('/planning?t=growth');
        const unit = page.locator('.input-with-unit input').first();
        await expect(unit).toBeVisible();
        await unit.focus();
        const wrapOutline = await unit.evaluate(el => {
          const wrap = el.closest('.input-with-unit');
          if (!wrap) throw new Error('unit wrap missing');
          const style = getComputedStyle(wrap);
          return { width: style.outlineWidth, style: style.outlineStyle };
        });
        expect(wrapOutline).toEqual({ width: '2px', style: 'solid' });
        await expectCleanPage(page, violations);
      });

      test('targets are at least 44px', async ({ page }) => {
        test.skip(width !== 390, 'target sizes are asserted at phone width');
        const violations = watchConsole(page);
        const vault = await syntheticVault(page, seed);
        await vault.open('/');
        const toggles = page.locator('button.section-toggle');
        expect(await toggles.count()).toBeGreaterThan(0);
        for (const toggle of await toggles.all()) {
          const box = await toggle.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
        await vault.open('/planning?t=path');
        const labels = page.locator('label:has(> input[type="checkbox"]), label:has(> input[type="radio"])');
        for (const label of await labels.all()) {
          const box = await label.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
        const openLinks = page.locator('app-planning a[routerLink], app-planning-quick-tools a[routerLink]');
        expect(await openLinks.count()).toBeGreaterThan(0);
        for (const link of await openLinks.all()) {
          const box = await link.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
        await expectCleanPage(page, violations);
      });
    });
  }
}
