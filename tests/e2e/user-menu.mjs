import { expect } from '@playwright/test';

export async function openUserMenu(page) {
  const trigger = page.locator('.user-menu-toggle');
  const menu = page.getByRole('navigation', { name: 'User options', exact: true });
  // The expanded flag can still say open after Escape until the menu node is gone.
  // A click in that window would close it. Open only when the menu is not shown.
  if (!(await menu.isVisible())) await trigger.click();
  await expect(menu).toBeVisible();
  return menu;
}

export async function chooseColorTheme(page, theme) {
  if (theme !== 'light' && theme !== 'dark' && theme !== 'system') throw new Error(`Unknown color theme: ${theme}`);
  const returnUrl = page.url();
  const onAppearance = new URL(returnUrl).pathname === '/settings/appearance';
  if (!onAppearance) {
    await page.goto(new URL('/settings/appearance', returnUrl).href);
    await expect(page.getByRole('heading', { level: 1, name: 'Appearance', exact: true })).toBeVisible();
  }
  const radio = page.locator(`input[name="color-theme"][value="${theme}"]`);
  if (!(await radio.isChecked())) await radio.click();
  await expect(radio).toBeChecked();
  if (!onAppearance) await page.goto(returnUrl);
  await expect(page.locator('html')).toHaveAttribute('data-theme-choice', theme);
  if (theme !== 'system') await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}
