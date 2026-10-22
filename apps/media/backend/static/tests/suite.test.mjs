import assert from "node:assert/strict";
import test from "node:test";

import { WEEK_STARTS_ON, weekStartsOn } from "../../../../../packages/browser/runtime/week.mjs";
import { readSuiteTheme, writeSuiteTheme } from "../../../../../packages/browser/runtime/theme.mjs";
import { weekStartsOn as mediaWeek } from "../modules/format.mjs";

test("week start defaults to Sunday and follows the suite setting", () => {
  assert.equal(WEEK_STARTS_ON, 0);
  assert.equal(weekStartsOn(), 0);
  assert.equal(mediaWeek(), 0);
  const memory = new Map();
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  localStorage.setItem("suite-week-start", "1");
  assert.equal(weekStartsOn(), 1);
  assert.equal(mediaWeek(), 1);
  localStorage.setItem("suite-week-start", "0");
  assert.equal(weekStartsOn(), 0);
  delete globalThis.localStorage;
});

test("suite-theme migrates a legacy key and keeps writing it", () => {
  const memory = new Map([["media-theme", "dark"]]);
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  assert.equal(readSuiteTheme("media-theme"), "dark");
  assert.equal(localStorage.getItem("suite-theme"), "dark");
  writeSuiteTheme("light", "media-theme");
  assert.equal(localStorage.getItem("suite-theme"), "light");
  assert.equal(localStorage.getItem("media-theme"), "light");
  delete globalThis.localStorage;
});
