import { readCookie } from '../../shared-browser/dom.mjs';
import { messageFrom } from './messages.mjs';

export { messageFrom };
export function financeLoginHref() {
  const next = `${location.pathname}${location.search}${location.hash}`;
  return `/auth/login?next=${encodeURIComponent(next)}`;
}
export async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const root = window.TRAVEL_ROOT || "";
  let response;
  try {
    if (!["GET", "HEAD", "OPTIONS"].includes(method) && !readCookie("finance_csrf")) {
      await fetch(`${root}/api/home`, { credentials: "include", headers: { accept: "application/json" } });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const csrf = readCookie("finance_csrf");
      if (csrf) headers["X-CSRF-Token"] = csrf;
    }
    response = await fetch(`${root}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
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
