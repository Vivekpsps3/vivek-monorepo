import { expect } from '@playwright/test';

const appearancePages = new WeakMap();

export async function openUserMenu(page) {
  const trigger = page.locator('.user-menu-toggle');
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  const menu = page.getByRole('navigation', { name: 'User options', exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

// The theme radios live on Settings → Appearance. A second page clicks them so
// the caller's route (an open map, a draft) stays mounted. localStorage is
// shared; the caller's document attributes are copied from that control.
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
  await expect(settings.locator('html')).toHaveAttribute('data-theme-choice', theme);
  if (settings === page) return;
  const applied = await settings.locator('html').evaluate(node => ({
    theme: node.getAttribute('data-theme'),
    choice: node.getAttribute('data-theme-choice'),
    scheme: node.style.colorScheme,
  }));
  await page.evaluate(state => {
    const root = document.documentElement;
    if (state.theme) root.setAttribute('data-theme', state.theme);
    if (state.choice) root.setAttribute('data-theme-choice', state.choice);
    root.style.colorScheme = state.scheme;
  }, applied);
  if (theme !== 'system') await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}
