import assert from "node:assert/strict";
import test from "node:test";

import { CSRF_MESSAGE, NETWORK_MESSAGE, UNAVAILABLE_MESSAGE, api, messageFrom } from "../modules/api.mjs";

test("network, csrf, and unavailable errors use the journal sentences", () => {
  assert.equal(messageFrom(null, 0), NETWORK_MESSAGE);
  assert.match(NETWORK_MESSAGE, /Can't reach Media/);
  assert.match(NETWORK_MESSAGE, /try again/i);
  assert.equal(messageFrom({ detail: "Failed to fetch" }, 0), NETWORK_MESSAGE);
  assert.equal(messageFrom({ detail: "Sign in again so this change can be saved." }, 403), CSRF_MESSAGE);
  assert.equal(messageFrom({ detail: "Sign-in is unavailable." }, 503), UNAVAILABLE_MESSAGE);
  assert.match(UNAVAILABLE_MESSAGE, /Try again in a minute/);
  assert.equal(messageFrom({ detail: "That item is not in your library." }, 404), "That item is not in your library.");
  assert.equal(messageFrom(null, 500), "Request failed (500).");
});

test("a timeout with no caller signal uses the friendly network sentence", async () => {
  const original = globalThis.fetch;
  globalThis.document = { cookie: "finance_csrf=token" };
  globalThis.window = { MEDIA_ROOT: "" };
  globalThis.fetch = async () => {
    const error = new Error("The operation was aborted due to timeout");
    error.name = "TimeoutError";
    throw error;
  };
  try {
    await assert.rejects(
      () => api("/api/entries/1", { method: "PATCH", body: "{}" }),
      error => error.message === NETWORK_MESSAGE && error.status === 0 && error.name !== "TimeoutError",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("a timeout on the caller's signal stays a timeout", async () => {
  const original = globalThis.fetch;
  globalThis.document = { cookie: "finance_csrf=token" };
  globalThis.window = { MEDIA_ROOT: "" };
  globalThis.fetch = async () => {
    const error = new Error("The operation was aborted due to timeout");
    error.name = "TimeoutError";
    throw error;
  };
  try {
    await assert.rejects(
      () => api("/api/entries/1", { method: "PATCH", body: "{}", signal: AbortSignal.timeout(10_000) }),
      error => error.name === "TimeoutError",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("a failed csrf preflight uses the friendly network sentence", async () => {
  const original = globalThis.fetch;
  globalThis.document = { cookie: "" };
  globalThis.window = { MEDIA_ROOT: "" };
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  try {
    await assert.rejects(
      () => api("/api/entries/1", { method: "PATCH", body: "{}" }),
      error => error.message === NETWORK_MESSAGE && error.status === 0,
    );
  } finally {
    globalThis.fetch = original;
  }
});
