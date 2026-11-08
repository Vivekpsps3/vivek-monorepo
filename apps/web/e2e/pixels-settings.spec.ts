import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';

// PF6: Settings › Profile › Birthday. Runs under the town e2e domain
// (apps/web/e2e/playwright.config.ts from TH1). Seeds come from
// /e2e/reset?seed=pixels-empty (PF3 seed names).
test.describe('PF6 profile birthday settings', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=pixels-empty')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  });

  function watchNonSelf(page: import('@playwright/test').Page): string[] {
    const nonSelf: string[] = [];
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.origin !== new URL(page.url()).origin && !req.url().startsWith('data:')) nonSelf.push(req.url());
    });
    return nonSelf;
  }

  test('save a birthday: toast names no date; age toggle persists', async ({ page }) => {
    const nonSelf = watchNonSelf(page);
    await page.goto('/settings/profile#birthday');
    const section = page.locator('#birthday');
    await expect(section).toBeVisible();
    await section.getByLabel('Birthday', { exact: true }).fill('1990-05-04');
    await section.getByLabel('Show my age on Life in Pixels').check();
    await section.getByRole('button', { name: 'Save', exact: true }).click();
    const toast = page.locator('.toast.success');
    await expect(toast).toContainText('Birthday saved.');
    await expect(toast).not.toContainText('1990');
    const view = await (await page.request.get('/api/account/birthday')).json();
    expect(view).toEqual({ birthday: '1990-05-04', show_age: true });
    expect(nonSelf).toEqual([]);
  });

  test('the three validation messages, verbatim', async ({ page }) => {
    await page.goto('/settings/profile#birthday');
    const section = page.locator('#birthday');
    const field = section.getByLabel('Birthday', { exact: true });
    const save = section.getByRole('button', { name: 'Save', exact: true });

    await field.fill('1899-12-31');
    await save.click();
    await expect(section.getByRole('alert')).toHaveText('Enter a year after 1900.');
    await expect(field).toHaveAttribute('aria-invalid', 'true');

    await field.fill('2027-01-01');
    await save.click();
    await expect(section.getByRole('alert')).toHaveText("Birthday can't be in the future.");

    await field.fill('');
    await save.click();
    await expect(section.getByRole('alert')).toHaveText('Enter a full date.');
  });

  test('remove asks for confirmation and clears the birthday', async ({ page }) => {
    await page.request.patch('/api/account/birthday', { data: { birthday: '1990-05-04', show_age: false } });
    await page.goto('/settings/profile#birthday');
    const section = page.locator('#birthday');
    await section.getByRole('button', { name: 'Remove', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove birthday?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    let view = await (await page.request.get('/api/account/birthday')).json();
    expect(view.birthday).toBe('1990-05-04');
    await section.getByRole('button', { name: 'Remove', exact: true }).click();
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    view = await (await page.request.get('/api/account/birthday')).json();
    expect(view.birthday).toBeNull();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe on /settings/profile [${theme}]`, async ({ page }) => {
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await page.goto('/settings/profile');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const scan = await new AxeBuilder({ page }).analyze();
      expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    });
  }
});
