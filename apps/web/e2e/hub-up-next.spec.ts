import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';

import { reminder, event, travel, summary, mediaEvent, sources } from './hub-fixtures';

test.beforeEach(async ({ page, request }) => {
  expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
  await page.clock.setFixedTime(new Date('2026-12-25T20:00:00Z'));
});

test('one set of source reads feeds the cards and filtered list across a year boundary', async ({ page }) => {
  const calls = await sources(page);
  const forbidden: string[] = [];
  page.on('request', request => { if (/\/calendar\/refresh|tmdb|musicbrainz|geocod/i.test(request.url())) forbidden.push(request.url()); });
  await page.goto('/hub');
  const next = page.getByRole('region', { name: 'Up next' });
  await expect(next.getByRole('link', { name: 'Check in' })).toBeVisible();
  await expect(next.getByRole('link', { name: 'Premiere' })).toBeVisible();
  await expect(next.locator('.event-link')).toHaveCount(3);
  await expect(next.getByRole('link', { name: 'Finale' })).toHaveCount(0);
  await expect(next).toContainText('Overdue');
  await expect(next).toContainText('Bills hidden: Finance is locked');
  await expect(page.getByRole('region', { name: 'In progress' })).toContainText('Example series');
  await expect(page.getByRole('region', { name: 'Next trip' })).toContainText('Kyoto');
  const filter = next.getByRole('button', { name: 'Travel', exact: true });
  await filter.focus(); await page.keyboard.press('Space');
  await expect(filter).toHaveAttribute('aria-pressed', 'false');
  await expect(next.getByRole('link', { name: 'Check in' })).toHaveCount(0);
  await expect(next.getByRole('link', { name: 'Premiere' })).toBeVisible();
  await expect(next.getByRole('link', { name: 'Finale' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(next.getByRole('link', { name: 'Check in' })).toBeVisible();
  expect(calls.sort()).toEqual(['2026-12', '2027-01', 'media', 'travel']);
  expect(forbidden).toEqual([]);
});

test('reminder failure rolls back, retry sends the full replacement and Undo preserves it', async ({ page }) => {
  await sources(page);
  const bodies: unknown[] = [];
  await page.route('**/travel/api/reminders/7', route => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: bodies.length === 1 ? 503 : 200, json: {} });
  });
  await page.goto('/hub');
  const next = page.getByRole('region', { name: 'Up next' });
  const done = next.getByRole('button', { name: 'Mark Check in done' });
  await done.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Couldn\'t mark "Check in" done. Try again.');
  await expect(done).toBeEnabled();
  await done.click();
  await expect(next.locator('li.done')).toContainText('Check in');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(done).toBeEnabled();
  await expect(next.locator('li.done')).toHaveCount(0);
  const { id: _id, ...body } = reminder;
  expect(bodies).toEqual([{ ...body, done: true }, { ...body, done: true }, body]);
});

test('a failed source retries alone while Travel actions remain usable', async ({ page }) => {
  const calls = await sources(page);
  let reads = 0;
  await page.route('**/media/api/summary', route => { calls.push('media'); reads += 1; return route.fulfill({ status: reads === 1 ? 503 : 200, json: summary }); });
  await page.goto('/hub');
  const next = page.getByRole('region', { name: 'Up next' });
  await expect(next.getByRole('link', { name: 'Check in' })).toBeVisible();
  await expect(next).toContainText("Couldn't load Media dates.");
  await next.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(next.getByRole('link', { name: 'Premiere' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'In progress' })).toContainText('Example series');
  expect(calls.filter(call => call === 'travel')).toHaveLength(1);
  expect(calls.filter(call => call === 'media')).toHaveLength(2);
  expect(calls.filter(call => call === '2026-12')).toHaveLength(2);
  expect(calls.filter(call => call === '2027-01')).toHaveLength(2);
});

