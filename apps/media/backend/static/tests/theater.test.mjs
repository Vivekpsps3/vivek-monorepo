import assert from "node:assert/strict";
import test from "node:test";
import { filmShelf, recordedViewing, seriesShelf } from "../../../frontend/src/theater.mjs";

test("a watched film and a planned film differ without inventing a date", () => {
  assert.deepEqual(filmShelf("want", "2024-03-02"), {
    tone: "planned",
    fact: "Planned",
    viewedOn: null,
  });
  assert.deepEqual(filmShelf("anticipating", null), {
    tone: "planned",
    fact: "Planned",
    viewedOn: null,
  });
  assert.deepEqual(filmShelf("completed", null), {
    tone: "watched",
    fact: "Watched",
    viewedOn: null,
  });
  assert.deepEqual(filmShelf("completed", ""), {
    tone: "watched",
    fact: "Watched",
    viewedOn: null,
  });
  assert.deepEqual(filmShelf("completed", "2024-03-02"), {
    tone: "watched",
    fact: "Watched",
    viewedOn: "2024-03-02",
  });
  assert.deepEqual(filmShelf("in_progress", "2024-03-02"), {
    tone: "watching",
    fact: "Watching",
    viewedOn: null,
  });
  assert.equal(recordedViewing("tomorrow"), null);
  assert.equal(recordedViewing("2024-03-02"), "2024-03-02");
});

test("series lifecycle stays separate from caught up and the next episode", () => {
  assert.deepEqual(seriesShelf({ lifecycle: { state: "ongoing" } }), {
    lifecycle: "ongoing",
    lifecycleLabel: "Ongoing",
    progress: "none",
    fact: "No episodes logged",
  });
  const caughtUp = seriesShelf({
    caught_up: true,
    lifecycle: { state: "ongoing", raw_value: "Returning Series" },
    continuation: { state: "upcoming", season: 2, episode: 1 },
  });
  assert.equal(caughtUp.fact, "Caught up");
  assert.equal(caughtUp.lifecycleLabel, "Ongoing");
  assert.notEqual(caughtUp.fact, caughtUp.lifecycleLabel);
  assert.equal(
    seriesShelf({
      caught_up: true,
      lifecycle: { state: "ended", raw_value: "Ended" },
    }).lifecycleLabel,
    "Ended",
  );
  assert.equal(
    seriesShelf({
      caught_up: false,
      lifecycle: { state: "ongoing", raw_value: "planned" },
      continuation: { state: "next", season: 1, episode: 4 },
    }).fact,
    "Next S1E4",
  );
  assert.equal(
    seriesShelf({
      lifecycle: { state: "ongoing", raw_value: "planned" },
    }).lifecycle,
    "planned",
  );
});
