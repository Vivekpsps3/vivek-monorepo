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

function domainWrite(request: Request): boolean {
  if (request.method() === 'GET' || request.method() === 'HEAD' || request.method() === 'OPTIONS') return false;
  const path = new URL(request.url()).pathname;
  return path.startsWith('/travel/')
    || path.includes('/health')
    || path.startsWith('/api/vault')
    || path.includes('health_workout')
    || path.startsWith('/api/finance');
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
    await residents.locator('[data-dialogue-choice]').first().click();
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
    await residents.locator('[data-dialogue-choice]').first().click();
    await residents.locator('#dialogue-note').fill('Synthetic session note');
    await residents.getByRole('button', { name: 'Finish talk', exact: true }).click();
    await expect(residents.getByText('This conversation changed. The current ranks are shown.')).toBeVisible();
    await expect(residents.getByText('STALE')).toHaveCount(0);
    await expect(residents.locator('#dialogue-note')).toHaveCount(0);
    await expect(residents.locator('[data-selected-reply]')).toHaveCount(0);
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

  const terminalScenes = [
    ['Welcome', 'Imani keeps the harbor terminal. The departure board, the booking desk, and the map room stay here when you are away.', 'Rank rises by 1. 2 Stamps, once.'],
    ['How this place works', 'Saved trips stay in Travel. The terminal does not keep a second itinerary.', 'Rank rises by 1. No Stamps.'],
    ['A preference', 'Imani asks which kind of route you like to imagine. The answer is a taste, not a Travel record.', 'Rank rises by 1. No Stamps.'],
    ['A short activity', 'There is one small thing you can notice. You can look at the sample departure board, or leave it.', 'Rank rises by 1. No Stamps.'],
    ['A reflection', 'Imani looks at the terminal, not at a private itinerary.', 'Rank rises by 1. No Stamps.'],
  ] as const;
  const gymScenes = [
    ['Welcome', 'Jun keeps the training floor. The routine desk, the station, and the bench stay in the room.', 'Rank rises by 1. 2 Stamps, once.'],
    ['How this place works', 'The Gym is a room you can walk. Health keeps any measurements.', 'Rank rises by 1. No Stamps.'],
    ['A preference', 'Jun asks how you like the room to feel. The answer is a taste, not a result.', 'Rank rises by 1. No Stamps.'],
    ['A short activity', 'You can notice one part of the room, or leave it. Noticing does not log a workout.', 'Rank rises by 1. No Stamps.'],
    ['A reflection', 'Jun looks at the floor, not at a private log.', 'Rank rises by 1. No Stamps.'],
  ] as const;
  const badgeNames = [
    'First lift PR', 'First run PR', 'First personal best', 'PR breaker',
    'One plate', 'Two plates', 'Three plates', 'Four plates',
    '5K finisher', '10K finisher', 'Half-marathon finisher', 'Marathon finisher',
    '4-week logger', '12-week logger', '26-week logger', '52-week logger',
  ];

  test('empty Travel and locked Health still offer Imani and Jun', async ({ page }) => {
    const writes: string[] = [];
    page.on('request', request => {
      if (domainWrite(request)) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    await page.addInitScript(() => {
      localStorage.setItem('town.scene.v1.1', JSON.stringify({ season: 'automatic', sound: false }));
      localStorage.setItem('synthetic-trip', 'Synthetic harbor');
      localStorage.setItem('synthetic-destination', 'Lisbon quay');
      localStorage.setItem('synthetic-taken', 'status done');
      localStorage.setItem('synthetic-workout', 'Back squat 100 kg');
      localStorage.setItem('synthetic-badge', 'Marathon finisher');
      localStorage.setItem('synthetic-measurement', '72 bpm');
      const contexts: unknown[] = [];
      (window as unknown as { __audioContexts: unknown[] }).__audioContexts = contexts;
      class SilentAudio {
        constructor() { contexts.push(this); }
      }
      window.AudioContext = SilentAudio as unknown as typeof AudioContext;
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    const homeResponse = await page.request.get('/travel/api/home');
    expect(homeResponse.ok()).toBeTruthy();
    const emptyHome = await homeResponse.text();
    const empty = JSON.parse(emptyHome) as { in_progress: unknown[]; upcoming: unknown[]; past: unknown[] };
    expect(empty.in_progress).toEqual([]);
    expect(empty.upcoming).toEqual([]);
    expect(empty.past).toEqual([]);
    const healthKeys = () => page.evaluate(() => Object.keys(localStorage).filter(key => /health|workout|badge/i.test(key)).sort());

    await page.goto('/town/residents?resident=imani');
    const healthBefore = await healthKeys();
    const residents = page.locator('app-town-residents');
    await residents.getByRole('button', { name: 'Talk about Welcome', exact: true }).focus();
    await page.keyboard.press('Enter');
    await residents.locator('[data-dialogue-choice]').first().focus();
    await page.keyboard.press('Enter');
    await residents.locator('#dialogue-note').fill('Synthetic session note');
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'finance-vault-lock', newValue: '1' })));
    await expect(residents.getByRole('heading', { name: 'Finish Welcome with Imani?' })).toHaveCount(0);
    await expect(residents.locator('#dialogue-note')).toHaveCount(0);
    await expect(residents.locator('[data-selected-reply]')).toHaveCount(0);
    await expect(residents.locator('article[data-resident="imani"]')).toHaveAttribute('data-rank', '0');

    const before = await balance(page);
    let rank = 0;
    for (const [title, line, effect] of terminalScenes) {
      await activate(page, residents.getByRole('button', { name: `Talk about ${title}`, exact: true }), false);
      await expect(residents.getByText(line, { exact: true }).first()).toBeVisible();
      await expect(residents.locator('[data-mention-label]')).toHaveText('Sample departure board');
      await expect(residents.locator('[data-mention-sample]')).toHaveAttribute('data-mention-sample', 'true');
      await expect(residents.getByText('Labeled sample. Not a saved trip.')).toBeVisible();
      const sceneId = title === 'Welcome' ? 'welcome' : title === 'How this place works' ? 'how-it-works' : title === 'A preference' ? 'preference' : title === 'A short activity' ? 'activity' : 'reflection';
      await expect(residents.locator('[data-resident-scene]')).toHaveAttribute('data-resident-scene', `imani:${sceneId}`);
      const choices = residents.locator('[data-dialogue-choice]');
      await expect(choices).toHaveCount(2);
      await expect(residents.getByRole('button', { name: 'Finish talk', exact: true })).toBeDisabled();
      if (title === 'A short activity') await activate(page, residents.getByRole('button', { name: 'Leave the board alone.', exact: true }), false);
      else await activate(page, choices.nth(rank % 2), false);
      await expect(residents.locator('[data-rank-effect]')).toHaveText(effect);
      const posted = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/town/residents/conversations'));
      await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), false);
      const body = (await posted).postDataJSON() as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['conversation_id', 'expected_revision', 'resident_id']);
      expect(body['resident_id']).toBe('imani');
      expect(body['conversation_id']).toBe(sceneId);
      expect(JSON.stringify(body)).not.toMatch(/Synthetic harbor|Lisbon quay|status done|board|ferry/i);
      rank += 1;
      await expect(residents.locator('article[data-resident="imani"]')).toHaveAttribute('data-rank', String(rank));
    }

    await page.goto('/town/residents?resident=jun');
    rank = 0;
    for (const [title, line, effect] of gymScenes) {
      await activate(page, residents.getByRole('button', { name: `Talk about ${title}`, exact: true }), false);
      await expect(residents.getByText(line, { exact: true }).first()).toBeVisible();
      await expect(residents.locator('[data-mention-label]')).toHaveText('Sample training card');
      await expect(residents.locator('[data-mention-sample]')).toHaveAttribute('data-mention-sample', 'true');
      await expect(residents.getByText('Labeled sample. Not a Health record.')).toBeVisible();
      const choices = residents.locator('[data-dialogue-choice]');
      await expect(choices).toHaveCount(2);
      if (title === 'A short activity') await activate(page, residents.getByRole('button', { name: 'Leave the floor alone.', exact: true }), false);
      else await activate(page, choices.nth((rank + 1) % 2), false);
      await expect(residents.locator('[data-rank-effect]')).toHaveText(effect);
      await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), false);
      rank += 1;
      await expect(residents.locator('article[data-resident="jun"]')).toHaveAttribute('data-rank', String(rank));
    }
    expect(await balance(page)).toBe(before + 4);
    expect(writes).toEqual([]);
    expect(await healthKeys()).toEqual(healthBefore);
    expect(await (await page.request.get('/travel/api/home')).text()).toBe(emptyHome);
    await expect(residents.getByText(/Synthetic harbor|Lisbon quay|status done|Back squat 100 kg|Marathon finisher|72 bpm/)).toHaveCount(0);
    for (const name of badgeNames) await expect(residents.getByText(name, { exact: true })).toHaveCount(0);
    await expect(residents.getByText(/great job|well done|amazing|proud of you|excellent/i)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __audioContexts: unknown[] }).__audioContexts.length)).toBe(0);

    const created = await page.request.post('/travel/api/trips', {
      data: {
        title: 'Synthetic harbor',
        start_date: '2026-12-12',
        end_date: '2026-12-14',
        status: 'planning',
        counts_as_pto: false,
      },
    });
    expect(created.ok()).toBeTruthy();
    const trip = (await created.json()) as { id: number; status: string };
    expect(trip.status).toBe('planning');
    const tripUrl = `/travel/api/trips/${trip.id}`;
    const beforeTrip = await (await page.request.get(tripUrl)).text();
    const beforeSavedHome = await (await page.request.get('/travel/api/home')).text();
    await page.goto('/town/residents?resident=imani');
    await activate(page, residents.getByRole('button', { name: 'Replay A short activity', exact: true }), false);
    await expect(residents.locator('[data-mention-label]')).toHaveText('Sample departure board');
    await expect(residents.getByText('Synthetic harbor')).toHaveCount(0);
    await expect(residents.locator('[data-rank-effect]')).toHaveText('Rank stays. No Stamps.');
    await activate(page, residents.getByRole('button', { name: 'Look at the sample board.', exact: true }), false);
    await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), false);
    await expect(residents.getByText('Rank stays at 5.')).toBeVisible();
    await expect(residents.locator('article[data-resident="imani"]')).toHaveAttribute('data-rank', '5');
    expect(await (await page.request.get(tripUrl)).text()).toBe(beforeTrip);
    expect(await (await page.request.get('/travel/api/home')).text()).toBe(beforeSavedHome);
    expect(writes).toEqual([]);

    await page.goto('/town/residents?resident=jun');
    await expect(residents.locator('article[data-resident="jun"]')).toHaveAttribute('data-rank', '5');
    await page.evaluate(() => localStorage.setItem('finance-vault-present', '1'));
    await activate(page, residents.getByRole('button', { name: 'Replay A short activity', exact: true }), false);
    await expect(residents.locator('[data-mention-label]')).toHaveText('Training floor');
    await expect(residents.locator('[data-mention-sample]')).toHaveAttribute('data-mention-sample', 'false');
    await expect(residents.getByText('A public floor. Records stay in Health.')).toBeVisible();
    await expect(residents.getByText(/Back squat 100 kg|Marathon finisher|72 bpm/)).toHaveCount(0);
    for (const name of badgeNames) await expect(residents.getByText(name, { exact: true })).toHaveCount(0);
    await expect(residents.locator('[data-rank-effect]')).toHaveText('Rank stays. No Stamps.');
    await activate(page, residents.getByRole('button', { name: 'Notice the open floor.', exact: true }), false);
    await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), false);
    await expect(residents.getByText('Rank stays at 5.')).toBeVisible();
    expect(await (await page.request.get(tripUrl)).text()).toBe(beforeTrip);
    expect(await healthKeys()).toEqual(healthBefore);
    expect(writes).toEqual([]);
    expect(await balance(page)).toBe(before + 4);
  });

  for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
    test(`${width} ${theme} corrects an Imani reply and a Jun reply`, async ({ page }, info) => {
      const touch = width === 390;
      await page.addInitScript(chosen => {
        localStorage.setItem('suite-theme', chosen);
        localStorage.setItem('town.scene.v1.1', JSON.stringify({ season: 'automatic', sound: false }));
      }, theme);
      await page.setViewportSize({ width, height: touch ? 844 : 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/town/residents?resident=imani');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const residents = page.locator('app-town-residents');
      const talk = residents.getByRole('button', { name: 'Talk about A preference', exact: true });
      await activate(page, talk, touch);
      await expect(residents.getByRole('heading', { name: 'Finish A preference with Imani?' })).toBeFocused();
      await expect(residents.locator('[data-mention-label]')).toHaveText('Sample departure board');
      const choices = residents.locator('[data-dialogue-choice]');
      await expect(choices).toHaveCount(2);
      for (const choice of await choices.all()) {
        const box = await choice.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      await activate(page, choices.first(), touch);
      await info.attach(`imani-preference-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, residents.getByRole('button', { name: 'Cancel', exact: true }), touch);
      await expect(talk).toBeFocused();
      await expect(residents.locator('#dialogue-note')).toHaveCount(0);
      await activate(page, talk, touch);
      await activate(page, choices.nth(1), touch);
      await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), touch);
      await expect(residents.getByText('Rank is 1. No extra Stamps.')).toBeFocused();
      await expect(residents.locator('article[data-resident="imani"]')).toHaveAttribute('data-rank', '1');
      const close = residents.getByRole('button', { name: 'Close', exact: true });
      await activate(page, close, touch);
      await expect(residents.locator('#inspect-imani')).toBeFocused();
      await page.goBack();
      await expect(page).toHaveURL(/resident=imani/);

      await page.goto('/town/residents?resident=jun');
      const gymTalk = residents.getByRole('button', { name: 'Talk about A short activity', exact: true });
      await activate(page, gymTalk, touch);
      await expect(residents.getByRole('heading', { name: 'Finish A short activity with Jun?' })).toBeFocused();
      await expect(residents.locator('[data-mention-label]')).toHaveText('Sample training card');
      const gymChoices = residents.locator('[data-dialogue-choice]');
      await expect(gymChoices).toHaveCount(2);
      for (const choice of await gymChoices.all()) {
        const box = await choice.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      await activate(page, gymChoices.first(), touch);
      await info.attach(`jun-activity-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, residents.getByRole('button', { name: 'Cancel', exact: true }), touch);
      await expect(gymTalk).toBeFocused();
      await activate(page, gymTalk, touch);
      await activate(page, residents.getByRole('button', { name: 'Leave the floor alone.', exact: true }), touch);
      await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), touch);
      await expect(residents.getByText('Rank is 1. No extra Stamps.')).toBeFocused();
      await expect(residents.locator('article[data-resident="jun"]')).toHaveAttribute('data-rank', '1');
      expect(await residents.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      const scan = await new AxeBuilder({ page }).include('app-town-residents').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    });
  }

  const wrenScenes = [
    ['Welcome', 'Wren keeps the music room and the arcade. The bar, the sign, and the play floor stay here when you are away.', 'Rank rises by 1. 2 Stamps, once.'],
    ['How this place works', 'Saved music stays in Media. A game stays with its play. This talk does not keep a second copy.', 'Rank rises by 1. No Stamps.'],
    ['A preference', 'Wren asks what you like to linger with. The answer is a taste, not a grade of music or of play.', 'Rank rises by 1. No Stamps.'],
    ['A short activity', 'You can notice the sample sign, or leave the floor. Noticing does not save a score or copy a review.', 'Rank rises by 1. No Stamps.'],
    ['A reflection', 'Wren looks at the music room and the play floor, not at a private review.', 'Rank rises by 1. No Stamps.'],
  ] as const;
  const solScenes = [
    ['Welcome', 'Sol keeps the Hall and the study. The rules and the desk stay here when you are away.', 'Rank rises by 1. 2 Stamps, once.'],
    ['How this place works', 'The Hall shows public rules. Learning stays with you. This talk does not copy a note from the study.', 'Rank rises by 1. No Stamps.'],
    ['A preference', 'Sol asks how you like to learn the rules of a place. The answer is a taste, not a grade.', 'Rank rises by 1. No Stamps.'],
    ['A short activity', 'You can notice the rules, or leave them. Noticing does not copy a review or a concept note.', 'Rank rises by 1. No Stamps.'],
    ['A reflection', 'Sol looks at the Hall, not at a private review or a concept note.', 'Rank rises by 1. No Stamps.'],
  ] as const;
  const reviewNote = 'Harbor week note stays shut';
  const conceptNote = 'Concept note tide tables';

  function conversationId(title: string): string {
    if (title === 'Welcome') return 'welcome';
    if (title === 'How this place works') return 'how-it-works';
    if (title === 'A preference') return 'preference';
    if (title === 'A short activity') return 'activity';
    return 'reflection';
  }

  test('reads Wren and Sol before and after a chapter without copying a note', async ({ page }) => {
    const writes: string[] = [];
    page.on('request', request => {
      if (request.method() === 'GET' || request.method() === 'HEAD' || request.method() === 'OPTIONS') return;
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/media/') || path.startsWith('/api/world') || path.startsWith('/api/vault') || path.includes('/health')) {
        writes.push(`${request.method()} ${path}`);
      }
    });
    await page.addInitScript(({ review, concept }) => {
      localStorage.setItem('town.scene.v1.1', JSON.stringify({ season: 'automatic', sound: false }));
      localStorage.setItem('synthetic-review', review);
      localStorage.setItem('synthetic-concept', concept);
      const contexts: unknown[] = [];
      (window as unknown as { __audioContexts: unknown[] }).__audioContexts = contexts;
      class SilentAudio {
        constructor() { contexts.push(this); }
      }
      window.AudioContext = SilentAudio as unknown as typeof AudioContext;
    }, { review: reviewNote, concept: conceptNote });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto('/town/residents?resident=wren');
    const residents = page.locator('app-town-residents');
    const before = await balance(page);
    await activate(page, residents.getByRole('button', { name: 'Talk about A reflection', exact: true }), false);
    await expect(residents.locator('[data-chapter-visit]')).toHaveText('Not visited yet. This talk does not mark a chapter done.');
    await expect(residents.locator('[data-mention-label]')).toHaveText('Sample arcade sign');
    await expect(residents.locator('[data-rank-effect]')).toHaveText('Rank rises by 1. No Stamps.');
    await expect(residents.getByText(reviewNote)).toHaveCount(0);
    await expect(residents.getByText(conceptNote)).toHaveCount(0);
    await activate(page, residents.getByRole('button', { name: 'Cancel', exact: true }), false);
    await expect(residents.locator('article[data-resident="wren"]')).toHaveAttribute('data-rank', '0');

    let rank = 0;
    for (const [title, line, effect] of wrenScenes) {
      await activate(page, residents.getByRole('button', { name: `Talk about ${title}`, exact: true }), false);
      await expect(residents.getByText(line, { exact: true }).first()).toBeVisible();
      await expect(residents.locator('[data-mention-label]')).toHaveText('Sample arcade sign');
      await expect(residents.locator('[data-mention-sample]')).toHaveAttribute('data-mention-sample', 'true');
      const id = conversationId(title);
      await expect(residents.locator('[data-resident-scene]')).toHaveAttribute('data-resident-scene', `wren:${id}`);
      if (title === 'A reflection') {
        await expect(residents.locator('[data-chapter-visit]')).toHaveText('Not visited yet. This talk does not mark a chapter done.');
      } else {
        await expect(residents.locator('[data-chapter-visit]')).toHaveCount(0);
      }
      const choices = residents.locator('[data-dialogue-choice]');
      await expect(choices).toHaveCount(2);
      await expect(residents.getByRole('button', { name: 'Finish talk', exact: true })).toBeDisabled();
      if (title === 'A short activity') await activate(page, residents.getByRole('button', { name: 'Leave the floor alone.', exact: true }), false);
      else await activate(page, choices.nth(rank % 2), false);
      await expect(residents.locator('[data-rank-effect]')).toHaveText(effect);
      const posted = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/town/residents/conversations'));
      await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), false);
      const body = (await posted).postDataJSON() as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['conversation_id', 'expected_revision', 'resident_id']);
      expect(body['resident_id']).toBe('wren');
      expect(body['conversation_id']).toBe(id);
      expect(JSON.stringify(body)).not.toContain(reviewNote);
      expect(JSON.stringify(body)).not.toContain(conceptNote);
      rank += 1;
      await expect(residents.locator('article[data-resident="wren"]')).toHaveAttribute('data-rank', String(rank));
      await expect(residents.locator('#dialogue-notice')).not.toContainText(reviewNote);
      await expect(residents.locator('#dialogue-notice')).not.toContainText(conceptNote);
    }
    expect(await balance(page)).toBe(before + 2);
    await activate(page, residents.getByRole('button', { name: 'Replay A reflection', exact: true }), false);
    await expect(residents.locator('[data-chapter-visit]')).toHaveText('Already visited. This talk is not recorded again.');
    await expect(residents.locator('[data-rank-effect]')).toHaveText('Rank stays. No Stamps.');
    await activate(page, residents.getByRole('button', { name: 'The floor is for playing again.', exact: true }), false);
    await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), false);
    await expect(residents.getByText('Rank stays at 5.')).toBeVisible();
    await expect(residents.locator('article[data-resident="wren"]')).toHaveAttribute('data-rank', '5');
    expect(await balance(page)).toBe(before + 2);

    await page.goto('/town/residents?resident=sol');
    await residents.getByRole('button', { name: 'Talk about Welcome', exact: true }).focus();
    await page.keyboard.press('Enter');
    await residents.locator('[data-dialogue-choice]').first().focus();
    await page.keyboard.press('Enter');
    await residents.locator('#dialogue-note').fill('Synthetic session note');
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'finance-vault-lock', newValue: '1' })));
    await expect(residents.getByRole('heading', { name: 'Finish Welcome with Sol?' })).toHaveCount(0);
    await expect(residents.locator('#dialogue-note')).toHaveCount(0);
    await expect(residents.locator('[data-selected-reply]')).toHaveCount(0);
    await expect(residents.locator('article[data-resident="sol"]')).toHaveAttribute('data-rank', '0');

    rank = 0;
    for (const [title, line, effect] of solScenes) {
      await activate(page, residents.getByRole('button', { name: `Talk about ${title}`, exact: true }), false);
      await expect(residents.getByText(line, { exact: true }).first()).toBeVisible();
      await expect(residents.locator('[data-mention-label]')).toHaveText('Sample rules card');
      await expect(residents.getByText('Labeled sample. Not a review or a concept note.')).toBeVisible();
      await expect(residents.getByText(reviewNote)).toHaveCount(0);
      await expect(residents.getByText(conceptNote)).toHaveCount(0);
      if (title === 'A reflection') {
        await expect(residents.locator('[data-chapter-visit]')).toHaveText('Not visited yet. This talk does not mark a chapter done.');
      }
      const choices = residents.locator('[data-dialogue-choice]');
      if (title === 'A short activity') await activate(page, residents.getByRole('button', { name: 'Leave the notes alone.', exact: true }), false);
      else await activate(page, choices.nth((rank + 1) % 2), false);
      await expect(residents.locator('[data-rank-effect]')).toHaveText(effect);
      const posted = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/town/residents/conversations'));
      await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), false);
      const body = (await posted).postDataJSON() as Record<string, unknown>;
      expect(body['resident_id']).toBe('sol');
      expect(body['conversation_id']).toBe(conversationId(title));
      expect(JSON.stringify(body)).not.toContain(reviewNote);
      expect(JSON.stringify(body)).not.toContain(conceptNote);
      rank += 1;
      await expect(residents.locator('article[data-resident="sol"]')).toHaveAttribute('data-rank', String(rank));
    }
    expect(await balance(page)).toBe(before + 4);
    expect(writes).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __audioContexts: unknown[] }).__audioContexts.length)).toBe(0);
    await expect(residents.getByText(/great job|well done|amazing|proud of you|excellent/i)).toHaveCount(0);
    await expect(residents.locator('#dialogue-notice')).not.toContainText(reviewNote);
    await expect(residents.locator('#dialogue-notice')).not.toContainText(conceptNote);

    const created = await page.request.post('/api/world/concepts', {
      data: { name: 'Tide table', note: conceptNote, tz: 'America/Los_Angeles' },
    });
    expect(created.ok()).toBeTruthy();
    const concept = (await created.json()) as { id: number; note: string };
    expect(concept.note).toBe(conceptNote);
    const writesAfterTalks = writes.length;
    const conceptUrl = `/api/world/concepts?archived=0`;
    const beforeConcept = await (await page.request.get(conceptUrl)).text();
    await page.goto('/town/residents?resident=sol');
    await activate(page, residents.getByRole('button', { name: 'Replay A reflection', exact: true }), false);
    await expect(residents.locator('[data-chapter-visit]')).toHaveText('Already visited. This talk is not recorded again.');
    await expect(residents.locator('[data-rank-effect]')).toHaveText('Rank stays. No Stamps.');
    await expect(residents.getByText(conceptNote)).toHaveCount(0);
    await expect(residents.getByText('Tide table')).toHaveCount(0);
    await expect(residents.getByText(reviewNote)).toHaveCount(0);
    await activate(page, residents.getByRole('button', { name: 'The study can wait.', exact: true }), false);
    await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), false);
    await expect(residents.getByText('Rank stays at 5.')).toBeVisible();
    await expect(residents.getByText(conceptNote)).toHaveCount(0);
    expect(await (await page.request.get(conceptUrl)).text()).toBe(beforeConcept);
    expect(await balance(page)).toBe(before + 4);
    expect(writes.slice(writesAfterTalks).filter(item => item !== 'POST /api/world/concepts')).toEqual([]);

    await page.goto('/town/residents?resident=wren');
    await expect(residents.getByRole('button', { name: 'Replay A short activity', exact: true })).toBeVisible();
    await page.evaluate(() => localStorage.setItem('finance-vault-present', '1'));
    await activate(page, residents.getByRole('button', { name: 'Replay A short activity', exact: true }), false);
    await expect(residents.locator('[data-mention-label]')).toHaveText('Music bar');
    await expect(residents.locator('[data-mention-sample]')).toHaveAttribute('data-mention-sample', 'false');
    await expect(residents.getByText('A public room. Albums and games stay in Media.')).toBeVisible();
    await expect(residents.getByText(reviewNote)).toHaveCount(0);
    await expect(residents.getByText(conceptNote)).toHaveCount(0);
    await expect(residents.locator('[data-rank-effect]')).toHaveText('Rank stays. No Stamps.');
    await activate(page, residents.getByRole('button', { name: 'Look at the sample sign.', exact: true }), false);
    await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), false);
    await expect(residents.getByText('Rank stays at 5.')).toBeVisible();
    await page.goto('/town/residents?resident=sol');
    await expect(residents.getByRole('button', { name: 'Replay A short activity', exact: true })).toBeVisible();
    await page.evaluate(() => localStorage.setItem('finance-vault-present', '1'));
    await activate(page, residents.getByRole('button', { name: 'Replay A short activity', exact: true }), false);
    await expect(residents.locator('[data-mention-label]')).toHaveText('Rules board');
    await expect(residents.getByText('A public board. Reviews and concept notes are not copied here.')).toBeVisible();
    await expect(residents.getByText(reviewNote)).toHaveCount(0);
    await expect(residents.getByText(conceptNote)).toHaveCount(0);
    await expect(residents.getByText('Tide table')).toHaveCount(0);
    await activate(page, residents.getByRole('button', { name: 'Notice the public rules.', exact: true }), false);
    await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), false);
    await expect(residents.getByText('Rank stays at 5.')).toBeVisible();
    expect(await (await page.request.get(conceptUrl)).text()).toBe(beforeConcept);
    expect(await balance(page)).toBe(before + 4);
    expect(writes.slice(writesAfterTalks).filter(item => item !== 'POST /api/world/concepts' && item !== 'GET /api/world/concepts')).toEqual([]);
  });

  for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
    test(`${width} ${theme} corrects a Wren reply and a Sol reply`, async ({ page }, info) => {
      const touch = width === 390;
      await page.addInitScript(chosen => {
        localStorage.setItem('suite-theme', chosen);
        localStorage.setItem('town.scene.v1.1', JSON.stringify({ season: 'automatic', sound: false }));
      }, theme);
      await page.setViewportSize({ width, height: touch ? 844 : 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/town/residents?resident=wren');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const residents = page.locator('app-town-residents');
      const talk = residents.getByRole('button', { name: 'Talk about A preference', exact: true });
      await activate(page, talk, touch);
      await expect(residents.getByRole('heading', { name: 'Finish A preference with Wren?' })).toBeFocused();
      await expect(residents.locator('[data-mention-label]')).toHaveText('Sample arcade sign');
      const choices = residents.locator('[data-dialogue-choice]');
      await expect(choices).toHaveCount(2);
      for (const choice of await choices.all()) {
        const box = await choice.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      await activate(page, choices.first(), touch);
      await info.attach(`wren-preference-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, residents.getByRole('button', { name: 'Cancel', exact: true }), touch);
      await expect(talk).toBeFocused();
      await expect(residents.locator('#dialogue-note')).toHaveCount(0);
      await activate(page, talk, touch);
      await activate(page, choices.nth(1), touch);
      await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), touch);
      await expect(residents.getByText('Rank is 1. No extra Stamps.')).toBeFocused();
      await expect(residents.locator('article[data-resident="wren"]')).toHaveAttribute('data-rank', '1');
      const close = residents.getByRole('button', { name: 'Close', exact: true });
      await activate(page, close, touch);
      await expect(residents.locator('#inspect-wren')).toBeFocused();
      await page.goBack();
      await expect(page).toHaveURL(/resident=wren/);

      await page.goto('/town/residents?resident=sol');
      const hallTalk = residents.getByRole('button', { name: 'Talk about A short activity', exact: true });
      await activate(page, hallTalk, touch);
      await expect(residents.getByRole('heading', { name: 'Finish A short activity with Sol?' })).toBeFocused();
      await expect(residents.locator('[data-mention-label]')).toHaveText('Sample rules card');
      const hallChoices = residents.locator('[data-dialogue-choice]');
      await expect(hallChoices).toHaveCount(2);
      for (const choice of await hallChoices.all()) {
        const box = await choice.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      await activate(page, hallChoices.first(), touch);
      await info.attach(`sol-activity-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, residents.getByRole('button', { name: 'Cancel', exact: true }), touch);
      await expect(hallTalk).toBeFocused();
      await activate(page, hallTalk, touch);
      await activate(page, residents.getByRole('button', { name: 'Leave the notes alone.', exact: true }), touch);
      await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), touch);
      await expect(residents.getByText('Rank is 1. No extra Stamps.')).toBeFocused();
      await expect(residents.locator('article[data-resident="sol"]')).toHaveAttribute('data-rank', '1');
      expect(await residents.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      const scan = await new AxeBuilder({ page }).include('app-town-residents').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    });
  }
});
