import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '../../../tests/e2e/fixtures';
import { MEMORY_SEED, dealMemory } from '../src/app/town/memory-shelves';

function pairs(): number[][] {
  const groups = new Map<string, number[]>();
  for (const tile of dealMemory(MEMORY_SEED).tiles) {
    const list = groups.get(tile.symbol) ?? [];
    list.push(tile.index);
    groups.set(tile.symbol, list);
  }
  return [...groups.values()];
}

async function prepare(page: Page, width: number, theme: 'light' | 'dark', reduced = true): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.addInitScript(value => {
    localStorage.setItem('suite-theme', value);
    const win = window as Window & { __memoryAudio?: number };
    win.__memoryAudio = 0;
    const Original = window.AudioContext;
    if (!Original) return;
    const Wrapped = function (this: AudioContext): AudioContext {
      win.__memoryAudio = (win.__memoryAudio ?? 0) + 1;
      return new Original();
    };
    Wrapped.prototype = Original.prototype;
    window.AudioContext = Wrapped as unknown as typeof AudioContext;
  }, theme);
  expect((await page.request.post('/e2e/reset?seed=town-empty')).ok()).toBeTruthy();
}

async function activate(page: Page, locator: Locator, touch: boolean): Promise<void> {
  if (touch) await locator.tap();
  else {
    await locator.focus();
    await page.keyboard.press('Enter');
  }
}

async function solve(page: Page, game: Locator, touch: boolean): Promise<void> {
  for (const indexes of pairs()) {
    for (const index of indexes) await activate(page, game.locator(`[data-index="${index}"]`), touch);
  }
}

