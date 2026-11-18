import {
  genericStatusOptions,
  libraryStatusForKind,
  statusOptions,
} from "./format.mjs";

export const DEFAULT_SORT = "activity";

const MAX_TAGS = 10;
const SORTS = new Set(["activity", "added", "rating", "release", "title"]);

const VIEW_NAME = {
  movie: "Movies",
  tv: "Series",
  book: "Books",
  game: "Games",
  artist: "Artists",
  album: "Albums",
  track: "Songs",
  "": "All activity",
};

const STATUS_SPOKEN = {
  want: "Want",
  anticipating: "Anticipating",
  in_progress: "In progress",
  completed: "Finished",
  paused: "Paused",
  dropped: "Dropped",
  following: "Following",
  unfollowed: "Unfollowed",
};

/** Movies, series, books, music and games. Empty kind is the mixed activity view. */
export function collectionKey(kind) {
  if (kind === "artist" || kind === "album" || kind === "track") return "music";
  if (kind === "movie" || kind === "tv" || kind === "book" || kind === "game") return kind;
  return "all";
}

export function collectionSummary(kind) {
  switch (kind) {
    case "movie":
      return "Movies. Films you want to watch, are watching, or have watched.";
    case "tv":
      return "Series. Shows and the episodes you are watching.";
    case "book":
      return "Books. What you want to read, are reading, or have read.";
    case "artist":
      return "Music. Artists you follow, with saved albums and songs beside them.";
    case "album":
      return "Music. Saved albums, without marking the artist followed.";
    case "track":
      return "Music. Saved songs, without saving the rest of an album.";
    case "game":
      return "Games. What you want to play, are playing, or have played.";
    default:
      return "All activity: movies, series, books, music, and games.";
  }
}

export function normalizationNotice(kind, status) {
  const spoken = STATUS_SPOKEN[status] || String(status || "That state");
  const name = VIEW_NAME[kind] || "this collection";
  return `${spoken} does not apply to ${name}. Showing every state.`;
}

export function emptyLibraryCopy(kind, filtered) {
  if (filtered) {
    return {
      title: "Nothing in this collection matches",
      message: "Try another state, tag, or search. This collection stays selected.",
    };
  }
  switch (kind) {
    case "movie":
      return { title: "No movies saved yet", message: "Search for a film or add one of your own." };
    case "tv":
      return { title: "No series saved yet", message: "Search for a show or add one of your own." };
    case "book":
      return { title: "No books saved yet", message: "Search for a book or add one of your own." };
    case "artist":
      return { title: "No artists saved yet", message: "Follow an artist to keep them in Music." };
    case "album":
      return { title: "No albums saved yet", message: "Save an album without following the artist." };
    case "track":
      return { title: "No songs saved yet", message: "Save a song without saving the rest of the album." };
    case "game":
      return { title: "No games saved yet", message: "Search for a game or add one of your own." };
    default:
      return {
        title: "Your next favorite starts here",
        message: "Search for a title, follow an artist, or add something of your own.",
      };
  }
}

export function statusChoices(kind) {
  if (!kind) {
    return [
      ...genericStatusOptions(),
      { value: "following", label: "Following" },
      { value: "unfollowed", label: "Unfollowed" },
    ];
  }
  return statusOptions(kind);
}

export const MUSIC_VIEWS = [
  { kind: "artist", label: "Artists" },
  { kind: "album", label: "Albums" },
  { kind: "track", label: "Songs" },
];

/**
 * The next library query when the collection changes.
 * Page, expanded artist, and open artist group reset. A state the new kind cannot show is omitted.
 */
export function collectionQuery(filters, kind) {
  const status = libraryStatusForKind(kind, filters.status);
  const sort = filters.sort && filters.sort !== DEFAULT_SORT ? filters.sort : null;
  return {
    q: filters.q || null,
    kind: kind || null,
    status: status || null,
    sort,
    fav: filters.favorite ? 1 : null,
    tag: filters.tags.length ? [...filters.tags] : null,
    offset: null,
    expanded: null,
    group: null,
  };
}

