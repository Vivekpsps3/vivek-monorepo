import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../../../tests/e2e/fixtures';
import { HOME_ROOMS, homeObjects, homePrimary } from '../src/app/town/home-rooms';

const FOREIGN_HABIT = "Other's habit";

async function prepare(page: Page, width: number, theme: 'light' | 'dark'): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
  expect((await page.request.post('/e2e/reset?seed=town-empty')).ok()).toBeTruthy();
}

async function activate(page: Page, locator: ReturnType<Page['locator']>, touch: boolean): Promise<void> {
  if (touch) await locator.tap();
  else {
    await locator.focus();
    await page.keyboard.press('Enter');
  }
}

test.describe('Home rooms', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true });

  for (const [width, theme] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']] as const) {
    test(`visits four furnished rooms at ${width} ${theme}`, async ({ page }, info) => {
      test.setTimeout(180_000);
      const posts: string[] = [];
      page.on('request', request => {
        if (request.method() !== 'POST') return;
        posts.push(new URL(request.url()).pathname);
      });
      await prepare(page, width, theme);
      await page.goto('/town');
      const entrance = page.getByRole('link', { name: 'Visit Home' });
      await expect(entrance).toBeVisible();
      await expect(page.getByRole('button', { name: 'Choose a first habit' })).toBeVisible();
      const touch = width === 390;
      await activate(page, entrance, touch);

      const home = page.locator('app-town-home');
      await expect(home.getByRole('heading', { name: 'Living room', level: 1 })).toBeVisible();
      await expect(home).not.toContainText('Choose a first habit');
      await expect(home).not.toContainText('Buy');
      await expect(home).not.toContainText('Stamps');
      await expect(home).not.toContainText(FOREIGN_HABIT);
      await expect(home.locator('[data-cutaway="floor-walls"]')).toBeVisible();
      await expect(home.locator('[data-floor-cells="12"]')).toBeVisible();
      const part = theme === 'dark' ? 'night' : 'day';

      for (const room of HOME_ROOMS) {
        const nav = home.locator(`[data-home-link="${room.id}"]`);
        const navBox = await nav.boundingBox();
        expect(navBox?.width, room.id).toBeGreaterThanOrEqual(44);
        expect(navBox?.height, room.id).toBeGreaterThanOrEqual(44);
        await activate(page, nav, touch);
        await expect(page).toHaveURL(new RegExp(`/town/home/${room.id}$`));
        await expect(home.getByRole('heading', { name: room.label, level: 1 })).toBeVisible();
        await expect(home.locator('[data-wall-slots]')).toContainText('open');
        await expect(home.locator('img.room')).toBeVisible();
        for (const object of homeObjects(room.id)) {
          const link = home.locator(`[data-object="${object.id}"]`);
          await expect(link).toBeVisible();
          const box = await link.boundingBox();
          expect(box?.width, object.id).toBeGreaterThanOrEqual(44);
          expect(box?.height, object.id).toBeGreaterThanOrEqual(44);
        }
        const primary = homePrimary(room.id);
        const primaryLink = home.locator(`[data-object="${primary.id}"]`);
        await activate(page, primaryLink, touch);
        await expect(page).toHaveURL(new RegExp(`object=${primary.id}`));
        await expect(home.locator('[data-cutaway="floor-walls"]')).toHaveClass(/cutaway/);
        await expect(home.getByRole('heading', { name: primary.label, level: 2 })).toBeVisible();
        const art = home.locator(`[data-scene-object="${primary.id}"] img`);
        await expect(art).toBeVisible();
        await expect(art).toHaveAttribute('src', new RegExp(`/town/cosmetics/${primary.catalogId}-${part}\\.svg`));
        if (primary.action.kind === 'sample') {
          await expect(home.getByText(primary.action.title)).toBeVisible();
          await expect(home.getByText('No photo is saved.')).toBeVisible();
        } else if (primary.action.kind === 'note') {
          const note = home.locator('#home-note');
          await expect(note).toBeEnabled();
          await note.fill('Visit note');
          await expect(note).toHaveValue('Visit note');
          await expect(page).not.toHaveURL(/Visit/);
        } else if (primary.action.kind === 'media') {
          const media = home.getByRole('link', { name: primary.action.label });
          await expect(media).toBeVisible();
          await expect(media).toHaveAttribute('href', new RegExp(`/media/library\\?kind=${primary.action.query.kind}`));
          const mediaBox = await media.boundingBox();
          expect(mediaBox?.height, primary.id).toBeGreaterThanOrEqual(44);
        } else if (primary.action.kind === 'garden') {
          await expect(home.getByRole('button', { name: primary.action.verb })).toBeVisible();
        }
        if (touch) {
          const close = home.getByRole('button', { name: 'Close details' });
          const closeBox = await close.boundingBox();
          expect(closeBox?.width).toBeGreaterThanOrEqual(44);
          expect(closeBox?.height).toBeGreaterThanOrEqual(44);
          await page.keyboard.press('Escape');
          await expect(page).not.toHaveURL(/object=/);
          await expect(primaryLink).toBeFocused();
        }
      }

      const planter = home.locator('[data-object="courtyard-planter"]');
      if (!page.url().includes('object=courtyard-planter')) await activate(page, planter, touch);
      await expect(home.getByText('Lot 1 is an empty lot')).toBeVisible();
      await expect(home.getByText('Lot 3 unlocks at level 3')).toBeVisible();
      const water = home.getByRole('button', { name: 'Water the planter' });
      const waterBox = await water.boundingBox();
      expect(waterBox?.width).toBeGreaterThanOrEqual(44);
      expect(waterBox?.height).toBeGreaterThanOrEqual(44);
      await activate(page, water, touch);
      await expect(home.getByText('Watered for this visit. No habit was checked.')).toBeVisible();
      expect(posts.filter(path => /habit|checkin|stamp|cosmetic/i.test(path))).toEqual([]);

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      expect(await home.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
      const scan = await new AxeBuilder({ page }).include('app-town-home').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      await info.attach(`home-${width}-${theme}`, { body: await home.screenshot(), contentType: 'image/png' });
    });
  }

  test('opens the study desk from a direct address', async ({ page }) => {
    await prepare(page, 1280, 'light');
    await page.goto('/town/home');
    await expect(page).toHaveURL(/\/town\/home\/living$/);
    await page.goto('/town/home/study?object=study-desk');
    const home = page.locator('app-town-home');
    await expect(home.getByRole('heading', { name: 'Desk', level: 2 })).toBeVisible();
    await expect(home.locator('#home-note')).toBeVisible();
    await expect(home).not.toContainText(FOREIGN_HABIT);
  });

  test('keeps the desk note when town lots fail', async ({ page }) => {
    await prepare(page, 390, 'dark');
    await page.route('**/api/town**', route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Town is unavailable right now.' }),
    }));
    await page.goto('/town/home/study?object=study-desk');
    const home = page.locator('app-town-home');
    const note = home.locator('#home-note');
    await note.fill('Harbor draft stays');
    await expect(note).toHaveValue('Harbor draft stays');
    await expect(page).not.toHaveURL(/Harbor/);
    await home.locator('[data-home-link="courtyard"]').tap();
    await expect(home.getByText('Town lots are unavailable right now.')).toBeVisible();
    await home.getByRole('button', { name: 'Retry lots' }).tap();
    await expect(home.getByText('Town lots are unavailable right now.')).toBeVisible();
    await home.locator('[data-home-link="study"]').tap();
    await home.locator('[data-object="study-desk"]').tap();
    await expect(note).toHaveValue('Harbor draft stays');
  });

  test('returns focus to Visit Home', async ({ page }) => {
    await prepare(page, 1280, 'light');
    await page.goto('/town');
    const entrance = page.getByRole('link', { name: 'Visit Home' });
    await entrance.click();
    await expect(page.getByRole('heading', { name: 'Living room', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Town' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Terraria-on-Sea' })).toBeVisible();
    await expect(entrance).toBeFocused();
  });
});
