import AxeBuilder from '@axe-core/playwright';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from '../../../tests/e2e/synthetic-vault-harness';
import { expect, test, type Locator, type Page } from '../../../tests/e2e/fixtures';

const NOTE = 'Synthetic review note QX';
const EDITED = 'Synthetic review note QX edited';
const NEXT_NOTE = 'Synthetic next week QX';
const LINK = 'https://example.com/synthetic-review';
const WEEK = '2026-12-28';
const NEXT = '2027-01-04';

async function target(locator: Locator): Promise<void> {
  await expect.poll(async () => (await locator.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
}

async function activate(page: Page, locator: Locator, touch: boolean): Promise<void> {
  await expect(locator).toBeVisible();
  if (touch) {
    await locator.tap();
    return;
  }
  await locator.focus();
  await page.keyboard.press('Enter');
}

async function unlock(page: Page, touch: boolean): Promise<void> {
  const room = page.locator('app-weekly-review');
  await expect(room).toHaveAttribute('data-review-state', 'locked');
  await expect(page).toHaveURL(url => url.pathname === '/town/review' && url.searchParams.get('week') === WEEK);
  expect(await room.innerText()).not.toContain(NOTE);
  await expect(room.locator('[data-review-marker]')).toHaveCount(0);
  const link = room.getByRole('link', { name: 'Unlock', exact: true });
  await target(link);
  await activate(page, link, touch);
  await expect(page).toHaveURL(url => url.pathname === '/finance/vault/unlock' && url.searchParams.get('next') === `/town/review?week=${WEEK}`);
  await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/town/review' && url.searchParams.get('week') === WEEK, { timeout: 90_000 });
  await expect(room).toHaveAttribute('data-review-state', 'ready', { timeout: 90_000 });
}

async function vaultCall(page: Page, path: string, init?: { method?: string; body?: unknown }): Promise<Record<string, unknown>> {
  return page.evaluate(async ({ path, init }) => {
    const response = await fetch(path, {
      method: init?.method ?? 'GET',
      headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${path} ${text}`);
    return text ? JSON.parse(text) : {};
  }, { path, init: init ?? null });
}

for (const [width, height, theme] of [[390, 844, 'dark'], [390, 844, 'light'], [1280, 800, 'dark'], [1280, 800, 'light']] as const) {
  test.describe(`weekly review at ${width} ${theme}`, () => {
    test.describe.configure({ timeout: 180_000 });
    test.use({
      viewport: { width, height },
      hasTouch: width === 390,
      timezoneId: 'America/Los_Angeles',
    });

    test('Hub opens one editor and the ISO week keeps its schema', async ({ page, request }) => {
      const touch = width === 390;
      expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
      await page.clock.setFixedTime(new Date('2027-01-03T20:00:00Z'));
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      const townWrites: string[] = [];
      page.on('request', req => {
        const path = new URL(req.url()).pathname;
        if (!page.url().includes('/town/review') || !path.startsWith('/api/town')) return;
        townWrites.push(`${req.method()} ${path}`);
      });
      const vault = await syntheticVault(page, {});
      await page.goto('/hub');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const shortcuts = page.getByRole('navigation', { name: 'Shortcuts' });
      const hubLink = shortcuts.getByRole('link', { name: 'Weekly review', exact: true });
      await expect(page.getByRole('link', { name: 'Weekly review', exact: true })).toHaveCount(1);
      await expect(hubLink).toHaveAttribute('href', '/town/review');
      expect(await page.locator('body').innerText()).not.toContain(NOTE);
      await activate(page, hubLink, touch);

      const room = page.locator('app-weekly-review');
      await unlock(page, touch);
      await expect(page).toHaveTitle(/Weekly review/);
      await expect(room.getByRole('link', { name: 'Hall', exact: true })).toHaveAttribute('href', '/town/hall');
      await expect(room).toContainText('This week ends today. Saving is optional and does not change Town.');
      const motion = await room.locator('.review').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(motion).toBe('0s');
      for (const locator of [
        room.getByRole('link', { name: 'Hall', exact: true }),
        room.locator('#review-focus-1'),
        room.locator('#review-note'),
        room.locator('#review-obsidian'),
        room.getByRole('button', { name: 'Save', exact: true }),
        room.getByRole('button', { name: 'Later', exact: true }),
      ]) await target(locator);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const scan = await new AxeBuilder({ page }).include('app-weekly-review').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);

      await room.locator('#review-focus-1').fill('Synthetic focus');
      await room.locator('#review-note').fill(NOTE);
      await room.locator('#review-obsidian').fill(LINK);
      await expect(room.locator('a.reference')).toHaveAttribute('href', LINK);
      await expect(room.locator('a.reference')).not.toContainText(NOTE);
      await activate(page, room.getByRole('button', { name: 'Save', exact: true }), touch);
      await expect(room).toContainText('Saved.');
      expect(vault.data('town_reviews')).toEqual([{
        v: 1, week: WEEK, focus: ['Synthetic focus', '', ''], note: NOTE, obsidian: LINK,
      }]);
      expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(NOTE);

      await room.locator('#review-note').fill(EDITED);
      await activate(page, room.getByRole('button', { name: 'Save', exact: true }), touch);
      await expect.poll(() => vault.data('town_reviews')[0]?.note).toBe(EDITED);
      await activate(page, room.getByRole('button', { name: 'Later', exact: true }), touch);
      await expect(page).toHaveURL(url => url.searchParams.get('week') === NEXT);
      await expect(room).not.toContainText('This week ends today.');
      await room.locator('#review-note').fill(NEXT_NOTE);
      await activate(page, room.getByRole('button', { name: 'Save', exact: true }), touch);
      await expect.poll(() => vault.data('town_reviews').map(item => item.week).sort()).toEqual([WEEK, NEXT]);
      await page.reload();
      await expect(room).toHaveAttribute('data-review-state', 'ready', { timeout: 90_000 });
      await expect(room.locator('#review-note')).toHaveValue(NEXT_NOTE);
      expect(vault.data('town_reviews').map(item => item.note).sort()).toEqual([NEXT_NOTE, EDITED]);

      await activate(page, room.getByRole('button', { name: WEEK, exact: true }), touch);
      await expect(room.locator('#review-note')).toHaveValue(EDITED);
      await activate(page, room.getByRole('button', { name: 'Delete', exact: true }), touch);
      const dialog = page.getByRole('dialog', { name: 'Delete this week' });
      await expect(dialog).toBeVisible();
      await expect(dialog).not.toContainText(EDITED);
      await activate(page, dialog.getByRole('button', { name: 'Delete', exact: true }), touch);
      await expect.poll(() => vault.data('town_reviews').map(item => item.week)).toEqual([NEXT]);
      expect(townWrites).toEqual([]);

      await page.goto('/hub');
      await expect(page.getByRole('link', { name: 'Weekly review', exact: true })).toHaveCount(1);
      await expect(shortcuts.getByRole('link', { name: 'Weekly review', exact: true })).toHaveCount(1);
      expect(await page.locator('body').innerText()).not.toContain(EDITED);
      expect(await page.locator('body').innerText()).not.toContain(NEXT_NOTE);
      const editPins = shortcuts.getByRole('button', { name: 'Edit pins', exact: true });
      if (touch) await editPins.tap();
      else await editPins.press('Enter');
      const pins = page.getByRole('dialog', { name: 'Edit pins' });
      const pin = pins.getByRole('button', { name: 'Weekly review', exact: true });
      if (touch) await pin.tap();
      else await pin.press('Space');
      await expect(pin).toHaveAttribute('aria-pressed', 'true');
      const done = pins.getByRole('button', { name: 'Done', exact: true });
      if (touch) await done.tap();
      else await done.press('Enter');
      await expect(pins).toBeHidden();
      const pinned = shortcuts.getByRole('link', { name: 'Weekly review', exact: true });
      await expect(pinned).toHaveCount(1);
      await expect(pinned).toHaveAttribute('href', '/town/review');
      if (touch) await pinned.tap();
      else await pinned.press('Enter');
      await expect(room).toHaveAttribute('data-review-state', 'ready', { timeout: 90_000 });
      await expect(room.locator('#review-note')).toHaveValue('');
      expect(await page.locator('body').innerText()).not.toContain(NEXT_NOTE);

      await page.goto('/settings/finance');
      await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
      await page.goto(`/town/review?week=${WEEK}`);
      await expect(room).toHaveAttribute('data-review-state', 'locked', { timeout: 90_000 });
      await expect(room.locator('[data-review-marker]')).toHaveCount(0);
      expect(await room.innerText()).not.toContain(EDITED);
      expect(await room.innerText()).not.toContain(NEXT_NOTE);
      expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(EDITED);
    });
  });
}

test.describe('weekly review restore', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 1280, height: 800 }, timezoneId: 'America/Los_Angeles' });

  test('restores the saved week under the current owner', async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2027-01-03T20:00:00Z'));
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'light'));
    const vault = await syntheticVault(page, {});
    await page.goto(`/town/review?week=${WEEK}`);
    await unlock(page, false);
    const room = page.locator('app-weekly-review');
    await room.locator('#review-note').fill(NOTE);
    await room.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => vault.data('town_reviews')).toEqual([
      { v: 1, week: WEEK, focus: ['', '', ''], note: NOTE, obsidian: null },
    ]);
    const backup = await vaultCall(page, '/api/vault/recovery-snapshot');
    await room.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete this week' }).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => vault.data('town_reviews')).toEqual([]);
    const current = await vaultCall(page, '/api/vault/recovery-snapshot');
    const counts: Record<string, number> = {};
    const backupRecords = backup['records'] as Array<{ collection: string }>;
    for (const row of current['collections'] as Array<{ collection: string }>) {
      counts[row.collection] = backupRecords.filter(item => item.collection === row.collection).length;
    }
    const stage = await vaultCall(page, '/api/vault/restore/stages', {
      method: 'POST',
      body: {
        source_hash: 'a'.repeat(64),
        base_fingerprint: current['fingerprint'],
        mode: 'replace',
        key_version: 1,
        expected_counts: counts,
        batch_count: 1,
      },
    });
    await vaultCall(page, `/api/vault/restore/stages/${stage['id']}/batches`, {
      method: 'PUT',
      body: {
        batch_index: 0,
        records: (backup['records'] as Array<Record<string, unknown>>).map(row => ({
          collection: row['collection'],
          client_id: row['client_id'],
          ciphertext_b64: row['ciphertext_b64'],
          schema_version: row['schema_version'],
          key_version: row['key_version'],
          expected_revision: null,
          indexes: [],
        })),
      },
    });
    await vaultCall(page, `/api/vault/restore/stages/${stage['id']}/activate`, {
      method: 'POST',
      body: { confirmation: 'REPLACE' },
    });
    await page.reload();
    await expect(room).toHaveAttribute('data-review-state', 'ready', { timeout: 90_000 });
    await expect(room.locator('#review-note')).toHaveValue(NOTE);
    expect(vault.data('town_reviews')).toEqual([
      { v: 1, week: WEEK, focus: ['', '', ''], note: NOTE, obsidian: null },
    ]);
  });
});