test('the existing episode action refreshes the shared Media snapshot and removes watched dates', async ({ page }) => {
  const calls = await sources(page);
  let watched = false;
  await page.route('**/media/api/summary', route => {
    calls.push('media');
    return route.fulfill({ json: { ...summary, next_episodes: watched ? [] : [{ entry_id: 4, episode_id: 1,
      show_title: 'Example series', season: 1, episode: 1, state: 'next', air_date: '2026-12-25' }] } });
  });
  await page.route('**/media/api/calendar?*', route => {
    const month = new URL(route.request().url()).searchParams.get('month')!;
    calls.push(month);
    return route.fulfill({ json: { days: month === '2026-12' ? [{ date: '2026-12-25', events: [{ ...mediaEvent('Premiere'), watched }] }] : [] } });
  });
  await page.route('**/media/api/entries/4/episodes/next', route => {
    watched = true;
    return route.fulfill({ json: { marked: { episode_id: 1, season_number: 1, episode_number: 1, title: 'Premiere', label: 'S1E1' }, show: { next_episode: null } } });
  });
  await page.goto('/hub');
  const next = page.getByRole('region', { name: 'Up next' });
  await expect(next.getByRole('link', { name: 'Premiere' })).toBeVisible();
  await page.getByRole('region', { name: 'In progress' }).getByRole('button', { name: 'Watched S1E1' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' })).toBeVisible();
  await expect(next.getByRole('link', { name: 'Premiere' })).toHaveCount(0);
  await expect(next.getByRole('link', { name: 'Check in' })).toBeVisible();
  expect(calls.filter(call => call === 'travel')).toHaveLength(1);
  for (const source of ['media', '2026-12', '2027-01']) expect(calls.filter(call => call === source)).toHaveLength(2);
});

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`compact Hub actions and states at ${width} ${theme}`, async ({ page, request }, info) => {
      const height = width === 390 ? 844 : 800;
      await page.setViewportSize({ width, height });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await sources(page);
      await page.goto('/hub');
      const next = page.getByRole('region', { name: 'Up next' });
      await expect(next.getByRole('link', { name: 'Check in' })).toBeVisible();
      await expect(page.locator('.pixel-strip .pixel')).toHaveCount(91);
      const shortcuts = page.getByRole('navigation', { name: 'Shortcuts' });
      await expect(shortcuts.getByRole('listitem')).toHaveCount(7);
      await expect(shortcuts).toContainText('Health');
      await expect(shortcuts.getByRole('link', { name: 'Holdings' })).toHaveAttribute('href', '/finance/have?t=holdings');
      await expect(shortcuts.getByRole('link', { name: 'Trips' })).toHaveAttribute('href', '/travel');
      await expect(shortcuts.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/media/library');
      await expect(shortcuts.getByRole('link', { name: 'Pixels' })).toHaveAttribute('href', '/pixels');
      await expect(shortcuts.getByRole('link', { name: 'Town' })).toHaveAttribute('href', '/town');
      await expect(shortcuts.getByRole('link', { name: 'Weekly review', exact: true })).toHaveCount(1);
      await expect(shortcuts.getByRole('link', { name: 'Weekly review', exact: true })).toHaveAttribute('href', '/town/review');
      const firstScreen = [page.getByRole('button', { name: 'Quick add' }), next.locator('.event-link').last(), shortcuts.getByRole('link', { name: 'Town' })];
      for (const control of firstScreen) {
        const box = (await control.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.y + box.height).toBeLessThanOrEqual(height);
      }
      const town = page.locator('.town-bar');
      await expect(town.locator('details')).not.toHaveAttribute('open');
      await expect(town.locator('img')).toHaveCount(2);
      expect(await town.locator('.town-preview').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      for (const control of [next.getByRole('button', { name: 'Mark Check in done' }), page.getByRole('link', { name: 'Open Travel', exact: true }), page.getByRole('link', { name: 'Open Media', exact: true }), page.getByRole('link', { name: 'Open Finance', exact: true })]) {
        const box = await control.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await info.attach(`hub-up-next-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      const preview = town.locator('.town-preview');
      await preview.scrollIntoViewIfNeeded();
      await expect.poll(() => preview.locator('img').evaluateAll(images =>
        images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
      await info.attach(`hub-town-preview-${width}-${theme}`, { body: await town.screenshot(), contentType: 'image/png' });
      expect((await request.post('/e2e/reset?seed=pixels-empty')).ok()).toBeTruthy();
      await page.route('**/travel/api/summary?*', route => route.fulfill({ json: { today: '2026-12-25', next_trip: null, up_next: [] } }));
      await page.route('**/media/api/summary', route => route.fulfill({ json: { currently: [], upcoming: [], recent_reviews: [], next_episodes: [] } }));
      await page.route('**/media/api/calendar?*', route => route.fulfill({ json: { days: [] } }));
      await page.reload();
      await expect(page.getByRole('region', { name: 'Next trip' })).toContainText('No trips yet');
      await expect(page.getByRole('region', { name: 'In progress' })).toContainText('Nothing in progress');
      await expect(page.locator('.compact-locked')).toContainText('Finance is locked');
      expect((await page.getByRole('region', { name: 'Net worth' }).boundingBox())!.height).toBeLessThan(215);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await info.attach(`hub-empty-${width}-${theme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    });
  }
}

test('agenda reuses source months, preserves URL history and offers keyboard date navigation', async ({ page }) => {
  const calls = await sources(page);
  await page.goto('/hub');
  await expect(page.getByRole('region', { name: 'Up next' }).getByRole('link', { name: 'Premiere' })).toBeVisible();
  await page.getByRole('link', { name: 'Explore agenda' }).click();
  const agenda = page.getByRole('region', { name: 'Agenda', exact: true });
  await expect(agenda.getByRole('link', { name: 'Premiere' })).toBeVisible();
  expect(calls.filter(call => call === 'media')).toHaveLength(1);
  expect(calls.filter(call => call === '2026-12')).toHaveLength(1);
  await agenda.getByRole('button', { name: 'December 25, 1 event', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#agenda-2026-12-25')).toBeFocused();
  await agenda.getByRole('button', { name: 'Travel', exact: true }).click();
  await expect(page).toHaveURL(/sources=media/);
  await expect(agenda.getByRole('link', { name: 'Check in' })).toHaveCount(0);
  await agenda.getByRole('button', { name: 'Next month' }).click();
  await expect(page).toHaveURL(/date=2027-01-01/);
  await expect(agenda.getByRole('link', { name: 'Finale' })).toBeVisible();
  await page.goBack();
  await expect(agenda.getByRole('heading', { name: 'December 2026' })).toBeVisible();
  await expect(agenda.getByRole('button', { name: 'Travel', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.goForward(); await page.reload();
  await expect(agenda.getByRole('link', { name: 'Finale' })).toBeVisible();
  await expect(agenda.getByRole('button', { name: 'Travel', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(new URL(page.url()).searchParams.get('sources')).toBe('media');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('recent notes and long show titles stay inside the Media card at phone and desktop widths', async ({ page }) => {
  await sources(page);
  const title = 'LongShowTitle'.repeat(15);
  const note = 'UnbrokenNote'.repeat(50);
  await page.route('**/media/api/summary', route => route.fulfill({ json: { ...summary, currently: [], recent_reviews: [{ id: 4, kind: 'tv', title, review_excerpt: note }] } }));
  await page.goto('/hub');
  const card = page.getByRole('region', { name: 'In progress' });
  await expect(card.getByText(note, { exact: true })).toBeHidden();
  await card.locator('summary', { hasText: 'Recent notes' }).click();
  await expect(card.getByText(note, { exact: true })).toBeVisible();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await card.evaluate(node => {
      const box = node.getBoundingClientRect();
      return [...node.querySelectorAll('.media-notes li, .media-notes a, .media-notes strong')].every(child => {
        const rect = child.getBoundingClientRect();
        return rect.left >= box.left && rect.right <= box.right && child.scrollWidth <= child.clientWidth + 1;
      });
    })).toBe(true);
  }
});

test('pins reorder shortcuts, survive reload and reset from the keyboard', async ({ page }) => {
  await sources(page);
  await page.goto('/hub');
  const shortcuts = page.getByRole('navigation', { name: 'Shortcuts' });
  const edit = shortcuts.getByRole('button', { name: 'Edit pins' });
  const links = shortcuts.getByRole('link');
  const dialog = page.getByRole('dialog', { name: 'Edit pins' });
  const defaults = ['Holdings', 'Trips', 'Library', 'Health', 'Pixels', 'Town', 'Weekly review'];
  await expect(links).toHaveText(defaults);
  await edit.press('Enter');
  await expect(dialog.getByRole('button', { name: 'Holdings' })).toBeFocused();
  for (const name of ['Town', 'Pixels', 'Library']) {
    const pin = dialog.getByRole('button', { name, exact: true });
    await pin.press('Space');
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(dialog.getByRole('button', { name: 'Trips' })).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
  await expect(links).toHaveText(['Town', 'Pixels', 'Library', 'Holdings', 'Trips', 'Health', 'Weekly review']);
  await page.reload();
  await expect(links).toHaveText(['Town', 'Pixels', 'Library', 'Holdings', 'Trips', 'Health', 'Weekly review']);
  await edit.press('Enter');
  await dialog.getByRole('button', { name: 'Reset pins' }).press('Enter');
  await dialog.getByRole('button', { name: 'Done' }).press('Enter');
  await expect(edit).toBeFocused();
  await expect(links).toHaveText(defaults);
  await page.reload();
  await expect(links).toHaveText(defaults);
});

test.describe('compact Hub on touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('opens a shortcut and returns to Hub, then opens a dated source link', async ({ page, request }) => {
    const title = 'Synthetic premiere series';
    const created = await request.post('/media/api/library', { data: { kind: 'tv', title } });
    expect(created.ok(), await created.text()).toBeTruthy();
    const { id } = await created.json() as { id: number };
    const destination = '/media/item/' + id;
    await sources(page);
    await page.route('**/media/api/calendar?*', route => route.fulfill({
      json: { days: [{ date: '2026-12-25', events: [{ ...mediaEvent('Premiere'), entry_id: id }] }] },
    }));
    await page.goto('/hub');
    const shortcuts = page.getByRole('navigation', { name: 'Shortcuts' });
    await shortcuts.getByRole('link', { name: 'Town', exact: true }).tap();
    await expect(page).toHaveURL(/\/town$/);
    await page.goBack();
    await expect(shortcuts.getByRole('link', { name: 'Town', exact: true })).toBeVisible();
    const next = page.getByRole('region', { name: 'Up next' });
    await next.getByRole('link', { name: 'Explore agenda' }).tap();
    const agenda = page.getByRole('region', { name: 'Agenda', exact: true });
    await agenda.getByRole('button', { name: 'Travel', exact: true }).tap();
    const premiere = agenda.getByRole('link', { name: 'Premiere' });
    await expect(premiere).toHaveAttribute('href', destination);
    await premiere.tap();
    await expect(page).toHaveURL(url => url.pathname === destination);
    const detailTitle = page.getByRole('heading', { name: title, exact: true });
    await expect(detailTitle).toBeVisible();
    await page.reload();
    await expect(detailTitle).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/hub\/agenda\?sources=media$/);
    await expect(agenda.getByRole('heading', { name: 'December 2026' })).toBeVisible();
    await expect(premiere).toBeVisible();
  });
});

test('shortcut and agenda links stay readable at 320px with enlarged text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await sources(page);
  await page.goto('/hub');
  const shortcuts = page.getByRole('navigation', { name: 'Shortcuts' });
  await expect(shortcuts.getByRole('listitem')).toHaveCount(7);
  await page.locator('html').evaluate(el => { el.style.fontSize = '200%'; });
  for (const area of [shortcuts, page.getByRole('region', { name: 'Up next' })]) {
    await expect(area).toBeVisible();
    expect(await area.evaluate(el => {
      const frame = el.getBoundingClientRect();
      return frame.left >= 0 && frame.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1;
    })).toBe(true);
  }
  const town = shortcuts.getByRole('link', { name: 'Town', exact: true });
  await town.press('Enter');
  await expect(page).toHaveURL(/\/town$/);
});
