import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptFlight,
  beginManual,
  clearFlightStart,
  destinationProposal,
  existingTrips,
  flightSectionDirty,
  lookupApplies,
  reviewFromFlights,
  reviseFlightQuery,
  settleAttach,
  stageStart,
} from "../../../frontend/src/flight-start.mjs";

const morning = {
  ident: "UAL837",
  ident_iata: "UA837",
  status: "Scheduled",
  origin_iata: "SFO",
  origin_timezone: "America/Los_Angeles",
  destination_iata: "NRT",
  destination_timezone: "Asia/Tokyo",
  scheduled_out: "2026-11-02T18:00:00Z",
  scheduled_in: "2026-11-03T22:30:00Z",
  fa_flight_id: "fa-1",
};

const evening = {
  ...morning,
  ident: "UAL837E",
  origin_iata: "LAX",
  destination_iata: "HND",
  scheduled_out: "2026-11-02T23:00:00Z",
  scheduled_in: "2026-11-03T16:00:00Z",
  fa_flight_id: "fa-2",
};

test("one flight proposes local times and acceptance leaves the return empty", () => {
  const choice = reviewFromFlights([morning], "2026-11-02", {
    fetchedAt: "2026-11-19T15:00:00+00:00",
  });
  assert.equal(choice.kind, "preview");
  assert.equal(choice.review.departLabel, "2026-11-02 10:00 America/Los_Angeles");
  assert.equal(choice.review.arriveLabel, "2026-11-04 07:30 Asia/Tokyo");
  assert.equal(choice.review.from, "SFO");
  assert.equal(choice.review.to, "NRT");

  const accepted = acceptFlight({
    review: choice.review,
    values: {},
    overrides: [],
    manual: false,
    ident: "UA 837",
    fetchedAt: "2026-11-19T15:00:00+00:00",
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.start, "2026-11-02");
  assert.equal(accepted.end, "");
  assert.equal(accepted.number, "UA837");
  assert.equal(accepted.leg.depart_at, "2026-11-02T10:00");
  assert.equal(accepted.leg.arrive_at, "2026-11-04T07:30");
  assert.equal(accepted.leg.depart_place, "SFO");
  assert.equal(accepted.leg.arrive_place, "NRT");
  assert.equal(accepted.leg.fa_scheduled_out, "2026-11-02T18:00:00Z");
  assert.equal("end_date" in accepted.leg, false);
  assert.equal("counts_as_pto" in accepted.leg, false);
  assert.deepEqual(accepted.proposal, {
    field: "destination_city",
    value: "NRT",
    source: "inferred",
  });
  assert.deepEqual(destinationProposal(accepted.proposal, false), [accepted.proposal]);
  assert.deepEqual(destinationProposal(accepted.proposal, true), []);
});

test("several flights stay unselected until one is chosen", () => {
  const choice = reviewFromFlights([morning, evening], "2026-11-02");
  assert.equal(choice.kind, "choose");
  assert.equal(choice.review, null);
  assert.equal(choice.flights.length, 2);
  const accepted = acceptFlight({
    review: null,
    values: {},
    overrides: [],
    manual: false,
    ident: "UA 837",
  });
  assert.equal(accepted.ok, false);
});

test("a typed local time wins and a typed trip start is kept", () => {
  const choice = reviewFromFlights([morning], "2026-11-02");
  const manual = beginManual({}, morning);
  manual.values.depart_at = "2026-11-02T09:15";
  const accepted = acceptFlight({
    review: choice.review,
    values: manual.values,
    overrides: manual.overrides,
    manual: true,
    ident: "UA837",
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.leg.depart_at, "2026-11-02T09:15");
  assert.equal(accepted.leg.arrive_at, "2026-11-04T07:30");
  assert.equal(accepted.leg.fa_scheduled_out, "2026-11-02T18:00:00Z");
  assert.equal(stageStart("2026-12-01", "", accepted.start), "2026-12-01");
  assert.equal(stageStart("", "", accepted.start), "2026-11-02");
});

test("a late lookup or a changed flight does not replace the current choice", () => {
  const query = { ident: "UA837", depart_on: "2026-11-02" };
  assert.equal(
    lookupApplies({
      epoch: 1,
      currentEpoch: 2,
      sessionActive: true,
      settingsOpen: false,
      query,
      currentQuery: query,
    }),
    false,
  );
  assert.equal(
    lookupApplies({
      epoch: 2,
      currentEpoch: 2,
      sessionActive: true,
      settingsOpen: true,
      query,
      currentQuery: query,
    }),
    false,
  );
  assert.equal(
    lookupApplies({
      epoch: 2,
      currentEpoch: 2,
      sessionActive: false,
      settingsOpen: false,
      query,
      currentQuery: query,
    }),
    false,
  );
  const revised = reviseFlightQuery({
    ident: "UA838",
    departOn: "2026-11-02",
    values: { depart_at: "2026-11-02T09:15", depart_place: "SFO" },
    overrides: ["depart_at"],
    filled: ["depart_place"],
    manual: true,
    review: { from: "SFO" },
  });
  assert.equal(revised.review, null);
  assert.equal(revised.values.depart_at, "2026-11-02T09:15");
  assert.equal(revised.values.depart_place, "");
  const attach = settleAttach({
    epoch: 1,
    currentEpoch: 1,
    sessionActive: true,
    ok: true,
    submittedNumber: "UA837",
    currentNumber: "UA838",
  });
  assert.equal(attach.apply, false);
  assert.equal(attach.keepForm, true);
  assert.deepEqual(clearFlightStart().ident, "");
});

test("existing trips are listed once and a failure keeps the form", () => {
  const trips = existingTrips({
    in_progress: [{ id: 4, title: "Now", start_date: "2026-11-01", end_date: "2026-11-03" }],
    upcoming: [{ id: 4, title: "Now", start_date: "2026-11-01", end_date: "2026-11-03" }],
    past: [{ id: 9, title: "Lisbon week", start_date: "2026-04-06", end_date: "2026-04-10" }],
  });
  assert.deepEqual(
    trips.map((trip) => trip.id),
    [4, 9],
  );
  const failed = settleAttach({
    epoch: 3,
    currentEpoch: 3,
    sessionActive: true,
    ok: false,
    submittedNumber: "UA837",
    currentNumber: "UA837",
  });
  assert.equal(failed.apply, false);
  assert.equal(failed.failed, true);
  assert.equal(failed.keepForm, true);
  const signedOut = settleAttach({
    epoch: 3,
    currentEpoch: 3,
    sessionActive: false,
    ok: true,
    submittedNumber: "UA837",
    currentNumber: "UA837",
  });
  assert.equal(signedOut.apply, false);
  assert.equal(signedOut.failed, false);
});

test("a flight section is dirty until the same flight and date are accepted", () => {
  assert.equal(
    flightSectionDirty({
      ident: "UA 837",
      departOn: "2026-11-02",
      review: { from: "SFO" },
      manualDirty: false,
      stagedNumber: "",
      stagedDate: "",
    }),
    true,
  );
  assert.equal(
    flightSectionDirty({
      ident: "UA 837",
      departOn: "2026-11-02",
      review: { from: "SFO" },
      manualDirty: false,
      stagedNumber: "UA837",
      stagedDate: "2026-11-02",
    }),
    false,
  );
  assert.equal(
    flightSectionDirty({
      ident: "UA 837",
      departOn: "2026-11-03",
      review: null,
      manualDirty: false,
      stagedNumber: "UA837",
      stagedDate: "2026-11-02",
    }),
    true,
  );
});
