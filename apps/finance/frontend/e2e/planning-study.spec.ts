import AxeBuilder from '@axe-core/playwright';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { expect, test, type Page } from './frozen-clock';
import { moneyText } from './money-text';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from './synthetic-vault';

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
const deposit = {
  id: 83, date: '2026-10-01', type: 'income', kind: 'income', category: 'Pay', amount: 5000,
  description: 'Northwind deposit',
};
const job = {
  id: 66, employer: 'Northwind', pay_frequency: 'annual', base_pay: 60000,
  payday_frequency: 'monthly', first_pay_date: '2026-10-01', effective_date: '2026-01-01', is_active: true,
};
const checking = {
  id: 11, name: 'Harbor checking', category: 'checking', current_value: 1200, as_of_date: '2026-10-01',
};
const records = {
  assets: [checking],
  fixed_expenses: [rent, gas],
  subscriptions: [archive],
  transactions: [posted, deposit],
  job_incomes: [job],
};

async function expectStudyTargets(page: Page): Promise<void> {
  const controls = page.locator('app-planning-study').locator('.study-row, .month-field input, a.ui-btn');
  for (const control of await controls.all()) {
    const box = await control.boundingBox();
    expect(Math.min(box!.height, box!.width)).toBeGreaterThanOrEqual(44);
  }
}

test.use({ hasTouch: true });

