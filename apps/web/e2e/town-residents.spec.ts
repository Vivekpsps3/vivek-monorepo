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
      await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), touch);
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
      await activate(page, residents.getByRole('button', { name: 'Finish talk', exact: true }), touch);
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
    await residents.getByRole('button', { name: 'Finish talk', exact: true }).click();
    await expect(residents.locator('article[data-resident="mara"]')).toHaveAttribute('data-rank', '1');
    await residents.getByRole('button', { name: 'Talk about How this place works', exact: true }).click();
    await residents.getByRole('button', { name: 'Finish talk', exact: true }).click();
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
    await residents.locator('#dialogue-note').fill('Synthetic session note');
    await residents.getByRole('button', { name: 'Finish talk', exact: true }).click();
    await expect(residents.getByRole('button', { name: 'Retry talk', exact: true })).toBeVisible();
    await expect(residents.locator('#dialogue-note')).toHaveValue('Synthetic session note');
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
});
