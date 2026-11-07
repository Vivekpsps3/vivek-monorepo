import assert from "node:assert/strict";
import test from "node:test";
import {
  nightsWord,
  ptoText,
  showSubtitle,
  transportWhen,
} from "../../../frontend/src/trip-header.mjs";

test("showSubtitle hides single city equal to title case-insensitively", () => {
  assert.equal(showSubtitle("Lisbon", ["Lisbon"]), false);
  assert.equal(showSubtitle("lisbon ", [" Lisbon"]), false);
  assert.equal(showSubtitle("Lisbon week", ["Lisbon"]), true);
  assert.equal(showSubtitle("Kyoto and Osaka", ["Kyoto", "Osaka"]), true);
  assert.equal(showSubtitle("Lisbon", []), false);
});

test("nightsWord keeps same day and 1 night copy", () => {
  assert.equal(nightsWord(0), "same day");
  assert.equal(nightsWord(1), "1 night");
  assert.equal(nightsWord(2), "2 nights");
  assert.equal(nightsWord(7), "7 nights");
});

test("ptoText singular and plural and zero", () => {
  assert.equal(ptoText("1"), "1 PTO day");
  assert.equal(ptoText("0.5"), "0.5 PTO days");
  assert.equal(ptoText("2"), "2 PTO days");
  assert.equal(ptoText("0"), "0 PTO days");
  assert.equal(ptoText(""), "0 PTO days");
  assert.equal(ptoText(null), "0 PTO days");
});

test("transportWhen same day and overnight and missing side", () => {
  assert.deepEqual(transportWhen("2026-12-12T09:00", "2026-12-12T11:40"), {
    depart: { date: "2026-12-12", time: "09:00" },
    arrive: { date: "2026-12-12", time: "11:40" },
    sameDay: true,
  });
  const overnight = transportWhen("2026-12-12T21:00", "2026-12-13T06:10");
  assert.equal(overnight.sameDay, false);
  assert.deepEqual(overnight.arrive, { date: "2026-12-13", time: "06:10" });
  assert.deepEqual(transportWhen(null, "2026-12-13T06:10"), {
    depart: null,
    arrive: { date: "2026-12-13", time: "06:10" },
    sameDay: false,
  });
  assert.deepEqual(transportWhen("", null), {
    depart: null,
    arrive: null,
    sameDay: false,
  });
});
