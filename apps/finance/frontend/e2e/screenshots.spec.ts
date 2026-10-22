import path from 'node:path';

import { expect, type Page, test } from '@playwright/test';
import { syntheticVault } from './synthetic-vault';

const dir = process.env.SCREENSHOT_DIR;
const backgrounds = {
  light: 'rgb(246, 243, 238)',
  dark: 'rgb(20, 19, 17)',
} as const;

async function assertTheme(page: Page, theme: 'light' | 'dark') {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  const group = page.getByRole('group', { name: 'Color mode' });
  if (await group.count()) {
    const label = theme === 'dark' ? 'Dark' : 'Light';
    await expect(group.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(backgrounds[theme]);
}

async function expectNoStrayToast(page: Page) {
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 2_000 });
}

async function expectChartsDrawn(page: Page) {
  await expect.poll(async () => page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')];
    if (!canvases.length) return false;
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
}

async function freezeCharts(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('canvas').forEach(node => {
      const canvas = node as HTMLCanvasElement;
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.alt = canvas.getAttribute('aria-label') || 'Chart';
      img.style.width = `${canvas.clientWidth}px`;
      img.style.height = `${canvas.clientHeight}px`;
      img.dataset.chartShot = '1';
      canvas.insertAdjacentElement('afterend', img);
      canvas.style.display = 'none';
    });
  });
}

async function thawCharts(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('img[data-chart-shot]').forEach(img => img.remove());
    document.querySelectorAll('canvas').forEach(node => {
      (node as HTMLElement).style.display = '';
    });
  });
}

async function chooseTheme(page: Page, vault: Awaited<ReturnType<typeof syntheticVault>>, theme: 'light' | 'dark') {
  await page.evaluate(value => localStorage.setItem('ft-theme', value), theme);
  await vault.reload();
  await expectNoStrayToast(page);
  await assertTheme(page, theme);
}

