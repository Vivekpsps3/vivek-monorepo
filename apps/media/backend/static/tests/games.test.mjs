import assert from "node:assert/strict";
import test from "node:test";
import {
  gameProgressWords,
  gameStateOptions,
  gameStatusWords,
  visibleBays,
} from "../../../frontend/src/games.mjs";

const game = (id, status, extra = {}) => ({ id, status, title: `Game ${id}`, ...extra });

test("progress words use only a recorded hour or percent", () => {
  assert.equal(gameStatusWords("in_progress"), "Playing");
  assert.equal(gameStatusWords("want"), "Want to play");
  assert.equal(gameStatusWords("completed"), "Played");
  assert.equal(gameStatusWords("paused"), "Paused");
  assert.equal(gameStatusWords("dropped"), "Dropped");
  assert.equal(gameStatusWords("anticipating"), "Anticipating");
  assert.equal(gameProgressWords({ progress_value: 12, progress_unit: "hour" }), "12 hours recorded");
  assert.equal(gameProgressWords({ progress_value: 1, progress_unit: "hour" }), "1 hour recorded");
  assert.equal(gameProgressWords({ progress_value: 1.5, progress_unit: "hour" }), "1.5 hours recorded");
  assert.equal(gameProgressWords({ progress_value: 40, progress_unit: "percent" }), "40 percent recorded");
  assert.equal(gameProgressWords({ progress_value: 0, progress_unit: "percent" }), "0 percent recorded");
  assert.equal(gameProgressWords({}), "Progress not recorded");
  assert.equal(gameProgressWords({ status: "completed" }), "Progress not recorded");
  assert.equal(gameProgressWords({ progress_value: null, progress_unit: "hour" }), "Progress not recorded");
  assert.equal(
    gameProgressWords({ progress_label: "12 h", progress_unit: "hour" }),
    "Progress not recorded",
  );
  assert.equal(gameProgressWords({ progress_value: 4, progress_unit: "page", progress_label: "p. 4" }), "p. 4 recorded");
  assert.equal(gameStateOptions().some((item) => item.value === "in_progress" && item.label === "Playing"), true);
});

test("bays keep every game and do not merge the same title", () => {
  const items = [
    game(1, "in_progress", { title: "Lantern Kart", progress_value: 12, progress_unit: "hour" }),
    game(2, "want", { title: "Lantern Kart" }),
    game(3, "completed", { title: "Quiet Arcade" }),
    game(4, "anticipating", { title: "Anticipated Port" }),
    game(5, "paused", { title: "Paused Relay" }),
    game(6, "custom", { title: "Odd State" }),
  ];
  const open = visibleBays(items, "");
  assert.deepEqual(open.map((bay) => bay.id), [
    "playing",
    "want",
    "played",
    "anticipating",
    "paused",
    "other",
  ]);
  assert.equal(open.find((bay) => bay.id === "dropped"), undefined);
  assert.deepEqual(
    open.find((bay) => bay.id === "playing").games.map((item) => item.id),
    [1],
  );
  assert.deepEqual(
    open.find((bay) => bay.id === "want").games.map((item) => item.id),
    [2],
  );
  assert.equal(open.find((bay) => bay.id === "played").games[0].title, "Quiet Arcade");
  assert.equal(open.find((bay) => bay.id === "other").games[0].title, "Odd State");
  const playing = visibleBays(items, "in_progress");
  assert.deepEqual(playing.map((bay) => bay.id), ["playing"]);
  assert.equal(playing[0].label, "Playing");
  const emptyWant = visibleBays([game(3, "completed")], "");
  assert.equal(emptyWant.find((bay) => bay.id === "want").games.length, 0);
  assert.equal(emptyWant.find((bay) => bay.id === "want").empty, "No games waiting to be played.");
  assert.equal(emptyWant.find((bay) => bay.id === "played").empty, "No finished games in this cabinet.");
  assert.equal(visibleBays([], "").map((bay) => bay.id).join(","), "playing,want,played");
  assert.equal(visibleBays(null, "paused")[0].empty, "No paused games in this cabinet.");
});
