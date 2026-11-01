import { deflateSync, inflateSync, crc32 } from 'node:zlib';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { openUserMenu } from '../../../tests/e2e/user-menu.mjs';
import { expect, test } from '@playwright/test';
const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const tileUrl = 'https://tile.openstreetmap.org/**';
const surfaces = {
  land: [0xf2, 0xef, 0xe9],
  water: [0xaa, 0xd3, 0xdf],
  park: [0xc8, 0xfa, 0xcc],
};
const containerBackground = [40, 37, 31];

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length);
  return out;
}

function solidPng(r, g, b, size = 32) {
  const stride = 1 + size * 3;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    const start = y * stride;
    for (let x = 0; x < size; x++) {
      raw[start + 1 + x * 3] = r;
      raw[start + 2 + x * 3] = g;
      raw[start + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buffer) {
  const buf = Buffer.from(buffer);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idats = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idats.push(Buffer.from(data));
    else if (type === 'IEND') break;
    offset += 12 + len;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idats));
  const stride = width * channels;
  const rows = [];
  let cursor = 0;
  for (let row = 0; row < height; row++) {
    const filter = raw[cursor++];
    const current = Buffer.alloc(stride);
    const prior = rows[row - 1] || Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? current[i - channels] : 0;
      const up = prior[i];
      const ul = i >= channels ? prior[i - channels] : 0;
      const value = raw[cursor++];
      let out = value;
      if (filter === 1) out = (value + left) & 255;
      else if (filter === 2) out = (value + up) & 255;
      else if (filter === 3) out = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) out = (value + paeth(left, up, ul)) & 255;
      else if (filter !== 0) throw new Error('png filter ' + filter);
      current[i] = out;
    }
    rows.push(current);
  }
  return {
    width,
    height,
    pixel(x, y) {
      const clampedX = Math.max(0, Math.min(width - 1, x));
      const clampedY = Math.max(0, Math.min(height - 1, y));
      const index = clampedX * channels;
      const row = rows[clampedY];
      return [row[index], row[index + 1], row[index + 2]];
    },
  };
}

function channel(value) {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground, background) {
  const luminance = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  const left = luminance(foreground);
  const right = luminance(background);
  const [hi, lo] = left > right ? [left, right] : [right, left];
  return (hi + 0.05) / (lo + 0.05);
}

function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function parseRgb(value) {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (!match) throw new Error('No rgb colour in ' + value);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

async function createTrip(request) {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
  const created = await request.post('/travel/api/trips', { data: { title: 'Theme map trip', start_date: '2026-11-01', end_date: '2026-11-04', stays: [{ city: 'Zero Island', arrive_on: '2026-11-01', leave_on: '2026-11-04', lat: 0, lng: 0 }] } });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json();
}

async function chooseAppearance(page, theme) {
  await (await openUserMenu(page)).getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Appearance', exact: true }).click();
  const radio = page.locator(`input[name="color-theme"][value="${theme}"]`);
  if (!(await radio.isChecked())) await radio.click();
  await expect(radio).toBeChecked();
  await page.goBack();
  await page.goBack();
}

async function showMap(page) {
  const opener = page.getByRole('button', { name: 'Show map', exact: true });
  const map = page.getByRole('region', { name: 'Trip map', exact: true });
  // mapOpen is component state, so a reload returns to the closed map.
  await expect(opener.or(map)).toBeVisible();
  if (await opener.isVisible()) await opener.click();
  const canvas = map.locator('.map-canvas');
  await expect(map.getByRole('status')).toContainText('Map ready');
  await expect(canvas.locator('.leaflet-tile-loaded').first()).toBeVisible();
  return { map, canvas };
}

async function samplePinAndTile(canvas, source) {
  const canvasBox = await canvas.boundingBox();
  const pin = canvas.locator('.leaflet-interactive');
  await expect(pin).toHaveCount(1);
  const pinBox = await pin.boundingBox();
  const image = decodePng(await canvas.screenshot({ scale: 'css' }));
  const centerX = Math.round(pinBox.x - canvasBox.x + pinBox.width / 2);
  const centerY = Math.round(pinBox.y - canvasBox.y + pinBox.height / 2);
  let pinPixel = image.pixel(centerX, centerY);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const candidate = image.pixel(centerX + dx, centerY + dy);
      if (candidate[1] > pinPixel[1]) pinPixel = candidate;
    }
  }
  let tilePoint = null;
  const tiles = canvas.locator('.leaflet-tile-loaded');
  const count = await tiles.count();
  for (let index = 0; index < count && !tilePoint; index++) {
    const box = await tiles.nth(index).boundingBox();
    if (!box) continue;
    const points = [
      [box.x + 6, box.y + 6],
      [box.x + box.width - 6, box.y + 6],
      [box.x + 6, box.y + box.height - 6],
      [box.x + box.width / 2, box.y + box.height / 2],
    ];
    for (const [x, y] of points) {
      const insideCanvas = x > canvasBox.x + 1 && y > canvasBox.y + 1 && x < canvasBox.x + canvasBox.width - 1 && y < canvasBox.y + canvasBox.height - 1;
      const insidePin = x >= pinBox.x - 4 && x <= pinBox.x + pinBox.width + 4 && y >= pinBox.y - 4 && y <= pinBox.y + pinBox.height + 4;
      if (insideCanvas && !insidePin) {
        tilePoint = [Math.round(x - canvasBox.x), Math.round(y - canvasBox.y)];
        break;
      }
    }
  }
  expect(tilePoint, 'a tile pixel inside the map screenshot').not.toBeNull();
  const tilePixel = image.pixel(tilePoint[0], tilePoint[1]);
  expect(distance(tilePixel, containerBackground), 'tile pixel is the filtered image, not the pane background').toBeGreaterThan(40);
  expect(distance(tilePixel, source), 'tile pixel is filtered, not the raw tile colour').toBeGreaterThan(40);
  expect(distance(pinPixel, tilePixel), 'pin pixel is not the surrounding tile').toBeGreaterThan(20);
  return { pinPixel, tilePixel, ratio: contrastRatio(pinPixel, tilePixel) };
}

