import { readCookie } from '../../shared-browser/dom.mjs';

export function messageFrom(payload, status) {
  if (!payload) return `Request failed (${status}).`;
  if (typeof payload.detail === "string") return payload.detail;
  if (payload.detail && payload.detail.message) return payload.detail.message;
  return `Request failed (${status}).`;
}
export function financeLoginHref() {
  const next = `${location.pathname}${location.search}${location.hash}`;
  return `/auth/login?next=${encodeURIComponent(next)}`;
}
export async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const root = window.TRAVEL_ROOT || "";
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !readCookie("finance_csrf")) {
    await fetch(`${root}/api/home`, { credentials: "include", headers: { accept: "application/json" } });
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = readCookie("finance_csrf");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  const response = await fetch(`${root}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });
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
