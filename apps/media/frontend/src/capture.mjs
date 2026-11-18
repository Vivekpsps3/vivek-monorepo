/** One capture flow for provider search and manual entry. Title text is not identity. */

export const CAPTURE_KINDS = ["movie", "tv", "book", "game", "artist", "album", "track"];

/** Explicit retry clicks after a failure. The first search or save is not a retry. */
export const CAPTURE_RETRY_LIMIT = 3;

const LABELS = {
  movie: "Movies",
  tv: "Series",
  book: "Books",
  game: "Games",
  artist: "Artists",
  album: "Albums",
  track: "Songs",
  all: "All types",
};

const SOURCE_NAMES = {
  tmdb: "TMDB",
  tvmaze: "TVMaze",
  itunes: "iTunes",
  musicbrainz: "MusicBrainz",
  openlibrary: "Open Library",
  rawg: "RAWG",
  steam: "Steam",
};

export function kindLabel(kind) {
  return LABELS[kind] || "All types";
}

/** A collection kind survives. Explicit all-types stays all-types. A blank manual entry stays a movie. */
export function selectedKind(value, manual) {
  if (CAPTURE_KINDS.includes(value) || value === "all") return value;
  return manual ? "movie" : "all";
}

export function captureParams(kind) {
  return CAPTURE_KINDS.includes(kind) ? { kind } : {};
}

export function addQuery(title, kind) {
  const params = {};
  if (typeof title === "string" && title.trim()) params.title = title;
  if (CAPTURE_KINDS.includes(kind)) params.kind = kind;
  return params;
}

export function retryOpen(used, limit = CAPTURE_RETRY_LIMIT) {
  return Number.isInteger(used) && used >= 0 && used < limit;
}

/** A late response may update the screen only while this visit and owner are still current. */
export function acceptCaptureResult(epoch, current, ownsSession) {
  return epoch === current && ownsSession === true;
}

/**
 * Same provider id is one membership. A manual row has no provider id and does not match.
 * The title is ignored on purpose.
 */
export function sameProviderIdentity(left, right) {
  if (!left || !right) return false;
  const source = typeof left.source === "string" ? left.source : "";
  const other = typeof right.source === "string" ? right.source : "";
  if (!source || source === "manual" || source !== other) return false;
  const id = typeof left.source_id === "string" ? left.source_id.trim() : "";
  const otherId = typeof right.source_id === "string" ? right.source_id.trim() : "";
  if (!id || !otherId) return false;
  return id.toLowerCase() === otherId.toLowerCase();
}

export function coverageText(source) {
  const name = SOURCE_NAMES[source?.id] || source?.id || "Source";
  const kinds = Array.isArray(source?.kinds) && source.kinds.length ? source.kinds.join(", ") : "this type";
  const reason = typeof source?.reason === "string" && source.reason ? " " + source.reason : "";
  if (source?.state === "unconfigured") {
    return (
      name +
      " (" +
      kinds +
      ") is not configured." +
      (reason || " No search is sent, and no result is invented.")
    );
  }
  const coverage = typeof source?.coverage === "string" && source.coverage ? source.coverage : "available";
  return name + " can search " + kinds + " (" + coverage + ")." + reason;
}
