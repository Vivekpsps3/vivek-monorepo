const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The only status vocabulary. Per-kind `completed` follows the spec default
 * (Watched / Read / Played / Listened). Flip a cell here to change every
 * surface that reads this map. "All types" uses STATUS_GENERIC.
 */
const STATUS = {
  movie: { want: "Want to Watch", anticipating: "Anticipating", in_progress: "Watching", completed: "Watched", paused: "Paused", dropped: "Dropped" },
  tv: { want: "Want to Watch", anticipating: "Anticipating", in_progress: "Currently Watching", completed: "Watched", paused: "Paused", dropped: "Dropped" },
  book: { want: "Want to Read", anticipating: "Anticipating", in_progress: "Currently Reading", completed: "Read", paused: "Paused", dropped: "Dropped" },
  track: { want: "Want to Listen", anticipating: "Anticipating", in_progress: "Listening", completed: "Listened", paused: "Paused", dropped: "Dropped" },
  album: { want: "Want to Listen", anticipating: "Anticipating", in_progress: "Listening", completed: "Listened", paused: "Paused", dropped: "Dropped" },
  artist: { want: "Following", anticipating: "Anticipating", in_progress: "Listening", completed: "Listened", paused: "Paused", dropped: "Dropped" },
  game: { want: "Want to Play", anticipating: "Anticipating", in_progress: "Currently Playing", completed: "Played", paused: "Paused", dropped: "Dropped" },
};

const STATUS_GENERIC = {
  want: "Want",
  anticipating: "Anticipating",
  in_progress: "In progress",
  completed: "Finished",
  paused: "Paused",
  dropped: "Dropped",
};

/** Feedback copy. Change a string here to change it everywhere it is shown. */
export const SAVING_LABEL = "Saving…";
export const SAVED_LABEL = "Saved ✓";
export const NOT_SAVED_LABEL = "Not saved. Try again";
export const PROGRESS_TOAST = "Couldn't save your progress. Try again.";
export const NOTE_CONFLICT_TOAST = "This note changed in another tab. Your text is kept as a draft.";
export const SORT_TOAST = "That sort isn't available. Showing recently active.";
export const NOTE_RESTORE_LABEL = "Unsaved note from earlier.";
export const LIBRARY_SAVED_TOAST = "Saved in your library.";
export const SKELETON_DELAY_MS = 150;
export const SAVING_DELAY_MS = 300;
export const SAVED_HOLD_MS = 2000;
export const TOAST_MS = 5000;
export const TOAST_ACTION_MS = 8000;

/** 0 = Sunday (en-US default). Set to 1 for a Monday week. */
export const WEEK_STARTS_ON = 0;

const EXPERIENCE = {
  movie: [["watch", "Watched"], ["rewatch", "Rewatched"]],
  tv: [["watch", "Watched"], ["rewatch", "Rewatched"]],
  book: [["read", "Read"], ["reread", "Reread"]],
  track: [["listen", "Listened"]],
  album: [["listen", "Listened"]],
  artist: [["listen", "Listened"]],
  game: [["play", "Played"], ["replay", "Replayed"]],
};

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeUrl(value) {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    return "";
  }
  return "";
}

export function kindLabel(kind) {
  return { movie: "Movie", tv: "Series", book: "Book", track: "Song", album: "Album", artist: "Artist", game: "Game" }[kind] || "Media";
}

export function statusLabel(kind, status) {
  return (STATUS[kind] || STATUS.movie)[status] || status;
}

export function statusOptions(kind) {
  return Object.entries(STATUS[kind] || STATUS.movie).map(([value, label]) => ({ value, label }));
}

export function genericStatusOptions() {
  return Object.entries(STATUS_GENERIC).map(([value, label]) => ({ value, label }));
}

export function experienceOptions(kind) {
  return (EXPERIENCE[kind] || EXPERIENCE.movie).map(([value, label]) => ({ value, label }));
}

