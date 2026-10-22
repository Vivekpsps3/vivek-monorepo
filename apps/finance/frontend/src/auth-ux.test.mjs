import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("sign-in names the username and signup does not probe a signed-out browser", () => {
  assert.match(read("app/auth/login.component.html"), /Sign in with your username and passphrase\./);
  assert.match(read("app/auth/auth.service.ts"), /if \(!this\.csrfToken\)/);
  assert.match(read("app/auth/signup.component.ts"), /signupProgress/);
  assert.match(read("app/auth/signup.component.html"), /One account for Hub, Media, Travel and Finance\./);
  assert.match(read("app/auth/signup.component.html"), /About your passphrase/);
  const index = read("index.html");
  assert.match(index, /id="auth-static-shell"/);
  assert.match(index, /location\.pathname === '\/auth\/signup'/);
  assert.match(index, /mobile-web-app-capable/);
  assert.doesNotMatch(index, /apple-mobile-web-app-capable/);
});

test("the hub panel uses journal labels, deep links, next episodes, and retry", () => {
  const html = read("app/hub/hub.component.html");
  assert.match(html, /kindLabel\(item\.kind\)/);
  assert.match(html, /\/media\/#\/item\//);
  assert.match(html, /!media\.next_episodes\.length/);
  assert.match(html, /retryMedia\(\)/);
  assert.match(html, /review_excerpt/);
  assert.match(read("app/hub/hub-summary.ts"), /tv: 'Series'/);
});
