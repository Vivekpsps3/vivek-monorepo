import { chooseColorTheme } from '../../../../tests/e2e/user-menu.mjs';
import { expect, type Locator, type Page, test } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

const viewports = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;

test('REC1–REC3 editors keep Save, optional values, and pay totals', async ({ page }) => {
  test.setTimeout(300_000);
  const vault = await syntheticVault(page, {
    job_incomes: [{
      id: 7,
      employer: 'Northwind',
      role_title: 'Engineer',
      pay_frequency: 'monthly',
      base_pay: 100.01,
      taxes_per_period: 10.01,
      deductions_per_period: 0.01,
      payday_frequency: 'biweekly',
      first_pay_date: '2026-10-16',
      effective_date: '2026-01-01',
      is_active: true,
      annual_bonus: 0,
      annual_equity: 0,
      annual_other: 0,
      annual_taxes: 0,
      annual_deductions: 0,
      notes: 'Keep this note',
      promotions: [{ date: '2026-06-01', annual_base_pay: 130000, role_title: 'Lead' }],
    }],
    fixed_expenses: [{
      id: 8, name: 'Rent', category: 'Rent', amount: 1500.5, frequency: 'monthly',
      start_date: '2026-01-01', due_day: 3, autopay: true, payment_account: 'Checking',
      is_active: true, notes: 'Lease',
    }],
    subscriptions: [{
      id: 9, name: 'Stream', category: 'Video', amount: 15.99, frequency: 'monthly',
      next_bill_date: '2026-10-20', payment_account: 'Visa', is_active: true, notes: 'Family plan',
    }],
  });

  await vault.open('/recurring');
  for (const theme of ['light', 'dark'] as const) {
    await chooseColorTheme(page, theme);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await exerciseJob(page, vault);
      await exerciseBill(page, vault);
      await exerciseSubscription(page, vault);
    }
  }

  await vault.open('/recurring');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const job = page.getByRole('dialog', { name: 'Edit job' });
  await job.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(job).toBeHidden();
  const saved = vault.data('job_incomes').find(row => row.employer === 'Northwind');
  expect(saved?.pay_frequency).toBe('annual');
  expect(saved?.base_pay).toBe(1200.12);
  expect(saved?.annual_taxes).toBe(120.12);
  expect(saved?.annual_deductions).toBe(0.12);
  expect(saved?.notes).toBe('Keep this note');
  expect(saved?.payday_frequency).toBe('biweekly');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const reopened = page.getByRole('dialog', { name: 'Edit job' });
  await expect(reopened.getByLabel('Yearly pay')).toHaveValue('1200.12');
  await expect(reopened.getByLabel('How often are you paid?')).toHaveValue('biweekly');
  await page.keyboard.press('Escape');
  await expect(reopened).toBeHidden();
});

