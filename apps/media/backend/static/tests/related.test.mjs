import assert from "node:assert/strict";
import test from "node:test";
import {
  RELATED_ATTEMPT_LIMIT,
  RELATED_KINDS,
  cleanNodes,
  relatedHref,
  relationLabel,
} from "../../../frontend/src/related.mjs";

test("a related manual link keeps the open type", () => {
  assert.equal(relatedHref({ title: "Paper Harbor" }, "book"), "/media/add?title=Paper%20Harbor&kind=book");
  assert.equal(relatedHref({ title: "Paper Harbor" }), "/media/add?title=Paper%20Harbor");
});

test("related kinds are movie, series and book, never an artist", () => {
  assert.deepEqual(RELATED_KINDS, ["movie", "tv", "book"]);
  assert.equal(RELATED_KINDS.includes("artist"), false);
  assert.equal(RELATED_ATTEMPT_LIMIT, 3);
});

test("cleanNodes drops bad rows, dedupes and caps at 12", () => {
  const rows = [
    { title: "Dune Part Two", relation: "sequel", year: 2024 },
    { title: "Dune Part Two", relation: "sequel", year: 2024 },
    { title: "Dune", relation: "series", year: "1984" },
    { title: "", relation: "sequel", year: 2000 },
    { title: 42, relation: "sequel", year: 2000 },
    { relation: "sequel", year: 2000 },
    null,
    "Dune",
    { title: "Dune", relation: "series", year: 2021 },
  ];
  assert.deepEqual(cleanNodes(rows), [
    { title: "Dune Part Two", relation: "sequel", year: 2024 },
    { title: "Dune", relation: "series", year: null },
    { title: "Dune", relation: "series", year: 2021 },
  ]);
  const many = Array.from({ length: 15 }, (_, i) => ({
    title: "Title " + i,
    relation: "series",
    year: 2000 + i,
  }));
  assert.equal(cleanNodes(many).length, 12);
  assert.deepEqual(cleanNodes(undefined), []);
  assert.deepEqual(cleanNodes("nope"), []);
});
