import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDateRange,
  formatDay,
  formatRelativeDay,
} from "./calendar-format.mjs";
import {
  formatDateRange as exportedRange,
  formatMoney,
  formatPercent,
  moneyAriaLabel,
} from "../src/format.ts";

const WORD_JOINER = "\u2060";
const RANGE = "\u2009\u2013\u2009";

test("formatDay omits the current year and adds it on a year rollover", () => {
  const now = new Date(2026, 11, 31);
  assert.equal(formatDay("2026-12-12", now), "Sat, Dec 12");
  assert.equal(formatDay("2027-01-01", now), "Fri, Jan 1, 2027");
  assert.equal(formatDay("2027-12-12", now), "Sun, Dec 12, 2027");
  assert.equal(formatDay("", now), "");
  assert.equal(formatDay(null, now), "");
  assert.equal(formatDay("2026-10", now), "2026-10");
});

test("formatDateRange uses an en dash and thin spaces", () => {
  assert.equal(
    formatDateRange("2026-12-12", "2026-12-15"),
    `Dec 12${RANGE}15, 2026`,
  );
  assert.equal(
    exportedRange("2026-12-12", "2026-12-15"),
    `Dec 12${RANGE}15, 2026`,
  );
  assert.equal(
    formatDateRange("2026-12-30", "2027-01-02"),
    `Dec 30, 2026${RANGE}Jan 2, 2027`,
  );
  assert.equal(
    formatDateRange("2026-11-12", "2026-12-02"),
    `Nov 12${RANGE}Dec 2, 2026`,
  );
  assert.equal(formatDateRange("2026-12-12", "2026-12-12"), "Dec 12, 2026");
});

test("formatRelativeDay counts calendar days and does not invent Yesterday", () => {
  const now = new Date(2026, 9, 26);
  assert.equal(formatRelativeDay("2026-10-26", now), "Today");
  assert.equal(formatRelativeDay("2026-10-27", now), "Tomorrow");
  assert.equal(formatRelativeDay("2026-12-08", now), "In 43 days");
  assert.equal(formatRelativeDay("2026-10-25", now), "1 day ago");
  assert.equal(formatRelativeDay("2026-10-23", now), "3 days ago");
  assert.equal(formatRelativeDay("not-a-date", now), "not-a-date");
  assert.equal(formatRelativeDay("", now), "");
});

test("formatMoney inserts U+2060 between the sign, the symbol, and the digits", () => {
  assert.equal(formatMoney(-4567), `−${WORD_JOINER}$${WORD_JOINER}45.67`);
  assert.equal(
    formatMoney(500000, { sign: "always" }),
    `+${WORD_JOINER}$${WORD_JOINER}5,000.00`,
  );
  assert.equal(
    formatMoney(568800, { style: "whole", approx: true }),
    `about $${WORD_JOINER}5,688`,
  );
  assert.equal(formatMoney(268), `$${WORD_JOINER}2.68`);
  assert.equal(formatMoney(0), `$${WORD_JOINER}0.00`);
  assert.equal(
    formatMoney(-5, { style: "compact" }),
    `−${WORD_JOINER}$${WORD_JOINER}0.1`,
  );
  assert.equal(moneyAriaLabel(-4567), "minus $45.67");
  assert.equal(formatPercent(-3, 0).includes(WORD_JOINER), false);
});
