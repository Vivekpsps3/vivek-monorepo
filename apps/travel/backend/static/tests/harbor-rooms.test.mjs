import assert from "node:assert/strict";
import test from "node:test";

import {
  cardKind,
  clearRoomDraft,
  completedPostcards,
  destinationLabel,
  ferryRing,
  mapDestinations,
  matchingPostcard,
  ordinarySouvenirs,
  plannedPostcards,
  postcardFacts,
  postcardLabel,
  readRoomQuery,
  souvenirLabel,
  roomStages,
  settleRoomLoad,
  tripPto,
  tripSpan,
  visibleItinerary,
} from "../../../frontend/src/harbor-rooms.mjs";

const coast = {
  id: 4,
  title: "Paper coast",
  status: "planning",
  start_date: "2026-12-01",
  end_date: "2026-12-03",
  counts_as_pto: false,
  pto: {
    counts: false,
    days: "0",
    note: "This trip is not counted as PTO. Day choices are kept.",
  },
  pto_dates: [
    { on_date: "2026-12-01", amount: "1" },
    { on_date: "2026-12-02", amount: "1" },
  ],
  stays: [{ city: "Paper Harbor", lat: 1, lng: 2 }],
  days: [
    { on_date: "2026-12-01", city: "Paper Harbor" },
    { on_date: "2026-12-02", city: "Paper Harbor" },
  ],
  transports: [{ id: 8, mode: "ferry", role: "local", number: "BELL" }],
  budget: {
    lines: [
      { currency: "USD", amount_cents: 1500, paid: false, source: "plan", source_id: 1 },
      { currency: "USD", amount_cents: 1200, paid: true, source: "transport", source_id: 9 },
    ],
  },
};

const done = {
  id: 5,
  title: "Paper return",
  status: "done",
  start_date: "2026-10-01",
  end_date: "2026-10-03",
  stays: [{ city: "Paper City" }],
  days: [],
  transports: [],
  budget: { lines: [] },
};

const home = { in_progress: [], upcoming: [coast], past: [done] };

const memories = [
  {
    id: "trip:4",
    trip_id: 4,
    title: "Paper coast",
    status: "planning",
    mark: "planned",
    mark_label: "Planned",
    span_start: "2026-12-01",
    span_end: "2026-12-03",
    span_text: "December 1, 2026 through December 3, 2026",
  },
  {
    id: "trip:5",
    trip_id: 5,
    title: "Paper return",
    status: "done",
    mark: "completed",
    mark_label: "Completed",
    span_start: "2026-10-01",
    span_end: "2026-10-03",
    span_text: "October 1, 2026 through October 3, 2026",
  },
  {
    id: "trip:6",
    trip_id: 6,
    title: "Open stay",
    status: "booked",
    mark: "booked",
    mark_label: "Booked",
    span_start: "2026-11-01",
    span_end: "",
  },
];

test("planned and completed postcards keep the source status and span", () => {
  const planned = plannedPostcards(memories);
  const completed = completedPostcards(memories);
  assert.deepEqual(planned.map((row) => row.trip_id), [4]);
  assert.deepEqual(completed.map((row) => row.trip_id), [5]);
  const plannedFacts = postcardFacts(planned[0], coast);
  const completedFacts = postcardFacts(completed[0], done);
  assert.equal(plannedFacts.status, "planning");
  assert.equal(plannedFacts.spanText, memories[0].span_text);
  assert.equal(plannedFacts.spanStart, "2026-12-01");
  assert.equal(plannedFacts.spanEnd, "2026-12-03");
  assert.equal(plannedFacts.agrees, true);
  assert.equal(completedFacts.status, "done");
  assert.equal(completedFacts.spanText, memories[1].span_text);
  assert.equal(completedFacts.spanStart, "2026-10-01");
  assert.equal(completedFacts.spanEnd, "2026-10-03");
  assert.equal(completedFacts.agrees, true);
  assert.match(postcardLabel(planned[0]), /Select planned postcard Paper coast/);
  assert.match(postcardLabel(planned[0]), /Planned/);
  assert.match(postcardLabel(planned[0]), /December 1, 2026 through December 3, 2026/);
  assert.match(souvenirLabel(completed[0]), /Saved souvenir Completed Paper return/);
  assert.match(souvenirLabel(completed[0]), /October 1, 2026 through October 3, 2026/);
  assert.notEqual(plannedFacts.status, completedFacts.status);
  assert.notEqual(plannedFacts.spanText, completedFacts.spanText);
  const mismatch = postcardFacts(planned[0], { start_date: "2026-12-01", end_date: "2026-12-04" });
  assert.equal(mismatch.agrees, false);
  assert.equal(mismatch.spanEnd, "2026-12-03");
});

