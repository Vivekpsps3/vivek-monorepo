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

test("filterCount ignores q and sort", () => {
  const base = {
    q: "story",
    kind: "",
    status: "",
    sort: "title",
    favorite: false,
    tags: [],
  };
  assert.equal(filterCount(base), 0);
  assert.equal(
    filterCount({ ...base, kind: "movie", status: "want", favorite: true, tags: ["a", "b"] }),
    5,
  );
  assert.equal(isFiltered(base), true);
  assert.equal(isFiltered({ ...base, q: "" }), false);
});

test("filterLabel", () => {
  assert.equal(filterLabel(0), "Filters");
  assert.equal(filterLabel(1), "Filters (1)");
  assert.equal(filterLabel(7), "Filters (7)");
});

test("toQueryParams nulls defaults and maps tags", () => {
  assert.deepEqual(
    toQueryParams({
      q: "",
      kind: "",
      status: "",
      sort: "activity",
      favorite: false,
      tags: [],
    }),
    {
      q: null,
      kind: null,
      status: null,
      sort: "activity",
      fav: null,
      tag: null,
      offset: null,
      expanded: null,
    },
  );
  assert.deepEqual(
    toQueryParams({
      q: "story",
      kind: "movie",
      status: "want",
      sort: "title",
      favorite: true,
      tags: ["Comfort", "sci-fi"],
    }),
    {
      q: "story",
      kind: "movie",
      status: "want",
      sort: "title",
      fav: 1,
      tag: ["Comfort", "sci-fi"],
      offset: null,
      expanded: null,
    },
  );
});

test("tagOptions puts missing selected tags first then sorts", () => {
  assert.deepEqual(
    tagOptions(["beta", "Alpha", "gamma"], ["Zulu", "Alpha"]),
    ["Zulu", "Alpha", "beta", "gamma"],
  );
  assert.deepEqual(tagOptions([], ["Only"]), ["Only"]);
  assert.deepEqual(tagOptions(["b", "A"], []), ["A", "b"]);
  assert.deepEqual(tagOptions(undefined, []), []);
});
