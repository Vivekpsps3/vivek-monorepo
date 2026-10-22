import assert from "node:assert/strict";
import test from "node:test";

import { CSRF_MESSAGE, NETWORK_MESSAGE, UNAVAILABLE_MESSAGE, messageFrom } from "../modules/api.mjs";

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
