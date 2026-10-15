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
  game: { want: "Want to Play", anticipating: "Anticipating", in_progress: "Currently Playing", completed: "Finished", paused: "Paused", dropped: "Dropped" },
};

const EXPERIENCE = {
  movie: [["watch", "Watched"], ["rewatch", "Rewatched"]],
  tv: [["watch", "Watched"], ["rewatch", "Rewatched"]],
  book: [["read", "Read"], ["reread", "Reread"]],
  track: [["listen", "Listened"]],
  album: [["listen", "Listened"]],
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
  return { movie: "Movie", tv: "Series", book: "Book", track: "Song", album: "Album", game: "Game" }[kind] || "Media";
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
