import { expect } from '@playwright/test';

export async function openUserMenu(page) {
  const trigger = page.locator('.user-menu-toggle');
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  const menu = page.getByRole('navigation', { name: 'User options', exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

export async function chooseColorTheme(page, theme) {
  const menu = await openUserMenu(page);
  await menu.getByRole('combobox', { name: 'Color theme' }).selectOption(theme);
  const trigger = page.locator('.user-menu-toggle');
  if (await trigger.getAttribute('aria-expanded') === 'true') await trigger.click();
}
