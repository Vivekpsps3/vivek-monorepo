import AxeBuilder from '@axe-core/playwright';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { expect, test } from './frozen-clock';
import { chaseGood } from './fixtures/bank-csv';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from './synthetic-vault';

const fidelityCsv = [
  'Account Number,Account Name,Symbol,Quantity,Average Cost Basis,Last Price,Current Value',
  'Z111,Individual,VOO,2,80,120,240',
  'Z111,Individual,SPAXX,100,,1,100',
].join('\n');

const holdingSeed = () => ({
  brokerage_accounts: [{ id: 30, broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: 'Z111', label: 'Fidelity ···Z111' }],
  holdings: [{
    id: 12, symbol: 'VOO', shares: 1, purchase_price: 80, purchase_date: '2026-01-01',
    current_price: 100, price_source: 'manual', brokerage_account_id: 30, account_display: 'Fidelity ···Z111',
  }],
});

test('FUX-07-A1 keeps the existing position until a Fidelity resume verifies the replacement', async ({ page }) => {
  const vault = await syntheticVault(page, holdingSeed());
  await vault.open('/have?t=holdings');
  await page.getByRole('button', { name: 'Holdings actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import from Fidelity', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Import from Fidelity/ });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'positions.csv', mimeType: 'text/csv', buffer: Buffer.from(fidelityCsv),
  });
  await dialog.getByRole('button', { name: /Preview/ }).click();
  await expect(dialog.getByRole('table', { name: 'Fidelity import preview' })).toBeVisible();
  vault.failWriteIn('holdings');
  await dialog.getByRole('button', { name: 'Replace', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Replace Fidelity holdings?' });
  await confirmation.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect.poll(() => vault.data('import_batches').filter(row => row.record_type === 'holding_stage').length).toBe(1);
  expect(vault.data('holdings')).toEqual([expect.objectContaining({ symbol: 'VOO', shares: 1 })]);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('link', { name: 'Finish your Fidelity import', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/imports$/);
  await expect(page.getByText('Your existing holdings stay until the replacement is verified.')).toBeVisible();
  expect(vault.data('holdings')).toEqual([expect.objectContaining({ symbol: 'VOO', shares: 1 })]);
  await page.getByRole('button', { name: 'Resume Fidelity import', exact: true }).click();
  await expect.poll(() => vault.data('holdings').map(row => String(row.symbol).toUpperCase()).sort()).toEqual(['SPAXX', 'VOO']);
  expect(vault.data('holdings').find(row => row.symbol === 'VOO')?.shares).toBe(2);
  await expect(page.getByRole('button', { name: 'Resume Fidelity import', exact: true })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Finance sections' }).getByRole('link', { name: 'Holdings', exact: true }).click();
  await expect(page.locator('app-portfolio')).toContainText('SPAXX');
  await expect(page.locator('app-portfolio')).toContainText('VOO');
});

test('FUX-07-A2 retries a bank import through the same engine and opens restore', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/spending?t=imports', page, '/imports');
  await expect(page.getByRole('heading', { level: 1, name: 'Imports', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from bank', exact: true });
  await dialog.locator('#import-file').setInputFiles({
    name: 'chase.csv', mimeType: 'text/csv', buffer: Buffer.from(chaseGood),
  });
  await dialog.getByLabel('Bank for chase.csv', { exact: true }).selectOption('chase');
  await dialog.getByLabel('Account name', { exact: true }).fill('Chase card');
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await expect(dialog.locator('.import-summary').first()).toContainText('new');
  vault.failNextWrites(1);
  await dialog.getByRole('button', { name: /Import \d+ transaction/ }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /chase\.csv/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(dialog.getByLabel('Account name', { exact: true })).toHaveValue('Chase card');
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await expect(dialog.locator('.import-summary').first()).toContainText('new');
  vault.failNextWrites(0);
  await dialog.getByRole('button', { name: /Import \d+ transaction/ }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => vault.data('transactions').length).toBe(3);
  expect(new Set(vault.data('transactions').map(row => row.description)).size).toBe(3);

  await page.getByRole('link', { name: 'Restore encrypted backup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Restore encrypted backup', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/finance\/imports/);
  await expect(page.getByRole('heading', { name: /Import history/ })).toBeVisible();
  await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/vault\/unlock/);
});

test('FUX-07-LIFE drops a held bank import on lock and keeps the file after an ordinary failure', async ({ page }) => {
  const vault = await syntheticVault(page);
  const second = await page.context().newPage();
  await vault.open('/imports', page);
  await vault.open('/', second);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from bank', exact: true });
  const csv = [
    'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
    '10/02/2026,10/02/2026,DRAFT GROCER,Food,Sale,-4.00,',
  ].join('\n');
  await dialog.locator('#import-file').setInputFiles({
    name: 'draft-statement.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await dialog.getByLabel('Bank for draft-statement.csv', { exact: true }).selectOption('chase');
  await dialog.getByLabel('Account name', { exact: true }).fill('Draft card label');
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await expect(dialog.locator('.import-summary').first()).toContainText('new');
  vault.holdNextUpserts();
  vault.failNextWrites();
  try {
    await dialog.getByRole('button', { name: /Import \d+ transaction/ }).click();
    await vault.waitForHeldUpserts();
    const menu = await openUserMenu(second);
    await menu.getByRole('button', { name: 'Lock Finance', exact: true }).click();
    await expect(page).toHaveURL(/\/finance\/vault\/unlock/);
    await expect(page.getByText('draft-statement.csv')).toHaveCount(0);
    await expect(page.getByText('Draft card label')).toHaveCount(0);
  } finally {
    vault.releaseHeldUpserts();
  }
  await page.getByLabel('Vault passphrase').fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/imports/);
  await expect(page.getByText('draft-statement.csv')).toHaveCount(0);
  await expect(page.getByText('Draft card label')).toHaveCount(0);
  await expect(page.getByText(/Imported/)).toHaveCount(0);
  expect(vault.data('transactions')).toHaveLength(0);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`FUX-07-VIEW ${viewport.width} ${theme}`, () => {
      const touch = viewport.width === 390;
      test.use({ viewport, hasTouch: touch, reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });

      test('opens import history, checks targets, and returns from the bank dialog', async ({ page }, info) => {
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
        const vault = await syntheticVault(page, holdingSeed());
        await vault.open('/');
        const imports = page.getByRole('navigation', { name: 'Finance sections' }).getByRole('link', { name: 'Imports', exact: true });
        await expect(imports).toHaveAttribute('href', '/finance/imports');
        if (touch) await imports.tap();
        else {
          await imports.focus();
          await page.keyboard.press('Enter');
        }
        const heading = page.getByRole('heading', { level: 1, name: 'Imports', exact: true });
        await expect(heading).toBeFocused();
        await expect(page.getByRole('heading', { name: /Import history \(0\)/ })).toBeVisible();
        await expect(page.getByText('No Fidelity import is waiting. Existing positions stay until a replacement is verified.')).toBeVisible();
        const controls = [
          page.getByRole('button', { name: 'Import', exact: true }),
          page.getByRole('button', { name: 'Export activity CSV', exact: true }),
          page.getByRole('button', { name: 'Import from Fidelity', exact: true }),
          page.getByRole('button', { name: 'Export holdings CSV', exact: true }),
          page.getByRole('link', { name: 'Encrypted recovery backup', exact: true }),
          page.getByRole('button', { name: 'Lock Finance', exact: true }),
        ];
        for (const control of controls) {
          await expect(control).toBeVisible();
          const box = await control.boundingBox();
          expect(box?.width).toBeGreaterThanOrEqual(44);
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        expect((await new AxeBuilder({ page }).include('app-imports').analyze()).violations).toEqual([]);
        const image = info.outputPath(`imports-${viewport.width}-${theme}.png`);
        await page.screenshot({ path: image, fullPage: true });
        await info.attach(`imports-${viewport.width}-${theme}`, { path: image, contentType: 'image/png' });

        const opener = page.getByRole('button', { name: 'Import', exact: true });
        if (touch) await opener.tap();
        else {
          await opener.focus();
          await page.keyboard.press('Enter');
        }
        const dialog = page.getByRole('dialog', { name: 'Import from bank', exact: true });
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        if (!touch) await expect(opener).toBeFocused();
        expect(vault.data('transactions')).toHaveLength(0);
        expect(vault.data('holdings')).toHaveLength(1);
      });
    });
  }
}