test.describe('Memory Shelves', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true });

  for (const [width, theme, touch] of [
    [390, 'light', true],
    [390, 'dark', true],
    [1280, 'light', false],
    [1280, 'dark', false],
  ] as const) {
    test(`finishes seed 10 at ${width} ${theme}`, async ({ page }, info) => {
      test.setTimeout(120_000);
      const writes: string[] = [];
      page.on('request', request => {
        if (request.method() === 'GET' || request.method() === 'HEAD') return;
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
      });
      await prepare(page, width, theme);
      await page.goto('/town/memory');
      const game = page.locator('app-memory-shelves');
      await expect(game.getByRole('heading', { name: 'Memory Shelves', level: 1 })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(game.locator('[data-motion="reduce"]')).toBeVisible();
      await expect(game.locator('[data-sound="off"]')).toBeVisible();
      await expect(game).toContainText('Seed 10.');
      await expect(game).toContainText('This game is not timed.');
      await expect(game).toContainText('Town sound is off.');
      await expect(game.getByText(/\d:\d\d/)).toHaveCount(0);
      await expect(game.getByRole('button', { name: /Buy|Grant/ })).toHaveCount(0);

      const playButton = game.getByRole('button', { name: 'Play Memory Shelves' });
      const playBox = await playButton.boundingBox();
      expect(playBox?.width).toBeGreaterThanOrEqual(44);
      expect(playBox?.height).toBeGreaterThanOrEqual(44);
      await activate(page, playButton, touch);
      await expect(game.getByRole('status')).toHaveText('0 moves.');

      for (const name of ['Pause', 'Restart', 'Quit']) {
        const target = game.getByRole('button', { name, exact: true });
        const box = await target.boundingBox();
        expect(box?.width, name).toBeGreaterThanOrEqual(44);
        expect(box?.height, name).toBeGreaterThanOrEqual(44);
      }
      const shelfBox = await game.locator('[data-index="0"]').boundingBox();
      expect(shelfBox?.width).toBeGreaterThanOrEqual(44);
      expect(shelfBox?.height).toBeGreaterThanOrEqual(44);

      if (touch) await game.getByRole('button', { name: 'Pause', exact: true }).tap();
      else await page.keyboard.press('p');
      await expect(game.getByRole('status')).toHaveText('Paused. 0 moves.');
      await expect(game.locator('[data-index="0"]')).toBeDisabled();
      await game.locator('[data-index="0"]').click({ force: true });
      await expect(game.locator('[data-index="0"]')).toHaveAttribute('data-face', 'down');

      if (touch) await game.getByRole('button', { name: 'Resume', exact: true }).tap();
      else await page.keyboard.press('p');
      await expect(game.getByRole('status')).toHaveText('0 moves.');
      await activate(page, game.locator('[data-index="0"]'), touch);
      await expect(game.locator('[data-index="0"]')).toHaveAttribute('data-face', 'up');
      if (touch) await game.getByRole('button', { name: 'Restart', exact: true }).tap();
      else await page.keyboard.press('r');
      await expect(game.locator('[data-index="0"]')).toHaveAttribute('data-face', 'down');
      await expect(game.getByRole('status')).toHaveText('0 moves.');

      await solve(page, game, touch);
      await expect(game.getByRole('status')).toHaveText('All six pairs matched in 6 moves.');
      await expect(game.locator('[data-face="matched"]')).toHaveCount(12);
      await expect(game.locator('[data-index="2"]')).toBeDisabled();
      const scan = await new AxeBuilder({ page }).include('app-memory-shelves').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);

      if (touch) await game.getByRole('button', { name: 'Restart', exact: true }).tap();
      else await page.keyboard.press('r');
      await expect(game.getByRole('status')).toHaveText('0 moves.');
      await expect(game.locator('[data-face="down"]')).toHaveCount(12);
      await expect(game.locator('[data-face="matched"]')).toHaveCount(0);
      await activate(page, game.locator('[data-index="2"]'), touch);
      await expect(game.locator('[data-index="2"]')).toHaveAttribute('aria-label', 'Shelf 3, Lantern');
      await expect(game.locator('[data-index="2"]')).toHaveAttribute('data-face', 'up');
      await expect(game.getByRole('status')).toHaveText('0 moves.');
      if (!touch) {
        await page.keyboard.press('ArrowRight');
        await expect(game.locator('[data-index="3"]')).toBeFocused();
      }

      if (touch) await game.getByRole('button', { name: 'Quit', exact: true }).tap();
      else await page.keyboard.press('q');
      await expect(game.locator('[data-index]')).toHaveCount(0);
      await expect(game.getByRole('status')).toHaveText('Last game finished in 6 moves. This game is not timed.');
      await expect(game.getByRole('button', { name: 'Play Memory Shelves' })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
      expect(await game.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
      expect(await page.evaluate(() => (window as Window & { __memoryAudio?: number }).__memoryAudio ?? 0)).toBe(0);
      expect(writes.filter(item => /\/api\/(town|media|pixels|health)|stamp/i.test(item))).toEqual([]);
      await info.attach(`memory-${width}-${theme}`, { body: await game.screenshot(), contentType: 'image/png' });
    });
  }

  test('finishes the same six moves when motion is allowed', async ({ page }) => {
    await prepare(page, 1280, 'light', false);
    await page.goto('/town/memory');
    const game = page.locator('app-memory-shelves');
    await expect(game.locator('[data-motion="ok"]')).toBeVisible();
    await game.getByRole('button', { name: 'Play Memory Shelves' }).click();
    await solve(page, game, false);
    await expect(game.getByRole('status')).toHaveText('All six pairs matched in 6 moves.');
    await expect(game.getByText(/\d:\d\d/)).toHaveCount(0);
    const before = await game.getByRole('status').innerText();
    await page.waitForTimeout(1100);
    await expect(game.getByRole('status')).toHaveText(before);
  });

  test('keeps the shelf when Town, Media, and Pixels reads fail', async ({ page }) => {
    await prepare(page, 390, 'dark');
    for (const path of ['**/api/town**', '**/api/media**', '**/api/pixels**']) {
      await page.route(path, route => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Town is unavailable right now.' }),
      }));
    }
    await page.goto('/town/memory');
    const game = page.locator('app-memory-shelves');
    await game.getByRole('button', { name: 'Play Memory Shelves' }).tap();
    await game.locator('[data-index="2"]').tap();
    await game.locator('[data-index="3"]').tap();
    await expect(game.getByRole('status')).toHaveText('1 move.');
    await expect(game.locator('[data-index="2"]')).toHaveAttribute('data-face', 'matched');
    await expect(game.locator('[data-index="3"]')).toHaveAttribute('aria-label', 'Shelf 4, Lantern, matched');
  });

  test('returns to Town and restores the open shelf', async ({ page }) => {
    await prepare(page, 1280, 'light');
    await page.goto('/town');
    const entrance = page.getByRole('link', { name: 'Memory Shelves', exact: true });
    const entranceBox = await entrance.boundingBox();
    expect(entranceBox?.height).toBeGreaterThanOrEqual(44);
    await entrance.click();
    await expect(page).toHaveURL(/\/town\/memory$/);
    const game = page.locator('app-memory-shelves');
    await game.getByRole('button', { name: 'Play Memory Shelves' }).click();
    await game.locator('[data-index="0"]').click();
    await expect(game.locator('[data-index="0"]')).toHaveAttribute('data-face', 'up');
    await game.getByRole('navigation', { name: 'Current place' }).getByRole('link', { name: 'Town' }).click();
    await expect(page).toHaveURL(/\/town$/);
    await expect(page.getByRole('link', { name: 'Memory Shelves', exact: true })).toBeFocused();
    await page.getByRole('link', { name: 'Memory Shelves', exact: true }).click();
    await expect(game.locator('[data-index="0"]')).toHaveAttribute('data-face', 'up');
    await expect(game.getByRole('status')).toHaveText('0 moves.');
  });

  test('clears the shelf when the session ends', async ({ page }) => {
    await prepare(page, 390, 'light');
    await page.goto('/town/memory');
    const game = page.locator('app-memory-shelves');
    await game.getByRole('button', { name: 'Play Memory Shelves' }).tap();
    await game.locator('[data-index="0"]').tap();
    await expect(game.locator('[data-index="0"]')).toHaveAttribute('data-face', 'up');
    await page.getByRole('banner').getByRole('button', { name: 'synthetic', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('town.memory-shelves.v1.')))).toEqual([]);
  });
});
