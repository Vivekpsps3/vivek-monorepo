import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '../../../tests/e2e/fixtures';

const headers = { 'X-CSRF-Token': 'synthetic-csrf' };
const purposes = [
  ['Mara', 'Mara keeps the Reading Hall and explains the shelves.'],
  ['Ada', 'Ada explains the public rules of the square.'],
  ['Imani', 'Imani points toward the harbor terminal.'],
  ['Jun', 'Jun explains the training floor.'],
  ['Wren', 'Wren keeps the music room and the arcade.'],
  ['Sol', 'Sol keeps the Hall and the study.'],
] as const;

function lifeMutation(request: Request): boolean {
  if (request.method() === 'GET' || request.method() === 'HEAD') return false;
  const path = new URL(request.url()).pathname;
  return path.startsWith('/media/')
    || path.startsWith('/travel/')
    || path.startsWith('/api/world')
    || path.startsWith('/api/town/habits')
    || path.startsWith('/api/town/stamps')
    || path.startsWith('/api/vault')
    || path.includes('/health');
}

async function activate(page: Page, action: ReturnType<Page['locator']>, touch: boolean): Promise<void> {
  await expect(action).toBeEnabled();
  if (touch) await action.tap();
  else {
    await action.focus();
    await page.keyboard.press('Enter');
  }
}

async function finishTalk(page: Page, residents: ReturnType<Page['locator']>, touch: boolean): Promise<void> {
  const finish = residents.getByRole('button', { name: /^(Finish|Retry) talk$/, exact: true });
  await expect(finish).toBeVisible();
  const choice = residents.locator('[data-dialogue-choice]');
  if (await choice.count()) await activate(page, choice.first(), touch);
  await activate(page, finish, touch);
}

async function balance(page: Page): Promise<number> {
  const response = await page.request.get('/api/town/stamps?tz=America/Los_Angeles');
  expect(response.ok()).toBeTruthy();
  return (await response.json()).balance as number;
}

