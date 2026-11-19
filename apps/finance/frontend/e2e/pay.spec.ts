import AxeBuilder from '@axe-core/playwright';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { expect, test } from './frozen-clock';
import { moneyText } from './money-text';
import { field, SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from './synthetic-vault';

const job = {
  id: 66, employer: 'Harbor Studio', pay_frequency: 'annual', base_pay: 36000,
  payday_frequency: 'monthly', first_pay_date: '2026-01-15',
  effective_date: '2025-11-01', is_active: true,
  compensation_payments: [{ date: '2026-01-18', kind: 'bonus', label: 'Studio bonus', amount: 400 }],
  stock_grants: [{
    date: '2025-11-01', origin: 'equity', label: 'Studio shares', quantity: 10, price_at_grant: 20,
    sales: [{ date: '2026-01-20', shares: 2, cash_proceeds: 200 }],
  }],
};
const deposit = {
  id: 67, date: '2026-01-16', type: 'income', kind: 'income',
  category: 'Pay', amount: 3600, description: 'Harbor deposit', source: 'import',
};
const seed = { job_incomes: [job], transactions: [deposit] };

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${viewport.width} ${theme}`, () => {
      const touch = viewport.width === 390;
      test.use({ viewport, hasTouch: touch, reducedMotion: 'reduce' });

      test('Pay explains the source total and edits a projection through the existing job editor', async ({ page }, info) => {
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
        const vault = await syntheticVault(page, seed);
        await vault.open('/');
        const payLink = page.getByRole('navigation', { name: 'Finance sections' }).getByRole('link', { name: 'Pay', exact: true });
        await expect(payLink).toHaveAttribute('href', '/finance/pay');
        if (touch) await payLink.tap();
        else {
          await payLink.focus();
          await page.keyboard.press('Enter');
        }
        await expect(page.getByRole('heading', { name: 'Pay', exact: true })).toBeFocused();
        await expect(payLink).toHaveAttribute('aria-current', 'page');

        const month = field(page, 'Income month');
        await expect(month).toHaveValue('2026-10');
        await month.fill('2026-01');
        await expect(page).toHaveURL(/\/finance\/pay\?month=2026-01$/);
        const totals = page.locator('.income-totals');
        await expect(totals.locator('div').filter({ hasText: 'Combined income' })).toContainText(moneyText('$3,600.00'));
        const disclosure = page.getByText('View income sources', { exact: true });
        if (touch) await disclosure.tap();
        else {
          await disclosure.focus();
          await page.keyboard.press('Enter');
        }
        const sources = page.getByRole('table', { name: 'Monthly income sources' });
        for (const [source, amount] of [
          ['Harbor Studio paycheck', '$3,000.00'],
          ['Harbor deposit income', '$3,600.00'],
          ['Dated bonus payment', '$400.00'],
          ['Stock grant sale', '$200.00'],
          ['Possible income overlap adjustment', '−$3,600.00'],
        ]) {
          await expect(sources.getByRole('row', { name: new RegExp(source) })).toContainText(moneyText(amount));
        }
        await expect(sources.getByRole('row', { name: /Possible income overlap adjustment/ })).toContainText('Monthly adjustment');
        await expect(sources.getByRole('row', { name: /Possible income overlap adjustment/ })).toContainText('within 20%');
        await expect(sources.locator('tbody tr')).toHaveCount(5);
        expect(vault.mutations).toHaveLength(0);

        const edit = page.getByRole('table', { name: 'Jobs and pay' }).getByRole('button', { name: 'Edit', exact: true });
        for (const control of [month, disclosure, edit]) {
          const box = await control.boundingBox();
          expect(box?.width).toBeGreaterThanOrEqual(44);
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        expect((await new AxeBuilder({ page }).include('app-pay').analyze()).violations).toEqual([]);
        const sourcesImage = info.outputPath('pay.png');
        await page.screenshot({ path: sourcesImage, fullPage: true });
        await info.attach('income-sources', { path: sourcesImage, contentType: 'image/png' });

        if (touch) await edit.tap();
        else {
          await edit.focus();
          await page.keyboard.press('Enter');
        }
        const dialog = page.getByRole('dialog', { name: 'Edit job' });
        await expect(field(dialog, 'Employer')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(edit).toBeFocused();

        await edit.click();
        await field(dialog, 'Yearly pay').fill('38400');
        const save = dialog.getByRole('button', { name: 'Save', exact: true });
        const editorImage = info.outputPath('job-editor.png');
        await page.screenshot({ path: editorImage });
        await info.attach('job-editor', { path: editorImage, contentType: 'image/png' });
        expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
        if (touch) await save.tap();
        else {
          await save.focus();
          await page.keyboard.press('Enter');
        }
        await expect(dialog).toBeHidden();
        await expect(edit).toBeFocused();
        await expect(totals.locator('div').filter({ hasText: 'Recorded deposits' })).toContainText(moneyText('$3,600.00'));
        await expect(totals.locator('div').filter({ hasText: 'Combined income' })).toContainText(moneyText('$3,800.00'));
        if (!(await sources.isVisible())) await disclosure.click();
        await expect(sources.getByRole('row', { name: /Dated bonus payment/ })).toHaveCount(1);
        await expect(sources.getByRole('row', { name: /Stock grant sale/ })).toHaveCount(1);
        expect(vault.data('transactions')).toEqual([deposit]);
        expect(vault.data('job_incomes')).toHaveLength(1);
        expect(vault.data('job_incomes')[0]).toMatchObject({
          base_pay: 38400, compensation_payments: job.compensation_payments, stock_grants: job.stock_grants,
        });
        expect(vault.mutations).toHaveLength(1);
        expect(vault.mutations[0].body.records).toEqual([expect.objectContaining({
          collection: 'job_incomes', expected_revision: 1, ciphertext_b64: expect.any(String),
        })]);
        expect(JSON.stringify(vault.mutations[0].body)).not.toContain(job.employer);

        await page.getByText('View compensation history', { exact: true }).click();
        const report = page.getByRole('table', { name: 'Total compensation by employer' });
        await expect(report).toContainText(job.employer);
        await expect(report.getByRole('row', { name: /Harbor Studio/ })).toContainText(moneyText('$200.00'));
        const reportImage = info.outputPath('compensation.png');
        await report.scrollIntoViewIfNeeded();
        await page.screenshot({ path: reportImage, fullPage: true });
        await info.attach('compensation-history', { path: reportImage, contentType: 'image/png' });
        expect((await new AxeBuilder({ page }).include('app-compensation-report').analyze()).violations).toEqual([]);
      });
    });
  }
}

test('a failed projection save keeps its draft and a held retry clears on vault lock', async ({ page }) => {
  const vault = await syntheticVault(page, seed);
  const second = await page.context().newPage();
  const path = '/pay?month=2026-01&history=1&start=2026-01-01&end=2026-01-31';
  await vault.open(path);
  await vault.open('/', second);
  const edit = page.getByRole('table', { name: 'Jobs and pay' }).getByRole('button', { name: 'Edit', exact: true });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'Edit job' });
  const yearly = field(dialog, 'Yearly pay');
  await yearly.fill('38400');
  const save = dialog.getByRole('button', { name: 'Save', exact: true });
  vault.failNextWrites();
  await save.click();
  const saveError = dialog.getByRole('alert');
  await expect(saveError).toHaveText(/couldn't save/i);
  await expect(saveError).toBeFocused();
  await expect(yearly).toHaveValue('38400');
  expect(vault.data('job_incomes')[0].base_pay).toBe(36000);

  vault.holdNextUpserts();
  vault.failNextWrites();
  try {
    await save.click();
    await vault.waitForHeldUpserts();
    const menu = await openUserMenu(second);
    await menu.getByRole('button', { name: 'Lock Finance', exact: true }).click();
    await expect(page).toHaveURL(/\/finance\/vault\/unlock/);
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('app-pay')).toHaveCount(0);
  } finally {
    vault.releaseHeldUpserts();
  }
  await page.getByLabel('Vault passphrase').fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(new URL('/finance' + path, page.url()).href);
  await expect(field(page, 'Income month')).toHaveValue('2026-01');
  await expect(field(page, 'From')).toHaveValue('2026-01-01');
  await expect(page.getByText(/Couldn't save this job|Job saved/)).toHaveCount(0);
  await edit.click();
  await expect(yearly).toHaveValue('36000');
  expect(vault.data('transactions')).toEqual([deposit]);
});

test('browser Back and Forward restore the income month without modifying the historical report range', async ({ page }) => {
  const vault = await syntheticVault(page, seed);
  await vault.open('/pay?history=1&year=2025');
  const month = field(page, 'Income month');
  await month.fill('2026-01');
  await expect(page).toHaveURL(/month=2026-01/);
  await expect(page.getByRole('combobox', { name: 'Calendar year', exact: true })).toHaveValue('2025');
  await page.goBack();
  await expect(month).toHaveValue('2026-10');
  await page.goForward();
  await expect(month).toHaveValue('2026-01');
  await expect(field(page, 'Through')).toHaveValue('2025-12-31');
  expect(vault.mutations).toHaveLength(0);
});
