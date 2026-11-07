import assert from "node:assert/strict";
import test from "node:test";
import { episodeLabel, nextEpisodeError } from "../../../frontend/src/next-episode.mjs";

test("episodeLabel formats without padding", () => {
  assert.equal(episodeLabel(2, 4), "S2E4");
  assert.equal(episodeLabel(0, 1), "S0E1");
  assert.equal(episodeLabel(1, 12), "S1E12");
  assert.equal(episodeLabel(10, 3), "S10E3");
});

test("nextEpisodeError maps 0/502/503/504 to the offline copy", () => {
  for (const status of [0, 502, 503, 504]) {
    assert.deepEqual(nextEpisodeError(status, "Some server detail"), {
      message: "Can't reach Media. Your progress hasn't changed. Try again.",
      reload: false,
    });
  }
});

test("nextEpisodeError uses the server detail for 409 and asks for reload", () => {
  assert.deepEqual(
    nextEpisodeError(409, "That episode is no longer next. Refresh to see your progress."),
    {
      message: "That episode is no longer next. Refresh to see your progress.",
      reload: true,
    },
  );
  assert.deepEqual(nextEpisodeError(409, "A different stale explanation."), {
    message: "A different stale explanation.",
    reload: true,
  });
  for (const detail of [undefined, null, "", "   ", 409]) {
    assert.deepEqual(nextEpisodeError(409, detail), {
      message: "That episode is no longer next. Refresh to see your progress.",
      reload: true,
    });
  }
});

test("nextEpisodeError 404 copy and reload", () => {
  assert.deepEqual(nextEpisodeError(404, "Not found"), {
    message: "This show isn't in your library anymore.",
    reload: true,
  });
  assert.deepEqual(nextEpisodeError(404), {
    message: "This show isn't in your library anymore.",
    reload: true,
  });
});

test("nextEpisodeError falls back for other statuses", () => {
  assert.deepEqual(nextEpisodeError(500, "Boom."), {
    message: "Boom.",
    reload: false,
  });
  for (const detail of [undefined, null, "", { detail: "nested" }]) {
    assert.deepEqual(nextEpisodeError(500, detail), {
      message: "This could not finish. Your progress hasn't changed. Try again.",
      reload: false,
    });
  }
  assert.deepEqual(nextEpisodeError(422), {
    message: "This could not finish. Your progress hasn't changed. Try again.",
    reload: false,
  });
});
