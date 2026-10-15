/** Browser-safe, framework-free DOM helpers usable directly as native modules. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function readCookie(name, cookieString) {
  let source = cookieString;
  if (source == null) {
    try {
      source = globalThis.document?.cookie ?? "";
    } catch {
      return "";
    }
  }
  const prefix = `${name}=`;
  for (const part of String(source).split(";")) {
    const item = part.trim();
    if (!item.startsWith(prefix)) continue;
    const value = item.slice(prefix.length);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
}

export function safeStorageGet(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeStorageSet(key, value) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
