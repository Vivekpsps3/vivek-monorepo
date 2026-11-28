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

function unexpectedWrites(writes: string[]): string[] {
  const allowed = /^POST \/api\/town\/minigames\/runs(\/[^/]+\/finish)?$/;
  return writes.filter(item => allowed.test(item) ? false : /\/api\/(town|media|pixels|health)|stamp/i.test(item));
}

async function solve(page: Page, game: Locator, touch: boolean, firstPair = 0): Promise<void> {
  for (const indexes of pairs().slice(firstPair)) {
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
      await expect(game).not.toContainText('Seed 10.');
      await expect(game.getByRole('status')).toHaveText('Turn two shelves. This game is not timed.');
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

      await activate(page, game.locator('[data-index="0"]'), touch);
      await activate(page, game.locator('[data-index="11"]'), touch);
      await expect(game.getByRole('status')).toHaveText('1 move. 1 of 6 pairs matched.');
      if (touch) await game.getByRole('button', { name: 'Pause', exact: true }).tap();
      else await page.keyboard.press('p');
      await expect(game.getByRole('status')).toHaveText('Paused. 1 move. 1 of 6 pairs matched.');
      await page.reload();
      await expect(game.getByRole('status')).toHaveText('Paused. 1 move. 1 of 6 pairs matched.');
      await expect(game.locator('[data-face="matched"]')).toHaveCount(2);
      await expect(game.getByRole('button', { name: 'Shelf 1, Bell, matched' })).toBeDisabled();
      await expect(game.locator('.shelf[tabindex="0"]')).toHaveCount(0);
      await activate(page, game.getByRole('button', { name: 'Resume', exact: true }), touch);
      await expect(game.locator('[data-index="1"][tabindex="0"]')).toBeFocused();
      await expect(game.getByRole('status')).toHaveText('1 move. 1 of 6 pairs matched.');

      await solve(page, game, touch, 1);
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
      expect(unexpectedWrites(writes)).toEqual([]);
      await info.attach(`memory-${width}-${theme}`, { body: await game.screenshot(), contentType: 'image/png' });
    });

    test(`keeps keyboard focus through all six matches at ${width} ${theme}`, async ({ page }, info) => {
      await prepare(page, width, theme);
      await page.goto('/town/memory');
      const game = page.locator('app-memory-shelves');
      const play = game.getByRole('button', { name: 'Play Memory Shelves' });
      const tabStop = game.locator('.shelf[tabindex="0"]:enabled');
      await expect(play).toBeVisible();
      for (let step = 0; step < 12; step++) {
        if (await play.evaluate(element => element === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      await expect(play).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(tabStop).toHaveAccessibleName('Shelf 1, face down');
      await expect(tabStop).toBeFocused();
      await expect(game.getByRole('group', { name: 'Shelves' })).toHaveAccessibleDescription(/Arrow keys.*Enter or Space/);
      await page.keyboard.press('Tab');
      await expect(game.getByRole('button', { name: 'Pause' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(tabStop).toBeFocused();

      let focused = 0;
      const matched = new Set<number>();
      const nextShelves = [1, 7, 4, 8, 9];
      for (const [pairIndex, pair] of pairs().entries()) {
        for (const index of pair) {
          const step = index > focused ? 1 : -1;
          while (focused !== index) {
            focused += step;
            while (matched.has(focused)) focused += step;
            await page.keyboard.press(step === 1 ? 'ArrowRight' : 'ArrowLeft');
            await expect(game.locator(`[data-index="${focused}"]`)).toBeFocused();
          }
          await page.keyboard.press(index === pair[0] ? 'Enter' : 'Space');
        }
        pair.forEach(index => matched.add(index));
        await expect(game.locator('.shelf:disabled[tabindex="0"]')).toHaveCount(0);
        await expect(game.locator('[data-face="matched"]')).toHaveCount(matched.size);
        if (pairIndex < nextShelves.length) {
          focused = nextShelves[pairIndex];
          await expect(tabStop).toHaveCount(1);
          await expect(tabStop).toHaveAttribute('data-index', String(focused));
          await expect(tabStop).toBeFocused();
          await expect(tabStop).toBeInViewport();
          await expect(game.locator('.shelf:focus-visible')).toHaveCount(1);
          const moves = pairIndex + 1;
          await expect(game.getByRole('status')).toHaveText(`${moves} ${moves === 1 ? 'move' : 'moves'}. ${moves} of 6 pairs matched.`);
          if (pairIndex === 0) {
            await info.attach(`memory-match-focus-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
          }
        }
      }
      await expect(tabStop).toHaveCount(0);
      await expect(game.getByRole('status')).toHaveText('All six pairs matched in 6 moves.');
      await expect(game.getByRole('button', { name: 'Restart' })).toBeFocused();
      await info.attach(`memory-restart-focus-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      await page.keyboard.press('Enter');
      await expect(tabStop).toHaveAccessibleName('Shelf 1, face down');
      await expect(tabStop).toBeFocused();
      await expect(game.getByRole('status')).toHaveText('0 moves.');
      await expect(page).toHaveURL(/\/town\/memory$/);
    });
  }

  test('keeps shelf focus and readable symbols at 320px with enlarged text', async ({ page }, info) => {
    await prepare(page, 320, 'dark');
    await page.goto('/town/memory');
    await page.locator('html').evaluate(element => { element.style.fontSize = '200%'; });
    const game = page.locator('app-memory-shelves');
    await game.getByRole('button', { name: 'Play Memory Shelves' }).click();
    await expect(game.locator('[data-index="0"]')).toBeFocused();
    await page.keyboard.press('Enter');
    for (let index = 1; index <= 11; index++) {
      await page.keyboard.press('ArrowDown');
      await expect(game.locator(`[data-index="${index}"]`)).toBeFocused();
    }
    await page.keyboard.press('Enter');
    await expect(game.getByRole('status')).toHaveText('1 move. 1 of 6 pairs matched.');
    await expect(game.locator('[data-index="1"]')).toBeFocused();
    await expect(game.locator('[data-index="1"]')).toBeInViewport();
    const readableSymbols = await game.locator('.shelf[data-face="matched"]').evaluateAll(elements => elements.every(element => {
      const face = element.querySelector('.shelf-face');
      if (!face) return false;
      const text = document.createRange();
      text.selectNodeContents(face);
      return text.getBoundingClientRect().width <= face.getBoundingClientRect().width + 1;
    }));
    expect(readableSymbols).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
    await info.attach('memory-enlarged-text', { body: await page.screenshot(), contentType: 'image/png' });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('ArrowDown');
    await expect(game.locator('[data-index="3"]')).toBeFocused();
  });

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
    await expect(game.getByRole('status')).toHaveText('1 move. 1 of 6 pairs matched.');
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
    await game.locator('[data-index="11"]').click();
    await game.locator('[data-index="1"]').click();
    await expect(game.locator('[data-index="1"]')).toHaveAttribute('data-face', 'up');
    await game.getByRole('navigation', { name: 'Current place' }).getByRole('link', { name: 'Town' }).click();
    await expect(page).toHaveURL(/\/town$/);
    await expect(page.getByRole('link', { name: 'Memory Shelves', exact: true })).toBeFocused();
    await page.getByRole('link', { name: 'Memory Shelves', exact: true }).click();
    await expect(game.locator('[data-index="1"]')).toHaveAttribute('data-face', 'up');
    await expect(game.locator('.shelf[tabindex="0"]')).toHaveAttribute('data-index', '1');
    await expect(game.getByRole('status')).toHaveText('1 move. 1 of 6 pairs matched.');
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

  for (const [width, theme, touch] of [
    [390, 'light', true],
    [390, 'dark', true],
    [1280, 'light', false],
    [1280, 'dark', false],
  ] as const) {
    test(`grants one Town-day reward and keeps a rejected receipt at ${width} ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      const finishes: string[] = [];
      page.on('request', request => {
        if (request.method() !== 'POST' || !request.url().includes('/minigames/runs/')) return;
        if (request.url().includes('/finish')) finishes.push(request.postData() ?? '');
      });
      await prepare(page, width, theme);
      let reject = true;
      await page.route('**/api/town/minigames/runs/*/finish', async route => {
        if (reject) {
          reject = false;
          await new Promise(resolve => setTimeout(resolve, 300));
          await route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'play_receipt_rejected', message: 'That play receipt does not match this run.' }),
          });
          return;
        }
        await route.continue();
      });
      await page.goto('/town/memory');
      const game = page.locator('app-memory-shelves');
      await activate(page, game.getByRole('button', { name: 'Play Memory Shelves' }), touch);
      await solve(page, game, touch);
      await expect(game.getByRole('status')).toHaveText('All six pairs matched in 6 moves.');
      await expect(game.locator('#memory-reward')).toHaveText('This win is still here. The reward was not saved.');
      await expect(game.locator('[data-face="matched"]')).toHaveCount(12);
      const retry = game.getByRole('button', { name: 'Try the reward again' });
      const retryBox = await retry.boundingBox();
      expect(retryBox?.width).toBeGreaterThanOrEqual(44);
      expect(retryBox?.height).toBeGreaterThanOrEqual(44);
      expect((await (await page.request.get('/api/town/stamps')).json()).balance).toBe(0);
      await activate(page, retry, touch);
      await expect(game.locator('#memory-reward')).toHaveText('5 Stamps for this Town day. A replay keeps the score and adds none.');
      await expect(game.getByRole('status')).toHaveText('All six pairs matched in 6 moves.');
      expect((await (await page.request.get('/api/town/stamps')).json()).balance).toBe(5);

      await activate(page, game.getByRole('button', { name: 'Restart', exact: true }), touch);
      await expect(game.getByRole('status')).toHaveText('0 moves.');
      await solve(page, game, touch);
      await expect(game.locator('#memory-reward')).toHaveText('Score kept. No extra Stamps for this game today.');
      await expect(game.getByRole('status')).toHaveText('All six pairs matched in 6 moves.');
      expect((await (await page.request.get('/api/town/stamps')).json()).balance).toBe(5);
      expect(finishes.length).toBeGreaterThanOrEqual(3);
      for (const body of finishes) expect(body).not.toMatch(/weight|blood|steps|sleep|finance|trip_id|heart/i);
      const scan = await new AxeBuilder({ page }).include('app-memory-shelves').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      expect(await game.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    });
  }
});
