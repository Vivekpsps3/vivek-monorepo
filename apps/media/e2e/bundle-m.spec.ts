import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('an empty add form explains itself and does not leave the page', async ({ page }) => {
  await page.goto('/media/#/new');
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('Enter a title.')).toBeVisible();
  await expect(page.getByLabel('Title')).toBeFocused();
  await expect(page).toHaveURL(/#\/new/);
  await page.getByLabel('Year').fill('99');
  await page.getByLabel('Title').fill('Synthetic Year');
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('Year must be a number from 1000 to 3000.')).toBeVisible();
  await expect(page).toHaveURL(/#\/new/);
});

test('search tells the truth when movie and game catalogs are missing', async ({ page }) => {
  await page.route('**/api/search**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: url.searchParams.get('q'),
        results: [],
        providers: { tmdb: 'unconfigured', rawg: 'unconfigured', openlibrary: 'ok', musicbrainz: 'ok' },
      }),
    });
  });
  await page.goto('/media/#/search');
  await expect(page.getByText('Results come from public catalogs.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search' }).fill('d');
  await expect(page.getByText('Type at least 2 letters.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search' }).fill('dune');
  await expect(page.getByText("Movies, series and games can't be searched right now.")).toBeVisible();
  await expect(page.getByRole('heading', { name: /No public match for/ })).toBeVisible();
});

test('Now, Library, and Calendar use the spec headings and one library list', async ({ page }) => {
  await page.goto('/media/#/');
  await expect(page.getByRole('link', { name: 'Find something to add' })).toBeVisible();
  await expect(page.locator('.grid .card').first()).toBeVisible();

  await page.goto('/media/#/library');
  await expect(page.getByLabel('Search your library')).toBeVisible();
  await expect(page.getByLabel('Search your library')).toBeVisible();
  await expect(page.locator('.grid .card').first()).toBeVisible();
  const libraryLoad = page.waitForResponse(response => (
    response.url().includes('/api/library') && response.request().method() === 'GET'
  ));
  await page.getByRole('button', { name: 'Favorites' }).click();
  const response = await libraryLoad;
  expect(response.ok()).toBeTruthy();
  await expect(page).toHaveURL(/fav=1/);
  await expect(page.getByRole('button', { name: '★ Favorites' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Favorites' })).toBeVisible();

  await page.goto('/media/#/calendar');
  await expect(page.getByRole('grid')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Previous month' })).toBeVisible();
});

test('removing an item asks before it deletes, and cancel leaves it in place', async ({ page }) => {
  await page.goto('/media/#/library');
  await page.getByRole('link', { name: /Dune/ }).click();
  await page.getByRole('button', { name: 'Remove from library' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove Dune?' });
  await expect(dialog.getByRole('heading', { name: 'Remove Dune?' })).toBeVisible();
  await expect(dialog).toContainText('album and song scores');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible();
});

test('a failed status save retires after the save succeeds and when the item changes', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const items = (await listed.json()).items;
  const dune = items.find((item: { title: string }) => item.title === 'Dune');
  const alpha = items.find((item: { title: string }) => item.title === 'Alpha');
  let failStatus = true;
  await page.route('**/api/entries/**', async route => {
    if (failStatus && route.request().method() === 'PATCH') {
      const body = route.request().postData() || '';
      if (body.includes('"status"')) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Status was not saved.' }) });
        return;
      }
    }
    await route.continue();
  });
  await page.goto(`/media/#/item/${dune.id}`);
  await page.getByRole('radio', { name: 'Paused' }).click();
  await expect(page.locator('[data-toast-key^="status:"]')).toBeVisible();
  await page.evaluate(id => { location.hash = `#/item/${id}`; }, String(alpha.id));
  await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();
  await expect(page.locator('[data-toast-key^="status:"]')).toHaveCount(0);
  await page.evaluate(id => { location.hash = `#/item/${id}`; }, String(dune.id));
  await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible();
  failStatus = false;
  await page.getByRole('radio', { name: 'Paused' }).click();
  await expect(page.getByRole('radio', { name: 'Paused' })).toHaveClass(/is-on/);
  await expect(page.locator('[data-toast-key^="status:"]')).toHaveCount(0);
});

test('a failed note or progress save retires when the item changes', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const items = (await listed.json()).items;
  const dune = items.find((item: { title: string }) => item.title === 'Dune');
  const alpha = items.find((item: { title: string }) => item.title === 'Alpha');
  let mode: 'note' | 'progress' = 'note';
  await page.route('**/api/entries/**', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postData() || '';
      const failNote = mode === 'note' && body.includes('"review"');
      const failProgress = mode === 'progress' && body.includes('"progress_value"');
      if (failNote || failProgress) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Not saved.' }),
        });
        return;
      }
    }
    await route.continue();
  });

  await page.goto(`/media/#/item/${dune.id}`);
  const note = page.locator('#note');
  await note.fill('A note that fails to save');
  await note.blur();
  await expect(page.locator('[data-toast-key^="note:"]')).toBeVisible();
  await page.evaluate(id => { location.hash = `#/item/${id}`; }, String(alpha.id));
  await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();
  await expect(page.locator('[data-toast-key^="note:"]')).toHaveCount(0);

  mode = 'progress';
  await page.evaluate(id => { location.hash = `#/item/${id}`; }, String(dune.id));
  await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible();
  const progress = page.getByLabel('Progress', { exact: true });
  await progress.fill('120');
  await progress.press('Enter');
  await expect(page.locator('[data-toast-key^="progress:"]')).toBeVisible();
  await page.evaluate(id => { location.hash = `#/item/${id}`; }, String(alpha.id));
  await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();
  await expect(page.locator('[data-toast-key^="progress:"]')).toHaveCount(0);
});

