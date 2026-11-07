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

export function stateLabel(status) {
  return STATE_LABELS[status] ?? "";
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
  const state = stateLabel(entry?.status);
  if (state) chips.push(state);
  return chips;
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
