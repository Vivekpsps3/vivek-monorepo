import AxeBuilder from '@axe-core/playwright';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { expect, test } from './frozen-clock';
import { moneyText } from './money-text';
import { field, SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from './synthetic-vault';

const rent = {
  id: 80, name: 'Harbor rent', category: 'Rent', amount: 1200, frequency: 'monthly',
  start_date: '2026-01-05', due_day: 5, autopay: true, payment_account: 'Household checking',
  notes: 'Unit 2', is_active: true,
};
const gas = {
  id: 81, name: 'Pier gas', category: 'Utilities', amount: 55, frequency: 'monthly',
  start_date: '2026-01-12', due_day: 12, autopay: false, is_active: true,
};
const archive = {
  id: 80, name: 'Maritime archives', category: 'Subscriptions', amount: 90, frequency: 'quarterly',
  next_bill_date: '2026-10-17', payment_account: 'Everyday card', notes: 'Shared access', is_active: true,
};
const posted = {
  id: 82, date: '2026-10-06', type: 'expense', kind: 'purchase', category: 'Rent',
  amount: 1200, description: 'Harbor rent payment',
};
const seed = { fixed_expenses: [rent, gas], subscriptions: [archive], transactions: [posted] };

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${viewport.width} ${theme}`, () => {
      const touch = viewport.width === 390;
      test.use({ viewport, hasTouch: touch, reducedMotion: 'reduce' });

      test('opens the direct Bills workspace and saves each record through its real editor', async ({ page }, info) => {
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
        const vault = await syntheticVault(page, seed);
        await vault.open('/');
        const link = page.getByRole('navigation', { name: 'Finance sections' }).getByRole('link', { name: 'Bills', exact: true });
        await expect(link).toHaveAttribute('href', '/finance/bills');
        if (touch) await link.tap();
        else {
          await link.focus();
          await page.keyboard.press('Enter');
        }
        await expect(page).toHaveURL(/\/finance\/bills$/);
        await expect(link).toHaveAttribute('aria-current', 'page');
        const heading = page.getByRole('heading', { level: 1, name: 'Bills and subscriptions' });
        await expect(heading).toBeFocused();
        const list = page.getByRole('table', { name: 'Bills and subscriptions' });
        await expect(list.locator('tbody tr')).toHaveCount(3);
        const rentRow = list.getByRole('row', { name: /Harbor rent/ });
        const gasRow = list.getByRole('row', { name: /Pier gas/ });
        const archiveRow = list.getByRole('row', { name: /Maritime archives/ });
        await expect(gasRow).toContainText('Possibly overdue');
        await expect(gasRow).toContainText('Manual');
        await expect(rentRow).toContainText('Autopay');
        await expect(rentRow).not.toContainText('Possibly overdue');
        await expect(archiveRow).toContainText('Upcoming');
        await expect(archiveRow).toContainText(moneyText('$30.00 / month'));
        await expect(archiveRow).not.toContainText('Manual');
        await expect(page.locator('.commitment-totals')).toContainText(moneyText('$1,285.00'));
        await expect(page.locator('.commitment-totals')).toContainText(moneyText('$15,420.00'));
        for (const control of await list.getByRole('button').all()) {
          const box = await control.boundingBox();
          expect(box?.width).toBeGreaterThanOrEqual(44);
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        expect((await new AxeBuilder({ page }).include('app-bills').analyze()).violations).toEqual([]);
        const listCapture = info.outputPath('bills-list.png');
        await page.screenshot({ path: listCapture, fullPage: true });
        await info.attach('bills-list', { path: listCapture, contentType: 'image/png' });

        const editBill = rentRow.getByRole('button', { name: 'Edit', exact: true });
        if (touch) await editBill.tap();
        else {
          await editBill.focus();
          await page.keyboard.press('Enter');
        }
        const billDialog = page.getByRole('dialog', { name: 'Edit bill' });
        await expect(field(billDialog, 'Name')).toBeFocused();
        await expect(field(billDialog, 'Due day')).toHaveValue('5');
        await expect(billDialog.getByRole('checkbox', { name: 'Autopay' })).toBeChecked();
        await field(billDialog, 'Notes').fill('Updated unit');
        const save = billDialog.getByRole('button', { name: 'Save', exact: true });
        if (touch) await save.tap();
        else {
          await save.focus();
          await page.keyboard.press('Enter');
        }
        await expect(billDialog).toBeHidden();
        await expect(editBill).toBeFocused();
        expect(vault.data('fixed_expenses').find(row => row.id === rent.id)).toMatchObject({ ...rent, notes: 'Updated unit' });

        const editSubscription = archiveRow.getByRole('button', { name: 'Edit', exact: true });
        await editSubscription.click();
        const subscriptionDialog = page.getByRole('dialog', { name: 'Edit subscription' });
        await expect(field(subscriptionDialog, 'Next bill date')).toHaveValue(archive.next_bill_date);
        await expect(subscriptionDialog.getByRole('checkbox', { name: 'Autopay' })).toHaveCount(0);
        await field(subscriptionDialog, 'Amount').fill('96');
        expect((await new AxeBuilder({ page }).include('app-bills').analyze()).violations).toEqual([]);
        const editorCapture = info.outputPath('subscription-editor.png');
        await page.screenshot({ path: editorCapture });
        await info.attach('subscription-editor', { path: editorCapture, contentType: 'image/png' });
        await subscriptionDialog.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(subscriptionDialog).toBeHidden();
        await expect(editSubscription).toBeFocused();
        await expect(archiveRow).toContainText(moneyText('$32.00 / month'));
        expect(vault.data('subscriptions')).toEqual([expect.objectContaining({ ...archive, amount: 96 })]);
        expect(vault.data('transactions')).toEqual([posted]);
        expect(vault.mutations.map(({ body }) => body.records.map(({ collection, expected_revision }) =>
          [collection, expected_revision]))).toEqual([[['fixed_expenses', 1]], [['subscriptions', 1]]]);

        await editSubscription.click();
        await field(subscriptionDialog, 'Amount').fill('120');
        await page.keyboard.press('Escape');
        await expect(subscriptionDialog).toBeHidden();
        await expect(editSubscription).toBeFocused();
        expect(vault.data('subscriptions')[0].amount).toBe(96);
      });
    });
  }
}

test('posted rent matches one projection without altering the monthly totals or ledger', async ({ page }) => {
  const oneMoreRent = { ...rent, id: 84, name: 'Studio rent', autopay: false };
  const vault = await syntheticVault(page, { ...seed, fixed_expenses: [rent, oneMoreRent, gas] });
  await vault.open('/');
  const activity = page.locator('.home-tile--activity');
  await expect(activity.locator('.home-tile__value')).toHaveText(moneyText('−$2,545.00'));
  await expect(activity).toContainText(moneyText('$1,200.00'));
  await expect(activity).toContainText(moneyText('$2,545.00'));
  await page.locator('.due-soon').getByRole('link', { name: 'Bills and subscriptions' }).click();
  await expect(page).toHaveURL(/\/finance\/bills$/);
  const list = page.getByRole('table', { name: 'Bills and subscriptions' });
  await expect(list.getByRole('row', { name: /Studio rent/ })).toContainText('Possibly overdue');
  await expect(list.getByRole('row', { name: /Harbor rent/ })).not.toContainText('Possibly overdue');
  expect(vault.data('transactions')).toEqual([posted]);
  expect(vault.mutations).toHaveLength(0);
});

test('lock discards the held subscription save and restores only allowed Bills filters', async ({ page }) => {
  const vault = await syntheticVault(page, seed);
  const second = await page.context().newPage();
  await vault.open('/bills?kind=subscription&status=active');
  await vault.open('/', second);
  const row = page.getByRole('row', { name: /Maritime archives/ });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit subscription' });
  await dialog.getByLabel('Notes').fill('Private held archive draft');
  vault.holdNextUpserts();
  vault.failNextWrites();
  try {
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await vault.waitForHeldUpserts();
    const menu = await openUserMenu(second);
    await menu.getByRole('button', { name: 'Lock Finance', exact: true }).click();
    await expect(page).toHaveURL(/\/finance\/vault\/unlock/);
    await expect(row).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
  } finally {
    vault.releaseHeldUpserts();
  }
  await page.getByLabel('Vault passphrase').fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/bills\?kind=subscription&status=active$/);
  await expect(row).toBeVisible();
  await expect(page.getByText(/Private held archive draft|Couldn't save|Subscription saved/)).toHaveCount(0);
  expect(vault.data('subscriptions')[0]).toMatchObject(archive);
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(dialog.getByLabel('Notes')).toHaveValue(archive.notes);
});

test('the list retries a failed delete and cancels a confirmation when leaving', async ({ page }) => {
  const vault = await syntheticVault(page, seed);
  await vault.open('/');
  const nav = page.getByRole('navigation', { name: 'Finance sections' });
  await nav.getByRole('link', { name: 'Bills', exact: true }).click();
  const bill = page.getByRole('row', { name: /Harbor rent/ });
  const subscription = page.getByRole('row', { name: /Maritime archives/ });
  await bill.getByRole('button', { name: 'Delete', exact: true }).click();
  const billConfirm = page.getByRole('dialog', { name: 'Delete bill?' });
  await expect(billConfirm).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/finance\/?$/);
  await expect(billConfirm).toHaveCount(0);
  expect(vault.mutations).toHaveLength(0);
  await page.goForward();
  await expect(page).toHaveURL(/\/finance\/bills$/);
  await bill.getByRole('button', { name: 'Delete', exact: true }).click();
  vault.failNextWrites();
  await billConfirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(bill.getByRole('alert')).toContainText('Could not delete this bill.');
  expect(vault.data('fixed_expenses')).toContainEqual(rent);
  await bill.getByRole('button', { name: 'Retry delete', exact: true }).click();
  await billConfirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(bill).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Bills and subscriptions' })).toBeFocused();
  await expect(subscription).toBeVisible();
  await subscription.getByRole('button', { name: 'Delete', exact: true }).click();
  const subConfirm = page.getByRole('dialog', { name: 'Delete subscription?' });
  await subConfirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(subscription).toHaveCount(0);
  expect(vault.data('fixed_expenses')).toEqual([gas]);
  expect(vault.data('subscriptions')).toHaveLength(0);
  expect(vault.data('transactions')).toEqual([posted]);
  expect(vault.mutations.map(({ body }) => body.records.map(({ collection, expected_revision }) =>
    [collection, expected_revision]))).toEqual([[['fixed_expenses', 1]], [['fixed_expenses', 1]], [['subscriptions', 1]]]);
});
