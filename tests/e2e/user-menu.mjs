import { expect } from '@playwright/test';

export async function openUserMenu(page) {
  const trigger = page.locator('.user-menu-toggle');
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  const menu = page.getByRole('navigation', { name: 'User options', exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

export async function chooseColorTheme(page, theme) {
  if (theme !== 'light' && theme !== 'dark' && theme !== 'system') throw new Error(`Unknown color theme: ${theme}`);
  const returnTo = page.url();
  const home = new URL(returnTo).pathname === '/settings/appearance';
  if (!home) {
    await page.goto(new URL('/settings/appearance', returnTo).href, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Appearance', exact: true })).toBeVisible();
  }
  const radio = page.locator(`input[name="color-theme"][value="${theme}"]`);
  if (!(await radio.isChecked())) await radio.click();
  await expect(radio).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme-choice', theme);
  if (home) return;
  await page.goto(returnTo, { timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme-choice', theme);
  if (theme !== 'system') await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}
