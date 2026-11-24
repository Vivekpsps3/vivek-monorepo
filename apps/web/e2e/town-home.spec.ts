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
    await expect(locator).toBeEnabled();
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

  for (const [width, theme] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']] as const) {
    test(`previews and saves a room edit at ${width} ${theme}`, async ({ page }, info) => {
      test.setTimeout(120_000);
      await prepare(page, width, theme);
      let failed = false;
      const writes: string[] = [];
      await page.route('**/api/town/layouts/**', async route => {
        const request = route.request();
        if (request.method() === 'PUT') writes.push(request.postData() ?? '');
        if (request.method() === 'PUT' && !failed) {
          failed = true;
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'The layout service is down.' }),
          });
          return;
        }
        await route.continue();
      });
      await page.goto('/town/home/study?object=study-desk');
      const home = page.locator('app-town-home');
      const status = home.locator('[data-layout-status]');
      await home.locator('#home-note').fill('Harbor draft stays');
      const touch = width === 390;
      const decorate = home.getByRole('button', { name: 'Decorate room' });
      await activate(page, decorate, touch);
      const inventory = home.getByLabel('Add furniture');
      await expect(inventory).toBeFocused();
      await inventory.selectOption('low-table');
      const column = home.getByLabel('Column', { exact: true });
      const row = home.getByLabel('Row', { exact: true });
      const place = home.getByRole('button', { name: 'Place item' });
      const preview = home.locator('[data-placement-status]');

      await column.selectOption({ value: '2' });
      await row.selectOption({ value: '5' });
      await expect(preview).toHaveText('That space is occupied.');
      await expect(place).toBeDisabled();
      await activate(page, home.getByRole('button', { name: 'Cancel placement' }), touch);
      await expect(inventory).toBeFocused();
      await expect(home.getByRole('button', { name: 'Save layout' })).toBeDisabled();

      await inventory.selectOption('low-table');
      if (touch) {
        const viewport = home.getByRole('group', { name: 'Study', exact: true });
        await viewport.scrollIntoViewIfNeeded();
        const scene = await viewport.boundingBox();
        if (!scene) throw new Error('Study scene is missing');
        await page.touchscreen.tap(scene.x + scene.width * 5.5 / 12, scene.y + scene.height * 13.5 / 15);
      } else {
        await column.selectOption({ value: '5' });
        await row.selectOption({ value: '10' });
      }
      await expect(column).toHaveValue('5');
      await expect(row).toHaveValue('10');
      await expect(preview).toHaveText('Keep the doorway clear.');
      await expect(place).toBeDisabled();

      await column.selectOption({ value: '6' });
      if (touch) await row.selectOption({ value: '1' });
      else {
        await row.press('Home');
        await row.press('ArrowDown');
        await expect(row).toHaveValue('1');
      }
      await activate(page, home.getByRole('button', { name: 'Rotate 90°' }), touch);
      await activate(page, home.getByRole('button', { name: 'Rose' }), touch);
      await expect(home.getByRole('button', { name: 'Rose' })).toHaveAttribute('aria-pressed', 'true');
      await expect(preview).toHaveText('Preview ready.');
      const scan = await new AxeBuilder({ page }).include('app-town-home').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      expect(await home.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
      await info.attach(`preview-${width}-${theme}`, { body: await home.screenshot(), contentType: 'image/png' });

      await activate(page, place, touch);
      const save = home.getByRole('button', { name: 'Save layout', exact: true });
      for (const target of [save, inventory]) {
        const box = await target.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      await activate(page, save, touch);
      await expect(status).toHaveText('The layout was not saved. Your changes are still here.');
      await expect(home.getByLabel('Move or recolor furniture')).toContainText('Low table');
      await expect(home).not.toContainText('layout service');
      await activate(page, save, touch);
      await expect(status).toHaveText('Layout saved · Revision 1');
      await expect(decorate).toBeFocused();
      await expect(home.locator('#home-note')).toHaveValue('Harbor draft stays');
      expect(writes).toHaveLength(2);
      expect(writes[0]).toBe(writes[1]);
      expect(writes[1]).not.toContain('Harbor');
      expect(writes[1]).not.toContain('note');

      const read = await page.request.get('/api/town/layouts/study');
      expect(read.ok()).toBeTruthy();
      const body = await read.json() as { revision: number; items: { instance_id: string; catalog_id: string; palette: number }[] };
      expect(body.revision).toBe(1);
      expect(body.items.map(item => item.catalog_id)).toEqual(['desk', 'desk-lamp', 'bookshelf', 'low-table']);
      const saved = body.items.at(-1)!;
      expect(saved).toMatchObject({ palette: 2, orientation: 1, column: 6, row: 1 });
      await page.reload();
      const item = home.locator(`[data-scene-object="${saved.instance_id}"] img`);
      await expect(item).toBeVisible();
      await expect(item).toHaveAttribute('data-palette', '2');
      await expect(item).toHaveCSS('--turn', '90deg');
      await expect(home.locator('#home-note')).toBeEnabled();
    });
  }

  test('brings a saved milestone ornament back when corrected eligibility returns', async ({ page }) => {
    await prepare(page, 1280, 'light');
    expect((await page.request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    const setDay = async (day: string) => {
      expect((await page.request.post('/e2e/town/clock', { data: { iso: `${day}T19:00:00Z` } })).ok()).toBeTruthy();
    };
    await setDay('2026-10-08');
    await page.goto('/town/home/courtyard');
    const home = page.locator('app-town-home');
    await home.getByRole('button', { name: 'Decorate room' }).click();
    await home.getByLabel('Building level 2', { exact: true }).selectOption('small-planter');
    await home.getByRole('button', { name: 'Place item' }).click();
    await home.getByRole('button', { name: 'Save layout' }).click();
    const ornament = home.locator('[data-scene-object="habit-level-2"]');
    await expect(ornament).toBeVisible();
    await expect(ornament.locator('img')).toHaveAttribute('src', /milestones\.svg#planter/);
    const town = await (await page.request.get('/api/town')).json() as { habits: { id: number; level: number }[] };
    const habit = town.habits.find(item => item.level === 2)!;
    const headers = { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin };
    const checkins = `/api/town/habits/${habit.id}/checkins`;
    expect((await page.request.delete(`${checkins}/2026-10-08`, { headers })).ok()).toBeTruthy();
    await page.reload();
    await expect(ornament).toHaveCount(0);
    await expect(home.locator('[data-dormant-milestone="habit-level-2"]')).toBeVisible();
    await home.getByRole('button', { name: 'Decorate room' }).click();
    await expect(home.getByText('Your choice will return when eligible.')).toBeVisible();
    const saved = await (await page.request.get('/api/town/layouts/courtyard')).json() as {
      items: { instance_id: string; catalog_id: string }[];
    };
    expect(saved.items).toContainEqual(expect.objectContaining({ instance_id: 'habit-level-2', catalog_id: 'small-planter' }));
    expect((await page.request.post(checkins, { headers, data: { day: '2026-10-08' } })).ok()).toBeTruthy();
    await page.reload();
    await expect(ornament).toBeVisible();
    await expect(ornament).toHaveAccessibleName('Small planter');
  });

  test('drops the editor and a held save on a cross-tab vault lock', async ({ page }) => {
    await prepare(page, 1280, 'dark');
    let release: () => void = () => undefined;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    await page.route(/\/api\/town\/layouts\/study(?:\?|$)/, async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      await waiting;
      await route.fulfill({
        status: 200,
        json: { room_id: 'study', revision: 4, items: route.request().postDataJSON().items },
      });
    });
    try {
      await page.goto('/town/home/study?object=study-desk');
      const home = page.locator('app-town-home');
      const note = home.locator('#home-note');
      await note.fill('Synthetic note clears on lock');
      const decorate = home.getByRole('button', { name: 'Decorate room' });
      await decorate.click();
      await home.getByLabel('Add furniture').selectOption('oak-seat');
      await home.getByRole('button', { name: 'Place item' }).click();
      const issued = page.waitForRequest(request => request.method() === 'PUT' && request.url().includes('/layouts/study'));
      await home.getByRole('button', { name: 'Save layout' }).click();
      await issued;
      await page.evaluate(() => {
        const remote = new BroadcastChannel('finance-vault-sync-v1');
        remote.postMessage({ version: 1, userId: 1, kind: 'lock', tabId: 'synthetic-other-tab' });
        remote.close();
      });
      await expect(decorate).toBeEnabled();
      await expect(note).toHaveValue('');
      const delivered = page.waitForResponse(response =>
        response.request().method() === 'PUT' && response.url().includes('/layouts/study'));
      release();
      await delivered;
      await expect(home.locator('[data-layout-status]')).toHaveAttribute('data-layout-revision', '0');
      await expect(home.getByRole('link', { name: 'Oak seat' })).toHaveCount(0);
    } finally {
      release();
    }
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
