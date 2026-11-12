export const ART_HOSTS = ["https://image.tmdb.org/"];

export function safeArt(url) {
  return typeof url === "string" &&
    ART_HOSTS.some((host) => url.startsWith(host))
    ? url
    : null;
}

export function cleanPopular(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (typeof row.title !== "string" || row.title === "") continue;
    if (typeof row.source !== "string" || row.source === "") continue;
    if (typeof row.source_id !== "string" || row.source_id === "") continue;
    const key = row.source + "|" + row.source_id;
    if (seen.has(key)) continue;
    seen.add(key);
    const saved =
      row.already_saved === true &&
      Number.isInteger(row.saved_id) &&
      row.saved_id > 0;
    const next = {
      ...row,
      kind: "movie",
      artwork_url: safeArt(row.artwork_url),
      already_saved: saved,
    };
    if (saved) next.saved_id = row.saved_id;
    else delete next.saved_id;
    out.push(next);
    if (out.length >= 20) break;
  }
  return out;
}

export function popularFocus(previous, state, count) {
  if (previous === state) return "";
  if (state === "loading") return "popular-status";
  if (state === "error" || (state === "ready" && count === 0))
    return "popular-retry";
  if (previous === "loading" && state === "ready") return "popular-heading";
  return "";
}

export function popularError(status) {
  if (status === 0 || (status >= 500 && status < 600))
    return "Can't reach the movie service.";
  if (status === 401) return "";
  return "Popular movies didn't load.";
}
