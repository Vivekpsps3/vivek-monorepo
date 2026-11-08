import AxeBuilder from '@axe-core/playwright';
import { type Locator, type Page } from '@playwright/test';
import { test, expect } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';
import { moneyText } from './money-text';
import { emptyCsv, fidelityGood, noPositions, notFidelity } from './fixtures/fidelity-csv';

async function upload(dialog: Locator, content: string, name = 'positions.csv') {
  await dialog.getByLabel('Fidelity positions CSV file').setInputFiles({
    name, mimeType: 'text/csv', buffer: Buffer.from(content),
  });
  await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
}

async function assertAccessible(page: Page) {
  // Contrast must be measured after the dialog's translucent entrance animation.
  await expect.poll(() => page.locator('ui-dialog').evaluateAll(dialogs => dialogs
    .flatMap(dialog => dialog.getAnimations({ subtree: true }))
    .filter(animation => animation.playState === 'running'
      && Number.isFinite(animation.effect?.getComputedTiming().iterations)).length)).toBe(0);
  const results = await new AxeBuilder({ page }).include('ui-dialog').analyze();
  expect(results.violations.filter(result => result.impact === 'serious' || result.impact === 'critical')).toEqual([]);
}

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${width} ${theme}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      });

      async function setup(page: Page) {
        const vault = await syntheticVault(page, {
          brokerage_accounts: [{ id: 30, broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: 'Z123', label: 'Fidelity ···Z123' }],
          holdings: [
            { id: 1, symbol: 'EXISTING', shares: 1, purchase_price: 10, current_price: 10, purchase_date: '2026-01-01', brokerage_account_id: 30, account_display: 'Fidelity ···Z123', lifecycle_status: 'active' },
            { id: 2, symbol: 'MANUAL', shares: 2, purchase_price: 20, current_price: 20, purchase_date: '2026-01-01', lifecycle_status: 'active' },
          ],
        });
        await vault.open('/have?t=holdings');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.getByRole('button', { name: 'Import from Fidelity', exact: true }).click();
        return { vault, dialog: page.getByRole('dialog', { name: 'Import from Fidelity', exact: true }) };
      }

      test('bad and empty files focus the error and preserve holdings', async ({ page }, testInfo) => {
        const { vault, dialog } = await setup(page);
        for (const [name, content] of [['wrong.csv', notFidelity], ['empty.csv', emptyCsv], ['no-positions.csv', noPositions]]) {
          const original = structuredClone(vault.data('holdings'));
          await upload(dialog, content, name);
          const alert = dialog.getByRole('alert');
          await expect(alert).toHaveText(/^This isn't a Fidelity positions export\./);
          await expect(alert).toBeFocused();
          await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeVisible();
          expect(vault.data('holdings')).toEqual(original);
          await assertAccessible(page);
          await page.screenshot({ path: testInfo.outputPath(name + '.png'), fullPage: true });
          await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
          const portfolio = page.locator('app-portfolio');
          await expect(portfolio.getByText('EXISTING', { exact: true }).first()).toBeVisible();
          await expect(portfolio.getByText('MANUAL', { exact: true }).first()).toBeVisible();
          await page.getByRole('button', { name: 'Import from Fidelity', exact: true }).click();
          await expect(dialog.getByRole('alert')).toHaveCount(0);
        }
      });

      test('only the replacement consequence uses warning color', async ({ page }, testInfo) => {
        const { dialog } = await setup(page);
        await upload(dialog, fidelityGood);
        const consequence = dialog.locator('.import-consequence');
        await expect(consequence).toHaveText(moneyText('2 positions · $1,250.00 · replaces your 1 Fidelity holding'));
        const helpColor = await dialog.locator('.import-help').first().evaluate(node => getComputedStyle(node).color);
        const consequenceColor = await consequence.evaluate(node => getComputedStyle(node).color);
        expect(consequenceColor).not.toBe(helpColor);
        expect(await dialog.evaluate((node, warning) => [...node.querySelectorAll('*')]
          .filter(child => child.className && getComputedStyle(child).color === warning)
          .map(child => child.className), consequenceColor)).toEqual(['import-consequence']);
        await assertAccessible(page);
        await page.screenshot({ path: testInfo.outputPath('preview.png'), fullPage: true });
      });

      test('Replace confirms the counts and retains the manual holding', async ({ page }) => {
        const { vault, dialog } = await setup(page);
        await upload(dialog, fidelityGood);
        await dialog.getByRole('button', { name: 'Replace', exact: true }).click();
        const confirmation = page.getByRole('dialog', { name: 'Replace Fidelity holdings?', exact: true });
        await expect(confirmation).toContainText('2 positions replace your 1 Fidelity holding. Manual holdings stay.');
        await assertAccessible(page);
        await confirmation.getByRole('button', { name: 'Replace', exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect(page.locator('.toast').filter({ hasText: 'Imported 2 Fidelity positions' })).toBeVisible();
        const portfolio = page.locator('app-portfolio');
        for (const symbol of ['TEST1', 'TEST2', 'MANUAL']) {
          await expect(portfolio.getByText(symbol, { exact: true }).first()).toBeVisible();
        }
        expect(vault.data('holdings').map(row => row.symbol).sort()).toEqual(['MANUAL', 'TEST1', 'TEST2']);
        expect(vault.data('holdings').find(row => row.symbol === 'MANUAL')).toEqual(expect.objectContaining({
          id: 2, shares: 2, purchase_price: 20,
        }));
        expect(vault.data('holdings').find(row => row.symbol === 'MANUAL')?.brokerage_account_id ?? null).toBeNull();
        expect(vault.data('import_batches').filter(row => row.record_type === 'holding_stage'))
          .toEqual([expect.objectContaining({ status: 'activated', cleanup_complete: true })]);
        await vault.reload();
        for (const symbol of ['TEST1', 'TEST2', 'MANUAL']) {
          await expect(portfolio.getByText(symbol, { exact: true }).first()).toBeVisible();
        }
      });

      test('cancelling replacement keeps both original holdings', async ({ page }) => {
        const { vault, dialog } = await setup(page);
        const original = structuredClone(vault.data('holdings'));
        await upload(dialog, fidelityGood);
        await dialog.getByRole('button', { name: 'Replace', exact: true }).click();
        const confirmation = page.getByRole('dialog', { name: 'Replace Fidelity holdings?', exact: true });
        await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(confirmation).toBeHidden();
        await expect(dialog).toBeVisible();
        expect(vault.data('holdings')).toEqual(original);
        expect(vault.data('import_batches')).toEqual([]);
      });
    });
  }
}
