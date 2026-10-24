import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function htmlFiles(dir, found = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === ".venv") continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) htmlFiles(path, found);
    else if (name.endsWith(".html")) found.push(path);
  }
  return found;
}

test("Media and Finance HTML do not load the Cloudflare beacon", () => {
  const root = new URL("../../../../../", import.meta.url);
  const files = htmlFiles(root.pathname).filter(path => path.includes("/apps/media/") || path.includes("/apps/finance/"));
  assert.ok(files.length > 0);
  for (const path of files) {
    const html = readFileSync(path, "utf8");
    assert.doesNotMatch(html, /cloudflareinsights|static\.cloudflareinsights|beacon\.min\.js/i, path);
  }
});
