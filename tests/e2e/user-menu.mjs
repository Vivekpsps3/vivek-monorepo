import { expect } from '@playwright/test';

const appearancePages = new WeakMap();

export async function openUserMenu(page) {
  const trigger = page.locator('.user-menu-toggle');
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  const menu = page.getByRole('navigation', { name: 'User options', exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

async function appearancePage(page) {
  const context = page.context();
  const cached = appearancePages.get(context);
  if (cached && !cached.isClosed() && new URL(cached.url()).pathname === '/settings/appearance') return cached;
  if (cached && !cached.isClosed()) await cached.close();
  const settings = await context.newPage();
  try {
    await settings.goto(new URL('/settings/appearance', page.url()).href, { timeout: 30_000 });
    await expect(settings.getByRole('heading', { level: 1, name: 'Appearance', exact: true })).toBeVisible();
  } catch (error) {
    await settings.close();
    throw error;
  }
  appearancePages.set(context, settings);
  return settings;
}

export async function chooseColorTheme(page, theme) {
  if (theme !== 'light' && theme !== 'dark' && theme !== 'system') throw new Error(`Unknown color theme: ${theme}`);
  const settings = new URL(page.url()).pathname === '/settings/appearance' ? page : await appearancePage(page);
  const radio = settings.locator(`input[name="color-theme"][value="${theme}"]`);
  if (!(await radio.isChecked())) await radio.click();
  await expect(radio).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme-choice', theme);
  if (theme !== 'system') await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}
