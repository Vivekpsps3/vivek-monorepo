import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function block(name) {
  const parts = css.split('\n[data-theme="dark"]');
  const source = name === 'light' ? parts[0] : parts[1];
  const read = (token) => {
    const match = source.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, token);
    return match[1].toLowerCase();
  };
  return read;
}

function channel(hex, index) {
  const value = parseInt(hex.slice(index, index + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(foreground, background) {
  const luminance = (hex) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
  const left = luminance(foreground);
  const right = luminance(background);
  const [hi, lo] = left > right ? [left, right] : [right, left];
  return (hi + 0.05) / (lo + 0.05);
}

test('light and dark contrast tokens meet the finance foundation ratios', () => {
  const light = block('light');
  const dark = block('dark');
  assert.ok(contrast(light('--danger'), light('--danger-tint')) >= 5.7);
  assert.ok(contrast(dark('--danger'), dark('--danger-tint')) >= 6.3);
  assert.ok(Number(contrast(light('--chart-2'), light('--bg')).toFixed(2)) >= 4.04);
  assert.ok(Number(contrast(light('--chart-6'), light('--bg')).toFixed(2)) >= 3.59);
  assert.equal(light('--chart-2'), '#9a6f35');
  assert.equal(light('--chart-6'), '#857f74');
  assert.equal(dark('--chart-2'), '#e0b56a');
  assert.equal(dark('--chart-6'), '#7d8794');
  assert.equal(dark('--on-accent'), '#141311');
  assert.ok(contrast(dark('--on-accent'), dark('--accent')) >= 10.63);
});
