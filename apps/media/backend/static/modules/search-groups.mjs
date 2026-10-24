const ORDER = ["book", "movie", "tv", "game", "album", "artist", "track"];

const PROVIDER_TYPES = {
  tmdb: ["Movies", "series"],
  tvmaze: ["series"],
  itunes: ["movies"],
  rawg: ["games"],
  openlibrary: ["books"],
  musicbrainz: ["albums", "artists", "songs"],
};

export function orderGroups(results, query) {
  const needle = String(query || "").trim().toLowerCase();
  const buckets = new Map();
  for (const item of results || []) {
    const kind = ORDER.includes(item.kind) ? item.kind : "movie";
    if (!buckets.has(kind)) buckets.set(kind, []);
    buckets.get(kind).push(item);
  }
  return ORDER.filter(kind => buckets.has(kind)).map(kind => ({
    kind,
    rows: buckets.get(kind).slice().sort((a, b) => {
      const exact = title => String(title || "").trim().toLowerCase() === needle ? 0 : 1;
      return exact(a.title) - exact(b.title);
    }),
  }));
}

/** Hidden when every provider is ok. Names the affected types, never the provider. */
export function affectedSentence(providers) {
  const words = [];
  for (const [name, state] of Object.entries(providers || {})) {
    if (!state || state === "ok") continue;
    for (const word of PROVIDER_TYPES[name] || []) {
      if (!words.includes(word)) words.push(word);
    }
  }
  if (!words.length) return "";
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} can't be searched right now.`;
}
