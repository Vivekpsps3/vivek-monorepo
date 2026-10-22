import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const tokensCss = fs.readFileSync(path.join(root, "packages/ui/tokens.css"), "utf8");
const controlsCss = fs.readFileSync(path.join(root, "packages/ui/controls.css"), "utf8");
const appCss = fs.readFileSync(path.join(root, "apps/media/backend/static/app.css"), "utf8");

function block(css, pattern) {
  const start = css.search(pattern);
  assert.ok(start >= 0, `missing ${pattern}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  throw new Error(`unclosed ${pattern}`);
}

function declarations(css) {
  const map = new Map();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(match[1], match[2].trim());
  return map;
}

function resolve(map, name, seen = new Set()) {
  const raw = map.get(name);
  assert.ok(raw, `missing ${name}`);
  const alias = raw.match(/^var\((--[\w-]+)\)$/);
  if (!alias) return raw;
  assert.ok(!seen.has(name), `cycle at ${name}`);
  seen.add(name);
  return resolve(map, alias[1], seen);
}

function channel(value) {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const body = hex.slice(1);
  const red = Number.parseInt(body.slice(0, 2), 16);
  const green = Number.parseInt(body.slice(2, 4), 16);
  const blue = Number.parseInt(body.slice(4, 6), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function mix(foreground, background, amount) {
  const parts = hex => [0, 2, 4].map(offset => Number.parseInt(hex.slice(1 + offset, 3 + offset), 16));
  const mixed = parts(foreground).map((value, index) => Math.round(value * amount + parts(background)[index] * (1 - amount)));
  return `#${mixed.map(value => value.toString(16).padStart(2, "0")).join("")}`;
}

const light = declarations(block(tokensCss, /:root\s*,/));
const dark = new Map(light);
for (const [name, value] of declarations(block(tokensCss, /\[data-theme="dark"\]\s*\{/))) dark.set(name, value);

const themes = { light, dark };

test("control boundaries stay at least 3:1 against their adjacent backgrounds", () => {
  const chip = block(appCss, /\.status-mark\s*,\s*\.flag\s*\{/);
  const mark = block(appCss, /\.mark\s*\{/);
  const season = block(appCss, /\.season-chip\s*\{/);
  const fields = block(controlsCss, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  const checkbox = block(appCss, /input\[type="checkbox"\]\s*\{/);
  const toastFocus = block(appCss, /\.toast button:focus-visible\s*\{/);
  assert.match(chip, /border:\s*1px solid var\(--border-control\)/);
  assert.match(chip, /background:\s*var\(--surface\)/);
  assert.match(mark, /border:\s*1\.5px solid var\(--border-control\)/);
  assert.match(mark, /background:\s*transparent/);
  assert.match(season, /border:\s*1px solid var\(--border-control\)/);
  assert.match(season, /background:\s*var\(--surface\)/);
  assert.match(fields, /border:\s*1px solid var\(--border-control\)/);
  assert.match(fields, /background:\s*var\(--surface-2\)/);
  assert.doesNotMatch(controlsCss, /input\[type="checkbox"\]/);
  assert.match(checkbox, /appearance:\s*none/);
  assert.match(checkbox, /border:\s*1px solid var\(--border-control\)/);
  assert.match(checkbox, /background:\s*var\(--bg-elevated\)/);
  assert.match(toastFocus, /outline:\s*2px solid var\(--bg\)/);

  const done = appCss.match(/\.season-chip\.is-done\s*\{[^}]*color-mix\(in srgb,\s*var\(--text\)\s+(\d+)%\s*,\s*var\(--bg\)\)/);
  assert.ok(done, "a watched season chip mixes --text over --bg");
  const amount = Number(done[1]) / 100;

  const pairs = [
    ["chip and season exterior", "--bg"],
    ["chip and season fill", "--surface"],
    ["empty score ring", "--bg"],
    ["search and add fill", "--surface-2"],
    ["search and add exterior", "--bg"],
    ["checkbox fill", "--bg-elevated"],
    ["checkbox exterior", "--bg"],
  ];
  const measured = [];
  for (const [theme, map] of Object.entries(themes)) {
    const border = resolve(map, "--border-control");
    assert.match(border, /^#[0-9a-fA-F]{6}$/);
    for (const [label, token] of pairs) {
      const background = resolve(map, token);
      const ratio = contrast(border, background);
      measured.push(`${theme} ${label} (${border} on ${background}): ${ratio.toFixed(2)}:1`);
      assert.ok(ratio >= 3, `${theme} ${label} is ${ratio.toFixed(2)}:1`);
    }
    const wash = mix(resolve(map, "--text"), resolve(map, "--bg"), amount);
    const washRatio = contrast(border, wash);
    measured.push(`${theme} watched season chip (${border} on ${wash}): ${washRatio.toFixed(2)}:1`);
    assert.ok(washRatio >= 3, `${theme} watched season chip is ${washRatio.toFixed(2)}:1`);
    const toastRing = contrast(resolve(map, "--bg"), resolve(map, "--text"));
    measured.push(`${theme} toast focus ring (${resolve(map, "--bg")} on ${resolve(map, "--text")}): ${toastRing.toFixed(2)}:1`);
    assert.ok(toastRing >= 3, `${theme} toast focus ring is ${toastRing.toFixed(2)}:1`);
  }
  console.log(measured.join("\n"));
});
