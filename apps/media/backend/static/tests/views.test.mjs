import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { writeWeekStart } from "../../../../../packages/browser/runtime/week.mjs";
import {
  addFormInner,
  connectionsFailureHtml,
  creatorLabel,
  emptyMonthHtml,
  graphCenter,
  legendHtml,
  libraryEmptyCopy,
  markNextLabel,
  noteCardHtml,
  noteCountText,
  overviewHtml,
  relatedHtml,
  releaseInformative,
  searchIdleHtml,
  searchResultHeading,
  validateAdd,
} from "../modules/views.mjs";

const appCss = readFileSync(new URL("../app.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../modules/app.mjs", import.meta.url), "utf8");

test("the add form asks for a title and refuses a native tooltip", () => {
  const html = addFormInner({ title: "Dune", kind: "book" });
  assert.match(html, /novalidate|name="title"/);
  assert.match(html, /name="title"/);
  assert.match(html, /aria-label="Type"/);
  assert.match(html, /aria-label="Status"/);
  assert.match(html, /Add to library/);
  assert.match(html, /Author/);
  assert.equal(creatorLabel("game"), "Developer");
  assert.deepEqual(validateAdd({ title: "  ", year: "" }), { title: "Enter a title." });
  assert.equal(validateAdd({ title: "Dune", year: "99" }).year, "Year must be a number from 1000 to 3000.");
  assert.deepEqual(validateAdd({ title: "Dune", year: "" }), {});
  const prefilled = addFormInner({ title: "Dune", kind: "book", prefilled: true });
  assert.match(prefilled, /type="hidden" name="title"/);
  assert.doesNotMatch(prefilled, /<label>Title/);
});

test("a release row appears only when it adds a day, month, platform, or region", () => {
  assert.equal(releaseInformative({ precision: "year", released_on: "1965" }), false);
  assert.equal(releaseInformative({ precision: "day", released_on: "1965-08-01" }), true);
  assert.equal(releaseInformative({ precision: "year", platform: "PC" }), true);
});

test("the overview toggle and the note count follow the spec", () => {
  const overview = overviewHtml("A long overview.");
  assert.match(overview, /aria-expanded="false"/);
  assert.match(overview, />More</);
  assert.equal(noteCountText("x".repeat(18000)), "");
  assert.equal(noteCountText("x".repeat(18001)), "18,001 / 20,000");
});

test("a song click keeps the artist at the center of related", () => {
  assert.equal(graphCenter("Radiohead"), "Radiohead");
  assert.match(appSource, /paintWeb\(graphCenter\(webCenter\)\)/);
  assert.doesNotMatch(appSource, /paintWeb\(song\.dataset\.songCenter\)/);
  const list = relatedHtml([{ title: "Kid A" }]);
  assert.match(list, /<svg aria-hidden="true"/);
  assert.match(list, /href="#\/search\?q=Kid%20A"/);
  assert.match(connectionsFailureHtml(), /Connections couldn't load\./);
});

test("library filters name what is showing and offer a reset", () => {
  assert.match(appSource, /libraryFilterSummary/);
  assert.match(appSource, /Showing <strong>/);
  assert.match(appSource, /href="#\/library">Reset/);
  assert.match(appCss, /#search-form\.filters/);
  assert.match(appCss, /align-items:\s*flex-end/);
});

test("library empty copy names the filter, and search stays quiet until two letters", () => {
  assert.equal(libraryEmptyCopy({}).title, "Your library is empty");
  assert.equal(libraryEmptyCopy({ kind: "book", status: "dropped" }).title, "No books marked Dropped");
  assert.equal(libraryEmptyCopy({ q: "dune" }).title, "No matches for “dune”");
  assert.match(libraryEmptyCopy({ q: "dune" }).primary.label, /Search all of Media/);
  assert.match(searchIdleHtml(""), /public catalogs/);
  assert.match(searchIdleHtml("d"), /at least 2 letters/);
  assert.equal(searchResultHeading(), ".result h2");
});

test("the calendar legend is absent for an empty month and today copy is specific", () => {
  assert.equal(legendHtml({ days: [], month_band: [], year_band: [], unknown: [] }), "");
  assert.match(legendHtml({ days: [{ events: [{ type: "episode" }] }] }), /Episode/);
  assert.match(emptyMonthHtml("October 2026", "#/calendar?month=2026-11"), /Nothing scheduled in October/);
  const card = noteCardHtml({ id: 4, title: "Dune", rating: 8, review_excerpt: "Sand.", review_updated_at: "2026-10-21T00:00:00Z" }, new Date("2026-10-22T12:00:00"));
  assert.match(card, /note-card/);
  assert.match(card, /excerpt/);
  assert.match(card, /Yesterday/);
});

test("a show offers Mark S2 E3 watched until it is caught up", () => {
  assert.equal(markNextLabel({ next_episode: { season_number: 2, episode_number: 3 }, caught_up: false }), "Mark S2 E3 watched");
  assert.equal(markNextLabel({ next_episode: null, caught_up: true }), "");
});

test("episodes that have not aired cannot be marked watched in the UI", () => {
  assert.match(appSource, /item\.state !== "upcoming"/);
  assert.match(appSource, /has not aired yet/);
  assert.match(appSource, /Has not aired yet/);
  assert.match(appSource, /episode\.released === false && !episode\.watched/);
});

test("type scale and motion live in app.css", () => {
  assert.doesNotMatch(appCss, /11px|clamp\(2rem/);
  assert.match(appCss, /font-size:\s*var\(--text-display-lg\)/);
  assert.match(appCss, /var\(--motion-fast\)/);
  assert.match(appCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(appCss, /animation:\s*none/);
});

test("week start can be set to Monday and back to Sunday", () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  assert.equal(writeWeekStart(1), 1);
  assert.equal(localStorage.getItem("suite-week-start"), "1");
  assert.equal(writeWeekStart("nope"), 0);
  delete globalThis.localStorage;
});
