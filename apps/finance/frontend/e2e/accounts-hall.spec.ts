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

test.use({ hasTouch: true });

for (const [width, theme] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']] as const) {
  test(`Accounts hall unlocks one drawer at ${width} in ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });
    await page.addInitScript(choice => {
      localStorage.setItem('suite-theme', choice);
      localStorage.setItem('finance-auto-price-check:987', 'off');
    }, theme);
    const vault = await syntheticVault(page, {
      assets: [checking, zero], liabilities: [debt], holdings: [holding],
    });
    await vault.open('/have?t=hall');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const heading = page.getByRole('heading', { name: 'Accounts hall', level: 1 });
    await expect(heading).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Finance sections' }).getByRole('link', { name: 'Accounts', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect(page.getByText(longName, { exact: true })).toHaveCount(1);
    await expect(page.locator('[data-drawer="debt:21"]')).toContainText('Hidden');
    await expect(page.locator('app-accounts-hall')).not.toContainText('$');
    await expect(page.getByRole('region', { name: 'Net worth' })).toContainText('does not keep another ledger');
    expect(await page.locator('app-accounts-hall').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    for (const control of await page.locator('app-accounts-hall').getByRole('button').all()) {
      const box = await control.boundingBox();
      expect(Math.min(box!.height, box!.width)).toBeGreaterThanOrEqual(44);
    }
    for (const control of await page.locator('app-accounts-hall').getByRole('link').all()) {
      const box = await control.boundingBox();
      expect(Math.min(box!.height, box!.width)).toBeGreaterThanOrEqual(44);
    }
    expect((await new AxeBuilder({ page }).include('app-accounts-hall').analyze()).violations).toEqual([]);
    await info.attach(`hall-${width}-${theme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    const drawer = page.locator('[data-drawer="asset:11"]');
    const edit = page.getByRole('button', { name: 'Edit', exact: true });
    if (width === 390) await drawer.tap();
    else {
      await drawer.focus();
      await page.keyboard.press('Enter');
    }
    const detail = page.locator('[data-account-detail]');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(detail).toContainText('Statement');
    await expect(detail).toContainText('Published balance');
    await expect(page.locator('[data-drawer="debt:21"]')).toContainText('Hidden');
    await expect(page.locator('[data-hall-amount]')).toContainText(moneyText('$1,200.00'));
    const drawerBox = await drawer.boundingBox();
    const detailBox = await detail.boundingBox();
    expect(detailBox!.y).toBeGreaterThanOrEqual(drawerBox!.y);
    expect(detailBox!.y - (drawerBox!.y + drawerBox!.height)).toBeLessThan(32);
    expect(Math.abs(detailBox!.x - drawerBox!.x)).toBeLessThan(8);
    expect(vault.mutations).toHaveLength(0);
    if (width === 390) await edit.tap();
    else {
      await page.keyboard.press('Tab');
      await expect(edit).toBeFocused();
      await page.keyboard.press('Enter');
    }
    const dialog = page.getByRole('dialog', { name: 'Edit asset' });
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Harbor checking');
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeFocused();
    await expect(dialog.getByRole('textbox', { name: 'Value' })).toHaveValue('1200');
    const amount = dialog.getByRole('textbox', { name: 'Value' });
    await amount.fill('-20');
    await dialog.getByRole('button', { name: 'Save asset' }).click();
    await expect(amount).toBeFocused();
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-hall-amount]')).toContainText(moneyText('$1,200.00'));
    expect((await new AxeBuilder({ page }).include('app-accounts-hall').analyze()).violations).toEqual([]);
    await info.attach(`hall-correction-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(edit).toBeFocused();
    expect(vault.mutations).toHaveLength(0);
  });
}

test('editing one drawer updates the hall and the accounts list once, then lock clears the digits', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('finance-auto-price-check:987', 'off');
  });
  const vault = await syntheticVault(page, {
    assets: [checking, zero], liabilities: [debt], holdings: [holding],
  });
  await vault.open('/have?t=hall');
  const drawer = page.locator('[data-drawer="asset:11"]');
  await drawer.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit asset' });
  await expect(page.locator('[data-hall-total]')).toContainText(moneyText('$1,250.00'));
  await page.locator('[data-hall-amount]').evaluate(element => {
    const values: string[] = [];
    new MutationObserver(() => {
      values.push(element.textContent?.trim() ?? '');
      element.setAttribute('data-test-values', JSON.stringify(values));
    }).observe(element, { characterData: true, childList: true, subtree: true });
  });
  await page.locator('[data-hall-total]').evaluate(element => {
    const values: string[] = [];
    new MutationObserver(() => {
      values.push(element.textContent?.trim() ?? '');
      element.setAttribute('data-test-values', JSON.stringify(values));
    }).observe(element, { characterData: true, childList: true, subtree: true });
  });

  await dialog.getByRole('textbox', { name: 'Value' }).fill('1399.25');
  await dialog.getByRole('button', { name: 'Save asset' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
  await expect(page.locator('[data-hall-amount]')).toContainText(moneyText('$1,399.25'));
  await expect(page.locator('[data-hall-total]')).toContainText(moneyText('$1,449.25'));
  await expect(page.locator('[data-drawer="debt:21"]')).toContainText('Hidden');
  expect(JSON.parse((await page.locator('[data-hall-amount]').getAttribute('data-test-values'))!)).toHaveLength(1);
  expect(JSON.parse((await page.locator('[data-hall-total]').getAttribute('data-test-values'))!)).toHaveLength(1);
  const writes = () => vault.mutations.filter(change => change.path === '/api/vault/records/upsert');
  expect(writes()).toHaveLength(1);

  await page.getByRole('link', { name: 'Accounts list', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/have$/);
  const row = page.getByRole('table', { name: 'Assets' }).getByRole('row', { name: /Harbor checking/ });
  await expect(row.locator('.balance-value .money')).toHaveText(moneyText('$1,399.25'));
  await expect(page.locator('.net-worth-hero .stat-display')).toHaveText(moneyText('$1,449.25'));
  await expect(row).toContainText('As of Oct 1');
  expect(writes()).toHaveLength(1);
  expect(vault.data('assets').find(asset => asset.id === checking.id)).toMatchObject({
    ...checking, current_value: 1399.25,
  });

  await page.getByRole('link', { name: 'Accounts hall', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/have\?t=hall$/);
  await expect(page.locator('app-accounts-hall')).not.toContainText('$');
  await page.locator('[data-drawer="asset:11"]').click();
  await expect(page.locator('[data-hall-amount]')).toContainText(moneyText('$1,399.25'));
  await page.getByRole('button', { name: 'Lock balances', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-drawer="asset:11"]')).toBeFocused();
  await expect(page.locator('app-accounts-hall')).not.toContainText('$');
  await expect(page.locator('[data-hall-amount]')).toHaveCount(0);

  await page.locator('[data-drawer="asset:11"]').click();
  await expect(page.locator('[data-hall-amount]')).toContainText(moneyText('$1,399.25'));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-hall-amount]')).toContainText(moneyText('$1,399.25'));
  await (await openUserMenu(page)).getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page).toHaveURL(/\/vault\/unlock/);
  await expect(page.getByText(moneyText('$1,399.25'))).toHaveCount(0);
  await expect(page.getByText('Harbor checking', { exact: true })).toHaveCount(0);
  await page.getByLabel('Vault passphrase').fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/have$/);
  await expect(page.locator('.net-worth-hero .stat-display')).toHaveText(moneyText('$1,449.25'));
  await page.getByRole('link', { name: 'Accounts hall', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/have\?t=hall$/);
  await expect(page.locator('app-accounts-hall')).not.toContainText('$');
  expect(writes()).toHaveLength(1);
});

test('a drawer save that finishes after lock cannot restore its draft or digits', async ({ page }) => {
  const vault = await syntheticVault(page, { assets: [checking], liabilities: [debt] });
  const second = await page.context().newPage();
  await vault.open('/have?t=hall');
  await vault.open('/', second);
  await page.locator('[data-drawer="asset:11"]').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
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
    await expect(page.getByText('Harbor checking', { exact: true })).toHaveCount(0);
    await expect(page.getByText('$')).toHaveCount(0);
  } finally {
    vault.releaseHeldUpserts();
  }
  await page.getByLabel('Vault passphrase').fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/have$/);
  await expect(page.getByText('Unpublished coastal draft', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/couldn.t save|asset saved/i)).toHaveCount(0);
  await page.getByRole('link', { name: 'Accounts hall', exact: true }).click();
  await expect(page.locator('app-accounts-hall')).not.toContainText('$');
  await page.locator('[data-drawer="asset:11"]').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit asset' }).getByRole('textbox', { name: 'Name' })).toHaveValue(checking.name);
  expect(vault.data('assets')[0]).toMatchObject(checking);
});
