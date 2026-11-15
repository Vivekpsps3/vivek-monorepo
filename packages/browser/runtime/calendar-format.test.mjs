import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRelativeDay,
} from "./calendar-format.mjs";
import {
  formatMoney,
  formatPercent,
  moneyAriaLabel,
} from "../src/format.ts";

const WORD_JOINER = "\u2060";

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