/**
 * What the visible library should do with a URL, given the previous collection.
 * `redirect` means the URL still names a state this kind cannot show.
 */
export function libraryTransition(previous, next) {
  const fitted = libraryStatusForKind(next.kind, next.status);
  const redirect = Boolean(next.status) && fitted !== next.status;
  const kindChange = Boolean(previous) && previous.kind !== next.kind;
  let notice = "";
  if (redirect) notice = normalizationNotice(next.kind, next.status);
  else if (
    kindChange &&
    previous.status &&
    libraryStatusForKind(next.kind, previous.status) !== previous.status
  ) {
    notice = normalizationNotice(next.kind, previous.status);
  }
  return { kind: next.kind, status: fitted, notice, redirect, kindChange };
}

function carriedLibraryQuery(current, kind) {
  const next = new URLSearchParams();
  if (kind) next.set("kind", kind);
  const q = current.get("q");
  if (q) next.set("q", q);
  const status = libraryStatusForKind(kind || "", current.get("status") || "");
  if (status) next.set("status", status);
  const sort = current.get("sort");
  if (sort && SORTS.has(sort.toLowerCase()) && sort.toLowerCase() !== DEFAULT_SORT) {
    next.set("sort", sort.toLowerCase());
  }
  if (current.get("fav") === "1") next.set("fav", "1");
  for (const tag of current.getAll("tag")) {
    if (tag) next.append("tag", tag);
  }
  return next;
}

/**
 * Section destinations keep the current library search, sort, favorites and tags.
 * All items stays the clean mixed view. Impossible states are not copied.
 * Query from another Media page is not the library's query.
 */
export function mediaSectionLinks(url, sections) {
  const parsed = new URL(url || "/", "http://local");
  const current =
    parsed.pathname === "/media/library" ? parsed.searchParams : new URLSearchParams();
  return sections.map((item) => {
    const link = new URL(item.link, "http://local");
    if (link.pathname !== "/media/library") return item;
    const kind = link.searchParams.get("kind");
    if (!kind) return item;
    const next = carriedLibraryQuery(current, kind);
    return { ...item, link: `${link.pathname}?${next.toString()}` };
  });
}

export function readFilters(paramMap) {
  const seen = new Set();
  const tags = [];
  for (const raw of paramMap.getAll("tag") ?? []) {
    const tag = String(raw).trim();
    if (!tag) continue;
    const key = tag.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return {
    q: paramMap.get("q") || "",
    kind: paramMap.get("kind") || "",
    status: paramMap.get("status") || "",
    sort: paramMap.get("sort") || DEFAULT_SORT,
    favorite: paramMap.get("fav") === "1",
    tags,
  };
}

export function filterCount(f) {
  return (f.status ? 1 : 0) + (f.favorite ? 1 : 0) + f.tags.length;
}

export function filterLabel(n) {
  return n === 0 ? "Filters" : `Filters (${n})`;
}

export function toQueryParams(f) {
  return {
    q: f.q || null,
    kind: f.kind || null,
    status: f.status || null,
    sort: f.sort,
    fav: f.favorite ? 1 : null,
    tag: f.tags.length ? [...f.tags] : null,
    offset: null,
    expanded: null,
    group: null,
  };
}

export function tagOptions(available, selected) {
  const availableList = available ?? [];
  const availableKeys = new Set(
    availableList.map((tag) => tag.toLocaleLowerCase("en")),
  );
  const missing = (selected ?? []).filter(
    (tag) => !availableKeys.has(tag.toLocaleLowerCase("en")),
  );
  const sorted = [...availableList].sort((a, b) =>
    a.toLocaleLowerCase("en").localeCompare(b.toLocaleLowerCase("en")),
  );
  return [...missing, ...sorted];
}

export function isFiltered(f) {
  return !!(f.q || f.status || f.favorite || f.tags.length);
}
