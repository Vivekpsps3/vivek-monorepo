import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanPopular,
  popularError,
  safeArt,
} from "../../../frontend/src/popular.mjs";

test("safeArt allows tmdb only", () => {
  assert.equal(
    safeArt("https://image.tmdb.org/t/p/w500/poster.jpg"),
    "https://image.tmdb.org/t/p/w500/poster.jpg",
  );
  assert.equal(safeArt("https://example.com/poster.jpg"), null);
  assert.equal(safeArt("https://image.tmdb.org.evil.example/poster.jpg"), null);
  assert.equal(safeArt("http://image.tmdb.org/poster.jpg"), null);
  assert.equal(safeArt(""), null);
  assert.equal(safeArt(null), null);
  assert.equal(safeArt(undefined), null);
});

test("cleanPopular drops bad rows, dedupes and caps at 20", () => {
  const rows = [
    { title: "Dune", source: "tmdb", source_id: "1", kind: "movie" },
    { title: "Dune again", source: "tmdb", source_id: "1", kind: "movie" },
    { title: "Series row", source: "tmdb", source_id: "2", kind: "tv" },
    { title: "", source: "tmdb", source_id: "3" },
    { title: "No source", source_id: "4" },
    { title: "No id", source: "tmdb" },
    { title: "Numeric id", source: "tmdb", source_id: 5 },
    null,
    "Dune",
  ];
  assert.deepEqual(cleanPopular(rows), [
    { title: "Dune", source: "tmdb", source_id: "1", kind: "movie" },
    { title: "Series row", source: "tmdb", source_id: "2", kind: "movie" },
  ]);
  const many = Array.from({ length: 25 }, (_, i) => ({
    title: "Movie " + i,
    source: "tmdb",
    source_id: String(i),
  }));
  const capped = cleanPopular(many);
  assert.equal(capped.length, 20);
  assert.equal(capped[0].kind, "movie");
  assert.deepEqual(cleanPopular(undefined), []);
});

test("popularError maps 0 and 5xx to service copy", () => {
  assert.equal(popularError(0), "Can't reach the movie service.");
  assert.equal(popularError(500), "Can't reach the movie service.");
  assert.equal(popularError(502), "Can't reach the movie service.");
  assert.equal(popularError(401), "");
  assert.equal(popularError(404), "Popular movies didn't load.");
  assert.equal(popularError(403), "Popular movies didn't load.");
});
