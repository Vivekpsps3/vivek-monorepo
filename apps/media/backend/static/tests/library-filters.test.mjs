import assert from "node:assert/strict";
import test from "node:test";
import {
  filterCount,
  filterLabel,
  isFiltered,
  readFilters,
  tagOptions,
  toQueryParams,
} from "../../../frontend/src/library-filters.mjs";

function paramMap(entries) {
  return {
    get: (key) => entries[key]?.[0] ?? null,
    getAll: (key) => entries[key] ?? [],
  };
}

test("readFilters parses all params and caps tags at 10", () => {
  const tags = Array.from({ length: 12 }, (_, i) => "tag" + i);
  const filters = readFilters(
    paramMap({
      q: ["story"],
      kind: ["movie"],
      status: ["want"],
      sort: ["title"],
      fav: ["1"],
      tag: tags,
    }),
  );
  assert.deepEqual(filters, {
    q: "story",
    kind: "movie",
    status: "want",
    sort: "title",
    favorite: true,
    tags: tags.slice(0, 10),
  });
  assert.deepEqual(readFilters(paramMap({})), {
    q: "",
    kind: "",
    status: "",
    sort: "activity",
    favorite: false,
    tags: [],
  });
});

test("readFilters de-dupes tags case-insensitively", () => {
  const filters = readFilters(
    paramMap({ tag: ["Sci-Fi", "sci-fi", " Drama ", "", "drama"] }),
  );
  assert.deepEqual(filters.tags, ["Sci-Fi", "Drama"]);
});