test('axe reports no serious or critical issues on the main screens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/media/');
  await page.evaluate(() => {
    localStorage.setItem('suite-theme', 'light');
    localStorage.setItem('media-theme', 'light');
  });
  const screens: Array<[string, string]> = [
    ['#/', 'now'],
    ['#/library', 'library'],
    ['#/search', 'search'],
    ['#/calendar', 'calendar'],
    ['#/item/1', 'item'],
    ['#/new', 'add'],
  ];
  for (const [hash, name] of screens) {
    await page.evaluate(value => { location.hash = value; }, hash);
    if (name === 'now') await expect(page.getByRole('link', { name: 'Find something to add' })).toBeVisible();
    if (name === 'library') await expect(page.locator('.grid .card').first()).toBeVisible();
    if (name === 'search') await expect(page.getByText('Results come from public catalogs.')).toBeVisible();
    if (name === 'calendar') await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
    if (name === 'item') await expect(page.locator('.opinion .status-mark').first()).toBeVisible();
    if (name === 'add') await expect(page.getByLabel('Title')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(row => row.impact === 'serious' || row.impact === 'critical');
    expect(serious, `${name}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
  }
});

test('a late save failure stays with the item it came from', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const items = (await listed.json()).items;
  const dune = items.find((item: { title: string }) => item.title === 'Dune');
  const alpha = items.find((item: { title: string }) => item.title === 'Alpha');
  let fail = true;
  await page.route('**/api/entries/**', async route => {
    if (fail && route.request().method() === 'PATCH') {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not saved.' }),
      });
      return;
    }
    await route.continue();
  });
  const cases = [
    {
      name: 'note',
      needle: '"review"',
      act: async () => {
        const note = page.locator('#note');
        await note.fill('A note that fails after leaving');
        await note.blur();
      },
    },
    {
      name: 'score',
      needle: '"rating"',
      act: async () => {
        await page.locator('.opinion .mark[data-score="7"]').click({ position: { x: 24, y: 16 } });
      },
    },
    {
      name: 'status',
      needle: '"status"',
      act: async () => {
        await page.getByRole('radio', { name: 'Paused' }).click();
      },
    },
    {
      name: 'favorite',
      needle: '"favorite"',
      act: async () => {
        await page.getByRole('button', { name: 'Favorite', exact: true }).click();
      },
    },
  ];
  for (const step of cases) {
    await page.goto(`/media/#/item/${dune.id}`);
    await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible();
    const pending = page.waitForRequest(req => (
      req.method() === 'PATCH' && (req.postData() || '').includes(step.needle)
    ));
    await step.act();
    await pending;
    await page.evaluate(id => { location.hash = `#/item/${id}`; }, String(alpha.id));
    await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();
    const toast = page.locator('#toast-alerts .toast').filter({ hasText: 'Save failed for Dune.' });
    await expect(toast).toBeVisible();
    fail = false;
    const retry = page.waitForRequest(req => (
      req.method() === 'PATCH'
      && req.url().includes(`/api/entries/${dune.id}`)
      && (req.postData() || '').includes(step.needle)
    ));
    await toast.getByRole('button', { name: 'Retry' }).click();
    const sent = await retry;
    expect(sent.postData() || '').toContain(step.needle);
    await expect(page.locator('#toast-alerts .toast')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();
    fail = true;
  }
});

test('a successful status, favorite, or rating save clears its toast', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
  let failField = '';
  await page.route('**/api/entries/**', async route => {
    const body = route.request().postData() || '';
    const field = body.includes('"status"')
      ? 'status'
      : body.includes('"favorite"')
        ? 'favorite'
        : body.includes('"rating"')
          ? 'rating'
          : '';
    if (route.request().method() === 'PATCH' && field && field === failField) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not saved.' }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto(`/media/#/item/${dune.id}`);
  await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible();

  failField = 'status';
  await page.getByRole('radio', { name: 'Paused' }).click();
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(1);
  failField = '';
  await page.getByRole('radio', { name: 'Paused' }).click();
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`#/item/${dune.id}`));

  failField = 'favorite';
  await page.getByRole('button', { name: 'Favorite', exact: true }).click();
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(1);
  failField = '';
  await page.getByRole('button', { name: 'Favorite', exact: true }).click();
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`#/item/${dune.id}`));

  failField = 'rating';
  await page.locator('.opinion .mark[data-score="3"]').click({ position: { x: 20, y: 10 } });
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(1);
  failField = '';
  await page.locator('.opinion .mark[data-score="3"]').click({ position: { x: 20, y: 10 } });
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`#/item/${dune.id}`));
});

