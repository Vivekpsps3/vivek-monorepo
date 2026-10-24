import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { gridDay, monthCells } from "../modules/composer-model.mjs";
import { balancePhrase, formatDays } from "../modules/labels.mjs";
import { formError } from "../modules/validate.mjs";

const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");

test("TR4.1 the narrow top bar drops the backdrop filter that traps the tab bar", () => {
  const css = read("app.css");
  const narrow = css.slice(css.indexOf("@media (max-width: 767px)"));
  assert.match(narrow, /backdrop-filter:\s*none/);
  assert.match(narrow, /-webkit-backdrop-filter:\s*none/);
});

test("TR2.4 a quick-add ride asks for a mode and refuses to save without one", () => {
  const trip = read("modules/views/trip.mjs");
  assert.equal(trip.includes('type="hidden" name="mode" value="flight"'), false);
  assert.match(trip, /<option value="">Choose…<\/option>/);
  assert.match(trip, /name="mode" required/);
  assert.deepEqual(formError("transport", { mode: "", depart_place: "SFO" }), {
    name: "mode",
    message: "Choose a way to travel.",
  });
  assert.equal(formError("transport", { mode: "train", depart_place: "SFO" }), null);
});

test("TR2.3 a Booked retry sends the value the person chose", () => {
  const ui = read("modules/actions/ui.mjs");
  const trip = read("modules/views/trip.mjs");
  assert.match(ui, /function saveFlagValue\(kind, id, flag, next, ui\)/);
  assert.match(ui, /run: \(\) => saveFlagValue\(kind, id, flag, next, ui\)/);
  assert.equal(ui.includes("run: () => saveFlag(input, ui)"), false);
  assert.equal(trip.includes('aria-pressed="'), false);
});

test("TR3.1 Space and a synthetic click select a composer day and keep focus", () => {
  const composer = read("modules/views/composer.mjs");
  assert.match(composer, /\[data-day\]:not\(\.is-out\)/);
  assert.match(composer, /day && event\.detail === 0/);
  assert.match(composer, /pickDay\(model, day\.dataset\.day/);
  assert.match(composer, /focusDay\(focusIso\)/);
  assert.match(composer, /event\.key === "Escape"[\s\S]*focusIso = stay[\s\S]*focusDay\(stay\)/);
  assert.equal(/if \(event\.key === "Enter"\)/.test(composer), false);
});

test("the composer grid has one tab stop and outside days are not announced", () => {
  const october = monthCells(new Date(2026, 9, 1));
  const html = october.map((cell) => gridDay(cell, {
    focusIso: "2026-10-15",
    selected: cell.iso === "2026-10-15",
    label: cell.iso,
  })).join("");
  assert.equal([...html.matchAll(/tabindex="0"/g)].length, 1);
  assert.match(html, /data-day="2026-10-15"[^>]*tabindex="0"/);
  assert.match(html, /aria-hidden="true"/);
  assert.equal(html.includes('data-day="2026-09-27"'), false);

  const november = monthCells(new Date(2026, 10, 1));
  const december = monthCells(new Date(2026, 11, 1));
  const both = [...november, ...december].map((cell) => gridDay(cell, {
    focusIso: "2026-11-30",
    selected: false,
    label: cell.iso === "2026-11-30" ? "Monday, November 30, 2026" : cell.iso,
  })).join("");
  assert.equal([...both.matchAll(/tabindex="0"/g)].length, 1);
  assert.equal((both.match(/aria-label="Monday, November 30, 2026"/g) || []).length, 1);
  const composer = read("modules/views/composer.mjs");
  assert.match(composer, /gridDay\(/);
  assert.match(composer, /aria-multiselectable="true"/);
  assert.match(composer, /event\.ctrlKey/);
  assert.match(composer, /Math\.hypot\(event\.clientX - dragX, event\.clientY - dragY\) < 8/);
  assert.match(composer, /pointercancel/);
  assert.match(composer, /lostpointercapture/);
});

test("TR3.4 a PTO drag ends once, a cadence change keeps typed values, and radios rove", () => {
  const pto = read("modules/views/pto.mjs");
  const css = read("app.css");
  assert.match(pto, /let picking = false/);
  assert.match(pto, /if \(!picking\) return;\s*picking = false/);
  assert.equal(pto.includes('window.addEventListener("pointerup"'), false);
  assert.match(pto, /function readDraft\(\)/);
  assert.match(pto, /paint\(\) \{\s*readDraft\(\)/);
  assert.match(pto, /tabindex="\$\{selected \? "0" : "-1"\}"/);
  assert.match(pto, /ArrowLeft/);
  assert.match(pto, /DECISIONS\.weekStartsOn/);
  assert.equal(pto.includes("addDays(date, -date.getDay())"), false);
  assert.match(css, /#pto-board \[role="radio"\]/);
});

test("TR2.10 delete closes the dialog before it navigates and the error is an alert", () => {
  const feedback = read("modules/feedback.mjs");
  const ui = read("modules/actions/ui.mjs");
  const html = read("index.html");
  assert.match(feedback, /await onConfirm\(\);\s*dialog\.close\(\);\s*if \(typeof after === "function"\) await after\(\)/);
  assert.match(feedback, /#app h1/);
  assert.match(feedback, /aria-hidden", "true"/);
  assert.match(ui, /onConfirm: async \(\) => \{\s*await api\(deletePath\(kind, id\), \{ method: "DELETE" \}\);\s*\}/);
  assert.match(ui, /after: async \(\)/);
  assert.match(html, /data-confirm-error role="alert"/);
  assert.match(html, /aria-describedby="confirm-body"/);
});

test("TR1.2 a later success dismisses the persistent Retry toast", () => {
  const forms = read("modules/actions/forms.mjs");
  const composer = read("modules/views/composer.mjs");
  const ui = read("modules/actions/ui.mjs");
  const pto = read("modules/views/pto.mjs");
  assert.match(forms, /dismissToast\(`form:\$\{kind\}`\)/);
  assert.match(forms, /committed\(kind, "Trip created\."\)/);
  assert.match(composer, /dismissToast\("composer-save"\)/);
  assert.match(ui, /dismissToast\(`flag-\$\{kind\}-\$\{id\}`\)/);
  assert.match(pto, /dismissToast\("pto-entry"\)/);
  assert.match(pto, /dismissToast\("pto-policy"\)/);
});

test("TR2.8 the city error survives a narrow redraw and clears when the city is typed", () => {
  const composer = read("modules/views/composer.mjs");
  const css = read("app.css");
  assert.match(composer, /if \(narrow\(\) === wasNarrow\) return/);
  assert.match(composer, /model\.cityError = true/);
  assert.match(composer, /clearFieldError\(root, "city"\)/);
  assert.match(composer, /applyFieldError\(root, "city", "Name the city\.", \{ focus: false \}\)/);
  assert.match(css, /grid-template-columns:\s*8px 1fr/);
});

test("client day rounding matches half away from zero", () => {
  assert.equal(formatDays("-0.125"), "-0.13");
  assert.equal(formatDays("1.005"), "1.01");
  assert.equal(formatDays("-0.001"), "0");
  assert.equal(formatDays("1.239"), "1.24");
  assert.equal(balancePhrase("-0.001"), "0 days");
  assert.equal(balancePhrase("-0.125"), "0.13 days over");
});
