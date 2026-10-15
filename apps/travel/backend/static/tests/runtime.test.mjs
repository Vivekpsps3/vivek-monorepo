import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml, readCookie, safeStorageGet, safeStorageSet } from "../../../../../packages/browser/runtime/dom.mjs";
import { parseHash } from "../modules/route-parser.mjs";

test("browser runtime escapes HTML and reads encoded cookies safely", () => {
  assert.equal(escapeHtml(`<tag attr="'&">`), "&lt;tag attr=&quot;&#39;&amp;&quot;&gt;");
  assert.equal(readCookie("finance_csrf", "other=1; finance_csrf=a%20b"), "a b");
  assert.equal(readCookie("finance_csrf", "finance_csrf=%E0%A4%A"), "%E0%A4%A");
  assert.equal(readCookie("missing", "finance_csrf=value"), "");
});

test("storage helpers survive unavailable and throwing localStorage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    delete globalThis.localStorage;
    assert.equal(safeStorageGet("travel-theme"), null);
    assert.equal(safeStorageSet("travel-theme", "dark"), false);

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage disabled");
      },
    });
    assert.equal(safeStorageGet("travel-theme"), null);
    assert.equal(safeStorageSet("travel-theme", "dark"), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});

test("hash routes parse travel home, calendar, trip day, PTO, and settings", () => {
  assert.deepEqual(parseHash("#/"), { name: "home" });
  assert.deepEqual(parseHash("#/calendar/2027/4/2027-04-12"), {
    name: "calendar",
    year: 2027,
    month: 4,
    day: "2027-04-12",
  });
  assert.deepEqual(parseHash("#/trips/42/day/2027-04-12"), {
    name: "trip",
    id: 42,
    focusDay: "2027-04-12",
  });
  assert.deepEqual(parseHash("#/pto"), { name: "pto" });
  assert.deepEqual(parseHash("#/settings"), { name: "settings" });
  assert.deepEqual(parseHash("#/unknown"), { name: "home" });
});
