import assert from "node:assert/strict";
import test from "node:test";
import {
  PAST_PREVIEW,
  acceptListedLoad,
  cardNextAction,
  cardPlaces,
  cardPtoText,
  cardStatus,
  countdownText,
  dayOfTrip,
  isEmpty,
  localToday,
  pastSlice,
  placeSearchCurrent,
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

test("todayIso helper uses local date", () => {
  // Local getters, not UTC: a fixed local Date round-trips its own Y/M/D.
  const fixed = new Date(2026, 11, 7, 23, 59, 30);
  assert.equal(localToday(fixed), "2026-12-07");
  const early = new Date(2027, 0, 1, 0, 1, 0);
  assert.equal(localToday(early), "2027-01-01");
  assert.match(localToday(), /^\d{4}-\d{2}-\d{2}$/);
});

test("cards name saved city, airport, and lodging without inventing a destination", () => {
  const titled = {
    title: "Harbor week",
    phase: "upcoming",
    stays: [],
    transports: [
      { mode: "drive", depart_place: "Garage", arrive_place: "Pier" },
      { mode: "flight", depart_place: "  ", arrive_place: "PAP" },
      { mode: "flight", depart_place: "PAP", arrive_place: "pap" },
    ],
  };
  assert.deepEqual(cardPlaces(titled).map((place) => [place.kind, place.label]), [
    ["airport", "PAP"],
  ]);
  assert.equal(cardStatus(titled), "Upcoming");
  assert.equal(cardNextAction({ phase: "upcoming", next_action: "Review the plan" }), "Review the plan");
  assert.equal(cardNextAction({ phase: "past", next_action: null }), "Open this trip");
  assert.equal(cardStatus({ phase: "past" }), "Past");
  assert.equal(cardStatus({ phase: "in_progress" }), "Away now");
  assert.equal(cardNextAction({ phase: "in_progress", next_action: "Open today's plan" }), "Open today's plan");

  const saved = cardPlaces({
    title: "Do not use this title",
    stays: [
      { city: "Paper City", lodging_name: "Paper Inn", lat: 0, lng: 0 },
      { city: "Paper City", lodging_name: "  ", lat: null, lng: 12 },
      { city: "Second City", lodging_name: "Paper Inn", lat: 99, lng: 10 },
    ],
    transports: [{ mode: "train", depart_place: "Union", arrive_place: "Central" }],
  });
  assert.deepEqual(
    saved.map((place) => [place.kind, place.kindLabel, place.label, place.lat, place.lng]),
    [
      ["city", "City", "Paper City", 0, 0],
      ["lodging", "Lodging", "Paper Inn", null, null],
      ["city", "City", "Second City", null, null],
    ],
  );
  assert.equal(cardPlaces(null).length, 0);
  assert.equal(cardNextAction(null), "");
});

test("a stale home load or place search does not count as current", () => {
  assert.equal(acceptListedLoad(1, 1, true), true);
  assert.equal(acceptListedLoad(1, 2, true), false);
  assert.equal(acceptListedLoad(2, 2, false), false);
  const current = {
    sessionActive: true,
    editor: "location",
    stayId: 4,
    currentStayId: 4,
    query: "Paper City",
    currentQuery: "Paper City",
  };
  assert.equal(placeSearchCurrent(current), true);
  assert.equal(placeSearchCurrent({ ...current, currentQuery: "Other city" }), false);
  assert.equal(placeSearchCurrent({ ...current, sessionActive: false }), false);
  assert.equal(placeSearchCurrent({ ...current, editor: "destination" }), false);
  assert.equal(placeSearchCurrent({ ...current, currentStayId: 9 }), false);
});
