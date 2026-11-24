import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../../../tests/e2e/fixtures';
import { HOME_ROOMS, homeObjects, homePrimary, starterHomeLayout } from '../src/app/town/home-rooms';

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
      for (const room of HOME_ROOMS) {
        const items = starterHomeLayout(room.id).map(item => item.instance_id === homePrimary(room.id).id
          ? { ...item, palette: 1 }
          : item);
        const response = await page.request.put(`/api/town/layouts/${room.id}`, {
          headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
          data: { expected_revision: 0, items },
        });
        expect(response.status()).toBe(201);
      }
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
      await expect(home.locator('[data-placement-grid]')).toHaveCount(0);
      await expect(home.getByLabel('Column', { exact: true })).toHaveCount(0);
      const part = theme === 'dark' ? 'night' : 'day';

      for (const room of HOME_ROOMS) {
        const nav = home.locator(`[data-home-link="${room.id}"]`);
        const navBox = await nav.boundingBox();
        expect(navBox?.width, room.id).toBeGreaterThanOrEqual(44);
        expect(navBox?.height, room.id).toBeGreaterThanOrEqual(44);
        await activate(page, nav, touch);
        await expect(page).toHaveURL(new RegExp(`/town/home/${room.id}$`));
        await expect(home.getByRole('heading', { name: room.label, level: 1 })).toBeVisible();
        const roomArt = home.locator('img.room');
        await expect(roomArt).toBeVisible();
        await expect(roomArt).toHaveAttribute('src', `/town/home/${room.id}.svg`);
        for (const object of homeObjects(room.id)) {
          const link = home.locator(`[data-object="${object.id}"]`);
          await expect(link).toBeVisible();
          const box = await link.boundingBox();
          expect(box?.width, object.id).toBeGreaterThanOrEqual(44);
          expect(box?.height, object.id).toBeGreaterThanOrEqual(44);
        }
        const primary = homePrimary(room.id);
        const primaryLink = home.locator(`[data-object="${primary.id}"]`);
        const piece = home.locator(`[data-scene-object="${primary.id}"]`);
        const art = piece.locator('img');
        await expect(art).toBeVisible();
        await expect(art).toHaveAttribute('src', new RegExp(`/town/cosmetics/${primary.catalogId}-${part}\\.svg`));
        await expect(art).toHaveAttribute('data-palette', '1');
        await expect(home.getByRole('button', { name: 'Decorate room' })).toBeEnabled();
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(primaryLink).toBeInViewport({ ratio: 1 });
        await expect(home.getByRole('button', { name: 'Decorate room' })).toBeInViewport({ ratio: 1 });
        await expect(home.locator('[data-placement-grid]')).toHaveCount(0);
        await info.attach(`browse-${room.id}-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
        await activate(page, primaryLink, touch);
        await expect(page).toHaveURL(new RegExp(`object=${primary.id}`));
        await expect(piece).toHaveAttribute('aria-current', 'true');
        await expect(home.getByRole('heading', { name: primary.label, level: 2 })).toBeVisible();
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
        const close = home.getByRole('button', { name: 'Close details' });
        const closeBox = await close.boundingBox();
        expect(closeBox?.width).toBeGreaterThanOrEqual(44);
        expect(closeBox?.height).toBeGreaterThanOrEqual(44);
        if (touch) await page.keyboard.press('Escape');
        else await activate(page, close, false);
        await expect(page).not.toHaveURL(/object=/);
        await expect(primaryLink).toBeFocused();

        await piece.scrollIntoViewIfNeeded();
        const bounds = await piece.boundingBox();
        if (!bounds) throw new Error(`${primary.label} is missing from the scene`);
        const x = bounds.x + bounds.width / 4;
        const y = bounds.y + bounds.height / 2;
        if (touch) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
        await expect(page).toHaveURL(new RegExp(`object=${primary.id}`));
        await expect(primaryLink).toBeFocused();
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

  test('fits the 320px room chooser and editor at 200% text', async ({ page }, info) => {
    await prepare(page, 320, 'dark');
    await page.goto('/town/home/study');
    const home = page.locator('app-town-home');
    await expect(home.locator('img.room')).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await expect(page.locator('html')).toHaveCSS('font-size', '32px');
    const fits = () => home.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(await fits()).toBeTruthy();
    const decorate = home.getByRole('button', { name: 'Decorate room' });
    await expect(decorate).toBeEnabled();
    await info.attach('browse-320-dark-200-percent', { body: await page.screenshot(), contentType: 'image/png' });
    await activate(page, decorate, false);
    await expect(home.getByLabel('Add furniture')).toBeFocused();
    await home.getByLabel('Add furniture').selectOption('low-table');
    await expect(home.getByLabel('Column', { exact: true })).toBeVisible();
    expect(await fits()).toBeTruthy();
    await info.attach('edit-320-dark-200-percent', { body: await home.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape');
    await expect(home.getByLabel('Add furniture')).toBeFocused();
    await activate(page, home.getByRole('button', { name: 'Cancel editing' }), false);
    await expect(decorate).toBeFocused();
  });

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
      const grid = home.locator('[data-placement-grid]');
      await expect(grid).toBeVisible();
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
        await grid.scrollIntoViewIfNeeded();
        const doorway = await grid.evaluate(element => {
          const shape = element.getBoundingClientRect();
          const skew = new DOMMatrix(getComputedStyle(element).transform).c;
          const depth = element.clientHeight * 10.5 / 12;
          return { x: shape.left + element.clientWidth * 5.5 / 12 + depth * skew, y: shape.top + depth };
        });
        await page.touchscreen.tap(doorway.x, doorway.y);
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
      const placed = home.locator('[data-scene-object^="piece-"]');
      const position = await placed.evaluate(element => {
        const { left, top } = (element as HTMLElement).style;
        return { left, top };
      });
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
      await expect(grid).toHaveCount(0);
      expect(await placed.evaluate(element => {
        const { left, top } = (element as HTMLElement).style;
        return { left, top };
      })).toEqual(position);
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

  for (const [width, theme] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']] as const) {
    test(`recovers a conflicted draft and previews Reset at ${width} ${theme}`, async ({ page }, info) => {
      await prepare(page, width, theme);
      await page.goto('/town/home/study?object=study-desk');
      const home = page.locator('app-town-home');
      const status = home.locator('[data-layout-status]');
      const touch = width === 390;
      const button = (name: string) => home.getByRole('button', { name, exact: true });
      const press = (name: string) => activate(page, button(name), touch);
      const desk = home.locator('[data-object="study-desk"]');
      const palette = (id: string) => home.locator(`[data-scene-object="${id}"] img`);
      const layoutUrl = '/api/town/layouts/study';
      const read = async () => {
        const response = await page.request.get(layoutUrl);
        expect(response.ok()).toBeTruthy();
        return response.json();
      };
      await home.locator('#home-note').fill('Keep this desk note');
      await press('Decorate room');
      await home.getByLabel('Move or recolor furniture').selectOption('study-desk');
      await press('Rose');
      await press('Place item');
      await expect(palette('study-desk')).toHaveAttribute('data-palette', '2');

      // Another client saves from the same revision while this device retains its draft.
      const otherItems = starterHomeLayout('study').map(item =>
        item.instance_id === 'study-shelf' ? { ...item, palette: 3 } : item);
      const winner = await page.request.put(layoutUrl, {
        headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
        data: { expected_revision: 0, items: otherItems },
      });
      expect(winner.status()).toBe(201);

      let failRead = true;
      let failWrite = false;
      const revisions: number[] = [];
      await page.route(/\/api\/town\/layouts\/study(?:\?|$)/, async route => {
        const request = route.request();
        const write = request.method() === 'PUT';
        if (write) {
          revisions.push(request.postDataJSON().expected_revision);
          if (failWrite) {
            failWrite = false;
            return route.fulfill({ status: 503, json: { message: 'Synthetic failure' } });
          }
        } else if (failRead) {
          failRead = false;
          return route.fulfill({ status: 503, json: { message: 'Synthetic failure' } });
        }
        return route.continue();
      });
      await press('Save layout');
      const conflict = home.getByRole('heading', { name: 'This room was saved elsewhere' });
      await expect(conflict).toBeFocused();
      await expect(status).toHaveText('The latest layout could not be loaded. Your draft is kept.');
      await expect(button('Reapply my changes')).toBeDisabled();
      expect(await read()).toMatchObject({ revision: 1, items: otherItems });
      await press('Retry latest layout');
      await expect(status).toHaveText('The scene shows the latest saved room.');
      await expect(palette('study-desk')).toHaveAttribute('data-palette', '0');
      await expect(palette('study-shelf')).toHaveAttribute('data-palette', '3');
      for (const name of ['Reapply my changes', 'Discard my changes']) {
        const box = await button(name).boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      await info.attach(`conflict-${width}-${theme}`, { body: await home.screenshot(), contentType: 'image/png' });
      await press('Reapply my changes');
      await expect(home.getByRole('heading', { name: 'Decorate Study' })).toBeFocused();
      await expect(palette('study-desk')).toHaveAttribute('data-palette', '2');
      await expect(palette('study-shelf')).toHaveAttribute('data-palette', '3');
      expect(revisions).toEqual([0]);
      expect(await read()).toMatchObject({ revision: 1, items: otherItems });
      await press('Save layout');
      await expect(status).toHaveText('Layout saved · Revision 2');
      await expect(home.locator('#home-note')).toHaveValue('Keep this desk note');
      const merged = await read();
      expect(merged.items.find((item: { instance_id: string }) => item.instance_id === 'study-desk')).toMatchObject({ palette: 2 });

      failWrite = true;
      await press('Undo last save');
      await expect(status).toHaveText('Undo failed. Your saved room is unchanged.');
      await expect(button('Undo last save')).toBeFocused();
      expect(await read()).toEqual(merged);
      await press('Undo last save');
      await expect(status).toHaveText('Layout saved · Revision 3');
      await expect(desk).toBeFocused();
      expect(await read()).toMatchObject({ revision: 3, items: otherItems });

      await press('Decorate room');
      await press('Reset room');
      const reset = home.getByRole('heading', { name: 'Reset preview' });
      await expect(reset).toBeFocused();
      await expect(palette('study-shelf')).toHaveAttribute('data-palette', '0');
      expect(await read()).toMatchObject({ revision: 3, items: otherItems });
      const scan = await new AxeBuilder({ page }).include('app-town-home').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      expect(await home.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
      const confirm = await button('Confirm reset').boundingBox();
      expect(confirm?.width).toBeGreaterThanOrEqual(44);
      expect(confirm?.height).toBeGreaterThanOrEqual(44);
      await info.attach(`reset-${width}-${theme}`, { body: await home.screenshot(), contentType: 'image/png' });
      failWrite = true;
      await press('Confirm reset');
      await expect(status).toHaveText('Reset failed. Your saved room and draft are unchanged.');
      await expect(button('Keep editing')).toBeFocused();
      expect(await read()).toMatchObject({ revision: 3, items: otherItems });
      await page.keyboard.press('Escape');
      await expect(button('Reset room')).toBeFocused();
      await expect(palette('study-shelf')).toHaveAttribute('data-palette', '3');
      await press('Reset room');
      await press('Confirm reset');
      await expect(status).toHaveText('Layout saved · Revision 4');
      await expect(desk).toBeFocused();
      expect(revisions).toEqual([0, 1, 2, 2, 3, 3]);
      expect(await read()).toMatchObject({ revision: 4, items: starterHomeLayout('study') });
      await page.reload();
      await expect(status).toHaveAttribute('data-layout-revision', '4');
      await expect(status).toBeEmpty();
      await expect(palette('study-shelf')).toHaveAttribute('data-palette', '0');
    });
  }

  test('keeps a protected layout read-only while room actions stay usable', async ({ page }) => {
    await prepare(page, 390, 'dark');
    await page.route(/\/api\/town\/layouts\/study(?:\?|$)/, route => route.fulfill({
      json: { room_id: 'study', revision: 7, items: [], recovery_required: true },
    }));
    await page.goto('/town/home/study');
    const home = page.locator('app-town-home');
    await expect(home.locator('[data-layout-status]')).toHaveText(
      'This layout needs recovery. Starter furniture is shown. Your saved layout is kept.',
    );
    await expect(home.getByRole('button', { name: 'Decorate room' })).toBeDisabled();
    await expect(home.getByRole('button', { name: 'Undo last save' })).toHaveCount(0);
    await home.getByRole('link', { name: 'Desk', exact: true }).tap();
    await expect(home.locator('#home-note')).toBeEnabled();
  });

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
