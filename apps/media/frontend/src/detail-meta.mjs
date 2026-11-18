import { statusOptions } from "./format.mjs";

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

export function stateLabel(status, kind) {
  if (kind && kindLabel(kind)) {
    const match = statusOptions(kind).find((choice) => choice.value === status);
    if (match) return match.label;
  }
  return STATE_LABELS[status] || "";
}

/** Status choices stay on the vocabulary in format.mjs. */
export function statusChoices(kind) {
  return statusOptions(kind);
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

/** Progress leads the editor for every tracked kind. Artists have no progress value. */
export function progressPrimary(kind) {
  return showsGenericProgress(kind);
}

/** Personal tracking, in the order the editor shows it before catalog maintenance. */
export function editorLead(kind) {
  const lead = [];
  if (progressPrimary(kind)) lead.push("progress");
  lead.push("rating", "note", "save");
  return lead;
}

export function showsGenericProgress(kind) {
  return kind !== "artist";
}

export function showsAnticipated(kind) {
  return kind !== "artist";
}

export function moreSummary(kind) {
  return showsAnticipated(kind) ? "Anticipation" : "";
}

/** Open anticipation only when that saved or drafted flag is already set. Progress is not inside it. */
export function needsMoreOpen(kind, fields) {
  if (!showsAnticipated(kind)) return false;
  return fields?.anticipated === true;
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
