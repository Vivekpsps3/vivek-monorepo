import assert from "node:assert/strict";
import test from "node:test";
import {
  continuationFromShow,
  episodeSeat,
  filmShelf,
  progressKey,
  progressKeyFromShow,
  recordedViewing,
  seatingRows,
  seriesShelf,
  showContinuation,
} from "../../../frontend/src/theater.mjs";

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

test("continuation comes from the show payload and keeps a null title", () => {
  assert.equal(continuationFromShow(null), null);
  assert.deepEqual(
    continuationFromShow({
      next_episode: {
        id: 4,
        season_number: 1,
        episode_number: 2,
        title: null,
        air_date: "2020-01-01",
        released: true,
      },
      upcoming_episodes: [{ id: 9, season_number: 2, episode_number: 1, title: "Later", released: false }],
    }),
    {
      episode_id: 4,
      season: 1,
      episode: 2,
      title: null,
      air_date: "2020-01-01",
      state: "next",
    },
  );
  const upcoming = continuationFromShow({
    next_episode: null,
    upcoming_episodes: [{ id: 9, season_number: 2, episode_number: 1, title: "Later", air_date: "2099-01-01", released: false }],
  });
  assert.equal(upcoming.state, "upcoming");
  assert.equal(upcoming.title, "Later");
  const card = { continuation: upcoming };
  assert.equal(showContinuation(card), upcoming);
  assert.equal(showContinuation({}), null);
});

test("seats keep future and unknown air dates off watched and next", () => {
  const episodes = [
    {
      id: 1,
      season_number: 1,
      episode_number: 1,
      title: "Pilot",
      air_date: "2020-01-01",
      watched: true,
      watched_on: "2024-03-02",
      released: true,
    },
    {
      id: 2,
      season_number: 1,
      episode_number: 2,
      title: "Soon",
      air_date: "2099-01-01",
      watched: false,
      released: false,
    },
    {
      id: 3,
      season_number: 1,
      episode_number: 3,
      title: "Mystery",
      air_date: null,
      watched: false,
      released: false,
    },
    {
      id: 4,
      season_number: 0,
      episode_number: 1,
      title: "Extra",
      air_date: "2020-01-01",
      watched: false,
      released: true,
    },
    {
      id: 5,
      season_number: 1,
      episode_number: 4,
      title: "Now",
      air_date: "2020-02-01",
      watched: false,
      released: true,
    },
  ];
  const rows = seatingRows(episodes, 5);
  assert.equal(rows[0].label, "Specials");
  assert.equal(rows[0].seats[0].place, "special");
  assert.equal(rows[0].seats[0].label, "Special");
  const season = rows.find((row) => row.season === 1);
  const place = Object.fromEntries(season.seats.map((seat) => [seat.code, seat.place]));
  assert.deepEqual(place, { S1E1: "watched", S1E2: "future", S1E3: "unknown", S1E4: "next" });
  assert.equal(season.seats.find((seat) => seat.code === "S1E2").label, "Future");
  assert.equal(season.seats.find((seat) => seat.code === "S1E3").label, "Air date unknown");
  assert.equal(episodeSeat(episodes[1], 2).place, "future");
  assert.equal(seatingRows(episodes, null)[1].seats.find((seat) => seat.code === "S1E4").place, "aired");
  const show = {
    watched_count: 1,
    caught_up: false,
    next_episode: {
      id: 5,
      season_number: 1,
      episode_number: 4,
      title: "Now",
      air_date: "2020-02-01",
      released: true,
    },
    upcoming_episodes: [],
  };
  assert.equal(
    progressKeyFromShow(show),
    progressKey({
      watched_count: 1,
      caught_up: false,
      continuation: continuationFromShow(show),
    }),
  );
});
