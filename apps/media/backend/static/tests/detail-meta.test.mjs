import assert from "node:assert/strict";
import test from "node:test";
import {
  aboutSummary,
  artRatio,
  dateOnly,
  episodeCode,
  episodeDateLine,
  experienceTitle,
  kindIcon,
  kindLabel,
  metaChips,
  moreSummary,
  needsMoreOpen,
  placeholderLetter,
  progressPrimary,
  stateLabel,
  statusChoices,
  statusFieldLabel,
  toggleLabel,
} from "../../../frontend/src/detail-meta.mjs";

test("metaChips skips missing parts and truncates creator", () => {
  assert.deepEqual(
    metaChips({ kind: "movie", year: 2024, creator: "Some Creator", status: "want" }),
    ["Movie", "2024", "Some Creator", "Want to watch"],
  );
  assert.deepEqual(metaChips({ kind: "book", status: "in_progress" }), [
    "Book",
    "Reading",
  ]);
  assert.deepEqual(metaChips({ kind: "tv", status: "completed" }), [
    "Series",
    "Watched",
  ]);
  assert.deepEqual(metaChips({ kind: "book", year: null, creator: null, status: "" }), [
    "Book",
  ]);
  assert.deepEqual(
    metaChips({ kind: "artist", creator: "  Padded Name  ", status: "following" }),
    ["Artist", "Padded Name", "Following"],
  );
  const long = metaChips({ kind: "movie", creator: "c".repeat(61) });
  assert.deepEqual(long, ["Movie", "c".repeat(60) + "…"]);
  const exact = metaChips({ kind: "movie", creator: "c".repeat(60) });
  assert.deepEqual(exact, ["Movie", "c".repeat(60)]);
});

test("detail copy, ratio, dates and disclosure follow the kind", () => {
  assert.equal(artRatio(), "2 / 3");
  assert.equal(experienceTitle("tv"), "Your series");
  assert.equal(experienceTitle("book"), "Your book");
  assert.equal(experienceTitle("track"), "Your song");
  assert.equal(aboutSummary("movie"), "About this movie");
  assert.equal(aboutSummary(""), "About this item");
  assert.equal(statusFieldLabel("artist"), "Relationship");
  assert.equal(statusFieldLabel("book"), "State");
  assert.deepEqual(
    statusChoices("artist").map((choice) => choice.value),
    ["following", "unfollowed"],
  );
  assert.equal(statusChoices("game").find((choice) => choice.value === "completed").label, "Played");
  assert.equal(stateLabel("want", "book"), "Want to read");
  assert.equal(stateLabel("want"), "Want to");
  assert.equal(progressPrimary("book"), true);
  assert.equal(progressPrimary("game"), true);
  assert.equal(progressPrimary("tv"), false);
  assert.equal(progressPrimary("movie"), false);
  assert.equal(moreSummary("tv"), "Manual progress");
  assert.equal(moreSummary("book"), "Anticipation");
  assert.equal(moreSummary("movie"), "Progress and anticipation");
  assert.equal(needsMoreOpen("artist", { anticipated: true, progress: 4, unit: "page" }), false);
  assert.equal(needsMoreOpen("book", { anticipated: false, progress: 12, unit: "page" }), false);
  assert.equal(needsMoreOpen("book", { anticipated: true, progress: null, unit: "" }), true);
  assert.equal(needsMoreOpen("movie", { anticipated: false, progress: null, unit: "" }), false);
  assert.equal(needsMoreOpen("movie", { anticipated: false, progress: 0, unit: "" }), true);
  assert.equal(needsMoreOpen("tv", { anticipated: false, progress: null, unit: "episode" }), true);
  assert.equal(dateOnly("2000-01-01T12:00:00Z"), "2000-01-01");
  assert.equal(dateOnly("not-a-date"), "");
  assert.equal(dateOnly(null), "");
  assert.equal(episodeDateLine("", ""), "Air date unknown");
  assert.equal(episodeDateLine("Sat, Jan 1, 2000", ""), "Sat, Jan 1, 2000");
  assert.equal(
    episodeDateLine("Sat, Jan 1, 2000", "Wed, Nov 11, 2026"),
    "Sat, Jan 1, 2000 · Watched Wed, Nov 11, 2026",
  );
});