async function exerciseJob(page: Page, vault: Awaited<ReturnType<typeof syntheticVault>>): Promise<void> {
  await vault.open('/recurring');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit job' });
  await expect(dialog.getByLabel('How often are you paid?')).toHaveCount(1);
  await expect(dialog.getByText('Pay frequency', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Paycheck schedule', { exact: false })).toHaveCount(0);
  await expect(dialog.getByRole('radio', { name: 'Yearly' })).toBeChecked();
  await expect(dialog.getByLabel('Yearly pay')).toHaveValue('1200.12');
  await expect(dialog.getByLabel('Next payday')).toHaveValue('2026-10-16');
  const more = dialog.locator('details.more-options');
  await expect(more).toHaveJSProperty('open', true);
  await expect(dialog.getByLabel('Role', { exact: true })).toHaveValue('Engineer');
  await expect(dialog.getByLabel('Notes')).toHaveValue('Keep this note');
  await scrollBody(dialog, true);
  await expectPinned(dialog);

  await dialog.getByLabel('Employer', { exact: true }).fill('');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.locator('[data-error-summary]')).toBeFocused();
  await expect(dialog).toContainText('Enter the employer.');
  await expectPinned(dialog);
  await dialog.getByLabel('Employer', { exact: true }).fill('Northwind');
  await dialog.getByLabel('Employer', { exact: true }).blur();
  await expect(dialog.getByLabel('Employer', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByLabel('Employer', { exact: true })).toHaveValue('Northwind');

  vault.failNextWrites(1);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert').filter({ hasText: "Couldn't save" })).toBeFocused();
  await expect(dialog.getByLabel('Yearly pay')).toHaveValue('1200.12');
  await expect(dialog.getByLabel('Notes')).toHaveValue('Keep this note');
  await expectPinned(dialog);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(vault.data('job_incomes').find(row => row.id === 7)?.pay_frequency).toBe('monthly');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const again = page.getByRole('dialog', { name: 'Edit job' });
  await again.getByLabel('Notes').fill('Draft note');
  await again.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(again).toBeHidden();
  expect(vault.data('job_incomes').find(row => row.id === 7)?.notes).toBe('Keep this note');
}

async function exerciseBill(page: Page, vault: Awaited<ReturnType<typeof syntheticVault>>): Promise<void> {
  await vault.open('/recurring?t=spend');
  await editCommitment(page, 'Rent');
  const dialog = page.getByRole('dialog', { name: 'Edit bill' });
  const more = dialog.locator('details.more-options');
  await expect(more).toHaveJSProperty('open', true);
  await expect(dialog.getByLabel('Due day')).toHaveValue('3');
  await expect(dialog.getByLabel('Payment account')).toHaveValue('Checking');
  await expect(dialog.getByLabel('Notes')).toHaveValue('Lease');
  await expect(dialog.getByLabel('Autopay')).toBeChecked();
  await scrollBody(dialog, false);
  await expectPinned(dialog);

  await dialog.getByLabel('Name', { exact: true }).fill('');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.locator('[data-error-summary]')).toBeFocused();
  await dialog.getByLabel('Name', { exact: true }).fill('Rent');
  await dialog.getByLabel('Name', { exact: true }).blur();
  await expect(dialog.getByLabel('Name', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByLabel('Amount', { exact: true })).toHaveValue('1500.5');

  vault.failNextWrites(1);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert').filter({ hasText: "Couldn't save" })).toBeFocused();
  await expect(dialog.getByLabel('Notes')).toHaveValue('Lease');
  await expectPinned(dialog);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(vault.data('fixed_expenses').find(row => row.id === 8)?.amount).toBe(1500.5);

  await editCommitment(page, 'Rent');
  const again = page.getByRole('dialog', { name: 'Edit bill' });
  await again.getByLabel('Notes').fill('Changed lease');
  await again.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(again).toBeHidden();
  expect(vault.data('fixed_expenses').find(row => row.id === 8)?.notes).toBe('Lease');
}

async function exerciseSubscription(page: Page, vault: Awaited<ReturnType<typeof syntheticVault>>): Promise<void> {
  await vault.open('/recurring?t=spend');
  await editCommitment(page, 'Stream');
  const dialog = page.getByRole('dialog', { name: 'Edit subscription' });
  await expect(dialog.getByLabel('Next bill date')).toHaveValue('2026-10-20');
  await expect(dialog.getByLabel('Autopay')).toHaveCount(0);
  await expect(dialog.getByLabel('Due day')).toHaveCount(0);
  const more = dialog.locator('details.more-options');
  await expect(more).toHaveJSProperty('open', true);
  await expect(dialog.getByLabel('Notes')).toHaveValue('Family plan');
  await expect(dialog.getByLabel('Category')).toHaveValue('Video');
  await scrollBody(dialog, false);
  await expectPinned(dialog);

  await dialog.getByLabel('Amount', { exact: true }).fill('-1');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.locator('[data-error-summary]')).toBeFocused();
  await expect(dialog).toContainText('Enter an amount above $0.');
  await dialog.getByLabel('Amount', { exact: true }).fill('15.99');
  await dialog.getByLabel('Amount', { exact: true }).blur();
  await expect(dialog.getByLabel('Amount', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByLabel('Next bill date')).toHaveValue('2026-10-20');

  vault.failNextWrites(1);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert').filter({ hasText: "Couldn't save" })).toBeFocused();
  await expect(dialog.getByLabel('Amount', { exact: true })).toHaveValue('15.99');
  await expectPinned(dialog);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(vault.data('subscriptions').find(row => row.id === 9)?.amount).toBe(15.99);

  await editCommitment(page, 'Stream');
  const again = page.getByRole('dialog', { name: 'Edit subscription' });
  await again.getByLabel('Notes').fill('Draft plan');
  await again.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(again).toBeHidden();
  expect(vault.data('subscriptions').find(row => row.id === 9)?.notes).toBe('Family plan');
}

async function editCommitment(page: Page, name: string): Promise<void> {
  await page.locator('tr, .commitment-card').filter({ hasText: name }).getByRole('button', { name: 'Edit', exact: true }).click();
}

async function scrollBody(dialog: Locator, requireOverflow: boolean): Promise<void> {
  const body = dialog.locator('[data-editor-body]');
  const scrolled = await body.evaluate(element => {
    const before = element.scrollTop;
    element.scrollTop = element.scrollHeight;
    return { before, after: element.scrollTop, overflows: element.scrollHeight > element.clientHeight + 1 };
  });
  if (requireOverflow) {
    expect(scrolled.overflows).toBe(true);
    expect(scrolled.after).toBeGreaterThan(scrolled.before);
  }
}

async function expectPinned(dialog: Locator): Promise<void> {
  for (const name of ['Cancel', 'Save'] as const) {
    const button = dialog.getByRole('button', { name, exact: true });
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    const metrics = await button.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        viewportHeight: window.innerHeight,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
      };
    });
    expect(metrics.visibility).toBe('visible');
    expect(metrics.pointerEvents).not.toBe('none');
    expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(metrics.top).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  }
}
