const KIND_ICONS = {
  movie: "film",
  tv: "tv",
  book: "book",
  track: "music",
  album: "music",
  artist: "music",
  game: "game",
};

const KIND_LABELS = {
  movie: "Movie",
  tv: "Series",
  book: "Book",
  track: "Song",
  album: "Album",
  artist: "Artist",
  game: "Game",
};

const STATE_LABELS = {
  want: "Want to",
  anticipating: "Anticipating",
  in_progress: "In progress",
  completed: "Completed",
  paused: "Paused",
  dropped: "Dropped",
  following: "Following",
  unfollowed: "Unfollowed",
};

export function kindIcon(kind) {
  return KIND_ICONS[kind] ?? "document";
}

export function kindLabel(kind) {
  return KIND_LABELS[kind] ?? "";
}

const STATUS_BY_KIND = {
  movie: {
    want: "Want to watch",
    anticipating: "Anticipating",
    in_progress: "Watching",
    completed: "Watched",
    paused: "Paused",
    dropped: "Dropped",
  },
  tv: {
    want: "Want to watch",
    anticipating: "Anticipating",
    in_progress: "Watching",
    completed: "Watched",
    paused: "Paused",
    dropped: "Dropped",
  },
  book: {
    want: "Want to read",
    anticipating: "Anticipating",
    in_progress: "Reading",
    completed: "Read",
    paused: "Paused",
    dropped: "Dropped",
  },
  album: {
    want: "Want to listen",
    anticipating: "Anticipating",
    in_progress: "Listening",
    completed: "Listened",
    paused: "Paused",
    dropped: "Dropped",
  },
  track: {
    want: "Want to listen",
    anticipating: "Anticipating",
    in_progress: "Listening",
    completed: "Listened",
    paused: "Paused",
    dropped: "Dropped",
  },
  game: {
    want: "Want to play",
    anticipating: "Anticipating",
    in_progress: "Playing",
    completed: "Played",
    paused: "Paused",
    dropped: "Dropped",
  },
  artist: {
    following: "Following",
    unfollowed: "Unfollowed",
  },
};

export function stateLabel(status, kind) {
  const specific = kind ? STATUS_BY_KIND[kind]?.[status] : "";
  return specific || STATE_LABELS[status] || "";
}

export function statusChoices(kind) {
  const map = STATUS_BY_KIND[kind] || {
    want: "Want to",
    anticipating: "Anticipating",
    in_progress: "In progress",
    completed: "Completed",
    paused: "Paused",
    dropped: "Dropped",
  };
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

export function statusFieldLabel(kind) {
  return kind === "artist" ? "Relationship" : "State";
}

export function metaChips(entry) {
  const chips = [];
  const kind = kindLabel(entry?.kind);
  if (kind) chips.push(kind);
  if (entry?.year) chips.push(String(entry.year));
  const creator =
    typeof entry?.creator === "string" ? entry.creator.trim() : "";
  if (creator) {
    const chars = [...creator];
    chips.push(
      chars.length > 60 ? chars.slice(0, 60).join("") + "…" : creator,
    );
  }
  const state = stateLabel(entry?.status, entry?.kind);
  if (state) chips.push(state);
  return chips;
}

function kindPhrase(kind) {
  const label = kindLabel(kind);
  return label ? label.toLocaleLowerCase("en") : "";
}

/** Detail posters are 2:3. Library cards keep their own ratio. */
export function artRatio() {
  return "2 / 3";
}

export function experienceTitle(kind) {
  const phrase = kindPhrase(kind);
  return phrase ? "Your " + phrase : "Your item";
}

export function aboutSummary(kind) {
  const phrase = kindPhrase(kind);
  return phrase ? "About this " + phrase : "About this item";
}

/** Books and games lead with a progress value. Other kinds disclose it. */
export function progressPrimary(kind) {
  return kind === "book" || kind === "game";
}

export function showsGenericProgress(kind) {
  return kind !== "artist";
}

export function showsAnticipated(kind) {
  return kind !== "artist";
}

export function moreSummary(kind) {
  if (kind === "tv") return "Manual progress";
  if (progressPrimary(kind)) return "Anticipation";
  return "Progress and anticipation";
}

/** Open the extra section only when it already holds a saved or drafted value. */
export function needsMoreOpen(kind, fields) {
  if (!showsGenericProgress(kind)) return false;
  const anticipated = fields?.anticipated === true;
  if (progressPrimary(kind)) return anticipated;
  const progress = fields?.progress;
  const unit = typeof fields?.unit === "string" ? fields.unit : "";
  const hasProgress =
    progress !== null && progress !== undefined && progress !== "";
  return anticipated || hasProgress || unit !== "";
}

export function dateOnly(value) {
  if (typeof value !== "string") return "";
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

export function episodeDateLine(airLabel, watchedLabel) {
  const air =
    typeof airLabel === "string" && airLabel.trim()
      ? airLabel.trim()
      : "Air date unknown";
  const watched =
    typeof watchedLabel === "string" ? watchedLabel.trim() : "";
  return watched ? air + " · Watched " + watched : air;
}

export function placeholderLetter(title) {
  const trimmed = String(title ?? "").trim();
  if (!trimmed) return "?";
  return [...trimmed][0].toLocaleUpperCase("en");
}

export function episodeCode(season, episode) {
  return "S" + season + "E" + episode;
}

export function toggleLabel(season, episode) {
  return "Mark " + episodeCode(season, episode) + " watched";
}
