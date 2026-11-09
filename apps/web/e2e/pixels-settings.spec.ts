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
    // The first document request happens while the page is still about:blank.
    // That origin is this app; later requests to any other origin are the leak.
    let selfOrigin: string | null = null;
    page.on('request', req => {
      if (req.url().startsWith('data:')) return;
      const origin = new URL(req.url()).origin;
      if (selfOrigin === null) {
        selfOrigin = origin;
        return;
      }
      if (origin !== selfOrigin) nonSelf.push(req.url());
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
    await page.goto('/settings/profile#birthday');
    const seeded = await page.request.patch('/api/account/birthday', {
      headers: { 'X-CSRF-Token': 'synthetic-csrf' },
      data: { birthday: '1990-05-04', show_age: false },
    });
    expect(seeded.ok()).toBeTruthy();
    await page.reload();
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

  function policyShape(policy: string): string {
    return policy.replace(/'nonce-[^']+'/g, "'nonce'");
  }

  // PROFILE1. Town project selection of this file stays with VER-02.
  test('navigate, refresh, fresh load, back-forward, and Birthday stay on Profile', async ({ page }) => {
    const unknown = await page.request.get('/no-such-page');
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toEqual({ detail: 'Not found' });
    expect((await page.request.get('/settings/not-a-section')).status()).toBe(404);
    expect((await page.request.get('/not-a-real-asset.js')).status()).toBe(404);
    expect((await page.request.get('/media/api/missing')).status()).toBe(404);

    const account = await page.goto('/settings/account');
    expect(account?.status()).toBe(200);
    await page.getByRole('navigation', { name: 'Settings' })
      .getByRole('link', { name: 'Profile', exact: true })
      .click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();

    const reloaded = await page.reload();
    expect(reloaded?.status()).toBe(200);
    expect(reloaded?.headers()['content-type'] ?? '').toContain('text/html');
    expect(reloaded?.headers()['cache-control'] ?? '').toContain('no-store');
    const profilePolicy = reloaded?.headers()['content-security-policy'] ?? '';
    expect(profilePolicy).toContain('nonce-');
    expect(profilePolicy).toContain('tile.openstreetmap.org');
    expect(profilePolicy).toContain("frame-ancestors 'none'");
    expect(profilePolicy).not.toContain('unsafe-eval');
    const accountDocument = await page.request.get('/settings/account');
    expect(accountDocument.status()).toBe(200);
    expect(policyShape(accountDocument.headers()['content-security-policy'])).toBe(policyShape(profilePolicy));
    const home = await page.request.get('/');
    expect(home.headers()['content-security-policy']).not.toContain('tile.openstreetmap.org');
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();

    const fresh = await page.goto('/settings/profile');
    expect(fresh?.status()).toBe(200);
    expect(fresh?.headers()['cache-control'] ?? '').toContain('no-store');
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();

    await page.goto('/settings/appearance');
    await expect(page.getByRole('heading', { level: 1, name: 'Appearance' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/settings\/appearance$/);

    await page.goto('/pixels');
    await page.getByRole('link', { name: 'Birthday', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/profile#birthday$/);
    await expect(page.locator('#birthday')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/pixels$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Pixels' })).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/settings\/profile#birthday$/);
    const birthdayReload = await page.reload();
    expect(birthdayReload?.status()).toBe(200);
    expect(birthdayReload?.headers()['cache-control'] ?? '').toContain('no-store');
    await expect(page.locator('#birthday')).toBeVisible();
    expect((await page.request.get('/api/account/birthday')).status()).toBe(200);
  });
});
