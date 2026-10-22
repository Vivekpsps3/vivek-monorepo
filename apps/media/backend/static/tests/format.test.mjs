import assert from "node:assert/strict";
import test from "node:test";
import { WEEK_STARTS_ON, chooseReview, coverImage, dayLabel, draftKey, emptyState, escapeHtml, genericStatusOptions, monthCells, monthLabel, normalizeLibraryQuery, progressPreview, progressUnits, ratingText, releaseLabel, routeErrorCopy, safeUrl, seasonLabel, shiftMonth, statusLabel, weekDayLabels, whenLabel } from "../modules/format.mjs";

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
  assert.equal(statusLabel("artist", "want"), "Following");
  assert.equal(statusLabel("movie", "want"), "Want to Watch");
  assert.equal(statusLabel("book", "want"), "Want to Read");
  assert.equal(statusLabel("game", "want"), "Want to Play");
  assert.equal(statusLabel("movie", "completed"), "Watched");
  assert.equal(statusLabel("tv", "completed"), "Watched");
  assert.equal(statusLabel("book", "completed"), "Read");
  assert.equal(statusLabel("game", "completed"), "Played");
  assert.equal(statusLabel("album", "completed"), "Listened");
  assert.equal(genericStatusOptions().find(row => row.value === "completed").label, "Finished");
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

test("review drafts win only when they still match the server base", () => {
  const serverAt = "2026-10-21T20:00:00+00:00";
  assert.deepEqual(chooseReview("B", serverAt, null), { text: "B", restore: false });
  assert.deepEqual(chooseReview("B", serverAt, { text: "", base: serverAt }), { text: "B", restore: false });
  assert.deepEqual(chooseReview("B", serverAt, { text: "A", base: "2000-01-01T00:00:00+00:00" }), { text: "B", restore: true });
  assert.deepEqual(chooseReview("B", serverAt, { text: "A", base: serverAt }), { text: "A", restore: false });
  assert.deepEqual(chooseReview("B", serverAt, { text: "B", base: "other" }), { text: "B", restore: false });
  assert.deepEqual(chooseReview("B", serverAt, { text: "A", at: "2099-01-01T00:00:00.000Z" }), { text: "B", restore: true });
  assert.deepEqual(chooseReview("B", null, { text: "A", base: "" }), { text: "A", restore: false });
});

test("library query drops unknown sort, kind, and status", () => {
  const cleaned = normalizeLibraryQuery("sort=nope&kind=poster&status=nope&q=dune");
  assert.equal(cleaned.droppedSort, true);
  assert.equal(cleaned.changed, true);
  assert.equal(cleaned.params.get("sort"), null);
  assert.equal(cleaned.params.get("kind"), null);
  assert.equal(cleaned.params.get("status"), null);
  assert.equal(cleaned.params.get("q"), "dune");
  const title = normalizeLibraryQuery("sort=title&kind=book");
  assert.equal(title.changed, false);
  assert.equal(title.params.get("sort"), "title");
  const cased = normalizeLibraryQuery("sort=Title");
  assert.equal(cased.droppedSort, false);
  assert.equal(cased.changed, true);
  assert.equal(cased.params.get("sort"), "title");
});

test("progress units and cover images stay inside their own fields", () => {
  assert.deepEqual(progressUnits("book").map(item => item.value), ["page", "percent"]);
  assert.deepEqual(progressUnits("game").map(item => item.value), ["percent", "hour"]);
  assert.equal(progressPreview("120", "page"), "p. 120");
  assert.equal(progressPreview("42", "percent"), "42%");
  assert.equal(progressPreview("", "page"), "");
  assert.equal(coverImage("javascript:alert(1)"), "");
  assert.equal(coverImage("https://covers.example/a).jpg"), '<img alt="" src="https://covers.example/a).jpg" width="300" height="300" loading="lazy" decoding="async">');
  assert.equal(coverImage('https://covers.example/a".jpg'), '<img alt="" src="https://covers.example/a%22.jpg" width="300" height="300" loading="lazy" decoding="async">');
});

test("calendar weeks start on Sunday for en-US and step across years", () => {
  assert.equal(WEEK_STARTS_ON, 0);
  assert.deepEqual(weekDayLabels().slice(0, 3), ["Sun", "Mon", "Tue"]);
  assert.equal(monthLabel("2026-10"), "October 2026");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  const cells = monthCells("2026-10");
  assert.equal(cells.length % 7, 0);
  assert.equal(cells[0], null);
  assert.equal(cells[4], "2026-10-01");
  assert.equal(cells.filter(Boolean).length, 31);
  assert.equal(cells.includes("2026-10-32"), false);
});

test("empty state escapes its copy and route errors are one panel", () => {
  const html = emptyState({
    title: "Nothing <here>",
    body: "Try again.",
    primary: { href: "#/search", label: "Find something" },
    secondary: { href: "#/library", label: "Library" },
  });
  assert.match(html, /class="empty(?:\s|")/);
  assert.match(html, /Nothing &lt;here&gt;/);
  assert.match(html, /class="btn btn-primary"/);
  assert.match(emptyState({ icon: "<star>" }), /class="empty-icon" aria-hidden="true">&lt;star&gt;/);
  assert.deepEqual(routeErrorCopy("item", { status: 404, message: "That item is not in your library." }), {
    title: "This item isn't in your library",
    body: "It may have been removed.",
    retry: true,
    links: [
      { href: "#/library", label: "Open library" },
      { href: "#/search", label: "Search" },
    ],
  });
  assert.equal(routeErrorCopy("home", { status: 0, message: "Failed to fetch" }).title, "Can't reach Media");
  assert.equal(routeErrorCopy("library", { status: 503, message: "nope" }).title, "Sign-in is unavailable right now");
  assert.equal(routeErrorCopy("library", { status: 503, message: "nope" }).body, "Try again in a minute.");
  assert.equal(routeErrorCopy("calendar", { status: 500, message: "Nope." }).title, "Couldn't load the calendar");
  assert.equal(routeErrorCopy("home", { status: 500, message: "Nope." }).links[0].label, "Open library");
});