test("a missing return is not copied from the leave date and PTO dates are not a new charge", () => {
  const open = tripSpan({ start_date: "2026-12-01", end_date: "" });
  assert.equal(open.start, "2026-12-01");
  assert.equal(open.end, "");
  assert.equal(open.inventedReturn, false);
  assert.match(open.text, /Return date is not saved/);
  assert.equal(open.text.includes("2026-12-01 through 2026-12-01"), false);
  const charge = tripPto(coast);
  assert.equal(charge.charged, "0");
  assert.equal(charge.counts, false);
  assert.match(charge.text, /PTO charge 0 days/);
  assert.match(charge.text, /does not add a PTO charge/);
  assert.equal(charge.dates.length, 2);
  const summed = charge.dates.reduce((total, row) => total + Number(row.amount), 0);
  assert.equal(summed, 2);
  assert.notEqual(charge.charged, String(summed));
  assert.equal(visibleItinerary({ upcoming: [{ id: 7, title: "Bare", start_date: "2026-12-01", end_date: "2026-12-03", days: [] }] }, 7).length, 0);
});

test("a trip title is not a destination and a ferry is not a room", () => {
  const titled = mapDestinations({
    upcoming: [{ id: 7, title: "Paper coast", stays: [], transports: [] }],
  });
  assert.equal(titled.length, 1);
  assert.equal(titled[0].label, "");
  assert.equal(titled[0].missing, true);
  assert.match(destinationLabel(titled[0]), /No destination saved/);
  const places = mapDestinations(home);
  assert.equal(places.some((row) => row.label === "Paper coast"), false);
  assert.equal(places.find((row) => row.label === "Paper Harbor").lat, 1);
  const zero = mapDestinations({
    upcoming: [{ id: 8, title: "Origin", stays: [{ city: "Zero", lat: 0, lng: 0 }] }],
  });
  assert.deepEqual([zero[0].lat, zero[0].lng], [0, 0]);
  const dropped = mapDestinations({
    upcoming: [{ id: 9, title: "Off", stays: [{ city: "Off", lat: 91, lng: 0 }] }],
  });
  assert.equal(dropped[0].lat, null);
  const params = new URLSearchParams("room=ferry&object=ferry&card=&trip=4");
  assert.equal(readRoomQuery(params).room, "");
  assert.equal(
    readRoomQuery({ get: (key) => (key === "room" ? "map" : key === "place" ? "Paper\u0000Harbor" : "") }).place,
    "PaperHarbor",
  );
  assert.equal(readRoomQuery(new URLSearchParams("room=map&trip=4&place=Paper Harbor")).room, "map");
  assert.equal(matchingPostcard(memories, { trip: 4, card: "" }), null);
  assert.equal(matchingPostcard(memories, { trip: 4, card: "souvenir" }), null);
  assert.equal(matchingPostcard(memories, { trip: 4, card: "planned" }).title, "Paper coast");
  assert.equal(cardKind(memories[2]), "souvenir");
  assert.equal(ordinarySouvenirs(memories).some((row) => row.trip_id === 6), false);
});

test("the model ferry copies status and does not complete the trip", () => {
  const rung = ferryRing(coast);
  assert.equal(rung.decorative, true);
  assert.equal(rung.completesTrip, false);
  assert.equal(rung.ptoCharge, false);
  assert.equal(rung.inventedReturn, false);
  assert.equal(rung.status, "planning");
  assert.equal(rung.end, "2026-12-03");
  assert.equal(coast.status, "planning");
  assert.equal(coast.end_date, "2026-12-03");
});

test("locked Finance keeps Travel lines and a link is counted once", () => {
  const souvenirs = ordinarySouvenirs(memories);
  const locked = roomStages(coast, null, [
    { tripId: 4, source: "transport", sourceId: 9, transactionId: 77 },
  ]);
  assert.equal(locked.length, 1);
  assert.equal(locked[0].locked, true);
  assert.equal(locked[0].posted, null);
  assert.equal(locked[0].planned, 1500);
  assert.equal(locked[0].booked, 1200);
  assert.equal(locked[0].countedOnce, 0);
  assert.equal("total" in locked[0], false);
  assert.equal(ordinarySouvenirs(memories).length, souvenirs.length);
  const lookup = () => [
    {
      trip_id: 4,
      currency: "USD",
      cents: 1200,
      count: 1,
      postings: [{ id: 77, cents: 1200, label: "synthetic" }],
    },
  ];
  const link = { tripId: 4, source: "transport", sourceId: 9, transactionId: 77 };
  const open = roomStages(coast, lookup, [link, { ...link }]);
  assert.equal(open[0].locked, false);
  assert.equal(open[0].planned, 1500);
  assert.equal(open[0].booked, 1200);
  assert.equal(open[0].posted, 1200);
  assert.equal(open[0].countedOnce, 1200);
  assert.equal("total" in open[0], false);
  assert.notEqual(open[0].planned, open[0].planned + open[0].posted);
});

test("a losing load drops, a failed load keeps, and a private draft clears", () => {
  assert.equal(settleRoomLoad({ epoch: 1, currentEpoch: 2, sessionActive: true, ok: true }), "drop");
  assert.equal(settleRoomLoad({ epoch: 1, currentEpoch: 1, sessionActive: false, ok: true }), "drop");
  assert.equal(settleRoomLoad({ epoch: 1, currentEpoch: 1, sessionActive: true, ok: false }), "keep");
  assert.equal(settleRoomLoad({ epoch: 1, currentEpoch: 1, sessionActive: true, ok: true }), "apply");
  assert.deepEqual(clearRoomDraft(), { note: "", ferry: null });
});