export function experienceLabel(kind) {
  for (const rows of Object.values(EXPERIENCE)) {
    const match = rows.find(([value]) => value === kind);
    if (match) return match[1];
  }
  return kind;
}

export function seasonLabel(number) {
  const value = Number(number);
  if (value === 0) return "Specials";
  return `Season ${value}`;
}

export function ratingText(value) {
  if (value === null || value === undefined || value === "") return "Unrated";
  const number = Number(value);
  if (!Number.isFinite(number)) return "Unrated";
  return `${number.toFixed(1).replace(/\.0$/, "")}/10`;
}

export function releaseLabel(release) {
  if (!release) return "Date unknown";
  if (release.status === "postponed") return "Postponed";
  if (!release.released_on || release.precision === "unknown") return "Date unknown";
  if (release.precision === "year") return String(release.released_on).slice(0, 4);
  const [year, month, day] = String(release.released_on).split("-");
  const name = MONTHS[Number(month) - 1];
  if (release.precision === "month") return name ? `${name} ${year}` : String(year);
  if (!name || !day) return "Date unknown";
  return `${name} ${Number(day)}, ${year}`;
}

export function whenLabel(item) {
  switch (item.when) {
    case "today": return "Releases today";
    case "tomorrow": return "Releases tomorrow";
    case "this_week": return "This week";
    case "this_month": return "This month";
    case "recent": return "Recently released";
    case "postponed": return "Postponed";
    case "unknown": return "Date unknown";
    default: return releaseLabel({
      released_on: item.release_on,
      precision: item.precision,
      status: item.release_status,
    });
  }
}

export function draftKey(entryId) {
  return `media-review-draft:${entryId}`;
}

const LIBRARY_SORTS = new Set(["activity", "added", "rating", "release", "title"]);
const LIBRARY_KINDS = new Set(["movie", "tv", "book", "artist", "album", "track", "game"]);
const LIBRARY_STATUSES = new Set(["want", "anticipating", "in_progress", "completed", "paused", "dropped"]);

export function progressUnits(kind) {
  if (kind === "book") return [{ value: "page", label: "Page" }, { value: "percent", label: "Percent" }];
  return [{ value: "percent", label: "Percent" }, { value: "hour", label: "Hours" }];
}

export function progressPreview(value, unit) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (unit === "page") return `p. ${text}`;
  if (unit === "percent") return `${text}%`;
  if (unit === "hour") return `${text} h`;
  if (unit === "episode") return `Episode ${text}`;
  return text;
}

/**
 * One draft key per entry, shared by every tab. `base` is the server
 * review_updated_at the draft started from, not the client clock.
 * The draft is shown only while that base still matches. Otherwise the server
 * text stays, and the caller can offer to restore the draft.
 */
export function chooseReview(serverReview, serverUpdatedAt, draft) {
  const server = serverReview ?? "";
  const unchanged = !draft || typeof draft.text !== "string" || draft.text === "" || draft.text === server;
  if (unchanged) return { text: server, restore: false };
  const base = Object.prototype.hasOwnProperty.call(draft, "base") ? (draft.base ?? "") : null;
  const serverBase = serverUpdatedAt ?? "";
  if (base !== null && String(base) === String(serverBase)) return { text: draft.text, restore: false };
  return { text: server, restore: true };
}

export function normalizeLibraryQuery(search) {
  const params = new URLSearchParams(search);
  let changed = false;
  let droppedSort = false;
  const sort = params.get("sort");
  if (sort != null && sort !== "") {
    const normalized = sort.toLowerCase();
    if (!LIBRARY_SORTS.has(normalized)) {
      params.delete("sort");
      changed = true;
      droppedSort = true;
    } else if (normalized !== sort) {
      params.set("sort", normalized);
      changed = true;
    }
  }
  const kind = params.get("kind");
  if (kind != null && kind !== "" && !LIBRARY_KINDS.has(kind)) {
    params.delete("kind");
    changed = true;
  }
  const status = params.get("status");
  if (status != null && status !== "" && !LIBRARY_STATUSES.has(status)) {
    params.delete("status");
    changed = true;
  }
  return { params, changed, droppedSort };
}

