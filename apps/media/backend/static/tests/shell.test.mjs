import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { icon } from "../modules/icons.mjs";

import {
  documentTitle,
  msUntilLocalMidnight,
  navKey,
  notFoundHtml,
  parseRoute,
  screenTitle,
  tabBarHidden,
} from "../modules/shell.mjs";

test("unknown hashes are not Now", () => {
  assert.equal(parseRoute("#/foo").name, "missing");
  assert.equal(parseRoute("#/item/nope").name, "missing");
  assert.equal(parseRoute("#/").name, "home");
  assert.equal(parseRoute("#/library?sort=title").name, "library");
  assert.equal(parseRoute("#/item/4/episode/9").name, "episode");
  assert.equal(parseRoute("#/item/4/season/2").seasonNumber, 2);
  assert.equal(navKey("item"), "library");
  assert.equal(navKey("episode"), "library");
  assert.equal(navKey("missing"), "");
  assert.equal(navKey("new"), "new");
});

test("document titles follow the screen map", () => {
  assert.equal(documentTitle({ name: "home" }), "Now · Media");
  assert.equal(documentTitle({ name: "library" }), "Library · Media");
  assert.equal(documentTitle({ name: "search" }, { query: "dune" }), "“dune” · Search · Media");
  assert.equal(documentTitle({ name: "search" }), "Search · Media");
  assert.equal(documentTitle({ name: "new" }), "Add · Media");
  assert.equal(documentTitle({ name: "item" }, { title: "Dune" }), "Dune · Media");
  assert.equal(documentTitle({ name: "episode" }, { season: 1, episode: 3, episodeTitle: "Pilot", show: "Dune" }), "S1 E3 Pilot · Dune · Media");
  assert.equal(documentTitle({ name: "calendar" }, { monthLabel: "October 2026" }), "October 2026 · Calendar · Media");
  assert.equal(documentTitle({ name: "missing" }), "Not found · Media");
  assert.equal(screenTitle({ name: "new" }), "Add");
});

test("not-found copy names the hash and offers Now", () => {
  const html = notFoundHtml("#/foo");
  assert.match(html, /<h1[^>]*>Page not found<\/h1>/);
  assert.match(html, /There&#39;s nothing at #\/foo in Media\./);
  assert.match(html, /href="#\/"/);
  assert.match(html, /Go to Now/);
  assert.match(html, /Open library/);
  assert.doesNotMatch(html, /<h1[^>]*>Now<\/h1>/);
});

test("a short viewport hides the tab bar only while scrolling down", () => {
  assert.equal(tabBarHidden(0, 40, true, false), true);
  assert.equal(tabBarHidden(40, 0, true, true), false);
  assert.equal(tabBarHidden(10, 12, true, false), false);
  assert.equal(tabBarHidden(0, 80, false, false), false);
});

test("the shell has five mobile tabs and a currentColor favicon", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const tab = html.slice(html.indexOf('class="tabbar"'));
  const tabNav = tab.slice(0, tab.indexOf("</nav>"));
  assert.equal((tabNav.match(/data-nav="/g) || []).length, 5);
  assert.match(html, /class="mobile-bar"/);
  assert.match(html, /data-action="open-add"/);
  assert.doesNotMatch(html, /aria-current="false"/);
  assert.match(icon("now"), /aria-hidden="true"/);
  assert.match(icon("search"), /<svg/);
  assert.equal(icon("missing"), "");
  const favicon = readFileSync(new URL("../favicon.svg", import.meta.url), "utf8");
  assert.match(favicon, /stroke="currentColor"/);
  assert.match(favicon, /prefers-color-scheme:\s*dark/);
  assert.doesNotMatch(favicon, /#0f6e6a/);
  const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.season-row|\.episode-row|\.album-block|\.episode-open/);
  assert.doesNotMatch(css, /min-height:\s*40px/);
});

test("midnight is the next local day, not a fixed delay", () => {
  const now = new Date(2026, 9, 22, 23, 0, 0);
  assert.equal(msUntilLocalMidnight(now), 60 * 60 * 1000);
  const source = readFileSync(new URL("../modules/app.mjs", import.meta.url), "utf8");
  assert.match(source, /msUntilLocalMidnight/);
  assert.match(source, /paintToday\(\)/);
});
