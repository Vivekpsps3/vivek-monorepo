import assert from "node:assert/strict";
import test from "node:test";
import {
  nightsWord,
  ptoText,
  showSubtitle,
  transportWhen,
} from "../../../frontend/src/trip-header.mjs";

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