export function coverImage(url) {
  const safe = safeUrl(url);
  if (!safe) return "";
  return `<img alt="" src="${escapeHtml(safe)}" width="300" height="300" loading="lazy" decoding="async">`;
}

export function monthLabel(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return "";
  const name = MONTHS[Number(match[2]) - 1];
  return name ? `${name} ${match[1]}` : "";
}

export function shiftMonth(month, delta) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return "";
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekDayLabels() {
  return [...WEEKDAY_SHORT.slice(WEEK_STARTS_ON), ...WEEKDAY_SHORT.slice(0, WEEK_STARTS_ON)];
}

const ROUTE_TITLES = {
  home: "Couldn't load your journal",
  library: "Couldn't load your library",
  calendar: "Couldn't load the calendar",
  search: "Search isn't working right now",
  new: "Couldn't open Add",
  item: "Couldn't load this item",
  episode: "Couldn't load this episode",
  season: "Couldn't load this item",
};

const ROUTE_LINKS = {
  home: [{ href: "#/library", label: "Open library" }],
  library: [{ href: "#/", label: "Go to Now" }],
  calendar: [{ href: "#/", label: "Go to Now" }],
  search: [],
  new: [{ href: "#/", label: "Go to Now" }],
  item: [{ href: "#/library", label: "Open library" }],
  episode: [{ href: "#/library", label: "Open library" }],
  season: [{ href: "#/library", label: "Open library" }],
};

export function routeErrorCopy(name, error) {
  const status = Number(error?.status) || 0;
  const raw = String(error?.message || "");
  const offline = status === 0 || /failed to fetch/i.test(raw);
  const links = ROUTE_LINKS[name] || ROUTE_LINKS.home;
  if (offline) {
    return {
      title: "Can't reach Media",
      body: "Check your connection and try again.",
      retry: true,
      links,
    };
  }
  if (status === 503) {
    return {
      title: "Sign-in is unavailable right now",
      body: "Try again in a minute.",
      retry: true,
      links,
    };
  }
  if ((name === "item" || name === "season") && status === 404) {
    return {
      title: "This item isn't in your library",
      body: "It may have been removed.",
      retry: true,
      links: [
        { href: "#/library", label: "Open library" },
        { href: "#/search", label: "Search" },
      ],
    };
  }
  return {
    title: ROUTE_TITLES[name] || "Couldn't load this page",
    body: raw || "Could not load this page.",
    retry: true,
    links,
  };
}

export function emptyState({ title = "", body = "", primary = null, secondary = null, icon = "" } = {}) {
  const glyph = icon ? `<span class="empty-icon" aria-hidden="true">${escapeHtml(icon)}</span>` : "";
  const heading = title ? `<h2>${escapeHtml(title)}</h2>` : "";
  const sentence = body ? `<p>${escapeHtml(body)}</p>` : "";
  const cta = primary
    ? `<a class="btn btn-primary" href="${escapeHtml(primary.href)}">${escapeHtml(primary.label)}</a>`
    : "";
  const extra = secondary
    ? `<a href="${escapeHtml(secondary.href)}">${escapeHtml(secondary.label)}</a>`
    : "";
  return `<div class="empty">${glyph}${heading}${sentence}${cta}${extra}</div>`;
}

export function monthCells(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return [];
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const weekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const offset = (weekday - WEEK_STARTS_ON + 7) % 7;
  const count = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= count; day += 1) {
    cells.push(`${match[1]}-${match[2]}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function dayLabel(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getUTCDay()];
  const month = MONTHS[Number(match[2]) - 1];
  if (!weekday || !month) return "";
  return `${weekday}, ${month} ${Number(match[3])}`;
}
