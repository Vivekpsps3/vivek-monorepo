import AxeBuilder from '@axe-core/playwright';
import { type Route } from '@playwright/test';
import { expect, test, type Locator } from '../../../tests/e2e/fixtures';
import type { TownResponse } from '../src/app/town/town.types';

const BUDGET_PASSPHRASE = 'Synthetic town budget passphrase';

const FOREIGN_HABIT = "Other's habit";

test.describe('Town', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  });
  test('7: locked lots are inspected from the keyboard; 9: other users stay out of the DOM', async ({ page }) => {
    await page.goto('/town');
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.locator('main > header')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Terraria-on-Sea' })).toBeVisible();
    const scene = page.getByRole('list', { name: 'Town buildings' });
    await expect(scene.getByRole('listitem')).toHaveCount(16);
    const locked = scene.getByRole('listitem').filter({ hasText: 'Unlocks at Lv 5' });
    await expect(locked).toHaveCount(1);
    const lockedButton = locked.getByRole('button');
    await lockedButton.focus();
    await page.keyboard.press('Enter');
    const inspector = page.locator('app-town-exterior [data-inspector]');
    await expect(inspector).toHaveAttribute('data-inspector', 'locked');
    await expect(inspector).toContainText('Unlocks at level 5');
    await expect(inspector).toContainText('Nothing can be built here yet.');
    await expect(inspector.getByRole('button', { name: 'Build here' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(page.locator('app-habit-dialog')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Archived habits' })).toBeVisible();
    const controls = scene.locator('a, button');
    await controls.first().focus();
    for (let i = 0; i < await controls.count(); i++) {
      await expect(controls.nth(i)).toBeFocused();
      await page.keyboard.press('Tab');
    }
    const html = await page.content();
    expect(html).not.toContain(FOREIGN_HABIT);
    expect(html).not.toContain('Other User');
    const treasury = scene.getByRole('link', { name: /Treasury/ });
    await expect(treasury).toHaveAttribute('href', '/finance/vault/unlock?next=%2Ftown');
    expect(await treasury.innerText()).not.toMatch(/\d/);
  });
  for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
    test(`14: ${width} ${theme} layout, contrast and decorative sprites`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.addInitScript(theme => localStorage.setItem('suite-theme', theme), theme);
      await page.goto('/town');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.locator('main > header')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('list', { name: 'Town buildings' })).toBeVisible();
      const body: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
      await expect(page.locator('app-town header')).toContainText(`Lv ${body.town.level} · ${body.town.xp} / ${body.town.next_level_xp} XP`);
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(body.town.name);
      expect(await page.content()).not.toContain(FOREIGN_HABIT);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      for (const name of ['Civic', 'Residential', 'Harbor', 'Culture', 'Wellness', 'Garden']) {
        const district = page.getByRole('button', { name, exact: true });
        await expect(district).toBeVisible();
        const box = await district.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      const viewport = page.getByRole('group', { name: 'Town exterior' });
      await expect(viewport).toBeInViewport({ ratio: 1 });
      if (width === 390) {
        await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeInViewport({ ratio: 1 });
        await expect(page.getByText('Buildings', { exact: true })).toBeInViewport({ ratio: 1 });
        await expect(page.getByRole('link', { name: /^Home/ }).filter({ has: page.locator('.building-icon') })).toBeInViewport({ ratio: 1 });
      } else {
        const today = page.getByRole('region', { name: 'Today' });
        await expect(today.getByRole('heading', { name: 'Today' })).toBeVisible();
        expect((await today.boundingBox())?.x).toBeGreaterThan((await viewport.boundingBox())!.x);
      }
      await expect(page.locator('[aria-label="Town buildings"] svg[aria-hidden="true"]')).toHaveCount(16);
      await expect(viewport.locator('[data-scene-object][aria-hidden="true"]')).toHaveCount(16);
      if (width === 1280) expect(await page.locator('app-town ui-card').evaluate(el => el.getBoundingClientRect().width)).toBe(360);
      const scan = await new AxeBuilder({ page }).include('app-town').analyze();
      expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
      await info.attach(`town-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
    });
  }
  test('15: DST check-in keeps the server calendar day', async ({ page, request }) => {
    expect((await request.post('/e2e/town/clock', { data: { iso: '2026-11-01T19:00:00Z' } })).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-11-01T19:00:00Z'));
    await page.goto('/town');
    const before: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
    expect(before.town.tz).toBe('America/Los_Angeles');
    expect(before.town.today).toBe('2026-11-01');
    const habit = before.habits.find(h => h.name === 'Read 20 pages')!;
    const result = await page.request.post(`/api/town/habits/${habit.id}/checkins?tz=America%2FLos_Angeles`, {
      headers: { 'X-CSRF-Token': 'synthetic-csrf' }, data: { day: before.town.today },
    });
    expect(result.ok()).toBeTruthy();
    const checked = await result.json();
    expect(checked.day).toBe('2026-11-01'); expect(checked.checked).toBeTruthy();
    await page.reload();
    const lot = page.getByRole('list', { name: 'Town buildings' }).getByRole('button', { name: /Read 20 pages/ });
    await expect(lot).toContainText(`Lv ${checked.habit.level} · ${checked.habit.streak.current}-day streak`);
    expect(await page.content()).not.toContain(FOREIGN_HABIT);
  });

  test('passive credits name Media and Travel and retract when the source is undone', async ({ page, request }) => {
    const now = new Date();
    expect((await request.post('/e2e/town/clock', { data: { iso: now.toISOString() } })).ok()).toBeTruthy();
    await page.clock.setFixedTime(now);
    await page.goto('/town');
    const todayPanel = page.locator('app-town-today');
    await expect(todayPanel).toContainText('Media · +0/10 XP today');
    await expect(todayPanel).toContainText('Travel · +0/15 XP today');
    await expect(todayPanel).not.toContainText('Auto');

    const before: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
    expect(before.buildings.library.source).toBe('ok');
    expect(before.buildings.inn.source).toBe('ok');
    const yesterday = shiftDay(before.town.today, -1);

    const movieText = await readOk(await page.request.post('/media/api/library', {
      data: { kind: 'movie', title: 'Passive Film', status: 'completed' },
    }));
    const saved = JSON.parse(movieText) as { id: number };
    expect(movieText).not.toContain('completed_on');
    expect(saved.id).toBeGreaterThan(0);
    const credited: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
    expect(credited.buildings.library.today_xp).toBe(10);
    expect(credited.buildings.library.xp).toBe(before.buildings.library.xp + 10);
    expect(credited.town.xp).toBe(before.town.xp + 10);
    await page.reload();
    await expect(todayPanel).toContainText('Media · +10/10 XP today');

    const undoneText = await readOk(await page.request.patch(`/media/api/entries/${saved.id}`, {
      data: { status: 'in_progress' },
    }));
    expect(undoneText).not.toContain('completed_on');
    expect(JSON.parse(undoneText).status).toBe('in_progress');
    const cleared: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
    expect(cleared.buildings.library.today_xp).toBe(0);
    expect(cleared.buildings.library.xp).toBe(before.buildings.library.xp);
    await page.reload();
    await expect(todayPanel).toContainText('Media · +0/10 XP today');

    const plannedText = await readOk(await page.request.post('/travel/api/trips', {
      data: {
        title: 'Planning only', start_date: yesterday, end_date: yesterday,
        status: 'planning', counts_as_pto: false,
      },
    }));
    const planned = JSON.parse(plannedText) as { id: number };
    expect(planned.id).toBeGreaterThan(0);
    const lateText = await readOk(await page.request.post('/travel/api/trips', {
      data: {
        title: 'Logged late', start_date: yesterday, end_date: yesterday,
        status: 'done', counts_as_pto: false,
      },
    }));
    expect(JSON.parse(lateText).status).toBe('done');
    const still: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
    expect(still.buildings.inn.xp).toBe(before.buildings.inn.xp);
    expect(still.buildings.inn.today_xp).toBe(0);

    const reminderText = await readOk(await page.request.post(`/travel/api/trips/${planned.id}/reminders`, {
      data: { title: 'Pack', done: true },
    }));
    const detail = JSON.parse(reminderText) as { reminders: { id: number; title: string }[] };
    const packed = detail.reminders.find(item => item.title === 'Pack');
    expect(packed).toBeTruthy();
    expect(reminderText).not.toContain('done_at');
    const reminded: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
    expect(reminded.buildings.inn.today_xp).toBe(5);
    expect(reminded.buildings.inn.xp).toBe(before.buildings.inn.xp + 5);
    expect(reminded.buildings.library.source).toBe('ok');
    await page.reload();
    await expect(todayPanel).toContainText('Travel · +5/15 XP today');
    await expect(todayPanel).not.toContainText('Auto');

    const reversedText = await readOk(await page.request.patch(`/travel/api/reminders/${packed!.id}`, {
      data: { title: 'Pack', done: false },
    }));
    expect(JSON.parse(reversedText).reminders.find((item: { id: number }) => item.id === packed!.id).done).toBe(false);
    const retracted: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
    expect(retracted.buildings.inn.today_xp).toBe(0);
    expect(retracted.buildings.inn.xp).toBe(before.buildings.inn.xp);
    await page.reload();
    await expect(todayPanel).toContainText('Travel · +0/15 XP today');
  });

test('treasury follows completed budget weeks and clears when Finance locks', async ({ page }) => {
  test.setTimeout(360_000);
  const records: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/vault/records')) records.push(request.url());
  });
  await page.goto('/town');
  const scene = page.getByRole('list', { name: 'Town buildings' });
  const treasury = scene.getByRole('link', { name: /Treasury/ });
  const todayTreasury = page.locator('app-town-today .treasury a');
  await expect(treasury).toContainText('Finance vault locked');
  await expect(treasury).not.toContainText(/Lv \d/);
  await expect(todayTreasury).toContainText('Finance vault locked');
  await expect(scene.getByRole('button', { name: /Read 20 pages/ })).toContainText(/day streak/);
  expect(records).toEqual([]);
  const before: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();

  await page.goto('/finance/vault/setup?next=%2Ffinance%2Fplanning');
  await page.getByLabel('Vault passphrase', { exact: true }).fill(BUDGET_PASSPHRASE);
  await page.getByLabel('Confirm passphrase', { exact: true }).fill(BUDGET_PASSPHRASE);
  await page.getByRole('button', { name: 'Create vault', exact: true }).click();
  // 600k PBKDF2 iterations finish after the default expect timeout.
  await expect(page).toHaveURL(/\/finance\/planning/, { timeout: 150_000 });
  await page.goto('/town');
  await expect(treasury).toContainText('No spending plan');
  await expect(treasury).toHaveAttribute('href', '/finance/planning');
  await expect(todayTreasury).toHaveAttribute('href', '/finance/planning');
  await expect(treasury).not.toContainText(/Lv \d/);
  await expect(scene.getByRole('button', { name: /Read 20 pages/ })).toContainText(/day streak/);

  await page.goto('/finance/planning/simulation');
  await page.getByLabel('Spending basis', { exact: true }).selectOption('manual');
  await page.getByLabel('Manual annual spending', { exact: true }).fill('36500');
  const saved = page.locator('ui-card').filter({ has: page.getByRole('heading', { name: 'Saved inputs' }) });
  await saved.locator('input[name="savedInputName"]').fill('Town budget');
  await saved.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved inputs updated.')).toBeVisible();
  await page.goto('/town');
  await expect(treasury).toContainText('No budget data');
  await expect(treasury).toHaveAttribute('href', '/finance/spending');
  await expect(todayTreasury).toHaveAttribute('href', '/finance/spending');

  await page.goto('/finance/spending');
  await page.locator('ui-page-header').getByRole('button', { name: 'Add transaction', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add transaction' });
  await dialog.locator('#tx-date').fill('2025-10-27');
  await dialog.locator('#tx-type').selectOption('expense');
  await dialog.locator('#tx-category').fill('Food');
  await dialog.locator('#tx-amount').fill('1.00');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/town');
  await expect(treasury).toContainText('Lv 5 · 52+ weeks');
  await expect(treasury.locator('.building-icon')).toHaveAttribute('data-stage', '3');
  await expect(treasury.locator('use')).toHaveAttribute('href', '/town/exterior/landmarks.svg#treasury');
  await expect(todayTreasury).toContainText('Lv 5 · 52+ weeks');
  await expect(treasury).not.toContainText('$');
  await expect(todayTreasury).not.toContainText('$');
  const after: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
  expect(after.town.xp).toBe(before.town.xp);
  await expect(page.locator('app-town header')).toContainText(`Lv ${after.town.level} · ${after.town.xp} / ${after.town.next_level_xp} XP`);
  await expect(scene.getByRole('button', { name: /Read 20 pages/ })).toContainText(/day streak/);

  await page.goto('/settings/finance');
  await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page.getByText('Finance locked.')).toBeVisible();
  await page.goto('/town');
  await expect(treasury).toContainText('Finance vault locked');
  await expect(treasury).not.toContainText('52+');
  await expect(treasury).not.toContainText(/Lv \d/);
  await expect(todayTreasury).toContainText('Finance vault locked');
  const locked: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
  expect(locked.town.xp).toBe(before.town.xp);
});

test.describe('Town exterior', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true });
  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('six districts, a real entrance, Today, and a locked Clinic', async ({ page }) => {
    for (const file of ['coast', 'landmarks']) {
      expect((await page.request.get(`/town/exterior/${file}.svg`)).ok()).toBeTruthy();
    }
    for (const width of [390, 1280]) {
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
        await page.goto('/town');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const scene = page.getByRole('list', { name: 'Town buildings' });
        await expect(scene.getByRole('listitem')).toHaveCount(16);
        for (const name of ['Civic', 'Residential', 'Harbor', 'Culture', 'Wellness', 'Garden']) {
          const district = page.getByRole('button', { name, exact: true });
          await expect(district).toBeVisible();
          const box = await district.boundingBox();
          expect(box?.width).toBeGreaterThanOrEqual(44);
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
        if (width === 390) await page.getByRole('button', { name: 'Today', exact: true }).tap();
        const today = page.getByRole('button', { name: 'Mark Read 20 pages done for today' });
        await expect(today).toBeVisible();
        await expect(today).toBeEnabled();
        const clinic = scene.getByRole('link', { name: /^Clinic/ });
        await expect(clinic).toBeVisible();
        expect(await clinic.innerText()).not.toMatch(/\d/);
        await expect(clinic.locator('.building-icon')).toHaveAttribute('data-stage', 'locked');
        await expect(clinic.locator('use')).toHaveAttribute('href', '/town/exterior/landmarks.svg#clinic');
        const clinicBox = await clinic.boundingBox();
        expect(clinicBox?.height).toBeGreaterThanOrEqual(44);
        await expect(scene.getByRole('link', { name: /^Library/ })).toBeVisible();
        await expect(scene.getByRole('link', { name: /^Gym/ })).toBeVisible();
        await expect(page.locator('a[href="/town/world"]')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        expect(await page.locator('app-town').evaluate(el => el.getAnimations({ subtree: true })
          .filter(animation => animation.effect?.getTiming().iterations === Infinity).length)).toBe(0);
      }
    }

    await page.setViewportSize({ width: 320, height: 700 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    await expect(page.getByRole('button', { name: 'Wellness', exact: true })).toBeVisible();
    const todayToggle = page.getByRole('button', { name: 'Today', exact: true });
    await todayToggle.press('Enter');
    await expect(page.getByRole('region', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark Read 20 pages done for today' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(todayToggle).toBeFocused();
    await expect(todayToggle).toHaveAttribute('aria-expanded', 'false');
    const narrowClinic = page.getByRole('list', { name: 'Town buildings' }).getByRole('link', { name: /^Clinic/ });
    expect((await narrowClinic.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();

    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize({ width: 1280, height: 800 });
    const harbor = page.getByRole('button', { name: 'Harbor', exact: true });
    await harbor.focus();
    await page.keyboard.press('Enter');
    await expect(harbor).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/\/town\/?$/);
    await page.getByRole('button', { name: 'Garden', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Garden', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(harbor).toHaveAttribute('aria-pressed', 'false');

    const library = page.getByRole('list', { name: 'Town buildings' }).getByRole('link', { name: /^Library/ });
    await library.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Reading Hall', level: 1 })).toBeVisible();
    await page.goBack();
    await expect(library).toBeFocused();

    const clinic = page.getByRole('list', { name: 'Town buildings' }).getByRole('link', { name: /^Clinic/ });
    expect(await clinic.innerText()).not.toMatch(/\d/);
    await clinic.click();
    await expect(page).toHaveURL(/\/town\/clinic\/?$/);
    await expect(page.getByText('Finance is locked. Unlock to see measurements.')).toBeVisible();
    await page.goBack();

    await page.setViewportSize({ width: 390, height: 844 });
    await todayToggle.press('Enter');
    await expect(page.getByRole('button', { name: 'Mark Read 20 pages done for today' })).toBeFocused();
    await page.keyboard.press('Enter');
    const done = page.getByRole('button', { name: 'Read 20 pages, done today. Undo' });
    await expect(done).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(done).toBeVisible();
    await expect(page.getByRole('button', { name: 'Garden', exact: true })).toBeVisible();
  });

  test('names Culture landmarks and picks the visible overlap through zoom and pan', async ({ page }, info) => {
    const viewport = page.getByRole('group', { name: 'Town exterior' });
    const landmarks = viewport.locator('.caption');
    const culture = page.getByRole('button', { name: 'Culture', exact: true });
    const scene = page.getByRole('list', { name: 'Town buildings' });
    const music = scene.getByRole('link', { name: /^Music bar/ });
    const theater = scene.getByRole('link', { name: /^Theater/ });
    for (const width of [390, 1280]) {
      const theme = width === 390 ? 'light' : 'dark';
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.addInitScript(theme => localStorage.setItem('suite-theme', theme), theme);
      await page.clock.setFixedTime(new Date(theme === 'dark' ? '2026-10-30T05:30:00Z' : '2026-10-29T19:00:00Z'));
      const assets = ['coast', 'landmarks'].map(file => page.waitForResponse(`**/town/exterior/${file}.svg`));
      await page.goto('/town');
      expect((await Promise.all(assets)).every(response => response.ok())).toBeTruthy();
      await expect(landmarks).toHaveCount(0);
      await culture.press('Enter');
      await expect(landmarks).toHaveText(['Library', 'Theater', 'Music bar', 'Arcade']);
      for (const caption of await landmarks.all()) {
        await expect(caption).toBeInViewport({ ratio: 1 });
        expect(await caption.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
      }
      await info.attach(`coastal-culture-${width}-${theme}`, { body: await viewport.screenshot(), contentType: 'image/png' });

      const overviewOverlap = await cultureHitPoints(viewport);
      await page.touchscreen.tap(overviewOverlap.empty.x, overviewOverlap.empty.y);
      await expect(page).toHaveURL(/\/town\/?$/);
      await page.touchscreen.tap(overviewOverlap.overlap.x, overviewOverlap.overlap.y);
      await expect(page).toHaveURL(/\/media\/library\?kind=artist$/);
      await page.goBack();
      await page.getByText('View controls', { exact: true }).click();
      await culture.press('Enter');
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await viewport.scrollIntoViewIfNeeded();
      const zoomed = await cultureHitPoints(viewport);
      const stage = viewport.locator('.stage');
      const beforeDrag = await stage.getAttribute('style');
      await page.mouse.move(zoomed.overlap.x, zoomed.overlap.y);
      await page.mouse.down();
      await page.mouse.move(zoomed.overlap.x + 8, zoomed.overlap.y + 14, { steps: 4 });
      await page.mouse.up();
      await expect(stage).not.toHaveAttribute('style', beforeDrag!);
      await expect(page).toHaveURL(/\/town\/?$/);

      const panned = await cultureHitPoints(viewport);
      await page.touchscreen.tap(panned.exposed.x, panned.exposed.y);
      await expect(page).toHaveURL(/\/media\/library\?kind=movie$/);
      await page.goBack();
      await music.focus();
      await expect(viewport.locator('.active-name')).toHaveText('Music bar');
      await expect(viewport.locator('[data-scene-object="music"]')).toHaveClass(/selected/);
      await music.press('Enter');
      await expect(page).toHaveURL(/\/media\/library\?kind=artist$/);
      await page.goBack();
      await theater.press('Enter');
      await expect(page).toHaveURL(/\/media\/library\?kind=movie$/);
    }

    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/town');
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    await culture.press('Enter');
    await viewport.scrollIntoViewIfNeeded();
    await expect(landmarks).toHaveText(['Library', 'Theater', 'Music bar', 'Arcade']);
    for (const caption of await landmarks.all()) {
      await expect(caption).toBeInViewport({ ratio: 1 });
      expect(await caption.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
    }
    const name = viewport.locator('.active-name');
    await music.focus();
    await expect(name).toHaveText('Music bar');
    await expect(landmarks).toHaveText(['Library', 'Theater', 'Arcade']);
    expect(await name.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await info.attach('coastal-focus-320-200-percent', { body: await viewport.screenshot(), contentType: 'image/png' });
  });

  test('the building picker still opens rooms if the coastal art fails', async ({ page }) => {
    await page.route('**/town/exterior/*.svg', route => route.abort());
    await page.goto('/town');
    const library = page.getByRole('list', { name: 'Town buildings' }).getByRole('link', { name: /^Library/ });
    await library.press('Enter');
    await expect(page.getByRole('heading', { name: 'Reading Hall', level: 1 })).toBeVisible();
    await page.goBack();
    await expect(library).toBeFocused();
  });

  test('an unfounded Town keeps Today and real rooms in reach at phone sizes', async ({ page, request }, info) => {
    expect((await request.post('/e2e/reset?seed=town-empty')).ok()).toBeTruthy();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/town');
    const today = page.getByRole('button', { name: 'Today', exact: true });
    const firstHabit = page.getByRole('button', { name: 'Choose a first habit' });
    const viewport = page.getByRole('group', { name: 'Town exterior' });
    const buildings = page.getByText('Buildings', { exact: true });
    const library = page.getByRole('list', { name: 'Town buildings' }).getByRole('link', { name: /^Library/ });
    for (const item of [today, firstHabit, viewport, buildings]) {
      await expect(item).toBeInViewport({ ratio: 1 });
    }
    await info.attach('unfounded-town-390', { body: await page.screenshot(), contentType: 'image/png' });

    await page.setViewportSize({ width: 320, height: 700 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    await today.tap();
    await expect(page.getByRole('button', { name: '+ New habit' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.keyboard.press('Escape');
    await expect(today).toBeFocused();
    await expect(today).toHaveAttribute('aria-expanded', 'false');
    const scan = await new AxeBuilder({ page }).include('app-town').analyze();
    expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    await firstHabit.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(firstHabit).toBeFocused();
    await library.tap();
    await expect(page.getByRole('heading', { name: 'Reading Hall', level: 1 })).toBeVisible();
    await page.goBack();
    await expect(library).toBeFocused();
  });

  test('inspects locked, empty, and archived lots and keeps a failed draft', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/town');
    const before: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
    const walk = before.habits.find(item => item.name === 'Walk 30 minutes');
    expect(walk?.id).toBeGreaterThan(0);
    await readOk(await page.request.patch(`/api/town/habits/${walk!.id}?tz=America%2FLos_Angeles`, {
      headers: { 'X-CSRF-Token': 'synthetic-csrf' }, data: { archived: true },
    }));

    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/town?inspect=slot-3');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const inspector = page.locator('app-town-exterior [data-inspector]');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(inspector).toHaveAttribute('data-inspector', 'locked');
    await expect(inspector).toContainText('Unlocks at level 5');
    await expect(inspector.getByRole('button', { name: 'Build here' })).toHaveCount(0);
    await expect(page.locator('app-town-today')).toContainText('Read 20 pages');
    await expect(page.locator('app-town-exterior .inspector.sheet')).toHaveCount(0);
    for (const control of await page.locator('app-town-exterior .inspector a:visible, app-town-exterior .inspector button:visible, app-town-exterior .place a:visible').all()) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    const empty = page.getByRole('list', { name: 'Town buildings' }).getByRole('button', { name: /Empty lot/ }).first();
    await empty.focus();
    await page.keyboard.press('Enter');
    await expect(inspector).toHaveAttribute('data-inspector', 'empty');
    await expect(inspector).toContainText('This lot is ready for a habit.');
    const build = inspector.getByRole('button', { name: 'Build here' });
    await build.focus();
    await page.keyboard.press('Enter');
    const name = page.locator('#habit-name');
    await expect(name).toBeVisible();
    await name.fill('Synthetic route habit');
    await page.route(url => url.pathname === '/api/town/habits', route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'unavailable' }) });
      }
      return route.continue();
    });
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(name).toHaveValue('Synthetic route habit');
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Town is unavailable right now.');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'New habit' })).toHaveCount(0);
    await expect(inspector).toHaveAttribute('data-inspector', 'empty');
    await page.unroute(url => url.pathname === '/api/town/habits');

    const archived = page.getByRole('list', { name: 'Archived habits' }).getByRole('button', { name: /Walk 30 minutes/ });
    await archived.focus();
    await page.keyboard.press('Enter');
    await expect(inspector).toHaveAttribute('data-inspector', 'archived');
    await inspector.getByRole('button', { name: 'Open history' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
    await expect(page.locator('app-history-dialog')).toContainText('Walk 30 minutes');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'History' })).toHaveCount(0);
    await expect(inspector).toHaveAttribute('data-inspector', 'archived');

    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/town?inspect=slot-3');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('app-town-exterior .inspector.sheet')).toBeVisible();
    await expect(inspector).toHaveAttribute('data-inspector', 'locked');
    await expect(page.locator('app-town-exterior [aria-modal="true"]')).toHaveCount(0);
    const close = page.getByRole('button', { name: 'Close details' });
    expect((await close.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await page.getByText('Buildings', { exact: true }).tap();
    await expect(page.getByRole('list', { name: 'Town buildings' })).toBeHidden();
    await page.getByText('View controls', { exact: true }).tap();
    const zoom = page.getByRole('button', { name: 'Zoom in' });
    await zoom.press('Enter');
    await expect(zoom).toBeFocused();
    const stage = page.locator('app-town-exterior .stage');
    await expect(stage).not.toHaveAttribute('style', /scale\(1\)/);
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/inspect=/);
    await expect(page.getByRole('button', { name: /Unlocks at Lv 5/ })).toBeFocused();
    const emptyPhone = page.getByRole('list', { name: 'Town buildings' }).getByRole('button', { name: /Empty lot/ }).first();
    await emptyPhone.tap();
    await expect(inspector).toHaveAttribute('data-inspector', 'empty');
    await expect(page).toHaveURL(/inspect=slot-/);
    const selectedURL = page.url();
    const camera = await stage.getAttribute('style');
    const today = page.getByRole('button', { name: 'Today', exact: true });
    await today.press('Enter');
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(today).toBeFocused();
    await expect(today).toHaveAttribute('aria-expanded', 'false');
    await expect(page).toHaveURL(selectedURL);
    await expect(stage).toHaveAttribute('style', camera!);
    await expect(inspector).toHaveAttribute('data-inspector', 'empty');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const scan = await new AxeBuilder({ page }).include('app-town').analyze();
    expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
  });
});

test('TF5 Hub card stays free of Treasury and answers loading, retry, expiry, empty, and keyboard', async ({ page, request }) => {
  let gate = Promise.resolve();
  await page.route('**/api/town/summary**', async route => {
    await gate;
    await route.continue();
  });
  let release = (): void => undefined;
  gate = new Promise(resolve => { release = resolve; });
  const going = page.goto('/hub');
  const town = page.locator('section[aria-labelledby="town-heading"]');
  await expect(town).toHaveAttribute('aria-busy', 'true');
  release();
  await going;
  await page.unroute('**/api/town/summary**');

  const summary = await (await page.request.get('/api/town/summary?tz=America%2FLos_Angeles')).json() as {
    level: number; xp: number; level_xp_start: number; next_level_xp: number; name: string;
  };
  const progress = town.locator('summary', { hasText: 'Town progress' });
  const bar = town.getByRole('progressbar', { name: 'Town XP' });
  await expect(bar).toBeHidden();
  await progress.press('Enter');
  await expect(bar).toHaveAttribute('aria-valuemin', String(summary.level_xp_start));
  await expect(bar).toHaveAttribute('aria-valuemax', String(summary.next_level_xp));
  await expect(bar).toHaveAttribute('aria-valuenow', String(summary.xp));
  await expect(bar).toHaveAttribute('aria-valuetext', `Level ${summary.level}, ${summary.xp} of ${summary.next_level_xp} XP`);
  await expect(town).toContainText(`${summary.name}`);
  await expect(town).not.toContainText('Treasury');
  await expect(town).not.toContainText('Health');
  expect(await town.innerText()).not.toMatch(/\$/);

  await page.setViewportSize({ width: 390, height: 844 });
  const openTown = town.getByRole('link', { name: 'Open Town' });
  await openTown.focus();
  await expect(openTown).toBeFocused();
  expect((await openTown.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/town\/?$/);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/hub');
  await expect(town.getByRole('link', { name: 'Open Town' })).toBeVisible();
  expect((await town.getByRole('link', { name: 'Open Town' }).boundingBox())?.height).toBeGreaterThanOrEqual(44);

  const credited = await readOk(await page.request.post('/media/api/library', {
    data: { kind: 'movie', title: 'Hub Film', status: 'completed' },
  }));
  expect(JSON.parse(credited).id).toBeGreaterThan(0);
  await page.reload();
  await progress.click();
  await expect(bar).toHaveAttribute('aria-valuenow', String(summary.xp + 10));

  await page.route('**/api/town/summary**', route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{}',
  }));
  await page.goto('/hub');
  await progress.click();
  await expect(town.getByText("Couldn't load your town.")).toBeVisible();
  const retry = town.getByRole('button', { name: 'Retry' });
  expect((await retry.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.unroute('**/api/town/summary**');
  await page.keyboard.press('Enter');
  await expect(town.getByRole('progressbar', { name: 'Town XP' })).toBeVisible();

  await page.route('**/api/town/summary**', route => route.fulfill({
    status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'expired' }),
  }));
  await page.goto('/hub');
  await progress.click();
  await expect(town.getByText('Your session ended. Sign in again to see your town.')).toBeVisible();
  await expect(town.getByRole('progressbar', { name: 'Town XP' })).toHaveCount(0);
  await page.unroute('**/api/town/summary**');

  expect((await request.post('/e2e/reset?seed=town-empty')).ok()).toBeTruthy();
  await page.goto('/hub');
  await progress.click();
  const start = town.getByRole('link', { name: 'Choose a first habit' });
  await expect(town).toContainText('Start your town');
  await expect(town).not.toContainText('habits done today');
  expect((await start.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/town\/?$/);
});

test.describe('Reading Hall', () => {
  test.use({ hasTouch: true, colorScheme: 'light' });

  test('matches artwork and pick bounds after resize and a live theme change', async ({ page, request }, info) => {
    const book = 'Synthetic Reading Hall Almanac';
    await readOk(await request.post('/media/api/library', {
      data: { kind: 'book', title: book, status: 'in_progress' },
    }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'system'));
    await page.goto('/town');
    const library = page.getByRole('list', { name: 'Town buildings' }).getByRole('link', { name: /^Library/ });
    await library.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Reading Hall', level: 1 })).toBeFocused();
    const room = page.locator('app-town-library-room');
    const objects = room.getByRole('list', { name: 'Room objects' });
    const shelves = room.locator('.scene').getByRole('button', { name: 'Bookshelves' });
    const paintedWidth = (await artworkBounds(shelves)).width;
    await shelves.tap();
    await expect(room.getByRole('heading', { name: 'Bookshelves' })).toBeVisible();
    await expect(objects.getByRole('link', { name: 'Bookshelves' })).toHaveAttribute('aria-current', 'true');
    const town = await (await request.get('/api/town?tz=America%2FLos_Angeles')).json() as TownResponse;
    await expect(room).toContainText('Level ' + town.buildings.library.level + ' · ' +
      town.buildings.library.today_xp + ' / ' + town.buildings.library.today_cap + ' Media XP today');
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(shelves.locator('img')).toHaveCSS('color-scheme', theme);
        const bounds = await artworkBounds(shelves);
        if (width === 1280) expect(bounds.width).toBeGreaterThan(paintedWidth);
        const desk = room.locator('.scene').getByRole('button', { name: 'Reading desk' });
        await artworkBounds(desk);
        await desk.click();
        await expect(room.getByRole('heading', { name: 'Reading desk' })).toBeVisible();
        await shelves.click({ position: { x: bounds.width - 6, y: 8 } });
        await expect(room.getByRole('heading', { name: 'Bookshelves' })).toBeVisible();
        const scan = await new AxeBuilder({ page }).include('app-town-library-room').analyze();
        expect(scan.violations).toEqual([]);
        await info.attach('reading-hall-' + width + '-' + theme, { body: await room.screenshot(), contentType: 'image/png' });
      }
    }
    for (const control of await room.locator('a:visible, button:visible').all()) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await expect(room.getByRole('link', { name: 'Browse saved books' })).toHaveAttribute('href', '/media/library?kind=book');
    await room.getByRole('link', { name: 'Browse saved books' }).click();
    await expect(page).toHaveURL(/\/media\/library\?kind=book/);
    await expect(page.getByRole('link', { name: book })).toBeVisible();
    await page.goBack();
    await expect(objects.getByRole('link', { name: 'Bookshelves' })).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(room.getByRole('heading', { name: 'Reading desk' })).toBeVisible();
    await expect(room.getByRole('link', { name: 'Open Media Now' })).toHaveAttribute('href', '/media');
    await objects.getByRole('link', { name: 'Wall calendar' }).click();
    await expect(room.getByRole('link', { name: 'Open Media calendar' })).toHaveAttribute('href', '/media/calendar');
    await room.getByRole('link', { name: 'Back to Town' }).click();
    await expect(page).toHaveURL(/\/town$/);
    await expect(library).toBeFocused();
  });

  test('loads artwork only in the room and preserves selection through artwork and progress retries', async ({ page }) => {
    const requests: string[] = [];
    let failedArt = true;
    let failedProgress = false;
    await page.route('**/town/library/*.svg*', async route => {
      const url = new URL(route.request().url());
      requests.push(url.pathname + url.search);
      if (url.pathname.endsWith('/desk.svg') && failedArt) await route.fulfill({ status: 503 });
      else await route.continue();
    });
    await page.route(url => url.pathname === '/api/town', async route => {
      if (failedProgress) await route.fulfill({ status: 503 });
      else await route.continue();
    });
    await page.goto('/hub');
    expect(requests).toEqual([]);
    await page.goto('/town');
    const library = page.getByRole('list', { name: 'Town buildings' }).getByRole('link', { name: /^Library/ });
    await expect(library).toBeVisible();
    expect(requests).toEqual([]);
    failedProgress = true;
    await library.click();
    const room = page.locator('app-town-library-room');
    const picker = room.getByRole('list', { name: 'Room objects' });
    await expect.poll(() => requests.length).toBe(4);
    await expect(room.getByRole('button', { name: 'Retry artwork' })).toBeVisible();
    await expect(room.getByRole('button', { name: 'Retry progress' })).toBeVisible();
    await picker.getByRole('link', { name: 'Reading desk' }).click();
    await expect(room.getByRole('heading', { name: 'Reading desk' })).toBeVisible();
    await expect(room.locator('.scene').getByRole('button', { name: 'Reading desk' })).toHaveCount(0);
    failedArt = false;
    await room.getByRole('button', { name: 'Retry artwork' }).click();
    await expect(picker.getByRole('link', { name: 'Reading desk' })).toBeFocused();
    await artworkBounds(room.locator('.scene').getByRole('button', { name: 'Reading desk' }));
    expect(requests.slice(4)).toEqual(['/town/library/desk.svg?retry=1']);
    failedProgress = false;
    await room.getByRole('button', { name: 'Retry progress' }).click();
    await expect(room.getByRole('heading', { name: 'Library progress' })).toBeFocused();
    await expect(room).toContainText('Media XP today');
    await expect(room.getByRole('heading', { name: 'Reading desk' })).toBeVisible();
    expect(await room.evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations === Infinity).length)).toBe(0);
    await page.goBack();
    await expect(library).toBeFocused();
    await expect(room).toHaveCount(0);
    expect(await page.locator('img[src^="/town/library/"]').count()).toBe(0);
  });

  test('leaving with a held artwork request unmounts its scene and prevents late UI changes', async ({ page }) => {
    let release = (): void => undefined;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const asset = '**/town/library/room.svg';
    let markHeld = (): void => undefined;
    const held = new Promise<void>(resolve => { markHeld = resolve; });
    let markSettled = (): void => undefined;
    const settled = new Promise<void>(resolve => { markSettled = resolve; });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.route(asset, async route => {
      const response = await route.fetch();
      markHeld();
      await hold;
      await route.fulfill({ response }).catch(() => undefined);
      markSettled();
    }, { times: 1 });
    await page.goto('/town');
    const requested = page.waitForRequest(asset);
    await page.getByRole('list', { name: 'Town buildings' }).getByRole('link', { name: /^Library/ }).click();
    await requested;
    await held;
    const room = page.locator('app-town-library-room');
    await expect(room.getByRole('heading', { name: 'Reading Hall' })).toBeVisible();
    await room.getByRole('link', { name: 'Back to Town' }).click();
    release();
    await settled;
    await expect(room).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Town buildings' })).toBeVisible();
    await expect(page.locator('img[src^="/town/library/"]')).toHaveCount(0);
    await page.goto('/town/library?object=calendar');
    await expect(room.getByRole('heading', { name: 'Wall calendar' })).toBeVisible();
    await expect(room.locator('.room')).toBeVisible();
    const motion = await room.evaluate(el => el.getAnimations({ subtree: true }).length);
    expect(motion).toBe(0);
  });

  test('opens the Reading Hall before a first habit is created', async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town-empty')).ok()).toBeTruthy();
    await page.goto('/town');
    await expect(page.getByRole('button', { name: 'Choose a first habit' })).toBeVisible();
    const entrance = page.getByRole('list', { name: 'Town buildings' }).getByRole('link', { name: /^Library/ });
    await entrance.click();
    const room = page.locator('app-town-library-room');
    await expect(room.getByRole('link', { name: 'Open Media Now' })).toBeVisible();
    await room.getByRole('link', { name: 'Back to Town' }).click();
    await expect(entrance).toBeFocused();
  });

  test('selects the front object after resize, pan, and zoom, and ignores drag and cancel', async ({ page, request }, info) => {
    test.setTimeout(120_000);
    const book = 'Synthetic Scene Atlas';
    await readOk(await request.post('/media/api/library', {
      data: { kind: 'book', title: book, status: 'in_progress' },
    }));
    const townReads: string[] = [];
    page.on('request', req => {
      if (new URL(req.url()).pathname === '/api/town') townReads.push(req.url());
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/town/library');
    const room = page.locator('app-town-library-room');
    const objects = room.getByRole('list', { name: 'Room objects' });
    const scene = room.getByRole('group', { name: /Drag to look around/ });
    const shelves = room.locator('.scene').getByRole('button', { name: 'Bookshelves' });
    const desk = room.locator('.scene').getByRole('button', { name: 'Reading desk' });
    await expect(room).toContainText('Media XP today');
    const town = await (await request.get('/api/town?tz=America%2FLos_Angeles')).json() as TownResponse;
    const progress = 'Level ' + town.buildings.library.level + ' · ' +
      town.buildings.library.today_xp + ' / ' + town.buildings.library.today_cap + ' Media XP today';
    await expect(room).toContainText(progress);

    for (const [index, viewport] of [
      { width: 390, height: 844, motion: 'reduce' },
      { width: 1280, height: 800, motion: 'no-preference' },
    ].entries()) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ reducedMotion: viewport.motion as 'reduce' | 'no-preference' });
      await room.getByRole('button', { name: 'Reset view' }).click();
      await expect.poll(() => stageMatrix(room)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
      await expect(shelves).toBeVisible();
      await artworkBounds(shelves);
      await artworkBounds(desk);
      for (const control of await room.locator('a:visible, button:visible').all()) {
        const bounds = (await control.boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
      const front = await overlapCenter(shelves, desk);
      expect(front.width).toBeGreaterThan(20);
      expect(front.height).toBeGreaterThan(12);
      const reads = townReads.length;
      await page.touchscreen.tap(front.cx, front.cy);
      await expect(room.getByRole('heading', { name: 'Reading desk' })).toBeVisible();
      await expect(objects.getByRole('link', { name: 'Reading desk' })).toBeFocused();
      await expect(page).toHaveURL(/object=desk/);
      expect(townReads.length).toBe(reads);

      const exposed = await exposedPoint(await shelves.boundingBox(), await desk.boundingBox());
      await page.touchscreen.tap(exposed.x, exposed.y);
      await expect(room.getByRole('heading', { name: 'Bookshelves' })).toBeVisible();
      await expect(objects.getByRole('link', { name: 'Bookshelves' })).toBeFocused();
      await expect(room.getByRole('link', { name: 'Browse saved books' })).toHaveAttribute('href', '/media/library?kind=book');

      await objects.getByRole('link', { name: 'Reading desk' }).focus();
      await page.keyboard.press('Enter');
      await expect(room.getByRole('heading', { name: 'Reading desk' })).toBeVisible();
      await expect(objects.getByRole('link', { name: 'Reading desk' })).toBeFocused();
      await objects.getByRole('link', { name: 'Wall calendar' }).focus();
      await page.keyboard.press('Enter');
      await expect(room.getByRole('heading', { name: 'Wall calendar' })).toBeVisible();
      await expect(page).toHaveURL(/object=calendar/);

      await room.getByRole('button', { name: 'Zoom in' }).click();
      await expect.poll(() => stageMatrix(room)).toContain('matrix(1.5,');
      const beforePan = (await desk.boundingBox())!;
      const view = (await scene.boundingBox())!;
      await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
      await page.mouse.down();
      await page.mouse.move(view.x + view.width / 2 + 70, view.y + view.height / 2 + 36, { steps: 8 });
      await page.mouse.up();
      await expect.poll(async () => (await desk.boundingBox())!.x).toBeGreaterThan(beforePan.x + 30);
      await expect(page).toHaveURL(/object=calendar/);
      await expect(room.getByRole('heading', { name: 'Wall calendar' })).toBeVisible();
      expect(townReads.length).toBe(reads);

      const panned = await overlapCenter(shelves, desk);
      const viewAfter = (await scene.boundingBox())!;
      expect(panned.cx).toBeGreaterThan(viewAfter.x + 4);
      expect(panned.cx).toBeLessThan(viewAfter.x + viewAfter.width - 4);
      expect(panned.cy).toBeGreaterThan(viewAfter.y + 4);
      expect(panned.cy).toBeLessThan(viewAfter.y + viewAfter.height - 4);
      await page.touchscreen.tap(panned.cx, panned.cy);
      await expect(room.getByRole('heading', { name: 'Reading desk' })).toBeVisible();
      await expect(objects.getByRole('link', { name: 'Reading desk' })).toBeFocused();

      await objects.getByRole('link', { name: 'Wall calendar' }).click();
      await expect(page).toHaveURL(/object=calendar/);
      const committed = await stageMatrix(room);
      const origin = await sceneOffset(desk, scene);
      const startX = viewAfter.x + 80;
      const startY = viewAfter.y + 80;
      const pointer = { pointerId: 7, pointerType: 'touch' as const, button: 0, clientX: startX, clientY: startY };
      await scene.dispatchEvent('pointerdown', pointer);
      await scene.dispatchEvent('pointermove', { ...pointer, clientX: startX - 56, clientY: startY - 40 });
      await expect.poll(async () => Math.abs((await sceneOffset(desk, scene)).x - origin.x)).toBeGreaterThan(20);
      expect(await stageMatrix(room)).not.toBe(committed);
      await scene.dispatchEvent('pointercancel', { ...pointer, clientX: startX - 56, clientY: startY - 40 });
      await expect.poll(() => stageMatrix(room)).toBe(committed);
      await expect.poll(async () => {
        const restored = await sceneOffset(desk, scene);
        return Math.max(Math.abs(restored.x - origin.x), Math.abs(restored.y - origin.y));
      }).toBeLessThan(2);
      await expect(page).toHaveURL(/object=calendar/);
      expect(townReads.length).toBe(reads);
      expect(await room.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);

      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(desk.locator('img')).toHaveCSS('color-scheme', theme);
        const scan = await new AxeBuilder({ page }).include('app-town-library-room').analyze();
        expect(scan.violations).toEqual([]);
        await info.attach(`scene-overlap-${viewport.width}-${theme}-${index}`, {
          body: await room.screenshot(), contentType: 'image/png',
        });
      }
    }

    await objects.getByRole('link', { name: 'Bookshelves' }).click();
    await room.getByRole('link', { name: 'Browse saved books' }).click();
    await expect(page).toHaveURL(/\/media\/library\?kind=book/);
    await expect(page.getByRole('link', { name: book })).toBeVisible();
    await page.goBack();
    await expect(objects.getByRole('link', { name: 'Bookshelves' })).toBeFocused();
    await expect(room).toContainText(progress);
  });

  test('keeps the scene view and selection when Library progress fails', async ({ page }) => {
    let mode: 'hold' | 'fail' | 'pass' = 'hold';
    let release = (): void => undefined;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(url => url.pathname === '/api/town', async route => {
      if (mode === 'hold') await held;
      if (mode === 'fail') {
        await route.fulfill({ status: 503 });
        return;
      }
      await route.continue();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const pending = page.waitForRequest(req => new URL(req.url()).pathname === '/api/town');
    await page.goto('/town/library?object=desk');
    await pending;
    const room = page.locator('app-town-library-room');
    await expect(room.getByRole('heading', { name: 'Reading desk' })).toBeVisible();
    await expect(room.getByText('Loading Library progress…')).toBeVisible();
    await room.getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(() => stageMatrix(room)).toContain('matrix(1.5,');
    const zoomed = await stageMatrix(room);
    mode = 'fail';
    release();
    await expect(room.getByText('Library progress is unavailable.')).toBeVisible();
    await expect(room.getByRole('heading', { name: 'Reading desk' })).toBeVisible();
    await expect(page).toHaveURL(/object=desk/);
    expect(await stageMatrix(room)).toBe(zoomed);
    mode = 'pass';
    await room.getByRole('button', { name: 'Retry progress' }).click();
    await expect(room.getByRole('heading', { name: 'Library progress' })).toBeFocused();
    await expect(room).toContainText('Media XP today');
    await expect(room.getByRole('heading', { name: 'Reading desk' })).toBeVisible();
    expect(await stageMatrix(room)).toBe(zoomed);
  });

  test('keeps the roster and canonical action usable at 320px and 200% text', async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/town/library?object=calendar');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await expect(page.locator('html')).toHaveCSS('font-size', '32px');
    const room = page.locator('app-town-library-room');
    await expect(room.getByRole('link', { name: 'Open Media calendar' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await info.attach('reading-hall-320-text-200', { body: await room.screenshot(), contentType: 'image/png' });
  });

  test('returns from an object with the room, camera, and selection restored', async ({ page, request }, info) => {
    test.setTimeout(180_000);
    const book = 'Synthetic Layered Atlas';
    await readOk(await request.post('/media/api/library', {
      data: { kind: 'book', title: book, status: 'in_progress' },
    }));
    const room = page.locator('app-town-library-room');
    const objects = room.getByRole('list', { name: 'Room objects' });

    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/town/library');
    await expect(room.getByRole('heading', { name: 'Reading Hall', level: 1 })).toBeVisible();
    await objects.getByRole('link', { name: 'Reading desk' }).focus();
    await page.keyboard.press('Enter');
    await expect(room.getByRole('heading', { name: 'Reading desk' })).toBeVisible();
    await expect(room.locator('img.room.cutaway')).toBeVisible();
    await expect(room.locator('[data-scene-object="desk"]')).not.toHaveClass(/faded/);
    await objects.getByRole('link', { name: 'Bookshelves' }).focus();
    await page.keyboard.press('Enter');
    await expect(room.getByRole('heading', { name: 'Bookshelves' })).toBeVisible();
    await expect(room.locator('[data-scene-object="desk"]')).toHaveClass(/faded/);
    await expect(room.locator('[data-scene-object="shelves"]')).not.toHaveClass(/faded/);
    await room.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page).toHaveURL(/object=shelves/);
    await expect(page).toHaveURL(/scale=1\.5/);
    const matrix = await stageMatrix(room);
    expect(matrix).toContain('matrix(1.5,');
    await expect(room.locator('.inspector.sheet')).toBeVisible();
    await expect(room.locator('[aria-modal="true"]')).toHaveCount(0);
    const zoom = room.getByRole('button', { name: 'Zoom in' });
    await zoom.focus();
    await expect(zoom).toBeFocused();
    const close = room.getByRole('button', { name: 'Close details' });
    expect((await close.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await room.getByRole('link', { name: 'Browse saved books' }).click();
    await expect(page).toHaveURL(/\/media\/library\?kind=book/);
    await expect(page.getByRole('link', { name: book })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/object=shelves/);
    await expect(page).toHaveURL(/scale=1\.5/);
    await expect.poll(() => stageMatrix(room)).toBe(matrix);
    await expect(objects.getByRole('link', { name: 'Bookshelves' })).toBeFocused();
    await expect(objects.getByRole('link', { name: 'Bookshelves' })).toHaveAttribute('aria-current', 'true');
    await expect(room.locator('img.room.cutaway')).toBeVisible();
    await expect(room.locator('[data-scene-object="desk"]')).toHaveClass(/faded/);
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/object=/);
    await expect(page).toHaveURL(/scale=1\.5/);
    await expect.poll(() => stageMatrix(room)).toBe(matrix);
    await expect(objects.getByRole('link', { name: 'Bookshelves' })).toBeFocused();
    expect(await room.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);

    // Playwright matches route predicates by function identity. A new arrow
    // function does not remove the previous handler, so the next navigation
    // would still receive the stubbed library source.
    const townApi = (url: URL) => url.pathname === '/api/town';
    const townDown = (route: Route) => route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'unavailable' }),
    });
    await page.route(townApi, townDown);
    await page.reload();
    await expect(room.getByText('Library progress is unavailable.')).toBeVisible();
    await objects.getByRole('link', { name: 'Wall calendar' }).focus();
    await page.keyboard.press('Enter');
    await expect(room.locator('[data-inspector]')).toHaveAttribute('data-inspector', 'error');
    await expect(room.locator('.inspector.sheet')).toBeVisible();
    await expect(room.locator('[aria-modal="true"]')).toHaveCount(0);
    const errored = await stageMatrix(room);
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/object=/);
    await expect.poll(() => stageMatrix(room)).toBe(errored);
    await expect(objects.getByRole('link', { name: 'Wall calendar' })).toBeFocused();
    await page.unroute(townApi, townDown);

    const librarySourceDown = async (route: Route) => {
      const response = await route.fetch();
      const body = await response.json() as TownResponse;
      body.buildings.library.source = 'unavailable';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    };
    await page.route(townApi, librarySourceDown);
    await room.getByRole('button', { name: 'Retry progress' }).click();
    await expect(room.locator('[data-inspector]')).toHaveAttribute('data-inspector', 'locked');
    await expect(room.getByText('Media is unavailable. Library progress may be out of date.')).toBeVisible();
    await objects.getByRole('link', { name: 'Wall calendar' }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(objects.getByRole('link', { name: 'Wall calendar' })).toBeFocused();
    await page.unroute(townApi, librarySourceDown);

    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/town/library?object=desk&scale=1.5&x=-12&y=-4');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(room.locator('.inspector.sheet')).toHaveCount(0);
    await expect(room.locator('[data-inspector]')).toHaveAttribute('data-inspector', 'ready');
    await expect(room.getByText(/Media XP today/)).toBeVisible();
    await expect(room.getByRole('heading', { name: 'Reading desk' })).toBeVisible();
    await expect(room.locator('img.room.cutaway')).toBeVisible();
    await expect.poll(() => stageMatrix(room)).toContain('matrix(1.5,');
    const desktop = await stageMatrix(room);
    for (const control of await room.locator('.inspector a:visible, .inspector button:visible, .place a:visible').all()) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/object=desk/);
    expect(await stageMatrix(room)).toBe(desktop);
    await room.getByRole('link', { name: 'Open Media Now' }).click();
    await expect(page).toHaveURL(/\/media\/?$/);
    await page.goBack();
    await expect(page).toHaveURL(/object=desk/);
    await expect(page).toHaveURL(/scale=1\.5/);
    await expect.poll(() => stageMatrix(room)).toBe(desktop);
    await expect(objects.getByRole('link', { name: 'Reading desk' })).toBeFocused();
    await expect(room.locator('[data-scene-object="desk"]')).toHaveAttribute('aria-current', 'true');
    const scan = await new AxeBuilder({ page }).include('app-town-library-room').analyze();
    expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    await info.attach('scene-03-room-1280-dark', { body: await room.screenshot(), contentType: 'image/png' });
  });
});

function stageMatrix(room: Locator): Promise<string> {
  return room.locator('.stage').evaluate(el => getComputedStyle(el).transform);
}

async function sceneOffset(target: Locator, frame: Locator): Promise<{ x: number; y: number }> {
  const piece = await target.elementHandle();
  if (!piece) throw new Error('missing scene bounds');
  try {
    // One layout frame. Separate box reads can straddle the scroll that a camera
    // URL update used to schedule, and the restored desk then looks a gesture away.
    const offset = await frame.evaluate((view, desk) => {
      if (!(desk instanceof Element)) return null;
      const viewBox = view.getBoundingClientRect();
      const deskBox = desk.getBoundingClientRect();
      if (viewBox.width <= 0 || viewBox.height <= 0 || deskBox.width <= 0 || deskBox.height <= 0) return null;
      return { x: deskBox.x - viewBox.x, y: deskBox.y - viewBox.y };
    }, piece);
    if (!offset) throw new Error('missing scene bounds');
    return offset;
  } finally {
    await piece.dispose();
  }
}

/** Find three points inside both artwork frames with different actual paint coverage. */
async function cultureHitPoints(viewport: Locator) {
  const points = await viewport.evaluate(view => {
    const theater = view.querySelector('[data-scene-object="theater"] .landmark')!.getBoundingClientRect();
    const music = view.querySelector('[data-scene-object="music"] .landmark')!.getBoundingClientRect();
    const bounds = view.getBoundingClientRect();
    type Point = { x: number; y: number };
    const found: { overlap: Point | null; exposed: Point | null; empty: Point | null } = {
      overlap: null, exposed: null, empty: null,
    };
    const left = Math.ceil(Math.max(theater.left, music.left, bounds.left));
    const top = Math.ceil(Math.max(theater.top, music.top, bounds.top));
    const right = Math.min(theater.right, music.right, bounds.right);
    const bottom = Math.min(theater.bottom, music.bottom, bounds.bottom);
    for (let y = top + 2; y < bottom - 1; y += 2) {
      for (let x = left + 2; x < right - 1; x += 2) {
        const painted = document.elementsFromPoint(x, y).map(element =>
          element.closest('[data-scene-object]')?.getAttribute('data-scene-object')).filter(Boolean);
        if (painted[0] === 'music' && painted.includes('theater')) found.overlap ??= { x, y };
        if (painted[0] === 'theater' && !painted.includes('music')) found.exposed ??= { x, y };
        if (painted.length === 0) found.empty ??= { x, y };
        if (found.overlap && found.exposed && found.empty) return found;
      }
    }
    return found;
  });
  if (!points.overlap || !points.exposed || !points.empty) {
    throw new Error(`Culture needs three distinct painted hit cases: ${JSON.stringify(points)}`);
  }
  return { overlap: points.overlap, exposed: points.exposed, empty: points.empty };
}

async function overlapCenter(first: Locator, second: Locator) {
  const [a, b] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  if (!a || !b) throw new Error('missing scene bounds');
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y, cx: (x + right) / 2, cy: (y + bottom) / 2 };
}

function exposedPoint(
  target: { x: number; y: number; width: number; height: number } | null,
  blocker: { x: number; y: number; width: number; height: number } | null,
) {
  if (!target || !blocker) throw new Error('missing scene bounds');
  const samples = [
    [target.x + 8, target.y + 8],
    [target.x + target.width - 8, target.y + 8],
    [target.x + target.width / 2, target.y + 12],
    [target.x + 8, target.y + target.height / 2],
  ];
  const hit = samples.find(([x, y]) => x > target.x && x < target.x + target.width
    && y > target.y && y < target.y + target.height
    && (x < blocker.x || x > blocker.x + blocker.width || y < blocker.y || y > blocker.y + blocker.height));
  if (!hit) throw new Error('no exposed shelves point');
  return { x: hit[0], y: hit[1] };
}

async function artworkBounds(link: Locator) {
  const artwork = link.locator('img');
  await expect(artwork).toBeVisible();
  const pickBounds = (await link.boundingBox())!;
  expect(await artwork.boundingBox()).toEqual(pickBounds);
  expect(pickBounds.width).toBeGreaterThanOrEqual(44);
  expect(pickBounds.height).toBeGreaterThanOrEqual(44);
  return pickBounds;
}

});
function shiftDay(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function readOk(response: { ok(): boolean; text(): Promise<string> }): Promise<string> {
  const text = await response.text();
  expect(response.ok(), text).toBeTruthy();
  return text;
}
