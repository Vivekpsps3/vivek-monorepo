import assert from "node:assert/strict";
import test from "node:test";
import { affectedSentence, orderGroups } from "../modules/search-groups.mjs";

test("dune puts an exact book before other kinds", () => {
  const groups = orderGroups([
    { kind: "movie", title: "Dune" },
    { kind: "book", title: "Dune Messiah" },
    { kind: "book", title: "Dune" },
    { kind: "track", title: "Dune" },
  ], "dune");
  assert.deepEqual(groups.map(group => group.kind), ["book", "movie", "track"]);
  assert.equal(groups[0].rows[0].title, "Dune");
  assert.equal(groups[0].rows[1].title, "Dune Messiah");
});

test("a missing movie key says movies, series and games, and hides a healthy catalog", () => {
  assert.equal(
    affectedSentence({ tmdb: "unconfigured", rawg: "unconfigured", openlibrary: "ok", musicbrainz: "ok" }),
    "Movies, series and games can't be searched right now.",
  );
  assert.equal(affectedSentence({ openlibrary: "ok", musicbrainz: "ok" }), "");
  assert.equal(affectedSentence({ openlibrary: "error" }), "Books can't be searched right now.");
});

test("a healthy keyless catalog covers the type a missing key used to block", () => {
  assert.equal(
    affectedSentence({
      tmdb: "unconfigured",
      tvmaze: "ok",
      rawg: "unconfigured",
      steam: "ok",
      openlibrary: "ok",
      musicbrainz: "ok",
    }),
    "Movies can't be searched right now.",
  );
  assert.equal(
    affectedSentence({ tmdb: "ok", tvmaze: "ok", rawg: "unconfigured", steam: "ok" }),
    "",
  );
});