test('season tabs move with the arrow keys and the chip label fits', async ({ page, request }) => {
  const show = await request.post('/media/api/library', {
    data: { kind: 'tv', title: 'Tab Show', status: 'in_progress' },
  });
  expect(show.ok()).toBeTruthy();
  const showId = (await show.json()).id as number;
  try {
    for (const season of [0, 1, 2]) {
      for (const episode of [1, 2, 3]) {
        expect((await request.post(`/media/api/entries/${showId}/episodes`, {
          data: { season_number: season, episode_number: episode, title: `S${season}E${episode}` },
        })).ok()).toBeTruthy();
      }
    }
    const detail = await (await request.get(`/media/api/entries/${showId}`)).json();
    const watched = (detail.show.episodes as Array<{ id: number; season_number: number; episode_number: number }>)
      .filter(episode => episode.season_number === 0 || (episode.season_number === 1 && episode.episode_number < 3));
    for (const episode of watched) {
      expect((await request.post(`/media/api/entries/${showId}/episodes/${episode.id}/watched`, {
        data: { watched: true },
      })).ok()).toBeTruthy();
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/media/#/item/${showId}`);
    await expect(page.getByRole('heading', { name: 'Tab Show' })).toBeVisible();
    const seasonOne = page.getByRole('tab', { name: 'Season 1' });
    await seasonOne.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Season 2' })).toHaveAttribute('aria-selected', 'true');
    const chip = page.getByRole('tab', { name: 'Specials' });
    const chipBox = await chip.boundingBox();
    expect(chipBox?.width).toBeGreaterThanOrEqual(44);
    const fits = await chip.evaluate(node => node.scrollWidth <= node.clientWidth + 1);
    expect(fits).toBeTruthy();
  } finally {
    await request.delete(`/media/api/entries/${showId}`);
  }
});

test('the month grid lays weeks across the row at 1280', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/media/#/calendar?month=2026-10');
  await expect(page.getByRole('grid')).toBeVisible();
  const headers = page.locator('.calendar-grid [role="columnheader"]');
  const sun = await headers.nth(0).boundingBox();
  const monday = await headers.nth(1).boundingBox();
  expect(sun && monday && sun.x < monday.x).toBeTruthy();
  const week = page.locator('.calendar-grid [role="row"]').nth(1);
  const cells = week.locator('[role="gridcell"]');
  const ys = [];
  for (let index = 0; index < 7; index += 1) ys.push(Math.round((await cells.nth(index).boundingBox())?.y || 0));
  expect(new Set(ys).size).toBe(1);
  const octoberFourth = await page.locator('[data-date="2026-10-04"]').boundingBox();
  expect(sun && octoberFourth && Math.abs(octoberFourth.x - sun.x)).toBeLessThan(2);
});

test('item, add, and an artist stay inside a 390px viewport', async ({ page, request }) => {
  const artist = await request.post('/media/api/library', {
    data: { kind: 'artist', title: 'Narrow Band', status: 'want' },
  });
  const artistId = (await artist.json()).id as number;
  try {
    expect((await request.post(`/media/api/entries/${artistId}/albums`, {
      data: { title: 'Narrow Album' },
    })).ok()).toBeTruthy();
    await page.setViewportSize({ width: 390, height: 800 });
    for (const hash of ['#/item/1', '#/new', `#/item/${artistId}`]) {
      await page.goto(`/media/${hash}`);
      if (hash === '#/new') await expect(page.getByRole('textbox', { name: 'Title' })).toBeVisible();
      else await expect(page.locator('h1').first()).toBeVisible();
      const right = await page.evaluate(() => {
        let max = 0;
        for (const node of document.body.querySelectorAll('*')) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const box = node.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          max = Math.max(max, box.right);
        }
        return max;
      });
      expect(right, hash).toBeLessThanOrEqual(391);
    }
  } finally {
    await request.delete(`/media/api/entries/${artistId}`);
  }
});

test('in-content links clear 4.5:1 on a dark 390px screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/media/');
  await page.evaluate(() => {
    localStorage.setItem('suite-theme', 'dark');
    localStorage.setItem('media-theme', 'dark');
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const ratio = await page.evaluate(() => {
    const host = document.querySelector('main');
    if (!host) return 0;
    const link = document.createElement('a');
    link.href = '#/library';
    link.textContent = 'Open library';
    host.append(link);
    const parse = (value: string) => {
      const parts = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
      return parts.map(part => (part <= 1 ? Math.round(part * 255) : part));
    };
    const channel = (part: number) => {
      const s = part / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (rgb: number[]) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
    const fg = luminance(parse(getComputedStyle(link).color));
    const bg = luminance(parse(getComputedStyle(document.body).backgroundColor));
    link.remove();
    const lighter = Math.max(fg, bg);
    const darker = Math.min(fg, bg);
    return (lighter + 0.05) / (darker + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});
