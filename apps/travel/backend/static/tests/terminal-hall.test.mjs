import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptHallLoad,
  clearHallDesk,
  dayActionLabel,
  departureRows,
  hallIsEmpty,
  hallReturnPath,
  hallTrips,
  itineraryRows,
  legActionLabel,
  legTarget,
  matchingDay,
  matchingLeg,
  readHallQuery,
} from "../../../frontend/src/terminal-hall.mjs";

const harbor = {
  id: 4,
  title: "Harbor week",
  start_date: "2026-12-12",
  end_date: "2026-12-14",
  transports: [
    {
      id: 9,
      role: "outbound",
      mode: "flight",
      number: "UA100",
      depart_place: "SFO",
      arrive_place: "HND",
      depart_at: "2026-12-12T09:00",
      arrive_at: "2026-12-12T11:40",
    },
    {
      id: 10,
      role: "inbound",
      mode: "flight",
      number: "UA200",
      depart_place: "HND",
      arrive_place: "SFO",
      depart_at: "2026-12-14T18:10",
      arrive_at: "2026-12-14T11:20",
    },
  ],
  days: [
    { on_date: "2026-12-12", city: "Harbor" },
    { on_date: "2026-12-13", city: "Harbor" },
    { on_date: "2026-12-14", city: "Harbor" },
    { on_date: "2026-02-31", city: "Skipped" },
  ],
};

function homeWith(trip, extras = {}) {
  return {
    in_progress: extras.in_progress || [],
    upcoming: trip ? [trip] : [],
    past: extras.past || [],
  };
}

test("saved departure and return stay separate and do not invent a third leg", () => {
  const rows = departureRows(homeWith(harbor));
  assert.deepEqual(
    rows.map((row) => [row.role, row.number, row.from, row.to, row.day]),
    [
      ["outbound", "UA100", "SFO", "HND", "2026-12-12"],
      ["inbound", "UA200", "HND", "SFO", "2026-12-14"],
    ],
  );
  assert.equal(legActionLabel(rows[0]), "Open departure UA100, SFO to HND, 2026-12-12, Harbor week");
  assert.equal(legActionLabel(rows[1]), "Open return UA200, HND to SFO, 2026-12-14, Harbor week");
  assert.equal(rows.some((row) => row.role === "return" && !row.number), false);
});

test("a one-way trip keeps the missing return missing", () => {
  const rows = departureRows(homeWith({
    ...harbor,
    transports: [harbor.transports[0], { role: "inbound", depart_place: "HND" }],
  }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].number, "UA100");
  assert.equal(rows[0].day, "2026-12-12");
});

test("a leg without a clock uses the saved trip start and does not invent a time", () => {
  const rows = departureRows(homeWith({
    id: 4,
    title: "Harbor week",
    start_date: "2026-12-12",
    transports: [{ id: 9, role: "outbound", mode: "flight", number: "UA100" }],
    days: [],
  }));
  assert.equal(rows[0].departAt, "");
  assert.equal(rows[0].day, "2026-12-12");
  assert.equal(legTarget(rows[0]).createsTrip, false);
});

test("itinerary rows are the saved local days only", () => {
  const rows = itineraryRows(homeWith(harbor));
  assert.deepEqual(rows.map((row) => [row.day, row.city]), [
    ["2026-12-12", "Harbor"],
    ["2026-12-13", "Harbor"],
    ["2026-12-14", "Harbor"],
  ]);
  assert.equal(dayActionLabel(rows[1]), "Open day 2026-12-13, Harbor week, Harbor");
  const span = { id: 4, title: "Harbor week", start_date: "2026-12-12", end_date: "2026-12-14", days: [] };
  assert.deepEqual(itineraryRows(homeWith(span)), []);
});

test("an empty home starts with no board and no table rows", () => {
  const empty = homeWith(null);
  assert.equal(hallIsEmpty(empty), true);
  assert.deepEqual(hallTrips(empty), []);
  assert.deepEqual(departureRows(empty), []);
  assert.deepEqual(itineraryRows(empty), []);
  assert.equal(hallIsEmpty(null), true);
});

test("the same saved trip is listed once", () => {
  const trips = hallTrips(homeWith(harbor, { past: [harbor], in_progress: [{ id: 0, title: "Draft" }] }));
  assert.deepEqual(trips.map((trip) => trip.id), [4]);
});

test("hall query keeps board, desk, and table coordinates and drops private ones", () => {
  const params = new URLSearchParams("object=board&trip=4&leg=9&day=2026-12-12&note=private");
  assert.deepEqual(readHallQuery(params), { object: "board", trip: 4, leg: 9, day: "2026-12-12" });
  const dropped = new URLSearchParams("object=ferry&trip=0&leg=9&day=2026-02-31&note=private");
  assert.deepEqual(readHallQuery(dropped), { object: "", trip: null, leg: 9, day: "" });
  assert.equal(
    hallReturnPath({ object: "board", trip: 4, leg: 9, day: "2026-12-12" }),
    "/travel/terminal?object=board&trip=4&leg=9&day=2026-12-12",
  );
  assert.equal(
    hallReturnPath({ object: "table", trip: 4, leg: 9, day: "2026-12-13" }),
    "/travel/terminal?object=table&trip=4&day=2026-12-13",
  );
  assert.equal(hallReturnPath({ object: "desk", day: "2026-02-31" }), "/travel/terminal?object=desk");
});

test("opening a leg or day addresses the saved row and never a new trip", () => {
  const rows = departureRows(homeWith(harbor));
  const days = itineraryRows(homeWith(harbor));
  const query = readHallQuery(new URLSearchParams("object=board&trip=4&leg=10&day=2026-12-14"));
  const leg = matchingLeg(rows, query);
  assert.equal(leg.number, "UA200");
  const target = legTarget(leg);
  assert.deepEqual(target, { tripId: 4, transportId: 10, day: "2026-12-14", createsTrip: false });
  assert.equal(legTarget({ tripId: 0, transportId: 10 }), null);
  assert.equal(matchingLeg(rows, { object: "desk", trip: 4, leg: 9, day: "" }), null);
  assert.equal(matchingDay(days, { object: "table", trip: 4, leg: null, day: "2026-12-13" }).city, "Harbor");
  assert.equal(matchingDay(days, { object: "board", trip: 4, leg: null, day: "2026-12-13" }), null);
});

test("a losing load is ignored and a cleared desk drops the private draft", () => {
  assert.equal(acceptHallLoad({ epoch: 2, currentEpoch: 2, sessionActive: true }), true);
  assert.equal(acceptHallLoad({ epoch: 1, currentEpoch: 2, sessionActive: true }), false);
  assert.equal(acceptHallLoad({ epoch: 2, currentEpoch: 2, sessionActive: false }), false);
  assert.deepEqual(clearHallDesk(), { ident: "", departOn: "", actionError: "", home: null });
});
