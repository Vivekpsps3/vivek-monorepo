/** An http(s) link the person typed. Anything else is not opened and is not played. */
export function externalMusicUrl(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 2000) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.href;
}
