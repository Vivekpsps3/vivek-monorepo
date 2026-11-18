import assert from "node:assert/strict";
import test from "node:test";
import {
  bookAuthorLine,
  bookProgressFact,
  bookSeriesLine,
  bookShelfId,
  noteExcerpt,
  visibleShelves,
} from "../../../frontend/src/books.mjs";

const linked = (id, name) => ({ id, name });

test("reading shelves follow the recorded status and do not invent progress", () => {
  assert.equal(bookShelfId("in_progress"), "current");
  assert.equal(bookShelfId("completed"), "read");
  assert.equal(bookShelfId("want"), "to-read");
  assert.equal(bookShelfId("paused"), "other");
  assert.equal(bookShelfId("dropped"), "other");
  assert.equal(bookProgressFact({ progress_label: "p. 40" }), "p. 40");
  assert.equal(bookProgressFact({ progress_label: "12%" }), "12%");
  assert.equal(bookProgressFact({}), "Progress unknown");
  assert.equal(bookProgressFact({ progress_label: "  " }), "Progress unknown");
  assert.equal(bookProgressFact({ status: "completed" }), "Progress unknown");
  assert.equal(noteExcerpt("  A synthetic margin note.  "), "A synthetic margin note.");
  assert.equal(noteExcerpt("   "), null);
});

test("authors and series group only on a canonical id", () => {
  const ada = linked("openlibrary:OL10A", "Ada Writer");
  const nia = linked("openlibrary:OL20A", "Nia Binder");
  const cycle = linked("openlibrary:OL55S", "Harbor Cycle");
  const books = [
    {
      id: 1,
      status: "in_progress",
      title: "Glass House",
      creator: "Ada Writer",
      author: ada,
      progress_label: "p. 40",
    },
    {
      id: 2,
      status: "in_progress",
      title: "Second Glass",
      creator: "Ada Writer",
      author: ada,
    },
    {
      id: 3,
      status: "in_progress",
      title: "Other Glass House",
      creator: "Ada Writer",
      author: { id: "Ada Writer", name: "Ada Writer" },
    },
    {
      id: 4,
      status: "want",
      title: "Glass House",
      creator: "Ada Writer",
    },
    {
      id: 5,
      status: "want",
      title: "Missing Cover Tale",
    },
    {
      id: 6,
      status: "completed",
      title: "Harbor Cycle One",
      creator: "Nia Binder",
      author: nia,
      series: cycle,
    },
    {
      id: 7,
      status: "completed",
      title: "Harbor Cycle Two",
      creator: "Nia Binder",
      author: nia,
      series: { id: "openlibrary:OL55S", name: "Harbor Cycle" },
      progress_label: "12%",
    },
    {
      id: 8,
      status: "completed",
      title: "Harbor Cycle Three",
      creator: "Nia Binder",
      author: nia,
      series: { id: "Harbor Cycle", name: "Harbor Cycle" },
    },
    {
      id: 9,
      status: "completed",
      title: "Quiet Index",
    },
  ];

  assert.deepEqual(bookAuthorLine(books[0]), {
    id: "openlibrary:OL10A",
    linked: true,
    text: "Ada Writer",
  });
  assert.equal(bookAuthorLine(books[2]).linked, false);
  assert.equal(bookAuthorLine(books[2]).text, "Ada Writer · not linked");
  assert.equal(bookAuthorLine(books[4]).text, "Author not linked");
  assert.equal(bookSeriesLine(books[5])?.id, "openlibrary:OL55S");
  assert.equal(bookSeriesLine(books[7]), null);
  assert.equal(bookSeriesLine({ series: { id: "openlibrary:OL55A", name: "No" } }), null);

  const shelves = visibleShelves(books, "");
  const current = shelves.find((shelf) => shelf.id === "current");
  const toRead = shelves.find((shelf) => shelf.id === "to-read");
  const read = shelves.find((shelf) => shelf.id === "read");
  assert.equal(shelves.some((shelf) => shelf.id === "other"), false);
  assert.deepEqual(
    current.blocks.map((block) => [block.type, block.id, block.books.map((book) => book.id)]),
    [
      ["author", "openlibrary:OL10A", [1, 2]],
      ["book", "book-3", [3]],
    ],
  );
  assert.deepEqual(
    toRead.blocks.map((block) => block.books.map((book) => book.id)),
    [[4], [5]],
  );
  assert.equal(toRead.blocks.every((block) => block.type === "book"), true);
  const series = read.blocks.find((block) => block.type === "series");
  assert.equal(series.id, "openlibrary:OL55S");
  assert.deepEqual(series.books.map((book) => book.title), ["Harbor Cycle One", "Harbor Cycle Two"]);
  assert.deepEqual(
    read.blocks.filter((block) => block.type === "book").map((block) => block.books[0].title),
    ["Harbor Cycle Three", "Quiet Index"],
  );
  assert.equal(visibleShelves(books, "paused").length, 1);
  assert.equal(visibleShelves(books, "paused")[0].label, "Paused");
  assert.equal(visibleShelves(books, "paused")[0].empty, "No paused books on this shelf.");
  assert.equal(visibleShelves(books, "paused")[0].books.length, 0);
  assert.equal(visibleShelves(books, "anticipating")[0].label, "Anticipating");
  assert.equal(visibleShelves(books, "completed")[0].label, "Read");
  assert.equal(visibleShelves([], "").filter((shelf) => shelf.id !== "other").length, 3);
});
