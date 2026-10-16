import assert from "node:assert/strict";
import test from "node:test";
import { dayLabel, draftKey, escapeHtml, monthCells, monthLabel, ratingText, releaseLabel, safeUrl, seasonLabel, shiftMonth, statusLabel, whenLabel } from "../modules/format.mjs";

test("escapes review text and rejects unsafe artwork urls", () => {
  assert.equal(escapeHtml(`<script>"&'</script>`), "&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;");
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("https://covers.example/a.jpg"), "https://covers.example/a.jpg");
});

test("keeps unrated distinct from zero and labels statuses by medium", () => {
  assert.equal(seasonLabel(0), "Specials");
  assert.equal(seasonLabel(2), "Season 2");
  assert.equal(ratingText(null), "Unrated");
  assert.equal(ratingText(0), "0/10");
  assert.equal(ratingText(7.5), "7.5/10");
  assert.equal(statusLabel("book", "in_progress"), "Currently Reading");
  assert.equal(statusLabel("game", "in_progress"), "Currently Playing");
  assert.equal(statusLabel("album", "want"), "Want to Listen");
});

test("month and year releases are not shown as a day", () => {
  assert.equal(releaseLabel({ precision: "year", released_on: "2027-01-01", status: "scheduled" }), "2027");
  assert.equal(releaseLabel({ precision: "month", released_on: "2026-11-01", status: "scheduled" }), "November 2026");
  assert.equal(releaseLabel({ precision: "day", released_on: "2026-11-03", status: "scheduled" }), "November 3, 2026");
  assert.equal(releaseLabel({ precision: "unknown", status: "unknown" }), "Date unknown");
  assert.equal(releaseLabel({ precision: "day", released_on: "2026-01-01", status: "postponed" }), "Postponed");
  assert.equal(whenLabel({ when: "this_month", precision: "month", release_on: "2026-10-01" }), "This month");
  assert.equal(draftKey(12), "media-review-draft:12");
  assert.equal(dayLabel("2026-10"), "");
  assert.equal(dayLabel("2026-10-01"), "Thursday, October 1");
});

test("calendar months start on Monday and step across years", () => {
  assert.equal(monthLabel("2026-10"), "October 2026");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  const cells = monthCells("2026-10");
  assert.equal(cells.length % 7, 0);
  assert.equal(cells[0], null);
  assert.equal(cells[3], "2026-10-01");
  assert.equal(cells.filter(Boolean).length, 31);
  assert.equal(cells.includes("2026-10-32"), false);
});
