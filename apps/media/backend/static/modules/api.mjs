export function readCookie(name) {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const crumb = part.trim();
    if (crumb.startsWith(prefix)) return decodeURIComponent(crumb.slice(prefix.length));
  }
  return "";
}

export const NETWORK_MESSAGE = "Can't reach Media. Check your connection and try again.";
export const CSRF_MESSAGE = "Sign in again so this change can be saved.";
export const UNAVAILABLE_MESSAGE = "Sign-in is unavailable right now. Try again in a minute.";

export function messageFrom(payload, status) {
  if (!status) return NETWORK_MESSAGE;
  if (status === 403) return CSRF_MESSAGE;
  if (status === 503) return UNAVAILABLE_MESSAGE;
  if (payload && typeof payload.detail === "string" && payload.detail) return payload.detail;
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
  const root = window.MEDIA_ROOT || "";
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !readCookie("finance_csrf")) {
    await fetch(`${root}/api/summary`, { credentials: "include", headers: { accept: "application/json" } });
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = readCookie("finance_csrf");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  let response;
  try {
    response = await fetch(`${root}${path}`, { ...options, credentials: "include", headers });
  } catch (error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError") throw error;
    const offline = new Error(messageFrom(null, 0));
    offline.status = 0;
    throw offline;
  }
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
