import AxeBuilder from '@axe-core/playwright';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { expect, test } from './frozen-clock';
import { moneyText } from './money-text';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from './synthetic-vault';

const checking = {
  id: 11, name: 'Harbor checking', category: 'checking', current_value: 1200,
  as_of_date: '2026-10-01', notes: 'Statement', review_interval_days: 0,
};
const longName = 'CoastalEstuaryConservationAndHarborEmergencyReserve';
const zero = { id: 12, name: longName, category: 'savings', current_value: 0 };
const debt = {
  id: 21, name: 'Harbor card balance', category: 'credit_card', balance_owed: 250, as_of_date: '2026-10-11',
};
const holding = {
  id: 31, symbol: 'VOO', shares: 2, current_price: 150, purchase_price: 100,
  price_source: 'manual', position_as_of: '2026-10-01',
};
const activity = {
  id: 41, name: 'Pier groceries', description: 'Pier groceries',
  date: '2026-10-04', amount: 40, type: 'expense', kind: 'purchase', category: 'Food',
};

test.use({ hasTouch: true });

for (const [width, theme] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']] as const) {
  test(`Accounts groups readable balances at ${width} in ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(choice => {
      localStorage.setItem('suite-theme', choice);
      localStorage.setItem('finance-auto-price-check:987', 'off');
    }, theme);
    const vault = await syntheticVault(page, {
      assets: [checking, zero], liabilities: [debt], holdings: [holding], transactions: [activity],
    });

    await vault.open('/');
    const accounts = page.getByRole('navigation', { name: 'Finance sections' }).getByRole('link', { name: 'Accounts' });
    if (width === 390) {
      await accounts.tap();
    } else {
      await accounts.focus();
      await page.keyboard.press('Enter');
    }
    await expect(page).toHaveURL(/\/finance\/have$/);
    const heading = page.getByRole('heading', { name: 'Accounts', level: 1 });
    await expect(heading).toBeInViewport();
    await expect(heading).toBeFocused();
    await expect(accounts).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    const assets = page.getByRole('table', { name: 'Assets' });
    const debts = page.getByRole('table', { name: 'Debts' });
    const checkingRow = assets.getByRole('row', { name: /Harbor checking/ });
    const zeroRow = assets.getByRole('row', { name: new RegExp(longName) });
    const debtRow = debts.getByRole('row', { name: /Harbor card balance/ });
    await expect(page.getByText(longName, { exact: true })).toHaveCount(1);
    await expect(checkingRow).toContainText('As of Oct 1');
    await expect(zeroRow).toContainText('No source date');
    await expect(zeroRow.locator('.balance-value .money')).toHaveText(moneyText('$0.00'));
    if (width === 390) {
      expect(await zeroRow.evaluate(row => {
        const name = row.querySelector('.balance-identity > span:first-child')!;
        const value = row.querySelector('.balance-value')!;
        const text = document.createRange();
        text.selectNodeContents(name);
        const valueEdge = value.getBoundingClientRect().left;
        return [...text.getClientRects()].every(line => line.right <= valueEdge + 1);
      })).toBe(true);
    }
    await expect(debtRow).toContainText('Credit Card');
    await expect(debtRow).toContainText('As of Oct 11');
    await expect(debtRow.locator('.balance-value .money')).toHaveText(moneyText('−$250.00'));
    await expect(page.locator('.source-dates')).toContainText('1 with no date');
    const total = page.locator('.net-worth-hero .stat-display');
    await expect(total).toHaveText(moneyText('$1,250.00'));
    await expect(page.getByText(activity.description, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'View card activity' })).toHaveAttribute('href', '/finance/spending');
    expect(await page.evaluate(() => {
      const containers = [document.documentElement, ...document.querySelectorAll('app-assets-liabilities .ui-data-table')];
      return containers.every(element => element.scrollWidth <= element.clientWidth + 1);
    })).toBe(true);
    for (const button of await checkingRow.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(Math.min(box!.height, box!.width)).toBeGreaterThanOrEqual(44);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await info.attach('accounts', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    const search = page.getByRole('searchbox', { name: 'Search accounts' });
    await search.fill('credit card');
    await expect(assets).toHaveCount(0);
    await expect(debtRow).toBeVisible();
    await expect(total).toHaveText(moneyText('$1,250.00'));
    const edit = debtRow.getByRole('button', { name: 'Edit' });
    await edit.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Edit debt' });
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeFocused();
    const amount = dialog.getByRole('textbox', { name: 'Amount owed' });
    await amount.fill('-20');
    await dialog.getByRole('button', { name: 'Save debt' }).click();
    await expect(amount).toBeFocused();
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await info.attach('accounts-correction', { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape');
    await expect(edit).toBeFocused();
    await expect(search).toHaveValue('credit card');
    expect(vault.mutations).toHaveLength(0);
  });
}

test('editing an account preserves the source date and updates net worth once after retry', async ({ page }) => {
  const vault = await syntheticVault(page, { assets: [checking, zero], liabilities: [debt], transactions: [activity] });
  await vault.open('/have?t=assets');
  const search = page.getByRole('searchbox', { name: 'Search accounts' });
  await search.fill('Harbor checking');
  const row = page.getByRole('table', { name: 'Assets' }).getByRole('row', { name: /Harbor checking/ });
  const edit = row.getByRole('button', { name: 'Edit' });
  const total = page.locator('.net-worth-hero .stat-display');
  await expect(total).toHaveText(moneyText('$950.00'));
  await total.evaluate(element => {
    const values: string[] = [];
    new MutationObserver(() => {
      values.push(element.textContent?.trim() ?? '');
      element.setAttribute('data-test-values', JSON.stringify(values));
    }).observe(element, { characterData: true, childList: true, subtree: true });
  });

  await edit.tap();
  const dialog = page.getByRole('dialog', { name: 'Edit asset' });
  const value = dialog.getByRole('textbox', { name: 'Value' });
  await value.fill('1399.25');
  vault.failNextWrites();
  const save = dialog.getByRole('button', { name: 'Save asset' });
  await save.tap();
  await expect(dialog.getByRole('alert')).toBeFocused();
  await expect(value).toHaveValue('1399.25');
  await expect(total).toHaveText(moneyText('$950.00'));
  expect(vault.data('assets').find(asset => asset.id === checking.id)).toMatchObject(checking);

  await save.tap();
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(total).toHaveText(moneyText('$1,149.25'));
  expect(JSON.parse((await total.getAttribute('data-test-values'))!)).toEqual([await total.textContent()]);
  await expect(row).toContainText('As of Oct 1');
  expect(vault.data('assets').find(asset => asset.id === checking.id)).toMatchObject({ ...checking, current_value: 1399.25 });
  expect(vault.mutations.map(change => change.body.records.map((record: { collection: string; expected_revision: number }) => ({
    collection: record.collection, expectedRevision: record.expected_revision,
  })))).toEqual([[{ collection: 'assets', expectedRevision: 1 }], [{ collection: 'assets', expectedRevision: 1 }]]);

  await page.getByRole('link', { name: 'View card activity' }).tap();
  await expect(page.getByRole('row', { name: /Pier groceries/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/finance\/have\?t=assets$/);
  await expect(total).toHaveText(moneyText('$1,149.25'));
  expect(vault.data('transactions')).toHaveLength(1);
  expect(vault.data('liabilities')[0]).toMatchObject(debt);
});

test('a balance save that finishes after a cross-tab lock cannot reopen a draft or publish feedback', async ({ page }) => {
  const vault = await syntheticVault(page, { assets: [checking], liabilities: [debt] });
  const second = await page.context().newPage();
  await vault.open('/have');
  await vault.open('/', second);
  const row = page.getByRole('table', { name: 'Assets' }).getByRole('row', { name: /Harbor checking/ });
  await row.getByRole('button', { name: 'Edit' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit asset' });
  await editor.getByRole('textbox', { name: 'Name' }).fill('Unpublished coastal draft');
  await editor.getByRole('textbox', { name: 'Value' }).fill('1399.25');
  vault.holdNextUpserts();
  vault.failNextWrites();
  try {
    await editor.getByRole('button', { name: 'Save asset' }).click();
    await vault.waitForHeldUpserts();
    const menu = await openUserMenu(second);
    await menu.getByRole('button', { name: 'Lock Finance', exact: true }).click();
    await expect(page).toHaveURL(/\/vault\/unlock/);
    await expect(editor).toHaveCount(0);
    await expect(page.getByText(checking.name)).toHaveCount(0);
  } finally {
    vault.releaseHeldUpserts();
  }
  await page.getByLabel('Vault passphrase').fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/have$/);
  await expect(row).toContainText(moneyText('$1,200.00'));
  await expect(page.getByText('Unpublished coastal draft', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/couldn.t save|asset saved/i)).toHaveCount(0);
  await row.getByRole('button', { name: 'Edit' }).click();
  await expect(editor.getByRole('textbox', { name: 'Name' })).toHaveValue(checking.name);
  expect(vault.data('assets')[0]).toMatchObject(checking);
});
