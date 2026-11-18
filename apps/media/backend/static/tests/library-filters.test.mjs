import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionKey,
  collectionQuery,
  collectionSummary,
  emptyLibraryCopy,
  filterCount,
  filterLabel,
  isFiltered,
  libraryTransition,
  mediaSectionLinks,
  normalizationNotice,
  readFilters,
  statusChoices,
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

const sections = [
  { label: "Movies", link: "/media/library?kind=movie" },
  { label: "Books", link: "/media/library?kind=book" },
  { label: "Music", link: "/media/library?kind=artist", also: ["/media/library?kind=album", "/media/library?kind=track"] },
  { label: "All items", link: "/media/library", also: ["/media/item"] },
  { label: "Now", link: "/media", exact: true },
];

test("Following then Books drops the state and keeps the rest of the library query", () => {
  const url = "/media/library?kind=artist&status=following&sort=Title&q=harbor&fav=1&tag=night&offset=24&expanded=3";
  const linked = mediaSectionLinks(url, sections);
  assert.equal(
    linked.find((item) => item.label === "Books").link,
    "/media/library?kind=book&q=harbor&sort=title&fav=1&tag=night",
  );
  assert.equal(
    linked.find((item) => item.label === "Music").link,
    "/media/library?kind=artist&q=harbor&status=following&sort=title&fav=1&tag=night",
  );
  assert.deepEqual(linked.find((item) => item.label === "Music").also, sections[2].also);
  assert.equal(linked.find((item) => item.label === "All items"), sections[3]);
  assert.equal(linked.find((item) => item.label === "Now"), sections[4]);
  const elsewhere = mediaSectionLinks("/media/search?q=dune&status=following", sections);
  assert.equal(elsewhere.find((item) => item.label === "Books").link, "/media/library?kind=book");
});

test("Search and Add keep the open collection type", () => {
  const sections = [
    { label: "Search", link: "/media/search" },
    { label: "Add", ariaLabel: "Add manually", link: "/media/add" },
    { label: "Books", link: "/media/library?kind=book" },
  ];
  const linked = mediaSectionLinks("/media/library?kind=book&status=want&q=harbor", sections);
  assert.equal(linked[0].link, "/media/search?kind=book");
  assert.equal(linked[1].link, "/media/add?kind=book");
  assert.equal(linked[2].link, "/media/library?kind=book&q=harbor&status=want");
  const games = mediaSectionLinks("/media/library?kind=game", sections);
  assert.equal(games[0].link, "/media/search?kind=game");
  assert.equal(games[1].link, "/media/add?kind=game");
  const plain = mediaSectionLinks("/media/search", sections);
  assert.equal(plain[0], sections[0]);
  assert.equal(plain[1], sections[1]);
});

test("an impossible status is a visible normalization, not a silent empty read", () => {
  const bookmarked = libraryTransition(null, {
    q: "",
    kind: "book",
    status: "following",
    sort: "title",
    favorite: false,
    tags: [],
  });
  assert.equal(bookmarked.redirect, true);
  assert.equal(bookmarked.status, "");
  assert.equal(bookmarked.notice, "Following does not apply to Books. Showing every state.");
  const chosen = libraryTransition(
    { kind: "artist", status: "following" },
    { q: "harbor", kind: "book", status: "", sort: "title", favorite: false, tags: ["night"] },
  );
  assert.equal(chosen.redirect, false);
  assert.equal(chosen.kindChange, true);
  assert.equal(chosen.notice, normalizationNotice("book", "following"));
  const albums = collectionQuery(
    { q: "harbor", kind: "artist", status: "following", sort: "title", favorite: true, tags: ["night"] },
    "album",
  );
  assert.equal(albums.status, null);
  assert.equal(albums.kind, "album");
  assert.equal(albums.sort, "title");
  assert.deepEqual(albums.tag, ["night"]);
  assert.equal(albums.offset, null);
  assert.equal(albums.expanded, null);
  assert.equal(albums.group, null);
  assert.equal(
    toQueryParams({
      q: "harbor",
      kind: "artist",
      status: "following",
      sort: "title",
      favorite: true,
      tags: ["night"],
    }).group,
    null,
  );
  assert.equal(collectionKey("album"), "music");
  assert.match(collectionSummary("artist"), /^Music\. Artists you have saved/);
  assert.equal(emptyLibraryCopy("artist", false).title, "No artists in your music yet");
  assert.match(collectionSummary("book"), /^Books\./);
  assert.equal(collectionSummary(""), "All activity: movies, series, books, music, and games.");
  assert.equal(emptyLibraryCopy("movie", false).title, "No movies saved yet");
  assert.equal(emptyLibraryCopy("tv", false).title, "No series saved yet");
  assert.match(emptyLibraryCopy("tv", false).message, /Caught up/);
  assert.match(collectionSummary("movie"), /^Movies\. Films you want to watch/);
  assert.match(collectionSummary("game"), /This cabinet is your Media library, not a Town minigame/);
  assert.equal(emptyLibraryCopy("game", false).title, "No games saved yet");
  assert.match(emptyLibraryCopy("game", false).message, /missing box image/);
  assert.match(collectionSummary("tv"), /^Series\. Shows and the episodes/);
  assert.equal(emptyLibraryCopy("book", true).title, "Nothing in this collection matches");
  assert.deepEqual(statusChoices("artist").map((item) => item.value), ["following", "unfollowed"]);
  assert.equal(statusChoices("book").some((item) => item.value === "following"), false);
  assert.equal(statusChoices("").some((item) => item.value === "following"), true);
});

test("a collection is not counted as a filter", () => {
  const filters = {
    q: "",
    kind: "book",
    status: "",
    sort: "title",
    favorite: false,
    tags: [],
  };
  assert.equal(filterCount(filters), 0);
  assert.equal(isFiltered(filters), false);
  assert.equal(filterCount({ ...filters, status: "want", favorite: true }), 2);
  assert.equal(isFiltered({ ...filters, q: "harbor" }), true);
});
