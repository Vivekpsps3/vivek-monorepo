import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanNodes,
  relatedHref,
  relationLabel,
} from "../../../frontend/src/related.mjs";

test("relationLabel maps known relations and blanks unknown", () => {
  assert.equal(relationLabel("sequel"), "Sequel");
  assert.equal(relationLabel("spinoff"), "Spin-off");
  assert.equal(relationLabel("series"), "Same series");
  assert.equal(relationLabel("collaborator"), "Collaborator");
  assert.equal(relationLabel("prequel"), "");
  assert.equal(relationLabel(""), "");
  assert.equal(relationLabel(undefined), "");
  assert.equal(relationLabel(null), "");
});

test("relatedHref encodes the title", () => {
  assert.equal(
    relatedHref({ title: "Amélie & Co?" }),
    "/media/add?title=" + encodeURIComponent("Amélie & Co?"),
  );
  assert.equal(relatedHref({ title: "Dune" }), "/media/add?title=Dune");
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
