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
