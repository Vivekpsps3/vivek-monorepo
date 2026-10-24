import assert from "node:assert/strict";
import test from "node:test";

import { rotateWeekLabels } from "../../../../../packages/browser/runtime/week.mjs";
import { weekdayHeads as composerHeads } from "../modules/composer-model.mjs";
import { monthMatrix, renderCalendar } from "../modules/views/calendar.mjs";

test("a Monday week start rotates the header and the first cell", () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  localStorage.setItem("suite-week-start", "1");
  try {
    assert.equal(rotateWeekLabels(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])[0], "Mon");
    assert.equal(composerHeads(true)[0].label, "M");
    const weeks = monthMatrix(2026, 10);
    assert.equal(weeks[0][0].getDay(), 1);
    const html = renderCalendar(
      { plans: [], trips: [] },
      { year: 2026, month: 10 },
      weeks,
      "2026-10-22",
    );
    const header = html.slice(html.indexOf('class="cal-dow"'));
    assert.match(header, /^class="cal-dow"><div><abbr title="Monday">Mon<\/abbr>/);
  } finally {
    delete globalThis.localStorage;
  }
});
