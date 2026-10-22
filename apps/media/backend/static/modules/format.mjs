const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS = {
  movie: { want: "Want to Watch", anticipating: "Anticipating", in_progress: "Watching", completed: "Finished", paused: "Paused", dropped: "Dropped" },
  tv: { want: "Want to Watch", anticipating: "Anticipating", in_progress: "Currently Watching", completed: "Finished", paused: "Paused", dropped: "Dropped" },
  book: { want: "Want to Read", anticipating: "Anticipating", in_progress: "Currently Reading", completed: "Finished", paused: "Paused", dropped: "Dropped" },
  track: { want: "Want to Listen", anticipating: "Anticipating", in_progress: "Listening", completed: "Finished", paused: "Paused", dropped: "Dropped" },
  album: { want: "Want to Listen", anticipating: "Anticipating", in_progress: "Listening", completed: "Finished", paused: "Paused", dropped: "Dropped" },
  artist: { want: "Following", anticipating: "Anticipating", in_progress: "Listening", completed: "Finished", paused: "Paused", dropped: "Dropped" },
  game: { want: "Want to Play", anticipating: "Anticipating", in_progress: "Currently Playing", completed: "Finished", paused: "Paused", dropped: "Dropped" },
};

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

export function monthCells(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return [];
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const offset = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
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
