import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Locator, type Page, type Request, type TestInfo } from '../../../tests/e2e/fixtures';
import { RHYTHM_CHART, RHYTHM_SEED } from '../src/app/town/harbor-rhythm';
import { MEMORY_SEED, dealMemory } from '../src/app/town/memory-shelves';

const headers = { 'X-CSRF-Token': 'synthetic-csrf' };
const lifePaths = ['/media/api/summary', '/travel/api/memories', '/travel/api/home', '/api/world/concepts'];

interface Earned {
  memoryNonce: string;
  memoryDay: string;
  harborNonce: string;
  harborDay: string;
}

function journalWrite(request: Request): boolean {
  if (request.method() === 'GET' || request.method() === 'HEAD' || request.method() === 'OPTIONS') return false;
  const path = new URL(request.url()).pathname;
  return path.startsWith('/media/')
    || path.startsWith('/travel/')
    || path.startsWith('/finance')
    || path.startsWith('/api/finance')
    || path.startsWith('/api/world')
    || path.startsWith('/api/vault')
    || path.includes('/health')
    || path.startsWith('/api/town/');
}

async function okJson(response: Awaited<ReturnType<APIRequestContext['post']>>): Promise<Record<string, unknown>> {
  const text = await response.text();
  expect(response.ok(), `${response.status()} ${text}`).toBeTruthy();
  return JSON.parse(text) as Record<string, unknown>;
}

async function post(request: APIRequestContext, path: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  return okJson(await request.post(path, { headers, data }));
}

async function earn(request: APIRequestContext): Promise<Earned> {
  let revision = 0;
  for (const [stepId, actionId] of [
    ['meet-librarian', 'find-your-shelves:meet-librarian'],
    ['inspect-saved', 'find-your-shelves:inspect-saved:sample'],
    ['choose-display', 'find-your-shelves:choose-display'],
  ] as const) {
    const saved = await post(request, '/api/town/quests/steps', {
      quest_id: 'find-your-shelves',
      step_id: stepId,
      action_id: actionId,
      expected_revision: revision,
    });
    revision = saved['revision'] as number;
  }
  await post(request, '/api/town/discoveries', { discovery_id: 'ferry-bell', expected_revision: 0 });
  await post(request, '/api/town/residents/conversations?tz=America%2FLos_Angeles', {
    resident_id: 'mara',
    conversation_id: 'welcome',
    expected_revision: 0,
  });
  const memory = await post(request, '/api/town/minigames/runs?tz=America%2FLos_Angeles', { game_id: 'memory-shelves' });
  const tiles = dealMemory(MEMORY_SEED).tiles.map(tile => ({ index: tile.index, symbol: tile.symbol, face: 'matched' }));
  const memoryDone = await post(request, `/api/town/minigames/runs/${memory['nonce']}/finish?tz=America%2FLos_Angeles`, {
    seed: MEMORY_SEED,
    moves: 8,
    tiles,
  });
  expect(memoryDone['amount']).toBe(5);
  expect(memoryDone['score']).toBe(8);
  const harbor = await post(request, '/api/town/minigames/runs?tz=America%2FLos_Angeles', {
    game_id: 'harbor-rhythm',
    mode: 'untimed',
  });
  const harborDone = await post(request, `/api/town/minigames/runs/${harbor['nonce']}/finish?tz=America%2FLos_Angeles`, {
    seed: RHYTHM_SEED,
    mode: 'untimed',
    elapsed: 0,
    wrong: 0,
    notes: RHYTHM_CHART.map(beat => ({ lane: beat.lane, at: beat.at, result: 'hit' })),
  });
  expect(harborDone['amount']).toBe(5);
  expect(harborDone['score']).toBe(100);
  return {
    memoryNonce: String(memoryDone['nonce']),
    memoryDay: String(memoryDone['civil_day']),
    harborNonce: String(harborDone['nonce']),
    harborDay: String(harborDone['civil_day']),
  };
}

