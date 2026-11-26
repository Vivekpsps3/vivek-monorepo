import AxeBuilder from '@axe-core/playwright';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from '../../../tests/e2e/synthetic-vault-harness';
import { expect, test, type Locator, type Page } from '../../../tests/e2e/fixtures';

const NOTE = 'Synthetic review note QX';
const EDITED = 'Synthetic review note QX edited';
const NEXT_NOTE = 'Synthetic next week QX';
const LINK = 'https://example.com/synthetic-review';
const WEEK = '2026-12-28';
const NEXT = '2027-01-04';
const EARLIER = '2026-12-21';

async function target(locator: Locator): Promise<void> {
  await expect.poll(async () => (await locator.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
}

async function activate(page: Page, locator: Locator, touch: boolean): Promise<void> {
  await expect(locator).toBeVisible();
  if (touch) {
    await locator.tap();
    return;
  }
  await expect(locator).toBeEnabled();
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
      await expect(room.getByRole('link', { name: 'Hub', exact: true })).toHaveAttribute('href', '/hub');
      await expect(room).toContainText('This week ends today. Saving is optional and does not change Town.');
      const motion = await room.locator('.review').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(motion).toBe('0s');
      for (const locator of [
        room.getByRole('link', { name: 'Hub', exact: true }),
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

      await room.getByRole('combobox', { name: 'Saved weeks' }).selectOption(WEEK);
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
    test('keeps a draft until a guarded exit is approved', async ({ page, request }, info) => {
      const touch = width === 390;
      expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
      await page.clock.setFixedTime(new Date('2027-01-03T20:00:00Z'));
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      const weeks = Array.from({ length: 52 }, (_, index) => ({
        v: 1,
        week: new Date(Date.UTC(2026, 11, 21 - 7 * index)).toISOString().slice(0, 10),
        focus: ['', '', ''], note: 'Synthetic history', obsidian: null,
      }));
      const vault = await syntheticVault(page, { town_reviews: weeks });
      await page.goto('/hub');
      await activate(page, page.getByRole('link', { name: 'Weekly review', exact: true }), touch);
      await unlock(page, touch);

      const room = page.locator('app-weekly-review');
      const focus = room.getByRole('textbox', { name: 'Focus 1' });
      const note = room.getByRole('textbox', { name: 'Note' });
      const reference = room.getByRole('textbox', { name: 'Obsidian link' });
      const history = room.getByRole('combobox', { name: 'Saved weeks' });
      const save = room.getByRole('button', { name: 'Save', exact: true });
      for (const control of [history, focus, note, save]) {
        await target(control);
        await expect(control).toBeInViewport({ ratio: 1 });
      }
      await expect(history.locator('option')).toHaveCount(53);
      await info.attach('compact-history', { body: await page.screenshot(), contentType: 'image/png' });

      await focus.fill('Synthetic focus');
      await note.fill(NOTE);
      await reference.fill(LINK);
      const leave = page.getByRole('dialog', { name: 'Leave this week?' });
      const stay = leave.getByRole('button', { name: 'Stay' });
      const discard = leave.getByRole('button', { name: 'Discard and leave' });
      const hub = room.getByRole('link', { name: 'Hub', exact: true });
      const earlier = room.getByRole('button', { name: 'Earlier' });
      const assertStayed = async (control: Locator) => {
        await expect(leave).toBeHidden();
        await expect(page).toHaveURL('/town/review?week=' + WEEK);
        await expect(focus).toHaveValue('Synthetic focus');
        await expect(note).toHaveValue(NOTE);
        await expect(reference).toHaveValue(LINK);
        await expect(control).toBeFocused();
      };

      await activate(page, earlier, touch);
      await expect(stay).toBeFocused();
      if (!touch) {
        await page.keyboard.press('Shift+Tab');
        await expect(discard).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(stay).toBeFocused();
      }
      await activate(page, stay, touch);
      await assertStayed(earlier);

      await history.focus();
      await history.selectOption(EARLIER);
      await activate(page, stay, touch);
      await assertStayed(history);
      await expect(history).toHaveValue('');

      await activate(page, hub, touch);
      await expect(stay).toBeFocused();
      await info.attach('leave-confirmation', { body: await page.screenshot(), contentType: 'image/png' });
      await page.keyboard.press('Escape');
      await assertStayed(hub);

      const switcher = page.getByRole('button', { name: /Switch apps and destinations/ });
      await activate(page, switcher, touch);
      const travel = page.getByRole('group', { name: 'App destinations' }).getByRole('link', { name: 'Travel', exact: true });
      await activate(page, travel, touch);
      await activate(page, stay, touch);
      await assertStayed(switcher);

      await note.focus();
      await page.evaluate(() => window.history.back());
      await activate(page, stay, touch);
      await assertStayed(note);
      await expect(hub).toHaveAttribute('href', '/hub');
      if (!touch) {
        const confirmation = page.waitForEvent('dialog', { timeout: 5_000 });
        await page.evaluate(() => window.setTimeout(() => window.location.reload(), 0));
        const nativePrompt = await confirmation;
        expect(nativePrompt.type()).toBe('beforeunload');
        await nativePrompt.dismiss();
        await assertStayed(note);
      }
      expect(vault.data('town_reviews')).toHaveLength(52);

      await activate(page, earlier, touch);
      await activate(page, discard, touch);
      await expect(page).toHaveURL('/town/review?week=' + EARLIER);
      await expect(note).toHaveValue('Synthetic history');
      await page.evaluate(() => window.history.back());
      await expect(page).toHaveURL('/town/review?week=' + WEEK);
      await expect(note).toHaveValue('');
      await page.evaluate(() => window.history.forward());
      await expect(page).toHaveURL('/town/review?week=' + EARLIER);

      await note.fill(EDITED);
      await activate(page, save, touch);
      await expect(room).toContainText('Saved.');
      await activate(page, hub, touch);
      await expect(page).toHaveURL('/hub');
      await expect(page.getByRole('dialog', { name: 'Leave this week?' })).toHaveCount(0);
      expect(vault.data('town_reviews').find(row => row.week === EARLIER)?.note).toBe(EDITED);

      await page.goto('/town/hall?object=rules');
      await activate(page, page.getByRole('link', { name: 'Weekly review', exact: true }), touch);
      const hall = room.getByRole('link', { name: 'Hall', exact: true });
      await expect(hall).toHaveAttribute('href', '/town/hall?object=rules');
      await history.selectOption(EARLIER);
      await expect(note).toHaveValue(EDITED);
      await page.reload();
      await expect(note).toHaveValue(EDITED);
      await expect(hall).toHaveAttribute('href', '/town/hall?object=rules');
      await note.fill(NEXT_NOTE);
      await activate(page, hall, touch);
      await activate(page, discard, touch);
      await expect(page).toHaveURL('/town/hall?object=rules');

      await page.goto('/town/review?week=' + EARLIER);
      await expect(note).toHaveValue(EDITED);
      await expect(hall).toHaveAttribute('href', '/town/hall');
    });

    test('clears drafts and held writes when another tab locks or signs out', async ({ page, request }) => {
      const touch = width === 390;
      expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      const vault = await syntheticVault(page, { town_reviews: [{
        v: 1, week: WEEK, focus: ['', '', ''], note: NOTE, obsidian: null,
      }] });
      await page.goto('/town/review?week=' + WEEK);
      await unlock(page, touch);
      const room = page.locator('app-weekly-review');
      const note = room.getByRole('textbox', { name: 'Note' });
      await expect(note).toHaveValue(NOTE);
      const peer = await page.context().newPage();
      await peer.goto('/settings/finance');
      const lock = peer.getByRole('button', { name: 'Lock Finance', exact: true });
      await expect(lock).toBeEnabled();

      await note.fill(EDITED);
      vault.holdNextUpserts();
      try {
        await activate(page, room.getByRole('button', { name: 'Save', exact: true }), touch);
        await expect.poll(() => vault.mutations.filter(item => item.path.endsWith('/upsert')).length).toBe(1);
        expect(vault.mutations[0].body.records[0].expected_revision).toBe(1);
        await activate(page, room.getByRole('link', { name: 'Hall', exact: true }), touch);
        await expect(page.getByRole('dialog', { name: 'Leave this week?' })).toContainText('A change is in progress');
        vault.failNextWrites();
        await lock.click();
        await expect(room).toHaveAttribute('data-review-state', 'locked');
        await expect(room.locator('[data-review-marker]')).toHaveCount(0);
        await expect(page.getByRole('dialog', { name: 'Leave this week?' })).toHaveCount(0);
        await expect(room).not.toContainText(EDITED);
        await expect(page).toHaveURL('/town/review?week=' + WEEK);
      } finally {
        vault.releaseHeldUpserts();
      }

      await unlock(page, touch);
      await expect(note).toHaveValue(NOTE);
      await note.fill(NEXT_NOTE);
      await activate(page, room.getByRole('link', { name: 'Hall', exact: true }), touch);
      await expect(page.getByRole('dialog', { name: 'Leave this week?' })).toBeVisible();
      await peer.locator('.user-menu-toggle').click();
      await peer.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page).toHaveURL(/\/(?:auth\/)?login(?:[?#]|$)/);
      await expect(page.locator('[data-review-marker]')).toHaveCount(0);
      await expect(page.getByRole('dialog', { name: 'Leave this week?' })).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText(NEXT_NOTE);
      expect(vault.data('town_reviews').map(row => row.note)).toEqual([NOTE]);
    });

  });
}

test('weekly review controls reflow at 320px with 200% text', async ({ page, request }, info) => {
  expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(() => localStorage.setItem('suite-theme', 'light'));
  await syntheticVault(page, { town_reviews: [{
    v: 1, week: EARLIER, focus: ['', '', ''], note: 'Synthetic history', obsidian: null,
  }] });
  await page.goto('/town/review?week=' + WEEK);
  await unlock(page, false);
  await page.locator('html').evaluate(root => { root.style.fontSize = '200%'; });
  const room = page.locator('app-weekly-review');
  const history = room.getByRole('combobox', { name: 'Saved weeks' });
  const note = room.getByRole('textbox', { name: 'Note' });
  const save = room.getByRole('button', { name: 'Save', exact: true });
  const inBounds = async (control: Locator) => {
    await target(control);
    const box = await control.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? Infinity) + (box?.width ?? Infinity)).toBeLessThanOrEqual(320);
  };
  for (const control of [history, note, save]) await inBounds(control);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await info.attach('enlarged-review', { body: await page.screenshot(), contentType: 'image/png' });
  await note.fill(NOTE);
  const earlier = room.getByRole('button', { name: 'Earlier' });
  await activate(page, earlier, false);
  const leave = page.getByRole('dialog', { name: 'Leave this week?' });
  const stay = leave.getByRole('button', { name: 'Stay' });
  await expect(stay).toBeFocused();
  await inBounds(stay);
  await inBounds(leave.getByRole('button', { name: 'Discard and leave' }));
  await info.attach('enlarged-confirmation', { body: await page.screenshot(), contentType: 'image/png' });
  await stay.press('Enter');
  await expect(earlier).toBeFocused();
  await expect(note).toHaveValue(NOTE);
});

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