function readRing(element) {
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    const active = document.activeElement;
    return {
      matches: node.matches(':focus-visible'),
      active: active === node,
      activeClass: active instanceof Element ? String(active.className).slice(0, 160) : '',
      inline: node.style.outlineStyle,
      outline: style.outlineColor,
      outlineStyle: style.outlineStyle,
      width: style.outlineWidth,
      offset: style.outlineOffset,
      shadow: style.boxShadow,
    };
  });
}

// Pointer clicks leave Chrome in pointer modality, and focus({focusVisible:true})
// is a no-op when the node is already focused. Either one reports the initial
// outline-width (medium, 3px) because :focus-visible does not match. Tab from
// Hide map so the control receives a real keyboard focus.
async function focusRing(page, element) {
  await element.evaluate((node) => {
    node.blur();
    node.focus({ focusVisible: true });
  });
  let ring = await readRing(element);
  if (ring.matches && ring.active && ring.width === '2px' && ring.outlineStyle === 'solid') return ring;
  await page.getByRole('button', { name: 'Hide map', exact: true }).focus();
  for (let step = 0; step < 12; step += 1) {
    ring = await readRing(element);
    if (ring.active) break;
    await page.keyboard.press('Tab');
  }
  return readRing(element);
}

function saveShot(map, name) {
  const dir = process.env.N3B_SHOT_DIR;
  if (!dir) return Promise.resolve();
  mkdirSync(dir, { recursive: true });
  return map.screenshot({ path: path.join(dir, name) });
}

test('map renders in the Appearance theme after returning to the trip', async ({ page, request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
  const created = await request.post('/travel/api/trips', { data: { title: 'Theme map trip', start_date: '2026-11-01', end_date: '2026-11-04', stays: [{ city: 'Zero Island', arrive_on: '2026-11-01', leave_on: '2026-11-04', lat: 0, lng: 0 }] } });
  expect(created.ok(), await created.text()).toBeTruthy(); const trip = await created.json();
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: tile })); await page.goto('/travel/trips/' + trip.id);
  await (await openUserMenu(page)).getByRole('link', { name: 'Settings', exact: true }).click(); await page.getByRole('link', { name: 'Appearance', exact: true }).click();
  const radio = page.locator('input[name="color-theme"][value="dark"]');
  if (!(await radio.isChecked())) await radio.click(); await expect(radio).toBeChecked();
  await page.goBack(); await page.goBack(); await expect(page).toHaveURL(new RegExp(`/travel/trips/${trip.id}$`));
  await page.getByRole('button', { name: 'Show map', exact: true }).click();
  const map = page.getByRole('region', { name: 'Trip map', exact: true }); const canvas = map.locator('.map-canvas');
  await expect(map.getByRole('status')).toContainText('Map ready');
  expect(await page.locator('html').evaluate(node => [node.getAttribute('data-theme'), node.getAttribute('data-theme-choice')])).toEqual(['dark', 'dark']);
  await expect(canvas.locator('.leaflet-tile')).not.toHaveCount(0);
  expect(await canvas.evaluate(node => { const pin = node.querySelector('.leaflet-interactive'); const tiles = node.querySelector('.leaflet-tile-pane'); return [node.isConnected, getComputedStyle(node).backgroundColor, tiles ? getComputedStyle(tiles).backgroundColor : '', pin ? getComputedStyle(pin).fill : '']; })).toEqual([true, 'rgb(40, 37, 31)', 'rgb(40, 37, 31)', 'rgb(143, 208, 200)']);
});