for (const [width, theme] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']] as const) {
  test(`Planning study labels a bill and a simulation at ${width} in ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });
    await page.addInitScript(choice => {
      localStorage.setItem('suite-theme', choice);
      localStorage.setItem('finance-auto-price-check:987', 'off');
    }, theme);
    const vault = await syntheticVault(page, records);
    await vault.open('/have?t=study');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const study = page.locator('app-planning-study');
    await expect(page.getByRole('heading', { name: 'Planning study', level: 1 })).toBeVisible();
    await expect(study).not.toContainText('$');
    await expect(page.locator('[data-study-inspector]')).toContainText('Harbor rent');
    await expect(page.locator('[data-study-inspector]')).toContainText('Hidden');
    await expect(page.locator('[data-study-inspector]')).toBeInViewport({ ratio: 1 });
    await expect(study).toContainText('does not keep another ledger');
    expect(await study.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await expectStudyTargets(page);
    expect((await new AxeBuilder({ page }).include('app-planning-study').analyze()).violations).toEqual([]);
    await info.attach(`study-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });

    const rentRow = page.locator('[data-bill="bill:80:2026-10-05"]');
    if (width === 390) await rentRow.tap();
    else {
      await rentRow.focus();
      await page.keyboard.press('Enter');
    }
    const actual = page.locator('[data-bill-actual]');
    const projected = page.locator('[data-bill-projected]');
    await expect(actual).toContainText('Actual');
    await expect(actual).toContainText('Posted payment');
    await expect(actual).toContainText(moneyText('$1,200.00'));
    await expect(projected).toContainText('Projected');
    await expect(projected).toContainText('Scheduled commitment');
    await expect(projected).toContainText(moneyText('$1,200.00'));
    await expect(page.getByRole('dialog', { name: 'Edit bill' })).toBeVisible();
    await expect(page.locator('[data-bill="bill:81:2026-10-12"]')).toContainText('Hidden');
    await expect(page.locator('[data-bill="subscription:80:2026-10-17"]')).not.toContainText('$');
    await expect(page).toHaveURL(/bill=bill:80:2026-10-05/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(rentRow).toBeFocused();
    expect((await new AxeBuilder({ page }).include('app-planning-study').analyze()).violations).toEqual([]);
    await info.attach(`study-bill-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });

    const payRow = page.locator('[data-pay="66"]');
    if (width === 390) await payRow.tap();
    else {
      await payRow.focus();
      await page.keyboard.press('Enter');
    }
    await expect(page.getByRole('dialog', { name: 'Edit job' })).toBeVisible();
    await expect(page.locator('[data-pay-actual]')).toContainText('Actual');
    await expect(page.locator('[data-pay-actual]')).toContainText(moneyText('$5,000.00'));
    await expect(page.locator('[data-pay-projected]')).toContainText('Projected');
    await expect(page.locator('[data-pay-projected]')).toContainText(moneyText('$5,000.00'));
    await expect(page.locator('[data-bill-actual]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(payRow).toBeFocused();

    const simulation = page.locator('[data-model="simulation"]');
    if (width === 390) await simulation.tap();
    else {
      await simulation.focus();
      await page.keyboard.press('Enter');
    }
    await expect(page.locator('[data-model-actual]')).toContainText('Actual');
    await expect(page.locator('[data-model-actual]')).toContainText(moneyText('$1,200.00'));
    await expect(page.locator('[data-model-projected]')).toContainText('Projected');
    await expect(page.locator('[data-model-projected] .money')).toContainText('$');
    await expect(page.locator('[data-model-projected]')).toContainText('does not change your current balances');
    const openSimulation = page.getByRole('link', { name: 'Open Simulation', exact: true });
    await expect(openSimulation).toBeVisible();
    await expectStudyTargets(page);
    expect((await new AxeBuilder({ page }).include('app-planning-study').analyze()).violations).toEqual([]);
    await info.attach(`study-simulation-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });

    const before = {
      asset: vault.data('assets').find(row => row.id === checking.id).current_value,
      posted: vault.data('transactions').find(row => row.id === posted.id).amount,
      deposit: vault.data('transactions').find(row => row.id === deposit.id).amount,
      rent: vault.data('fixed_expenses').find(row => row.id === rent.id).amount,
    };
    if (width === 390) await openSimulation.tap();
    else {
      await openSimulation.focus();
      await page.keyboard.press('Enter');
    }
    await expect(page).toHaveURL(/\/finance\/planning\/simulation$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Simulation' })).toBeVisible();
    const horizon = page.getByLabel('Horizon', { exact: true });
    await horizon.fill('18');
    await horizon.blur();
    await expect(horizon).toHaveValue('18');
    await page.getByRole('navigation', { name: 'Finance sections' }).getByRole('link', { name: 'Accounts', exact: true }).click();
    await expect(page).toHaveURL(/\/finance\/have$/);
    expect(vault.data('assets').find(row => row.id === checking.id).current_value).toBe(before.asset);
    expect(vault.data('transactions').find(row => row.id === posted.id).amount).toBe(before.posted);
    expect(vault.data('transactions').find(row => row.id === deposit.id).amount).toBe(before.deposit);
    expect(vault.data('fixed_expenses').find(row => row.id === rent.id).amount).toBe(before.rent);
    expect(vault.data('liabilities')).toEqual([]);
    expect(vault.mutations.filter(change => change.path === '/api/vault/records/upsert')).toEqual([]);
    await info.attach(`study-bank-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}

test('a locked vault keeps bill names and amounts off the unlock screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('finance-auto-price-check:987', 'off'));
  const vault = await syntheticVault(page, records);
  await vault.open('/have?t=study');
  await page.locator('[data-bill="bill:80:2026-10-05"]').tap();
  await expect(page.locator('[data-bill-actual]')).toContainText(moneyText('$1,200.00'));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-bill-actual]')).toContainText(moneyText('$1,200.00'));
  await (await openUserMenu(page)).getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page).toHaveURL(/\/vault\/unlock/);
  const unlock = page.locator('app-vault-unlock');
  await expect(unlock).not.toContainText('Harbor rent');
  await expect(unlock).not.toContainText('Northwind');
  await expect(unlock).not.toContainText('Maritime archives');
  await expect(unlock).not.toContainText('$');
  await info.attach('study-locked', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByLabel('Vault passphrase').fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/have$/);
  await expect(page.getByText('Harbor rent', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Planning study', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/have\?t=study$/);
  await expect(page.locator('app-planning-study')).not.toContainText('$');
  await expect(page.locator('[data-study-inspector]')).toContainText('Harbor rent');
  await expect(page.locator('[data-study-inspector]')).toContainText('Hidden');
  await info.attach('study-relocked', { body: await page.screenshot(), contentType: 'image/png' });
});
