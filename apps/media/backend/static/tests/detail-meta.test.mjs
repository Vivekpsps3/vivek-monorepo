import assert from "node:assert/strict";
import test from "node:test";
import {
  episodeCode,
  kindIcon,
  kindLabel,
  metaChips,
  placeholderLetter,
  stateLabel,
  toggleLabel,
} from "../../../frontend/src/detail-meta.mjs";

test("kindIcon maps all kinds with fallback", () => {
  assert.equal(kindIcon("movie"), "film");
  assert.equal(kindIcon("tv"), "tv");
  assert.equal(kindIcon("book"), "book");
  assert.equal(kindIcon("track"), "music");
  assert.equal(kindIcon("album"), "music");
  assert.equal(kindIcon("artist"), "music");
  assert.equal(kindIcon("game"), "game");
  assert.equal(kindIcon("podcast"), "document");
  assert.equal(kindIcon(""), "document");
  assert.equal(kindIcon(undefined), "document");
});

test("kindLabel maps all kinds", () => {
  assert.equal(kindLabel("movie"), "Movie");
  assert.equal(kindLabel("tv"), "Series");
  assert.equal(kindLabel("book"), "Book");
  assert.equal(kindLabel("track"), "Song");
  assert.equal(kindLabel("album"), "Album");
  assert.equal(kindLabel("artist"), "Artist");
  assert.equal(kindLabel("game"), "Game");
});

test("stateLabel maps all statuses", () => {
  assert.equal(stateLabel("want"), "Want to");
  assert.equal(stateLabel("anticipating"), "Anticipating");
  assert.equal(stateLabel("in_progress"), "In progress");
  assert.equal(stateLabel("completed"), "Completed");
  assert.equal(stateLabel("paused"), "Paused");
  assert.equal(stateLabel("dropped"), "Dropped");
  assert.equal(stateLabel("following"), "Following");
  assert.equal(stateLabel("unfollowed"), "Unfollowed");
  assert.equal(stateLabel("unknown"), "");
  assert.equal(stateLabel(""), "");
});

test("metaChips skips missing parts and truncates creator", () => {
  assert.deepEqual(
    metaChips({ kind: "movie", year: 2024, creator: "Some Creator", status: "want" }),
    ["Movie", "2024", "Some Creator", "Want to"],
  );
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

test("placeholderLetter handles emoji, lowercase and empty", () => {
  assert.equal(placeholderLetter("🎬 Night"), "🎬");
  assert.equal(placeholderLetter("dune"), "D");
  assert.equal(placeholderLetter("  dune"), "D");
  assert.equal(placeholderLetter("9 songs"), "9");
  assert.equal(placeholderLetter(""), "?");
  assert.equal(placeholderLetter("   "), "?");
});

test("toggleLabel formats SxEy", () => {
  assert.equal(episodeCode(1, 3), "S1E3");
  assert.equal(episodeCode(2, 10), "S2E10");
  assert.equal(toggleLabel(1, 3), "Mark S1E3 watched");
  assert.equal(toggleLabel(12, 1), "Mark S12E1 watched");
});
