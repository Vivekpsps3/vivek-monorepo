import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { gridDay, monthCells, monthRows } from "../modules/composer-model.mjs";
import { balancePhrase, formatDays } from "../modules/labels.mjs";
import { state } from "../modules/state.mjs";
import { formError } from "../modules/validate.mjs";
import { renderTrip } from "../modules/views/trip.mjs";

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
  assert.match(composer, /monthRows\(/);
  assert.equal(monthRows(new Date(2026, 9, 1)).every((row) => row.some((cell) => !cell.outside)), true);
  assert.equal(monthRows(new Date(2026, 10, 1)).every((row) => row.some((cell) => !cell.outside)), true);
  assert.equal(monthRows(new Date(2026, 9, 1)).length < 6, true);
  assert.equal(monthRows(new Date(2026, 10, 1)).length < 6, true);
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
  assert.match(pto, /weekStartsOn\(\)/);
  assert.equal(pto.includes("DECISIONS.weekStartsOn"), false);
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

test("TR1.6 a saved key and a saved PTO entry restore focus", () => {
  const forms = read("modules/actions/forms.mjs");
  const router = read("modules/router.mjs");
  const pto = read("modules/views/pto.mjs");
  const settings = read("modules/views/settings.mjs");
  assert.match(forms, /state\.focusKey = "flight-key"/);
  assert.match(settings, /focusKey: "flight-key"/);
  assert.match(router, /options\.focusKey \|\| state\.focusKey/);
  assert.match(pto, /state\.focusKey = "pto-name"/);
  assert.match(pto, /data-focus-key="pto-name"/);
  assert.match(pto, /querySelector\("\[data-edit-policy\]"\)\?\.focus\(\)/);
});

test("TR2.1 an error token is added without dropping the other description", () => {
  const feedback = read("modules/feedback.mjs");
  const forms = read("modules/actions/forms.mjs");
  const pto = read("modules/views/pto.mjs");
  const composer = read("modules/views/composer.mjs");
  assert.match(feedback, /function clearFormErrors/);
  assert.match(feedback, /describedIds\(field\)\.filter\(\(id\) => id !== token\)/);
  assert.match(forms, /clearFormErrors\(form\)/);
  assert.match(pto, /clearFormErrors\(form\)/);
  assert.match(composer, /clearFormErrors\(root\)/);
});

test("TR2.2 a ride has From and To labels", () => {
  const trip = read("modules/views/trip.mjs");
  assert.match(trip, /<legend class="add-label">Add a ride<\/legend>/);
  assert.match(trip, /<label for="\$\{focus\}">From<\/label>/);
  assert.match(trip, /<label for="\$\{focus\}-to">To<\/label>/);
});

test("TR4.3 row deletes stay ghost and the dialog confirm stays filled", () => {
  const css = read("app.css");
  const html = read("index.html");
  const trip = read("modules/views/trip.mjs");
  assert.match(css, /\.btn-ghost\.btn-danger \{[^}]*background:\s*transparent/);
  assert.match(html, /class="btn btn-danger" data-confirm-ok/);
  assert.equal(html.includes('class="btn btn-ghost btn-danger" data-confirm-ok'), false);
  assert.match(trip, /class="row-more"/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
});

test("TR4.1 theme radios rove and Escape closes More", () => {
  const html = read("index.html");
  const ui = read("modules/actions/ui.mjs");
  const css = read("app.css");
  assert.equal(html.includes('data-action="theme"'), true);
  assert.equal(html.includes("aria-pressed"), false);
  assert.match(ui, /button\.removeAttribute\("aria-pressed"\)/);
  assert.match(ui, /button\.tabIndex = selected \? 0 : -1/);
  assert.match(ui, /#more-menu/);
  assert.match(ui, /data-action=menu/);
  assert.match(css, /\.theme-switch \.btn\[aria-checked="true"\]/);
  assert.equal(css.includes('.theme-switch .btn[aria-pressed="true"]'), false);
});

test("TR2.10 a failed Undo offers Retry and the toast reports the rejection", () => {
  const ui = read("modules/actions/ui.mjs");
  const toast = readFileSync(new URL("../../../../../packages/browser/runtime/toast.mjs", import.meta.url), "utf8");
  assert.match(ui, /const restore = async \(\) =>/);
  assert.match(ui, /run: restore/);
  assert.match(toast, /Promise\.resolve\(result\)\.catch/);
});

test("focus uses the shared ring on keyboard and programmatic focus", () => {
  const css = read("app.css");
  assert.match(css, /input:focus/);
  assert.match(css, /outline:\s*3px solid var\(--focus-ring\)/);
});

function quietTrip(extra = {}) {
  return {
    id: 1,
    title: "Kyoto",
    status: "planning",
    start_date: "2026-10-24",
    end_date: "2026-10-26",
    origin_label: "SFO",
    counts_as_pto: true,
    pto: { days: "2", leftover_after: "3" },
    span_days: 3,
    nights: 2,
    budget: { currencies: [], lines: [], manual: [] },
    cities: ["Kyoto"],
    stays: [],
    transports: [],
    days: [
      { on_date: "2026-10-24", city: "Kyoto", items: [], transports: [] },
      { on_date: "2026-10-25", city: "Kyoto", items: [], transports: [] },
      { on_date: "2026-10-26", city: "Kyoto", items: [], transports: [] },
    ],
    outside_plans: [],
    parking: [],
    note_entries: [],
    reminders: [],
    ...extra,
  };
}

function forms(html, kind) {
  return (html.match(new RegExp(`data-form="${kind}"`, "g")) || []).length;
}

test("an empty trip offers transport and a quiet day instead of every builder", () => {
  const previous = {
    compose: state.compose,
    composeDate: state.composeDate,
    composeRole: state.composeRole,
    edit: state.edit,
    details: state.details,
  };
  state.compose = "";
  state.composeDate = "";
  state.composeRole = "outbound";
  state.edit = null;
  state.details = null;
  try {
    const empty = renderTrip(quietTrip(), "");
    assert.equal((empty.match(/Add transport/g) || []).length, 1);
    assert.equal((empty.match(/Add activity/g) || []).length, 1);
    assert.match(empty, /class="date-strip"/);
    assert.match(empty, /data-date="2026-10-24"/);
    assert.match(empty, /<h1>Kyoto<\/h1>/);
    assert.match(empty, /<span>PTO<\/span>/);
    assert.match(empty, /3 quiet days/);
    for (const kind of ["transport", "plan", "parking", "budget", "note", "reminder"]) {
      assert.equal(forms(empty, kind), 0);
    }
    assert.equal(empty.includes("<h3>Outbound</h3>"), false);
    assert.equal(empty.includes("<h3>Inbound</h3>"), false);
    assert.equal(empty.includes("<h3>Between cities</h3>"), false);

    state.compose = "transport";
    const ride = renderTrip(quietTrip(), "");
    assert.equal(forms(ride, "transport"), 1);
    assert.match(ride, /data-flight-only hidden/);
    assert.equal(ride.includes("Latitude"), false);
    assert.equal(/<details class="ride-more" open/.test(ride), false);
    assert.match(ride, /<option value="">Choose…<\/option>/);
    assert.match(ride, /name="mode" required/);

    state.compose = "";
    const outbound = renderTrip(quietTrip({
      transports: [{ id: 4, role: "outbound", mode: "train", depart_place: "SFO", arrive_place: "KIX", paid: false, status: "planned" }],
    }), "");
    assert.match(outbound, /<h3>Outbound<\/h3>/);
    assert.equal(outbound.includes("<h3>Inbound</h3>"), false);
    assert.equal(outbound.includes("<h3>Between cities</h3>"), false);

    const day = renderTrip(quietTrip(), "2026-10-24");
    assert.equal((day.match(/id="add-plan-/g) || []).length, 1);
    assert.match(day, /id="add-plan-2026-10-24"/);
    assert.match(day, /No plans yet\. A quiet day is fine\./);
    assert.match(day, /Mark as free time/);

    state.compose = "plan";
    state.composeDate = "2026-10-25";
    const picked = renderTrip(quietTrip(), "");
    assert.equal((picked.match(/id="add-plan-/g) || []).length, 1);
    assert.match(picked, /id="add-plan-2026-10-25"/);

    state.compose = "";
    state.composeDate = "";
    const free = renderTrip(quietTrip({
      days: [{
        on_date: "2026-10-24",
        city: "Kyoto",
        transports: [],
        items: [{ id: 3, kind: "other", title: "Free time", place_name: "", start_time: "", notes: "", on_date: "2026-10-24", paid: false }],
      }],
    }), "2026-10-24");
    assert.match(free, /<p class="meta">Free time<\/p>/);
    assert.equal(free.includes("Name this plan"), false);

    const money = renderTrip(quietTrip({
      budget: {
        currencies: [
          { total: "10", currency: "USD" },
          { total: "20", currency: "JPY" },
        ],
        lines: [
          { label: "Flight", amount: "10", currency: "USD", source: "transport", category: "transport" },
          { label: "Train", amount: "20", currency: "JPY", source: "transport", category: "transport" },
        ],
        manual: [],
      },
    }), "");
    assert.equal((money.match(/Total /g) || []).length, 2);
  } finally {
    Object.assign(state, previous);
  }
});

test("client day rounding matches half away from zero", () => {
  assert.equal(formatDays("-0.125"), "-0.13");
  assert.equal(formatDays("1.005"), "1.01");
  assert.equal(formatDays("-0.001"), "0");
  assert.equal(formatDays("1.239"), "1.24");
  assert.equal(balancePhrase("-0.001"), "0 days");
  assert.equal(balancePhrase("-0.125"), "0.13 days over");
});
