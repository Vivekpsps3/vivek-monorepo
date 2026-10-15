export function readCookie(name) {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const crumb = part.trim();
    if (crumb.startsWith(prefix)) return decodeURIComponent(crumb.slice(prefix.length));
  }
  return "";
}

export function messageFrom(payload, status) {
  if (payload && typeof payload.detail === "string") return payload.detail;
  return `Request failed (${status}).`;
}

export function loginHref() {
  const next = `${location.pathname}${location.search}${location.hash}`;
  return `/auth/login?next=${encodeURIComponent(next)}`;
}

export async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { accept: "application/json", ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = readCookie("finance_csrf");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  const root = window.MEDIA_ROOT || "";
  const response = await fetch(`${root}${path}`, { ...options, credentials: "include", headers });
  if (response.status === 204) return null;
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { detail: text };
    }
  }
  if (!response.ok) {
    const error = new Error(messageFrom(payload, response.status));
    error.status = response.status;
    throw error;
  }
  return payload;
}
