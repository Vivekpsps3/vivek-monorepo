import assert from "node:assert/strict";
import test from "node:test";

import { monthMatrix, weekdayHeads } from "../modules/calendar-model.mjs";
import { monthCells, saveState, weekdayHeads as composerHeads } from "../modules/composer-model.mjs";
import { DECISIONS } from "../modules/decisions.mjs";
import { formatDays } from "../modules/labels.mjs";
import { deletionMode } from "../modules/restore.mjs";
import { homeState, screenNav } from "../modules/screens.mjs";
import { transportForm } from "../modules/views/new-trip.mjs";
import { weekStartsOn } from "../../shared-browser/week.mjs";

function withFlag(key, value, run) {
  const previous = DECISIONS[key];
  DECISIONS[key] = value;
  try {
    return run();
  } finally {
    DECISIONS[key] = previous;
  }
}

test("each decision flag changes the behavior it owns", () => {
  assert.equal(withFlag("undoRowDeletes", false, () => deletionMode("stay")), "dialog");
  assert.equal(withFlag("undoRowDeletes", true, () => deletionMode("stay")), "undo");

  assert.equal(withFlag("ptoDayDecimals", 3, () => formatDays("1.2345")), "1.235");
  assert.equal(withFlag("ptoDayDecimals", 1, () => formatDays("1.2345")), "1.2");

  const open = { start: "2026-11-01", end: "2026-11-03", cities: {}, tripName: "Kyoto", splits: [] };
  assert.equal(withFlag("cityRequired", true, () => saveState(open).ok), false);
  assert.equal(withFlag("cityRequired", false, () => saveState(open).ok), true);

  assert.match(withFlag("legStatuses", [["planned", "Draft"]], () => transportForm(null, "outbound")), /Draft/);
  assert.equal(withFlag("legStatuses", [["planned", "Planning"]], () => transportForm(null, "outbound").includes("Draft")), false);
  assert.equal(screenNav("new"), "");
  assert.equal(homeState({ in_progress: [], upcoming: [], past: [] }).metrics, false);
  assert.equal(homeState({ in_progress: [{}], upcoming: [], past: [] }).metrics, true);
});

test("D9 is only the Sunday default of the shared week start", () => {
  assert.equal(weekStartsOn(), 0);
  assert.equal(weekdayHeads()[0].title, "Sunday");
  assert.equal(composerHeads()[0].title, "Sunday");
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  localStorage.setItem("suite-week-start", "1");
  try {
    assert.equal(weekStartsOn(), 1);
    assert.equal(weekdayHeads()[0].title, "Monday");
    assert.equal(composerHeads(true)[0].label, "M");
    assert.equal(monthMatrix(2026, 11)[0][0].getDay(), 1);
    assert.equal(monthCells(new Date(2026, 10, 1))[0].iso, "2026-10-26");
  } finally {
    delete globalThis.localStorage;
  }
});
