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
  assert.match(html, /Change username/);
  assert.match(html, /aria-label="Account settings"/);
  assert.match(html, /Save name/);
  assert.doesNotMatch(html, /Signed in as/);
  assert.doesNotMatch(html, /hub-account__name/);
  assert.match(read("app/hub/username-change.component.html"), /aria-live="assertive"/);
  assert.match(read("app/hub/username-change.component.html"), /New username/);
  assert.match(read("app/hub/username-change.component.html"), /Current passphrase/);
  const policy = readFileSync(new URL("../../backend/services/username_policy.py", import.meta.url), "utf8");
  const min = Number(policy.match(/^USERNAME_MIN = (\d+)$/m)[1]);
  const max = Number(policy.match(/^USERNAME_MAX = (\d+)$/m)[1]);
  const pattern = policy.match(/^USERNAME_PATTERN = r"(\^\[[^\]]+\]\+\$)"$/m)[1];
  const characterClass = pattern.slice(1, pattern.indexOf("]") + 1);
  const stored = `^${characterClass}{${min},${max}}$`;
  assert.equal(characterClass, "[a-zA-Z0-9_.-]");
  assert.match(
    policy,
    /USERNAME_RE = re\.compile\(rf"\^\[a-zA-Z0-9_.-\]\{\{\{USERNAME_MIN\},\{USERNAME_MAX\}\}\}\$"\)/,
  );
  const client = readFileSync(new URL("../../../../packages/auth/src/username.ts", import.meta.url), "utf8");
  assert.match(client, new RegExp(`export const USERNAME_PATTERN = '${stored.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}';`));
  assert.match(client, /toLowerCase\(\)/);
  const service = read("app/auth/auth.service.ts");
  assert.match(service, /usernameForStorage/);
  assert.match(service, /requestPasswordlessChallenge\(handle\)/);
  assert.match(service, /requestPasswordlessChallenge\(current, 'username_change'\)/);
});
