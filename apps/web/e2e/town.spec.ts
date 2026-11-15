import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import { openUserMenu } from '../../../tests/e2e/user-menu.mjs';
import type { TownResponse } from '../src/app/town/town.types';

const BUDGET_PASSPHRASE = 'Synthetic town budget passphrase';

const FOREIGN_HABIT = "Other's habit";

test.describe('Town', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  });
  test('7: locked lots are read in order and skipped by Tab; 9: other users stay out of the DOM', async ({ page }) => {
    await page.goto('/town');
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.locator('main > header')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Terraria-on-Sea' })).toBeVisible();
    const scene = page.getByRole('list', { name: 'Town buildings' });
    await expect(scene.getByRole('listitem')).toHaveCount(9);
    const locked = scene.getByRole('listitem').filter({ hasText: 'Unlocks at Lv 5' });
    await expect(locked).toHaveCount(1);
    await expect(locked.locator('.tile')).toHaveJSProperty('tabIndex', -1);
    await expect(locked.locator('a, button, [tabindex]')).toHaveCount(0);
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
      expect(await page.getByRole('list', { name: 'Town buildings' }).evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);
      for (const img of await page.locator('app-town-lot img').all()) {
        await expect(img).toHaveAttribute('alt', '');
        expect(await img.evaluate(el => el.getBoundingClientRect().width)).toBe(width === 390 ? 96 : 128);
        expect(await img.evaluate(el => getComputedStyle(el).imageRendering)).toBe('pixelated');
      }
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
    const lot = page.locator('app-town-lot').filter({ hasText: 'Read 20 pages' }).getByRole('button');
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
  test.setTimeout(180_000);
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
  await expect(page).toHaveURL(/\/finance\/planning/);
  await page.goto('/town');
  await expect(treasury).toContainText('No spending plan');
  await expect(treasury).toHaveAttribute('href', '/finance/planning');
  await expect(todayTreasury).toHaveAttribute('href', '/finance/planning');
  await expect(treasury).not.toContainText(/Lv \d/);
  await expect(scene.getByRole('button', { name: /Read 20 pages/ })).toContainText(/day streak/);

  await page.goto('/finance/planning');
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
  await expect(treasury.locator('img')).toHaveAttribute('src', /treasury-3\.svg$/);
  await expect(todayTreasury).toContainText('Lv 5 · 52+ weeks');
  await expect(treasury).not.toContainText('$');
  await expect(todayTreasury).not.toContainText('$');
  const after: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
  expect(after.town.xp).toBe(before.town.xp);
  await expect(page.locator('app-town header')).toContainText(`Lv ${after.town.level} · ${after.town.xp} / ${after.town.next_level_xp} XP`);
  await expect(scene.getByRole('button', { name: /Read 20 pages/ })).toContainText(/day streak/);

  const menu = await openUserMenu(page);
  await menu.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await page.goto('/town');
  await expect(treasury).toContainText('Finance vault locked');
  await expect(treasury).not.toContainText('52+');
  await expect(treasury).not.toContainText(/Lv \d/);
  await expect(todayTreasury).toContainText('Finance vault locked');
  const locked: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
  expect(locked.town.xp).toBe(before.town.xp);
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
  const bar = town.getByRole('progressbar', { name: 'Town XP' });
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
  await expect(town.getByRole('progressbar', { name: 'Town XP' })).toHaveAttribute('aria-valuenow', String(summary.xp + 10));

  await page.route('**/api/town/summary**', route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{}',
  }));
  await page.goto('/hub');
  await expect(town).toContainText("Couldn't load your town.");
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
  await expect(town).toContainText('Your session ended. Sign in again to see your town.');
  await expect(town.getByRole('progressbar', { name: 'Town XP' })).toHaveCount(0);
  await page.unroute('**/api/town/summary**');

  expect((await request.post('/e2e/reset?seed=town-empty')).ok()).toBeTruthy();
  await page.goto('/hub');
  const start = town.getByRole('link', { name: 'Choose a first habit' });
  await expect(town).toContainText('Start your town');
  await expect(town).not.toContainText('habits done today');
  expect((await start.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/town\/?$/);
});

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