test.describe('Resident dialogue', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true });
  test.beforeEach(async ({ request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
  });

  for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
    test(`${width} ${theme} talks once and replays without another rank or welcome reward`, async ({ page }, info) => {
      const touch = width === 390;
      const mutations: string[] = [];
      page.on('request', request => {
        if (lifeMutation(request)) mutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
      });
      await page.setViewportSize({ width, height: touch ? 844 : 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(chosen => localStorage.setItem('suite-theme', chosen), theme);
      await page.goto('/town');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const entrance = page.getByRole('link', { name: 'Residents', exact: true });
      const entranceBox = await entrance.boundingBox();
      expect(entranceBox?.width).toBeGreaterThanOrEqual(44);
      expect(entranceBox?.height).toBeGreaterThanOrEqual(44);
      await activate(page, entrance, touch);

      const residents = page.locator('app-town-residents');
      for (const [name, purpose] of purposes) {
        await expect(residents.locator(`article[data-name="${name}"]`)).toContainText(purpose);
      }
      await expect(residents.getByText(/you missed|yesterday|weight|blood pressure|paycheck|overdue/i)).toHaveCount(0);
      const away = residents.locator('article[data-present="false"]');
      await expect(away).toHaveCount(1);
      const name = await away.getAttribute('data-name');
      const id = await away.getAttribute('data-resident');
      expect(name).toBeTruthy();
      expect(id).toBeTruthy();
      const inspect = away.getByRole('link', { name: `Inspect ${name}`, exact: true });
      const inspectBox = await inspect.boundingBox();
      expect(inspectBox?.height).toBeGreaterThanOrEqual(44);
      await activate(page, inspect, touch);
      const talk = residents.getByRole('button', { name: 'Talk about Welcome', exact: true });
      await expect(talk).toBeVisible();
      await expect(talk).toBeEnabled();
      const talkBox = await talk.boundingBox();
      expect(talkBox?.width).toBeGreaterThanOrEqual(44);
      expect(talkBox?.height).toBeGreaterThanOrEqual(44);
      const before = await balance(page);
      await activate(page, talk, touch);
      const confirmation = residents.getByRole('heading', { name: `Finish Welcome with ${name}?` });
      await expect(confirmation).toBeFocused();
      await residents.locator('#dialogue-note').fill('Synthetic session note');
      const cancel = residents.getByRole('button', { name: 'Cancel', exact: true });
      expect((await cancel.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await info.attach(`residents-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, cancel, touch);
      await expect(talk).toBeFocused();
      await activate(page, talk, touch);
      await residents.locator('#dialogue-note').fill('Synthetic session note');
      const posted = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/town/residents/conversations'));
      await finishTalk(page, residents, touch);
      const body = (await posted).postDataJSON() as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['conversation_id', 'expected_revision', 'resident_id']);
      expect(body['conversation_id']).toBe('welcome');
      expect(JSON.stringify(body)).not.toContain('Synthetic session note');
      await expect(residents.getByText(`Rank is 1. Welcome gave 2 Stamps once.`)).toBeFocused();
      await expect(away).toHaveAttribute('data-rank', '1');
      expect(await balance(page)).toBe(before + 2);
      expect(mutations).toEqual([]);

      const replay = residents.getByRole('button', { name: 'Replay Welcome', exact: true });
      await activate(page, replay, touch);
      await finishTalk(page, residents, touch);
      await expect(residents.getByText('Rank stays at 1.')).toBeFocused();
      await expect(away).toHaveAttribute('data-rank', '1');
      expect(await balance(page)).toBe(before + 2);
      const repeated = await page.request.post('/api/town/residents/conversations?tz=America/Los_Angeles', {
        headers,
        data: { resident_id: body['resident_id'], conversation_id: 'welcome', expected_revision: 0 },
      });
      expect(repeated.status()).toBe(200);
      expect((await repeated.json()).revision).toBe(1);
      await page.reload();
      await expect(residents.locator(`article[data-name="${name}"]`)).toHaveAttribute('data-rank', '1');
      expect(await balance(page)).toBe(before + 2);

      const close = residents.getByRole('button', { name: 'Close', exact: true });
      await activate(page, close, touch);
      await expect(page).toHaveURL(/\/town\/residents$/);
      await expect(residents.locator(`#inspect-${id}`)).toBeFocused();
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`resident=${id}`));
      await expect(residents.locator(`article[data-resident="${id}"]`)).toHaveAttribute('data-rank', '1');
      expect(await residents.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      const scan = await new AxeBuilder({ page }).include('app-town-residents').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    });
  }

  test('a later conversation raises rank without another welcome reward', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/town/residents?resident=mara');
    const residents = page.locator('app-town-residents');
    const before = await balance(page);
    await residents.getByRole('button', { name: 'Talk about Welcome', exact: true }).click();
    await finishTalk(page, residents, false);
    await expect(residents.locator('article[data-resident="mara"]')).toHaveAttribute('data-rank', '1');
    await residents.getByRole('button', { name: 'Talk about How this place works', exact: true }).click();
    await expect(residents.locator('[data-rank-effect]')).toHaveText('Rank rises by 1. No Stamps.');
    await finishTalk(page, residents, false);
    await expect(residents.getByText('Rank is 2. No extra Stamps.')).toBeVisible();
    await expect(residents.locator('article[data-resident="mara"]')).toHaveAttribute('data-rank', '2');
    expect(await balance(page)).toBe(before + 2);
    await expect(residents.getByText('Mara keeps the Reading Hall and explains the shelves.')).toHaveCount(2);
    await expect(residents.getByText(/you missed|yesterday|weight/i)).toHaveCount(0);
  });

  test('a lost response keeps the note and the retry records welcome once', async ({ page }) => {
    let failed = false;
    await page.route(/\/api\/town\/residents\/conversations/, async route => {
      if (!failed && route.request().method() === 'POST') {
        failed = true;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'unavailable', message: 'Try again.', detail: 'Try again.', field_errors: null }),
        });
        return;
      }
      await route.continue();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/town/residents?resident=ada');
    const residents = page.locator('app-town-residents');
    await residents.getByRole('button', { name: 'Talk about Welcome', exact: true }).click();
    await residents.locator('[data-dialogue-choice]').first().click();
    await residents.locator('#dialogue-note').fill('Synthetic session note');
    await residents.getByRole('button', { name: 'Finish talk', exact: true }).click();
    await expect(residents.getByRole('button', { name: 'Retry talk', exact: true })).toBeVisible();
    await expect(residents.locator('#dialogue-note')).toHaveValue('Synthetic session note');
    await expect(residents.locator('[data-selected-reply]')).toBeVisible();
    await residents.getByRole('button', { name: 'Retry talk', exact: true }).click();
    await expect(residents.locator('article[data-resident="ada"]')).toHaveAttribute('data-rank', '1');
    await expect(residents.locator('main')).toHaveAttribute('data-revision', '1');
  });

  test('a conflict drops the note and keeps the saved rank', async ({ page }) => {
    await page.goto('/town/residents?resident=jun');
    const residents = page.locator('app-town-residents');
    await residents.getByRole('button', { name: 'Talk about Welcome', exact: true }).click();
    await residents.getByRole('button', { name: 'Finish talk', exact: true }).click();
    await expect(residents.locator('article[data-resident="jun"]')).toHaveAttribute('data-rank', '1');
    await page.route(/\/api\/town\/residents\/conversations/, async route => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'dialogue_conflict', message: 'STALE', detail: 'STALE', field_errors: null }),
      });
    });
    await residents.getByRole('button', { name: 'Replay Welcome', exact: true }).click();
    await residents.locator('#dialogue-note').fill('Synthetic session note');
    await residents.getByRole('button', { name: 'Finish talk', exact: true }).click();
    await expect(residents.getByText('This conversation changed. The current ranks are shown.')).toBeVisible();
    await expect(residents.getByText('STALE')).toHaveCount(0);
    await expect(residents.locator('#dialogue-note')).toHaveCount(0);
    await expect(residents.locator('article[data-resident="jun"]')).toHaveAttribute('data-rank', '1');
  });

  const scenes = [
    ['Welcome', 'Mara keeps the Reading Hall. The shelves, the desk, and the wall calendar stay here when you are away.', 'Ada keeps the public rules of the square. This meeting does not open a private record.', 'Rank rises by 1. 2 Stamps, once.'],
    ['How this place works', 'Saved books open in Media. The hall does not keep a second library.', 'The Treasury door leads to Finance. This talk does not copy what is behind it.', 'Rank rises by 1. No Stamps.'],
    ['A preference', 'Mara asks which part of the hall you like to linger in. The answer is a taste, not a grade.', 'Ada asks what you want the square to feel like. The answer is a taste, not a score.', 'Rank rises by 1. No Stamps.'],
    ['A short activity', 'There is one small thing to notice. You can look at the bookshelves, or at a labeled sample.', 'Notice one object. If Finance is locked, it is the labeled sample.', 'Rank rises by 1. No Stamps.'],
    ['A reflection', 'Mara looks at the hall, not at a private reading log.', 'Ada looks at the square, not at a private plan.', 'Rank rises by 1. No Stamps.'],
  ] as const;

  test('reads all ten conversations with the keyboard while sound is off', async ({ page }) => {
    const leaks: string[] = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (/\/api\/vault|\/finance\/api|\/api\/finance|account-hall|\/goals\b|spending-plan/.test(path)) leaks.push(path);
    });
    await page.addInitScript(() => {
      localStorage.setItem('town.scene.v1.1', JSON.stringify({ season: 'automatic', sound: false }));
      localStorage.setItem('synthetic-account', 'Northwind Checking');
      localStorage.setItem('synthetic-spending', 'Spent 4321 on synthetic rent');
      localStorage.setItem('synthetic-goal', 'Private goal harbor cottage');
      const contexts: unknown[] = [];
      (window as unknown as { __audioContexts: unknown[] }).__audioContexts = contexts;
      class SilentAudio {
        constructor() { contexts.push(this); }
      }
      window.AudioContext = SilentAudio as unknown as typeof AudioContext;
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto('/town/residents?resident=mara');
    const residents = page.locator('app-town-residents');
    const before = await balance(page);
    let rank = 0;
    for (const [title, line, , effect] of scenes) {
      const talk = residents.getByRole('button', { name: `Talk about ${title}`, exact: true });
      await activate(page, talk, false);
      await expect(residents.getByText(line, { exact: true }).first()).toBeVisible();
      await expect(residents.locator('[data-resident-scene]')).toHaveAttribute('data-resident-scene', `mara:${title === 'Welcome' ? 'welcome' : title === 'How this place works' ? 'how-it-works' : title === 'A preference' ? 'preference' : title === 'A short activity' ? 'activity' : 'reflection'}`);
      const choices = residents.locator('[data-dialogue-choice]');
      await expect(choices).toHaveCount(2);
      await expect(residents.getByRole('button', { name: 'Finish talk', exact: true })).toBeDisabled();
      await activate(page, choices.nth(rank % 2), false);
      await expect(residents.locator('[data-rank-effect]')).toHaveText(effect);
      const posted = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/town/residents/conversations'));
      await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), false);
      const body = (await posted).postDataJSON() as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['conversation_id', 'expected_revision', 'resident_id']);
      expect(JSON.stringify(body)).not.toMatch(/Northwind|shelves|desk|sample/i);
      rank += 1;
      await expect(residents.locator('article[data-resident="mara"]')).toHaveAttribute('data-rank', String(rank));
      if (title === 'Welcome') expect(await balance(page)).toBe(before + 2);
    }
    expect(await balance(page)).toBe(before + 2);
    await expect(residents.getByText(/great job|well done|amazing|proud of you|excellent/i)).toHaveCount(0);

    await page.goto('/town/residents?resident=ada');
    await residents.getByRole('button', { name: 'Talk about Welcome', exact: true }).focus();
    await page.keyboard.press('Enter');
    await residents.locator('[data-dialogue-choice]').first().focus();
    await page.keyboard.press('Enter');
    await residents.locator('#dialogue-note').fill('Synthetic session note');
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'finance-vault-lock', newValue: '1' })));
    await expect(residents.getByRole('heading', { name: 'Finish Welcome with Ada?' })).toHaveCount(0);
    await expect(residents.locator('#dialogue-note')).toHaveCount(0);
    await expect(residents.locator('article[data-resident="ada"]')).toHaveAttribute('data-rank', '0');

    rank = 0;
    for (const [title, , line, effect] of scenes) {
      await activate(page, residents.getByRole('button', { name: `Talk about ${title}`, exact: true }), false);
      await expect(residents.getByText(line, { exact: true }).first()).toBeVisible();
      await expect(residents.locator('[data-mention-label]')).toHaveText('Sample civic ledger');
      await expect(residents.locator('[data-mention-sample]')).toHaveAttribute('data-mention-sample', 'true');
      await expect(residents.getByText('Labeled sample. Not a Finance record.')).toBeVisible();
      await expect(residents.getByText(/Northwind Checking|Spent 4321 on synthetic rent|Private goal harbor cottage/)).toHaveCount(0);
      await expect(residents.getByText(/\baccount\b|\bspending\b|private goal/i)).toHaveCount(0);
      const choices = residents.locator('[data-dialogue-choice]');
      await activate(page, choices.nth((rank + 1) % 2), false);
      await expect(residents.locator('[data-rank-effect]')).toHaveText(effect);
      await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), false);
      rank += 1;
      await expect(residents.locator('article[data-resident="ada"]')).toHaveAttribute('data-rank', String(rank));
    }
    expect(await balance(page)).toBe(before + 4);
    expect(leaks).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __audioContexts: unknown[] }).__audioContexts.length)).toBe(0);

    await page.evaluate(() => localStorage.setItem('finance-vault-present', '1'));
    await activate(page, residents.getByRole('button', { name: 'Replay A short activity', exact: true }), false);
    await expect(residents.locator('[data-mention-label]')).toHaveText('Treasury door');
    await expect(residents.locator('[data-mention-sample]')).toHaveAttribute('data-mention-sample', 'false');
    await expect(residents.getByText(/Northwind Checking|Spent 4321 on synthetic rent|Private goal harbor cottage/)).toHaveCount(0);
    await expect(residents.locator('[data-rank-effect]')).toHaveText('Rank stays. No Stamps.');
    await activate(page, residents.locator('[data-dialogue-choice]').nth(1), false);
    await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), false);
    await expect(residents.getByText('Rank stays at 5.')).toBeVisible();
    await expect(residents.locator('article[data-resident="ada"]')).toHaveAttribute('data-rank', '5');
    expect(await balance(page)).toBe(before + 4);
  });

  for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
    test(`${width} ${theme} corrects a Library reply and keeps a 44px target`, async ({ page }, info) => {
      const touch = width === 390;
      await page.addInitScript(chosen => {
        localStorage.setItem('suite-theme', chosen);
        localStorage.setItem('town.scene.v1.1', JSON.stringify({ season: 'automatic', sound: false }));
      }, theme);
      await page.setViewportSize({ width, height: touch ? 844 : 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/town/residents?resident=mara');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const residents = page.locator('app-town-residents');
      const talk = residents.getByRole('button', { name: 'Talk about A preference', exact: true });
      await activate(page, talk, touch);
      await expect(residents.getByRole('heading', { name: 'Finish A preference with Mara?' })).toBeFocused();
      const choices = residents.locator('[data-dialogue-choice]');
      await expect(choices).toHaveCount(2);
      for (const choice of await choices.all()) {
        const box = await choice.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      await activate(page, choices.first(), touch);
      await info.attach(`mara-preference-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, residents.getByRole('button', { name: 'Cancel', exact: true }), touch);
      await expect(talk).toBeFocused();
      await expect(residents.locator('#dialogue-note')).toHaveCount(0);
      await activate(page, talk, touch);
      await activate(page, choices.nth(1), touch);
      await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), touch);
      await expect(residents.getByText('Rank is 1. No extra Stamps.')).toBeFocused();
      await expect(residents.locator('article[data-resident="mara"]')).toHaveAttribute('data-rank', '1');
      const close = residents.getByRole('button', { name: 'Close', exact: true });
      await activate(page, close, touch);
      await expect(residents.locator('#inspect-mara')).toBeFocused();
      await page.goBack();
      await expect(page).toHaveURL(/resident=mara/);
      expect(await residents.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      const scan = await new AxeBuilder({ page }).include('app-town-residents').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    });
  }
});