async function lifeSnapshot(request: APIRequestContext): Promise<string> {
  const bodies = await Promise.all(lifePaths.map(async path => {
    const response = await request.get(`${path}?tz=America%2FLos_Angeles`);
    expect(response.ok(), path).toBeTruthy();
    return JSON.stringify(await response.json());
  }));
  return bodies.join('\n');
}

async function boxAtLeast(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

async function activate(page: Page, locator: Locator, touch: boolean): Promise<void> {
  await expect(locator).toBeVisible();
  await boxAtLeast(locator);
  if (touch) await locator.tap();
  else {
    await locator.focus();
    await page.keyboard.press('Enter');
  }
}

async function openRecord(page: Page, journal: Locator, id: string, touch: boolean): Promise<Locator> {
  await activate(page, journal.locator(`#journal-open-${id}`), touch);
  const article = journal.locator(`article[data-record="${id}"]`);
  await expect(article).toBeVisible();
  await expect(journal.locator('#journal-item')).toBeFocused();
  return article;
}

test.describe('Hall journal', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true });
  test.beforeEach(async ({ request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
  });

  for (const [width, theme, touch] of [
    [390, 'dark', true],
    [390, 'light', true],
    [1280, 'light', false],
    [1280, 'dark', false],
  ] as const) {
    test(`reads the same earned records at ${width} ${theme}`, async ({ page, request }, info: TestInfo) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: touch ? 844 : 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(chosen => localStorage.setItem('suite-theme', chosen), theme);
      await page.goto('/town/hall');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const beforeLife = await lifeSnapshot(request);
      const earned = await earn(page.request);
      expect(await lifeSnapshot(request)).toBe(beforeLife);
      const stamps = await (await page.request.get('/api/town/stamps')).json();
      expect(stamps.balance).toBe(22);
      const writes: string[] = [];
      page.on('request', seen => {
        if (journalWrite(seen)) writes.push(`${seen.method()} ${new URL(seen.url()).pathname}`);
      });
      const journalLink = page.getByRole('link', { name: 'Hall journal', exact: true });
      await activate(page, journalLink, touch);

      const journal = page.locator('app-hall-journal');
      await expect(journal.getByRole('heading', { level: 1, name: 'Hall journal' })).toBeVisible();
      await expect(journal).toContainText('not Health badges, Finance totals, or Media memberships');
      await expect(journal.locator('[data-collection="chapters"]')).toContainText('1 earned.');
      await expect(journal.locator('[data-collection="discoveries"]')).toContainText('1 earned.');
      await expect(journal.locator('[data-collection="friendship"]')).toContainText('1 earned.');
      await expect(journal.locator('[data-collection="arcade"]')).toContainText('2 earned.');
      await expect(journal.locator('[data-badge]')).toHaveCount(0);

      await activate(page, journal.getByRole('link', { name: 'Chapters', exact: true }), touch);
      await expect(journal.locator('[data-record]')).toHaveCount(6);
      const find = journal.locator('#journal-find');
      await boxAtLeast(find);
      await find.fill('home');
      await expect(journal.locator('[data-record="make-a-home"]')).toBeVisible();
      await expect(journal.locator('[data-record="find-your-shelves"]')).toHaveCount(0);
      await find.fill('');
      const chapter = await openRecord(page, journal, 'find-your-shelves', touch);
      await expect(chapter.locator('[data-badge="once"]')).toHaveText('library seal, once');
      await expect(chapter.locator('[data-explanation]')).toContainText('10 Stamps, once');
      await expect(chapter.locator('[data-explanation]')).toContainText('find-your-shelves:inspect-saved:sample');
      await expect(chapter.locator('[data-source]')).toContainText('quest:find-your-shelves');
      await expect(chapter.locator('[data-source]')).toContainText('find-your-shelves:inspect-saved:sample');
      await expect(chapter.locator('[data-sample]')).toContainText('Sample shelf item');
      await expect(chapter.locator('[data-sample]')).toContainText('Labeled sample. Not your library.');
      await expect(journal.locator('[data-record="make-a-home"] [data-badge]')).toHaveCount(0);
      const chapterBadge = await chapter.locator('[data-badge="once"]').innerText();
      const chapterSource = await chapter.locator('[data-source]').innerText();
      await page.reload();
      await expect(chapter.locator('[data-badge="once"]')).toHaveText(chapterBadge);
      await expect(chapter.locator('[data-source]')).toHaveText(chapterSource);
      if (touch) await activate(page, journal.getByRole('link', { name: 'Back to Chapters', exact: true }), true);
      else {
        await page.keyboard.press('Escape');
        await expect(journal.locator('#journal-open-find-your-shelves')).toBeFocused();
      }
      await expect(journal.locator('article[data-open="true"]')).toHaveCount(0);
      await activate(page, journal.getByRole('link', { name: 'Journal', exact: true }), touch);

      await activate(page, journal.getByRole('link', { name: 'Discoveries', exact: true }), touch);
      await expect(journal.locator('[data-record]')).toHaveCount(12);
      const hints = journal.getByRole('button', { name: 'Show location hints', exact: true });
      await activate(page, hints, touch);
      await expect(journal.getByText('Beside the model ferry at the terminal.')).toBeVisible();
      await activate(page, journal.getByRole('button', { name: 'Hide location hints', exact: true }), touch);
      await expect(journal.locator('[data-hint]')).toHaveCount(0);
      const discovery = await openRecord(page, journal, 'ferry-bell', touch);
      await expect(discovery.locator('[data-badge="once"]')).toHaveText('Journal stamp, once');
      await expect(discovery.locator('[data-explanation]')).toContainText('No trip is created.');
      await expect(discovery.locator('[data-explanation]')).toContainText('Journal stamp, once. No Stamps.');
      await expect(discovery.locator('[data-explanation]')).not.toContainText('Beside the model ferry');
      await expect(discovery.locator('[data-source]')).toHaveText('Source discovery:ferry-bell');
      await page.reload();
      await expect(discovery.locator('[data-badge="once"]')).toHaveText('Journal stamp, once');
      await expect(discovery.locator('[data-source]')).toHaveText('Source discovery:ferry-bell');
      const missed = await openRecord(page, journal, 'arcade-sign', touch);
      await expect(missed.locator('[data-badge]')).toHaveCount(0);
      await expect(missed.locator('[data-explanation]')).toContainText('Not found yet.');
      await expect(missed.locator('[data-explanation]')).not.toContainText('You tap the arcade sign.');
      await activate(page, journal.getByRole('link', { name: 'Journal', exact: true }), touch);

      await activate(page, journal.getByRole('link', { name: 'Friendship', exact: true }), touch);
      await expect(journal.locator('[data-record]')).toHaveCount(6);
      const mara = await openRecord(page, journal, 'mara', touch);
      await expect(mara.locator('[data-badge="once"]')).toHaveText('Rank 1 of 5. 2 Stamps, once.');
      await expect(mara.locator('[data-explanation]')).toContainText('Rank 1 of 5. No decay.');
      await expect(mara.locator('[data-source]')).toContainText('meeting:mara');
      await expect(journal.locator('[data-record="ada"] [data-badge]')).toHaveCount(0);
      await page.reload();
      await expect(mara.locator('[data-badge="once"]')).toHaveText('Rank 1 of 5. 2 Stamps, once.');
      await expect(mara.locator('[data-source]')).toContainText('meeting:mara');
      await activate(page, journal.getByRole('link', { name: 'Journal', exact: true }), touch);

      await activate(page, journal.getByRole('link', { name: 'Arcade', exact: true }), touch);
      await expect(journal.locator('[data-record]')).toHaveCount(2);
      const memoryCard = await openRecord(page, journal, 'memory-shelves', touch);
      await expect(memoryCard.locator('h2')).toHaveText('Memory Shelves');
      await expect(memoryCard.locator('[data-badge="once"]')).toHaveText('5 Stamps, once');
      await expect(memoryCard.locator('[data-explanation]')).toContainText('Score 8 moves.');
      await expect(memoryCard.locator('[data-explanation]')).toContainText(`5 Stamps, once, on ${earned.memoryDay}. Source minigame:memory-shelves:${earned.memoryDay}.`);
      await expect(memoryCard.locator('[data-explanation]')).toContainText('A game medal records a minigame. It does not record a lift, a run, or a medical result.');
      await expect(memoryCard.locator('[data-explanation]')).toContainText('It is not a Finance total or a Media membership.');
      await expect(memoryCard.locator('[data-source]')).toContainText(`play:${earned.memoryNonce}`);
      await expect(memoryCard.locator('[data-source]')).toContainText(`minigame:memory-shelves:${earned.memoryDay}`);
      await expect(memoryCard).not.toContainText('Marathon finisher');
      const memorySource = await memoryCard.locator('[data-source]').innerText();
      await page.reload();
      await expect(memoryCard.locator('[data-badge="once"]')).toHaveText('5 Stamps, once');
      await expect(memoryCard.locator('[data-source]')).toHaveText(memorySource);
      const harborCard = await openRecord(page, journal, 'harbor-rhythm', touch);
      await expect(harborCard.locator('[data-badge="once"]')).toHaveText('5 Stamps, once');
      await expect(harborCard.locator('[data-explanation]')).toContainText('Accuracy 100.');
      await expect(harborCard.locator('[data-source]')).toContainText(`play:${earned.harborNonce}`);
      await expect(harborCard.locator('[data-source]')).toContainText(`minigame:harbor-rhythm:${earned.harborDay}`);
      await page.reload();
      await expect(harborCard.locator('[data-badge="once"]')).toHaveText('5 Stamps, once');
      await expect(harborCard.locator('[data-source]')).toContainText(`play:${earned.harborNonce}`);

      expect((await (await page.request.get('/api/town/stamps')).json()).balance).toBe(22);
      await expect(journal).not.toContainText('First lift PR');
      await expect(journal).not.toContainText('Two plates');
      await expect(journal).not.toContainText('mmHg');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      expect(await journal.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
      const scan = await new AxeBuilder({ page }).include('app-hall-journal').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      await info.attach(`journal-${width}-${theme}`, { body: await journal.screenshot(), contentType: 'image/png' });
      expect(writes).toEqual([]);
      expect(await lifeSnapshot(request)).toBe(beforeLife);
    });
  }

  for (const [width, theme, touch] of [[390, 'dark', true], [1280, 'light', false]] as const) {
    test(`an empty account reads every collection at ${width} ${theme}`, async ({ page, request }) => {
      expect((await request.post('/e2e/reset?seed=town-empty')).ok()).toBeTruthy();
      const beforeLife = await lifeSnapshot(request);
      const writes: string[] = [];
      page.on('request', seen => {
        if (journalWrite(seen)) writes.push(`${seen.method()} ${new URL(seen.url()).pathname}`);
      });
      await page.setViewportSize({ width, height: touch ? 844 : 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(chosen => localStorage.setItem('suite-theme', chosen), theme);
      await page.goto('/town/hall/journal');
      const journal = page.locator('app-hall-journal');
      await expect(journal.getByRole('heading', { level: 1, name: 'Hall journal' })).toBeVisible();
      for (const id of ['chapters', 'discoveries', 'friendship', 'arcade']) {
        await expect(journal.locator(`[data-collection="${id}"]`)).toContainText('0 earned.');
      }
      await expect(journal.locator('[data-badge]')).toHaveCount(0);
      for (const [name, count] of [['Chapters', 6], ['Discoveries', 12], ['Friendship', 6], ['Arcade', 2]] as const) {
        await activate(page, journal.getByRole('link', { name, exact: true }), touch);
        await expect(journal.locator('[data-record]')).toHaveCount(count);
        await expect(journal.locator('[data-badge]')).toHaveCount(0);
        await expect(journal.locator('[data-earned="true"]')).toHaveCount(0);
        await activate(page, journal.getByRole('link', { name: 'Journal', exact: true }), touch);
      }
      expect(writes).toEqual([]);
      expect(await lifeSnapshot(request)).toBe(beforeLife);
    });
  }
});
