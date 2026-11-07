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
    out.push({ ...row, kind: "movie" });
    if (out.length >= 20) break;
  }
  return out;
}

export function popularError(status) {
  if (status === 0 || (status >= 500 && status < 600))
    return "Can't reach the movie service.";
  if (status === 401) return "";
  return "Popular movies didn't load.";
}