test('map keeps the light pin and does not filter tiles', async ({ page, request }) => {
  const trip = await createTrip(request);
  await page.route(tileUrl, route => route.fulfill({ contentType: 'image/png', body: solidPng(...surfaces.land) }));
  await page.goto('/travel/trips/' + trip.id);
  await chooseAppearance(page, 'light');
  await expect(page).toHaveURL(new RegExp(`/travel/trips/${trip.id}$`));
  const { map, canvas } = await showMap(page);
  expect(await page.locator('html').evaluate(node => [node.getAttribute('data-theme'), node.getAttribute('data-theme-choice')])).toEqual(['light', 'light']);
  expect(await canvas.evaluate(node => {
    const pin = node.querySelector('.leaflet-interactive');
    const tiles = node.querySelector('.leaflet-tile-pane');
    return [getComputedStyle(node).backgroundColor, tiles ? getComputedStyle(tiles).backgroundColor : '', tiles ? getComputedStyle(tiles).filter : '', pin ? pin.getAttribute('fill') : '', pin ? pin.getAttribute('fill-opacity') : '', pin ? pin.getAttribute('stroke') : '', pin ? pin.getAttribute('stroke-width') : ''];
  })).toEqual(['rgb(221, 221, 221)', 'rgba(0, 0, 0, 0)', 'none', '#3388ff', '0.2', '#3388ff', '3']);
  await saveShot(map, 'light.png');
});

test('dark pin contrast is measured from a filtered tile pixel', async ({ page, request }) => {
  test.setTimeout(90_000);
  const trip = await createTrip(request);
  let rgb = surfaces.land;
  await page.route(tileUrl, route => route.fulfill({ contentType: 'image/png', body: solidPng(...rgb) }));
  await page.goto('/travel/trips/' + trip.id);
  await chooseAppearance(page, 'dark');
  await expect(page).toHaveURL(new RegExp(`/travel/trips/${trip.id}$`));
  const measured = [];
  for (const [name, source] of Object.entries(surfaces)) {
    rgb = source;
    if (measured.length) await page.reload();
    expect(await page.locator('html').evaluate(node => [node.getAttribute('data-theme'), node.getAttribute('data-theme-choice')])).toEqual(['dark', 'dark']);
    const { map, canvas } = await showMap(page);
    const sample = await samplePinAndTile(canvas, source);
    expect(sample.ratio, name).toBeGreaterThanOrEqual(3);
    const zoom = map.getByRole('button', { name: 'Zoom in', exact: true });
    const canvasRing = await focusRing(page, canvas);
    const zoomRing = await focusRing(page, zoom);
    for (const ring of [canvasRing, zoomRing]) {
      expect(ring.width, JSON.stringify(ring)).toBe('2px');
      expect(ring.offset, JSON.stringify(ring)).toBe('2px');
      expect(ring.outlineStyle, JSON.stringify(ring)).toBe('solid');
      expect(ring.shadow, JSON.stringify(ring)).toContain('2px');
      const outer = parseRgb(ring.outline);
      const inner = parseRgb(ring.shadow);
      expect(contrastRatio(inner, [255, 255, 255]), name + ' focus ring on the white control').toBeGreaterThanOrEqual(3);
      expect(contrastRatio(outer, sample.tilePixel), name + ' focus ring on the filtered tile').toBeGreaterThanOrEqual(3);
    }
    measured.push({ name, ...sample, outer: contrastRatio(parseRgb(zoomRing.outline), sample.tilePixel), inner: contrastRatio(parseRgb(zoomRing.shadow), [255, 255, 255]) });
    if (name === 'land') await saveShot(map, 'dark.png');
    console.log(`N3B_CONTRAST ${name} pin=${sample.pinPixel.join(',')} tile=${sample.tilePixel.join(',')} ratio=${sample.ratio.toFixed(3)} ringTile=${contrastRatio(parseRgb(zoomRing.outline), sample.tilePixel).toFixed(3)} ringControl=${contrastRatio(parseRgb(zoomRing.shadow), [255, 255, 255]).toFixed(3)}`);
  }
  expect(measured.map(item => item.name)).toEqual(['land', 'water', 'park']);
});
