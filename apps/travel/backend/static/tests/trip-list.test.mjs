import assert from "node:assert/strict";
import test from "node:test";
import {
  PAST_PREVIEW,
  cardPtoText,
  countdownText,
  dayOfTrip,
  isEmpty,
  localToday,
  pastSlice,
  totals,
} from "../../../frontend/src/trip-list.mjs";

test("dayOfTrip and countdownText including Today only", () => {
  assert.deepEqual(dayOfTrip("2026-12-01", "2026-12-04", "2026-12-02"), {
    day: 2,
    of: 4,
  });
  assert.deepEqual(dayOfTrip("2026-12-01", "2026-12-04", "2026-11-20"), {
    day: 1,
    of: 4,
  });
  assert.deepEqual(dayOfTrip("2026-12-01", "2026-12-04", "2026-12-20"), {
    day: 4,
    of: 4,
  });
  const away = {
    phase: "in_progress",
    start_date: "2026-12-01",
    end_date: "2026-12-04",
  };
  assert.equal(countdownText(away, "2026-12-02"), "Day 2 of 4");
  assert.equal(
    countdownText(
      { phase: "in_progress", start_date: "2026-12-14", end_date: "2026-12-14" },
      "2026-12-14",
    ),
    "Today only",
  );
  assert.equal(
    countdownText(
      { phase: "upcoming", start_date: "2026-12-01", end_date: "2026-12-04" },
      "2026-11-01",
    ),
    null,
  );
  assert.equal(
    countdownText(
      { phase: "past", start_date: "2026-12-01", end_date: "2026-12-04" },
      "2026-12-20",
    ),
    null,
  );
});

test("totals skips zero and keeps order", () => {
  const trip = {
    budget: {
      currencies: [
        { currency: "USD", total_cents: 124000 },
        { currency: "JPY", total_cents: 0 },
        { currency: "EUR", total_cents: 8000 },
      ],
    },
  };
  assert.deepEqual(totals(trip), [
    { currency: "USD", cents: 124000 },
    { currency: "EUR", cents: 8000 },
  ]);
  assert.deepEqual(totals({ budget: { currencies: [] } }), []);
  assert.deepEqual(totals({}), []);
  assert.deepEqual(totals(null), []);
});

test("pastSlice previews six", () => {
  const past = Array.from({ length: 9 }, (_, index) => ({ id: index + 1 }));
  assert.equal(PAST_PREVIEW, 6);
  assert.deepEqual(
    pastSlice(past, false).map((trip) => trip.id),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(pastSlice(past, true).length, 9);
  assert.equal(pastSlice(past.slice(0, 6), false).length, 6);
});

test("isEmpty ignores past", () => {
  assert.equal(isEmpty({ in_progress: [], upcoming: [], past: [{ id: 1 }] }), true);
  assert.equal(isEmpty({ in_progress: [{ id: 1 }], upcoming: [] }), false);
  assert.equal(isEmpty({ in_progress: [], upcoming: [{ id: 2 }] }), false);
});

test("todayIso helper uses local date", () => {
  // Local getters, not UTC: a fixed local Date round-trips its own Y/M/D.
  const fixed = new Date(2026, 11, 7, 23, 59, 30);
  assert.equal(localToday(fixed), "2026-12-07");
  const early = new Date(2027, 0, 1, 0, 1, 0);
  assert.equal(localToday(early), "2027-01-01");
  assert.match(localToday(), /^\d{4}-\d{2}-\d{2}$/);
});

test("cardPtoText appends PTO to the days text", () => {
  assert.equal(cardPtoText({ pto_days_effective: "2" }), "2 days PTO");
  assert.equal(cardPtoText({ pto_days_effective: "0.5" }), "0.5 days PTO");
  assert.equal(cardPtoText({ pto_days_effective: "0" }), "0 days PTO");
  assert.equal(cardPtoText({ pto_days_effective: "1" }), "1 day PTO");
});
