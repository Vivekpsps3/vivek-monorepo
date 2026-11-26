import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { addItem, resetMedia } from '../../apps/media/e2e/media-test';

for (const [width, theme, reducedMotion] of [
  [390, 'light', 'no-preference'],
  [390, 'dark', 'reduce'],
  [1280, 'light', 'reduce'],
  [1280, 'dark', 'no-preference'],
] as const) {
  test.describe(`${width}px ${theme}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 800 }, hasTouch: width === 390, reducedMotion });

    test('Health is pinnable and Clinic and Gym have direct app destinations', async ({ page, request }, info) => {
      expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await page.goto('/hub');
      const shortcuts = page.getByRole('navigation', { name: 'Shortcuts' });
      const links = shortcuts.getByRole('link');
      const health = shortcuts.getByRole('link', { name: 'Health' });
      await expect(health).toHaveAttribute('href', '/town/clinic');
      await shortcuts.getByRole('button', { name: 'Edit pins' }).click();
      const pins = page.getByRole('dialog', { name: 'Edit pins' });
      await pins.getByRole('button', { name: 'Health' }).click();
      await pins.getByRole('button', { name: 'Done' }).click();
      await expect(links.first()).toHaveText('Health');
      await page.reload();
      await expect(links.first()).toHaveText('Health');
      await shortcuts.getByRole('button', { name: 'Edit pins' }).click();
      await pins.getByRole('button', { name: 'Reset pins' }).click();
      await pins.getByRole('button', { name: 'Done' }).click();
      await expect(links.first()).toHaveText('Holdings');
      await health.click();
      await expect(page.getByRole('heading', { name: 'Clinic', level: 1 })).toBeFocused();

      const apps = page.getByRole('navigation', { name: 'Apps', exact: true });
      const toggle = apps.getByRole('button', { name: /Switch apps and destinations/ });
      const group = apps.getByRole('group', { name: 'Health', exact: true });
      await expect(toggle).toHaveAccessibleName(/Current app Health/);
      for (const [label, path] of [['Clinic', '/town/clinic'], ['Gym', '/town/gym']]) {
        await page.goto('/travel');
        await expect(toggle).toHaveAccessibleName(/Current app Travel/);
        if (width === 390) await toggle.tap();
        else await toggle.press('Enter');
        const destination = group.getByRole('link', { name: label, exact: true });
        await expect(destination).toBeInViewport({ ratio: 1 });
        await destination.click({ trial: true });
        expect(await destination.evaluate(link => link.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
        if (width === 390) await destination.tap();
        else await destination.press('Enter');
        await expect(page).toHaveURL(url => url.pathname === path);
        await expect(page.getByRole('heading', { name: label, level: 1 })).toBeFocused();
        await expect(toggle).toHaveAccessibleName(/Current app Health/);
        await toggle.press('Enter');
        await expect(destination).toHaveAttribute('aria-current', label === 'Clinic' ? 'location' : 'page');
        await info.attach(`health-switcher-${label}`, { body: await page.screenshot(), contentType: 'image/png' });
        await page.keyboard.press('Escape');
        await expect(toggle).toBeFocused();
        await page.goBack();
        await expect(toggle).toHaveAccessibleName(/Current app Travel/);
      }
    });

    test('Travel opens Media Books in two actions from one switcher', async ({ page, request }, info) => {
      await resetMedia(request);
      await addItem(request, { kind: 'book', title: 'Harbor Guide' });
      await addItem(request, { kind: 'movie', title: 'Harbor Matinee' });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await page.goto('/travel');
      const apps = page.getByRole('navigation', { name: 'Apps', exact: true });
      const toggle = apps.getByRole('button', { name: /Switch apps and destinations.*Travel/ });
      const menu = apps.getByRole('group', { name: 'App destinations' });
      if (width === 390) {
        await toggle.tap();
      } else {
        await toggle.focus();
        await page.keyboard.press('Enter');
      }
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(menu).toBeVisible();
      const media = menu.getByRole('group', { name: 'Media', exact: true });
      const books = media.getByRole('link', { name: 'Books', exact: true });
      for (const target of [toggle, books]) {
        const box = (await target.boundingBox())!;
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      }
      expect((await new AxeBuilder({ page }).include('.app-switcher__bar').analyze()).violations).toEqual([]);
      await info.attach('app-destinations', { body: await page.screenshot(), contentType: 'image/png' });

      if (width === 390) {
        await books.tap();
      } else {
        await books.focus();
        await page.keyboard.press('Enter');
      }
      await expect(page).toHaveURL(/\/media\/library\?kind=book$/);
      await expect(menu).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1, name: 'Books', exact: true })).toBeFocused();
      await expect(page.getByRole('link', { name: 'Harbor Guide', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Harbor Matinee', exact: true })).toHaveCount(0);
      const sections = page.getByRole('navigation', { name: 'Media sections' });
      const current = sections.locator('[aria-current="page"]');
      await expect(current).toHaveText('Books');
      await expect(current).toBeInViewport({ ratio: 1 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      const mediaToggle = apps.getByRole('button', { name: /Switch apps and destinations.*Media/ });
      await mediaToggle.focus();
      await page.keyboard.press('Enter');
      await expect(books).toHaveAttribute('aria-current', 'page');
      await books.focus();
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(mediaToggle).toHaveAttribute('aria-expanded', 'false');
      await expect(mediaToggle).toBeFocused();

      await page.goBack();
      await expect(page.getByRole('navigation', { name: 'Travel sections' }).locator('[aria-current="page"]')).toHaveText('Trips');
      await page.goForward();
      await expect(current).toHaveText('Books');
    });
  });
}

test('app switcher and Search have separate targets at the tablet transition', async ({ page, request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
  await page.goto('/hub');
  const apps = page.getByRole('navigation', { name: 'Apps', exact: true });
  const toggle = apps.getByRole('button', { name: /Switch apps and destinations/ });
  const search = page.getByRole('button', { name: 'Search', exact: true });
  const appsOverview = apps.locator('.app-switcher__overview').getByRole('link');
  await page.locator('html').evaluate(element => { element.style.fontSize = '110%'; });
  for (const width of [641, 768, 840, 841, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    if (width <= 840) await expect(appsOverview).toHaveCount(0);
    else await expect(appsOverview).toHaveText(['Hub', 'Health', 'Finance', 'Travel', 'Media', 'Town', 'Pixels']);
    const toggleBox = (await toggle.boundingBox())!;
    const searchBox = (await search.boundingBox())!;
    expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(searchBox.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 768, height: 844 });
  await toggle.press('Enter');
  const gym = apps.getByRole('group', { name: 'Health', exact: true }).getByRole('link', { name: 'Gym' });
  await expect(gym).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await search.press('Enter');
  await expect(page.getByRole('combobox')).toBeFocused();
});
