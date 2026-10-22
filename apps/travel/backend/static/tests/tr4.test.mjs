import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { homeState, screenNav, visiblePlans } from "../modules/screens.mjs";

test("new trip highlights no nav item and upcoming stays current on a trip", () => {
  assert.equal(screenNav("new"), "");
  assert.equal(screenNav("settings"), "");
  assert.equal(screenNav("not-found"), "");
  assert.equal(screenNav("home"), "home");
  assert.equal(screenNav("trip"), "home");
  assert.equal(screenNav("calendar"), "calendar");
});

test("an empty upcoming page hides metrics and a long trip caps planned days", () => {
  const empty = homeState({ in_progress: [], upcoming: [], past: [] });
  assert.equal(empty.metrics, false);
  assert.equal(empty.heading, "No trips planned");
  const pastOnly = homeState({ in_progress: [], upcoming: [], past: [{}] });
  assert.equal(pastOnly.metrics, true);
  assert.match(pastOnly.body, /past trips are below/);
  const plans = visiblePlans([
    { items: [{}], transports: [] },
    { items: [{}], transports: [] },
    { items: [], transports: [{}] },
    { items: [{}], transports: [] },
    { items: [], transports: [] },
  ]);
  assert.equal(plans.shown.length, 3);
  assert.equal(plans.more, 1);
});

test("the header is one row and the old wide breakpoints are gone", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
  const home = readFileSync(new URL("../modules/views/home.mjs", import.meta.url), "utf8");
  assert.match(html, /aria-label="More"/);
  assert.match(html, /role="radiogroup"/);
  assert.equal(html.includes(">Hub</a>\n        <a class=\"btn btn-primary"), false);
  assert.equal(css.includes("max-width: 960px"), false);
  assert.equal(css.includes("max-width: 900px"), false);
  assert.equal(css.includes("max-width: 800px"), false);
  assert.equal(css.includes("max-width: 380px"), false);
  assert.match(css, /min-width: 768px/);
  assert.match(css, /min-width: 1280px/);
  assert.match(css, /max-height: 500px/);
  assert.match(home, /Plan a trip/);
  assert.match(home, /visiblePlans/);
  assert.equal(home.includes(">Open</a>"), false);
});
