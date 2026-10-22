import assert from "node:assert/strict";
import test from "node:test";

import { createKeyedFetch, createSequence } from "../modules/guard.mjs";

test("a newer route load aborts the one before it", () => {
  const loads = createSequence();
  const first = loads.start();
  const second = loads.start();
  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.signal.aborted, false);
  assert.equal(second.isCurrent(), true);
});

test("search keeps the response that matches the latest query and kind", () => {
  const loads = createKeyedFetch();
  const movies = loads.start("dune\u0000movie");
  const books = loads.start("dune\u0000book");
  assert.equal(movies.signal.aborted, true);
  assert.equal(movies.matches(), false);
  assert.equal(books.matches(), true);
  const same = loads.start("dune\u0000book");
  assert.equal(books.matches(), false);
  assert.equal(same.matches(), true);
});
