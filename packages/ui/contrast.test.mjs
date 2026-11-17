import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function block(name) {
  const parts = css.split('\n[data-theme="dark"]');
  const source = name === 'light' ? parts[0] : parts[1];
  const read = (token) => {
    const match = source.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6}|var\\((--[a-z-]+)\\))`));
    assert.ok(match, token);
    return match[2] ? read(match[2]) : match[1].toLowerCase();
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
  assert.equal(light('--chart-2'), '#986d33');
  assert.equal(light('--chart-6'), '#827c71');
  assert.equal(dark('--chart-2'), '#e0b56a');
  assert.equal(dark('--chart-6'), '#7d8794');
  assert.equal(dark('--on-accent'), '#07131c');
  assert.ok(contrast(dark('--on-accent'), dark('--accent')) >= 10.63);
});

test('shared content, links and control boundaries retain contrast in both themes', () => {
  for (const theme of ['light', 'dark']) {
    const token = block(theme);
    for (const surface of ['--bg', '--bg-elevated', '--surface-2', '--card-bg']) {
      assert.ok(contrast(token('--border-control'), token(surface)) >= 3, `${theme} control / ${surface}`);
      for (const text of ['--text', '--text-secondary', '--accent']) {
        assert.ok(contrast(token(text), token(surface)) >= 4.5, `${theme} ${text} / ${surface}`);
      }
    }
  }
});

test('section 1.3 tertiary and warning text clears 4.5 and borders clear 3', () => {
  const light = block('light');
  const dark = block('dark');
  assert.equal(light('--text-tertiary'), '#555c5d');
  assert.equal(light('--warning'), '#765422');
  for (const theme of ['light', 'dark']) {
    const token = block(theme);
    for (const surface of ['--bg', '--surface-2', '--surface-hover']) {
      assert.ok(contrast(token('--text-tertiary'), token(surface)) >= 4.5, `${theme} tertiary / ${surface}`);
      assert.ok(contrast(token('--warning'), token(surface)) >= 4.5, `${theme} warning / ${surface}`);
    }
    for (const surface of ['--bg', '--surface-2', '--card-bg', '--surface-hover']) {
      assert.ok(contrast(token('--border-control'), token(surface)) >= 3, `${theme} border / ${surface}`);
    }
    assert.ok(contrast(token('--danger'), token('--card-bg')) >= 4.5, `${theme} danger-soft-text / card`);
  }
  assert.equal(dark('--text-tertiary'), '#c4b7a4');
  assert.equal(dark('--warning'), '#e6c37e');
  for (const name of ['--danger-soft-bg', '--success-soft-bg', '--warning-soft-bg', '--info-soft-bg']) {
    assert.match(css, new RegExp(`${name}:\\s*color-mix\\(in srgb, var\\(--[a-z]+\\) 14%, var\\(--card-bg\\)\\)`));
  }
  assert.match(css, /--danger-soft-text:\s*var\(--danger\)/);
  assert.match(css, /--focus-ring-width:\s*2px/);
  assert.match(css, /--focus-ring-offset:\s*2px/);
  assert.match(css, /--motion-slow:\s*240ms/);
  assert.match(css, /--content-max:\s*1160px/);
  assert.match(css, /--gutter:\s*clamp\(16px,\s*4vw,\s*32px\)/);
  assert.match(css, /--header-h:\s*72px/);
  assert.match(css, /--header-h:\s*64px/);
  assert.match(css, /--control-h:\s*44px/);
  assert.match(css, /--control-h-sm:\s*44px/);
});


test('coastal materials are readable accents and semantic roles use the named palette', () => {
  for (const theme of ['light', 'dark']) {
    const token = block(theme);
    assert.equal(token('--accent'), token('--teal'));
    assert.equal(token('--accent-fill'), token('--accent'));
    assert.equal(token('--accent-fill-hover'), token('--accent-hover'));
    assert.equal(token('--warning'), token('--brass'));
    assert.equal(token('--card-bg'), token(theme === 'light' ? '--ivory' : '--navy'));
    assert.equal(token('--text'), token(theme === 'light' ? '--navy' : '--ivory'));
    for (const accent of ['--teal', '--coral', '--brass', '--wood']) {
      assert.ok(contrast(token(accent), token('--card-bg')) >= 4.5, `${theme} ${accent} / card`);
    }
  }
});