test.describe('finance F1 screenshot matrix', () => {
  test.skip(!dir, 'Set SCREENSHOT_DIR to capture the 390/768/1280 light and dark matrix.');
  test.use({ reducedMotion: 'reduce' });

  test('review scenes at 390, 768, and 1280 in light and dark', async ({ page }) => {
    test.setTimeout(600_000);
    const vault = await syntheticVault(page, {
      assets: [
        { id: 1, name: 'Checking', category: 'cash', current_value: 1500, as_of_date: '2026-10-01' },
        { id: 2, name: 'Broken', category: 'cash', current_value: -40, as_of_date: '2026-10-01' },
        { id: 3, name: 'Huge', category: 'cash', current_value: 1_000_000_000_000_000, as_of_date: '2026-10-01' },
      ],
      liabilities: [{ id: 4, name: 'Card', category: 'credit_card', balance_owed: 100, as_of_date: '2026-10-01' }],
      holdings: [{
        id: 10, symbol: 'VOO', shares: 2, purchase_price: 0.1234, purchase_date: '2022-01-01',
        current_price: 100, price_source: 'manual', quote_date: '2026-10-08', position_as_of: '2026-10-10',
      }],
      subscriptions: [
        { id: 11, name: 'Cloud', category: 'software', amount: 15.99, frequency: 'monthly', next_bill_date: '2026-10-15', is_active: true },
        { id: 12, name: 'Legacy credit', category: 'software', amount: -480, frequency: 'monthly', next_bill_date: '2026-10-15', is_active: true },
      ],
      transactions: [
        { id: 13, date: '2026-10-02', type: 'expense', kind: 'purchase', category: 'Food', amount: 40, description: 'Grocery' },
        { id: 14, date: '2026-10-03', type: 'expense', kind: 'purchase', category: 'Food', amount: -45.67, description: 'Legacy return' },
      ],
    }, { role: 'admin' });

    const shot = async (name: string, width: number, theme: 'light' | 'dark') => {
      await assertTheme(page, theme);
      await expectNoStrayToast(page);
      const file = path.join(dir as string, `${name}-${width}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: true });
    };

    await vault.open('/');
    await expectNoStrayToast(page);

    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark'] as const) {
        await vault.open('/');
        await chooseTheme(page, vault, theme);
        await expect(page.locator('.source-dates')).toContainText('Balances');
        await shot('home-source-dates', width, theme);
        await page.locator('canvas[aria-label*="category"]').scrollIntoViewIfNeeded();
        await expectChartsDrawn(page);
        await freezeCharts(page);
        await shot('donuts-home', width, theme);
        await thawCharts(page);
        await page.locator('.skip-link').focus();
        await expect(page.locator('.skip-link')).toBeFocused();
        await shot('skip-link', width, theme);

        await vault.open('/have?t=assets');
        await expect(page.getByText('Needs fixing').first()).toBeVisible();
        await expect(page.getByText('Amount too large to count')).toBeVisible();
        await expect(page.getByText(/Excludes \d+ entr/)).toBeVisible();
        await shot('net-worth-needs-fixing', width, theme);

        await vault.open('/have?t=holdings');
        await expect(page.getByRole('button', { name: 'Delete VOO' })).toBeVisible();
        await shot('holdings', width, theme);

        await vault.open('/spending?t=activity');
        await expect(page.getByText('Needs fixing').filter({ visible: true }).first()).toBeVisible();
        await expect(page.locator('.month-total__note')).toBeVisible();
        await shot('activity-totals', width, theme);

        await vault.open('/spending?t=calendar');
        await expectChartsDrawn(page);
        await freezeCharts(page);
        await shot('donut-calendar', width, theme);
        await thawCharts(page);

        await vault.open('/planning');
        await expect(page.getByText('Current net worth').locator('..')).toContainText('$1,');
        await expect(page.getByText('−$480.00')).toHaveCount(0);
        await shot('planning-negative-subscription', width, theme);

        await vault.open('/planning?tool=simulation');
        await expect(page.getByText('Using ledger net worth')).toBeVisible();
        await expect(page.getByText('Choose saved inputs to delete.')).toBeVisible();
        await shot('planning-locks', width, theme);

        await vault.open('/planning?t=growth');
        const selectedPreset = page.getByRole('button', { name: '7% annual growth preset' });
        const otherPreset = page.getByRole('button', { name: '5% annual growth preset' });
        await expect(selectedPreset).toHaveAttribute('aria-pressed', 'true');
        const selectedStyle = await selectedPreset.evaluate(el => {
          const style = getComputedStyle(el);
          return { weight: style.fontWeight, shadow: style.boxShadow };
        });
        const otherWeight = await otherPreset.evaluate(el => getComputedStyle(el).fontWeight);
        expect(Number(selectedStyle.weight)).toBeGreaterThan(Number(otherWeight));
        expect(selectedStyle.shadow).toContain('inset');
        await selectedPreset.scrollIntoViewIfNeeded();
        await shot('growth-presets', width, theme);

        await vault.open('/planning?t=stocks');
        await expect(page.getByText('Save this scenario first to delete it.')).toBeVisible();
        await shot('stock-lab-delete', width, theme);

        await vault.open('/hub');
        await page.getByText('Breakdown').click();
        await expect(page.getByText('Debts')).toBeVisible();
        await shot('hub-net-worth', width, theme);

        await vault.open('/hub/admin');
        await expect(page.getByText("You can't change your own role or access.")).toBeVisible();
        await expect(page.getByText("You can't delete your own account.")).toBeVisible();
        await expect(page.getByText('This is the only active admin, so the role and access stay as they are.')).toBeVisible();
        await shot('admin-locks', width, theme);

        await vault.open('/recurring');
        await page.locator('header').getByRole('button', { name: 'Add job' }).click();
        const job = page.getByRole('dialog', { name: 'Add job' });
        await job.getByRole('button', { name: 'Save' }).click();
        await expect(job.locator('[data-error-summary]')).toBeFocused();
        await expect(job).toContainText('Enter the employer.');
        await shot('job-empty', width, theme);
        await job.getByRole('button', { name: 'Cancel' }).click();

        await vault.open('/recurring?t=spend');
        await page.getByRole('button', { name: 'Add subscription' }).click();
        const sub = page.getByRole('dialog', { name: 'Add subscription' });
        await sub.getByLabel('Name', { exact: true }).fill('Stream');
        await sub.getByLabel('Amount', { exact: true }).fill('-40');
        await sub.getByRole('button', { name: 'Save' }).click();
        await expect(sub).toContainText('Enter an amount above $0.');
        await shot('subscription-negative', width, theme);
        await sub.getByRole('button', { name: 'Cancel' }).click();

        await vault.open('/have?t=assets');
        await page.getByRole('button', { name: 'Add asset' }).click();
        const asset = page.getByRole('dialog', { name: 'Add asset' });
        await asset.getByLabel('Name', { exact: true }).fill('Savings');
        await asset.getByLabel('Value', { exact: true }).fill('250');
        vault.failNextWrites(1);
        await asset.getByRole('button', { name: 'Save' }).click();
        await expect(asset.getByRole('alert')).toBeVisible();
        await shot('asset-save-failure', width, theme);
        await asset.getByRole('button', { name: 'Cancel' }).click();
      }
    }
  });

  test('toast stack at 390, 768, and 1280 in light and dark', async ({ page }) => {
    test.setTimeout(300_000);
    const vault = await syntheticVault(page, {
      assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 1500, as_of_date: '2026-10-01' }],
      holdings: [{
        id: 10, symbol: 'VOO', shares: 2, purchase_price: 80, purchase_date: '2022-01-01',
        current_price: 100, price_source: 'manual', quote_date: '2026-10-08', position_as_of: '2026-10-10',
      }],
      subscriptions: [{
        id: 11, name: 'Cloud', category: 'software', amount: 15.99, frequency: 'monthly',
        next_bill_date: '2026-10-15', is_active: true,
      }],
    });
    const shot = async (name: string, width: number, theme: 'light' | 'dark') => {
      await assertTheme(page, theme);
      await page.screenshot({ path: path.join(dir as string, `${name}-${width}-${theme}.png`), fullPage: false });
    };
    await vault.open('/');
    await expectNoStrayToast(page);
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark'] as const) {
        await vault.open('/');
        await chooseTheme(page, vault, theme);
        await expectNoStrayToast(page);
        await vault.open('/have?t=holdings');
        await page.getByRole('button', { name: 'Delete VOO' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
        await vault.open('/recurring?t=spend');
        vault.failNextWrites(1);
        await page.getByRole('button', { name: 'Delete' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
        await vault.open('/have?t=assets');
        await page.getByRole('button', { name: 'Add asset' }).click();
        const added = page.getByRole('dialog', { name: 'Add asset' });
        await added.getByLabel('Name', { exact: true }).fill('Cash');
        await added.getByLabel('Value', { exact: true }).fill('10');
        await added.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByText('Asset added')).toBeVisible();
        await expect(page.locator('.toast')).toHaveCount(3);
        await page.mouse.move(0, 0);
        await shot('toast-stack', width, theme);
        const dismiss = page.locator('.toast-dismiss').first();
        await dismiss.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(dismiss).toBeFocused();
        expect(await dismiss.evaluate(el => el.matches(':focus-visible'))).toBe(true);
        await shot('toast-dismiss-focused', width, theme);
        await page.getByRole('button', { name: 'Undo' }).click();
        await expect.poll(() => vault.data('holdings').some(row => row.symbol === 'VOO')).toBe(true);
      }
    }
  });

  test('no-ticker price failure and refund chart', async ({ page }) => {
    test.setTimeout(180_000);
    const vault = await syntheticVault(page, {
      job_incomes: [{
        id: 21,
        employer: 'Private Co',
        pay_frequency: 'annual',
        base_pay: 80000,
        effective_date: '2026-01-01',
        is_active: true,
        stock_symbol: '',
        stock_grants: [{ date: '2026-02-01', origin: 'equity', label: 'Grant', quantity: 10, price_at_grant: 5 }],
      }],
      transactions: [
        { id: 13, date: '2026-10-02', type: 'expense', kind: 'purchase', category: 'Food', amount: 40, description: 'Grocery' },
        { id: 15, date: '2026-10-04', type: 'expense', kind: 'refund', category: 'Travel', amount: 12, description: 'Fare refund' },
      ],
    });
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark'] as const) {
        await vault.open('/recurring');
        await page.evaluate(value => localStorage.setItem('ft-theme', value), theme);
        await vault.reload();
        await expectNoStrayToast(page);
        await page.getByText('Show pay and stock history').click();
        const controls = page.locator('section[aria-label="Private share price controls"]');
        await controls.getByLabel('Manual price as of').fill('2026-10-01');
        await controls.locator('input[type="number"]').fill('12.5');
        vault.failNextWrites(1);
        await controls.getByRole('button', { name: 'Save current manual price' }).click();
        await expect(controls).toContainText('Manual price could not be saved');
        await expect(page.getByText("Couldn't save this share price. Try again.")).toBeVisible();
        await page.screenshot({ path: path.join(dir as string, `no-ticker-price-${width}-${theme}.png`), fullPage: true });
        await page.getByRole('button', { name: 'Dismiss' }).click();

        await vault.open('/');
        await expectNoStrayToast(page);
        await page.locator('canvas').first().scrollIntoViewIfNeeded();
        await expectChartsDrawn(page);
        await freezeCharts(page);
        await page.screenshot({ path: path.join(dir as string, `refund-donut-${width}-${theme}.png`), fullPage: true });
        await thawCharts(page);
      }
    }
  });
});
