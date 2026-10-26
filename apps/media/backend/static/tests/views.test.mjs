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
  discographyHtml,
  libraryCard,
  libraryEmptyCopy,
  savedExpansion,
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

test("artist pages omit related and details", () => {
  assert.match(appSource, /entry\.kind === "artist" \? musicBlock\(entry\) : ""/);
  assert.match(appSource, /entry\.kind === "artist" \? "" : `<div class="web"/);
  assert.match(appSource, /entry\.kind !== "movie" && entry\.kind !== "tv"/);
  assert.doesNotMatch(appSource, /data-song-center/);
  assert.doesNotMatch(appSource, /kind !== "artist" && entry\.kind !== "movie"/);
  const list = relatedHtml([{ title: "Kid A" }]);
  assert.match(list, /<h2>Related<\/h2>/);
  assert.match(connectionsFailureHtml(), /Connections couldn't load\./);
  assert.equal(graphCenter("Radiohead"), "Radiohead");
});

test("library filters name what is showing and offer a reset", () => {
  assert.match(appSource, /libraryFilterSummary/);
  assert.match(appSource, /Showing <strong>/);
  assert.match(appSource, /href="#\/library">Reset/);
  assert.match(appCss, /#search-form\.filters/);
  assert.match(appCss, /align-items:\s*flex-end/);
});

test("a saved artist uses the same collapsed card as any other item", () => {
  const movie = libraryCard({ id: 3, kind: "movie", title: "Dune", year: 2021, status: "want", rating: 8 });
  const artist = libraryCard({
    id: 1,
    kind: "artist",
    title: "Artist A",
    status: "want",
    rating: 5,
    saved_count: 2,
  });
  const sameName = libraryCard({ id: 2, kind: "artist", title: "Artist A", status: "want", saved_count: 0 });
  assert.match(movie, /<a class="card" href="#\/item\/3">/);
  assert.match(movie, /Dune/);
  assert.match(movie, /Movie · 2021/);
  assert.match(movie, /Want to watch · 8\/10/);
  assert.doesNotMatch(movie, /saved-toggle|is-artist/);
  assert.match(artist, /<article class="card is-artist"/);
  assert.match(artist, /<a class="card-open" href="#\/item\/1">/);
  assert.match(artist, /<span class="meta">Artist<\/span><span class="meta">Following · 5\/10<\/span>/);
  assert.match(artist, /<\/a><button type="button" class="saved-toggle" data-action="toggle-saved" data-artist="1" aria-expanded="false" aria-controls="saved-1" aria-label="Saved albums and songs, 2">/);
  assert.match(artist, /class="saved-count">2</);
  assert.match(artist, /<div id="saved-1" class="saved-children" hidden>/);
  assert.match(sameName, /href="#\/item\/2"/);
  assert.match(sameName, /id="saved-2"/);
  assert.doesNotMatch(sameName, /id="saved-1"/);
  const saved = savedExpansion(1, {
    albums: [{ id: 10, title: "A1", year: 1999, tracks: [{ id: 11, title: "A2", rating: 4 }] }],
    songs: [{ id: 12, title: "Loose" }],
  });
  assert.match(saved, /href="#\/item\/10"/);
  assert.match(saved, /A1/);
  assert.match(saved, /href="#\/item\/11"/);
  assert.match(saved, /A2/);
  assert.match(saved, /href="#\/item\/12"/);
  assert.doesNotMatch(saved, /Browse discography|>B<|>B1</);
  const empty = savedExpansion(2, { albums: [], songs: [] }, { browse: true });
  assert.match(empty, /No saved albums or songs\./);
  assert.match(empty, /href="#\/item\/2\/discography">Browse discography</);
  const page = discographyHtml({
    artistId: 1,
    artist: "Artist A",
    release: "studio",
    partial: true,
    albums: [
      {
        source_id: "rg-a1",
        title: "A1",
        year: 1999,
        saved: true,
        saved_id: 10,
        tracks: [{ source_id: "rec-a2", title: "A2", position: 1, saved: true, saved_id: 11 }],
      },
      {
        source_id: "rg-b",
        title: "B",
        year: 2010,
        saved: false,
        tracks: [{ source_id: "rec-b1", title: "B1", position: 1, saved: false }],
      },
    ],
  });
  assert.match(page, /Studio albums only/);
  assert.match(page, /data-release="single"[^>]*>Singles</);
  assert.match(page, /data-release="studio"[^>]*aria-pressed="true"/);
  assert.match(page, /data-action="save-discovered" data-kind="track" data-source="rec-b1"/);
  assert.match(page, /class="in-library">Saved<\/span> <a href="#\/item\/10">Open<\/a>/);
  assert.match(page, /data-action="discography-more">Load more</);
  assert.doesNotMatch(page, /Nothing in this list/);
  const failed = discographyHtml({
    artistId: 1,
    artist: "Artist A",
    albums: [{ source_id: "rg-b", title: "B", saved: false, tracks: [] }],
    error: "The discography could not be loaded.",
  });
  assert.match(failed, /The discography could not be loaded\./);
  assert.match(failed, /<h2>B<\/h2>/);
  assert.match(failed, /data-action="discography-retry">Try again</);
  assert.doesNotMatch(appSource, /buildLibraryTree|artistSection|movieBrowseCards|\/api\/movies/);
  assert.doesNotMatch(appSource, /if \(kind\) return libraryCards/);
});

test("library empty copy names the filter, and search stays quiet until two letters", () => {
  assert.equal(libraryEmptyCopy({}).title, "Your library is empty");
  assert.equal(libraryEmptyCopy({}).primary.href, "#/search");
  assert.equal(libraryEmptyCopy({}).primary.label, "Search");
  assert.equal(libraryEmptyCopy({}).secondary.href, "#/new");
  assert.equal(libraryEmptyCopy({}).secondary.label, "Add by title");
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

test("a watched episode button toggles off", () => {
  assert.match(appSource, /function paintEpisodeWatch/);
  assert.match(appSource, /watched \? "Unwatch" : "Mark watched"/);
  assert.match(appSource, /aria-pressed"\) !== "true"/);
  assert.match(appSource, /JSON\.stringify\(\{ watched \}\)/);
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
