import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FLIGHT_LOOKUP_DELAY,
  decideCandidates,
  editManually,
  fillPreview,
  flightProblem,
  invalidateCandidate,
  localClock,
  lookupQuery,
  overridesFromSaved,
  renderFlightState,
  typeField,
  useSchedule,
} from "../modules/actions/flight.mjs";
import { state } from "../modules/state.mjs";
import { connectionFields, legFields } from "../modules/views/new-trip.mjs";
import { renderTrip } from "../modules/views/trip.mjs";

const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");

const UA = {
  ident: "UAL837",
  ident_iata: "UA837",
  operator_iata: "UA",
  operator: "UAL",
  status: "Scheduled",
  origin_iata: "SFO",
  origin_timezone: "America/Los_Angeles",
  destination_iata: "NRT",
  destination_timezone: "Asia/Tokyo",
  scheduled_out: "2026-11-02T18:00:00Z",
  estimated_out: "2026-11-02T18:10:00Z",
  actual_out: "2026-11-02T18:20:00Z",
  scheduled_in: "2026-11-03T22:30:00Z",
  estimated_in: "2026-11-03T22:40:00Z",
  actual_in: null,
  gate_origin: "G4",
  departure_delay_seconds: 600,
};

function blank() {
  return {
    carrier: "",
    depart_place: "",
    arrive_place: "",
    depart_at: "",
    arrive_at: "",
    depart_tz: "",
    arrive_tz: "",
  };
}

test("a flight number and date are one lookup, not a request per keystroke", () => {
  assert.equal(lookupQuery("U", "2026-11-02"), null);
  assert.equal(lookupQuery("UA 837", "2026-11-2"), null);
  assert.deepEqual(lookupQuery(" ua 837 ", "2026-11-02"), { ident: "UA837", depart_on: "2026-11-02" });
  assert.ok(FLIGHT_LOOKUP_DELAY >= 300);
  const source = read("modules/actions/flight.mjs");
  assert.match(source, /setTimeout\(run, FLIGHT_LOOKUP_DELAY\)/);
  assert.equal(source.includes("bestTime"), false);
  assert.equal(read("modules/actions/ui.mjs").includes("lookup-flight"), false);
  assert.equal(read("modules/views/trip.mjs").includes("flight-results"), false);
});

test("a number and date preview scheduled local time, and edit manually keeps the typed time", () => {
  const clock = localClock(UA.scheduled_out, UA.origin_timezone);
  assert.equal(clock.stamp, "2026-11-02T10:00");
  assert.equal(localClock(UA.scheduled_in, UA.destination_timezone).stamp, "2026-11-04T07:30");
  assert.equal(decideCandidates([UA], "2026-11-02").kind, "preview");

  const filled = fillPreview(blank(), UA, []);
  assert.equal(filled.values.depart_at, "2026-11-02T10:00");
  assert.equal(filled.values.arrive_at, "2026-11-04T07:30");
  assert.equal(filled.values.depart_place, "SFO");
  assert.equal(filled.values.arrive_place, "NRT");
  assert.equal(filled.values.depart_tz, "America/Los_Angeles");
  assert.equal(filled.values.fa_scheduled_out, UA.scheduled_out);
  assert.equal(filled.values.fa_actual_out, UA.actual_out);
  assert.notEqual(filled.values.depart_at, "2026-11-02T10:20");

  const typed = typeField(filled.values, filled.overrides, "depart_at", "2026-11-02T09:15");
  const manual = editManually(typed.values);
  assert.equal(manual.values.depart_at, "2026-11-02T09:15");
  assert.equal(manual.values.depart_place, "SFO");
  const again = fillPreview(manual.values, { ...UA, scheduled_out: "2026-11-02T19:00:00Z" }, manual.overrides);
  assert.equal(again.values.depart_at, "2026-11-02T09:15");
  assert.equal(again.values.depart_place, "SFO");
  assert.equal(again.values.fa_scheduled_out, "2026-11-02T19:00:00Z");

  const used = useSchedule(again.values, UA);
  assert.equal(used.values.depart_at, "2026-11-02T10:00");
  assert.deepEqual(used.overrides, []);

  const cleared = invalidateCandidate(typed.values, filled.filled, typed.overrides);
  assert.equal(cleared.depart_at, "2026-11-02T09:15");
  assert.equal(cleared.depart_place, "");
  assert.equal(cleared.fa_ident, "");
});

test("several flights and the wrong local day stay choices, with scheduled time separate from actual", () => {
  const later = {
    ...UA,
    ident: "UAL838",
    ident_iata: "UA838",
    scheduled_out: "2026-11-02T20:00:00Z",
  };
  const choice = decideCandidates([UA, later], "2026-11-02");
  assert.equal(choice.kind, "choose");
  assert.equal(choice.flights.length, 2);

  const nextUtcDay = { ...UA, scheduled_out: "2026-11-03T10:00:00Z", actual_out: null, estimated_out: null };
  const adjacent = decideCandidates([nextUtcDay], "2026-11-02");
  assert.equal(adjacent.kind, "choose");
  assert.match(adjacent.note, /local date/);

  const html = renderFlightState({ kind: "preview", flight: UA, kept: false });
  assert.match(html, /FlightAware schedule/);
  assert.match(html, /Scheduled departure 2026-11-02 10:00/);
  assert.match(html, /America\/Los_Angeles/);
  assert.match(html, /Estimated departure 2026-11-02 10:10/);
  assert.match(html, /Actual departure 2026-11-02 10:20/);
  assert.match(html, /Arrives a later local day/);
  assert.equal(html.includes("Scheduled departure 2026-11-02 10:20"), false);

  const kept = renderFlightState({ kind: "preview", flight: UA, kept: true });
  assert.match(kept, /data-flight-provenance/);
  assert.match(kept, /Edited by you/);

  const buttons = renderFlightState({ kind: "choose", flights: [UA, later], note: adjacent.note });
  assert.match(buttons, /data-action="choose-flight"/);
  assert.match(buttons, /UA · SFO → NRT/);
  assert.match(buttons, /2026-11-02 10:00/);
  assert.match(buttons, /America\/Los_Angeles/);
  assert.equal((buttons.match(/data-action="choose-flight"/g) || []).length, 2);
});

test("canceled, missing, date-line, and ICAO flights stay explicit", () => {
  const canceled = { ...UA, status: "Canceled" };
  assert.match(renderFlightState({ kind: "preview", flight: canceled, kept: false }), /Canceled/);

  const unscheduled = {
    ident: "UAL1",
    ident_iata: "UA1",
    origin_iata: "SFO",
    origin_timezone: "America/Los_Angeles",
    destination_iata: "LAX",
    destination_timezone: "America/Los_Angeles",
    scheduled_out: null,
    actual_out: "2026-11-02T18:20:00Z",
    scheduled_in: null,
    actual_in: null,
  };
  const preview = renderFlightState({ kind: "preview", flight: unscheduled, kept: false });
  assert.match(preview, /Scheduled departure unavailable/);
  assert.match(preview, /Actual departure 2026-11-02 10:20/);
  assert.equal(fillPreview(blank(), unscheduled, []).values.depart_at, "");

  const dateline = {
    ident: "NH1",
    scheduled_out: "2026-11-02T15:00:00Z",
    scheduled_in: "2026-11-02T20:00:00Z",
    origin_iata: "HND",
    origin_timezone: "Asia/Tokyo",
    destination_iata: "HNL",
    destination_timezone: "Pacific/Honolulu",
  };
  assert.equal(localClock(dateline.scheduled_out, dateline.origin_timezone).stamp, "2026-11-03T00:00");
  assert.equal(localClock(dateline.scheduled_in, dateline.destination_timezone).stamp, "2026-11-02T10:00");
  assert.match(renderFlightState({ kind: "preview", flight: dateline, kept: false }), /earlier local date/);

  const icao = {
    ident: "UAL9",
    origin_icao: "KSFO",
    origin_timezone: "America/Los_Angeles",
    destination_icao: "RJAA",
    destination_timezone: "Asia/Tokyo",
    scheduled_out: "2026-11-02T18:00:00Z",
    scheduled_in: "2026-11-03T22:30:00Z",
  };
  assert.equal(fillPreview(blank(), icao, []).values.depart_place, "KSFO");
  assert.equal(fillPreview(blank(), icao, []).values.arrive_place, "RJAA");

  const first = localClock("2026-11-01T05:30:00Z", "America/New_York");
  const second = localClock("2026-11-01T06:30:00Z", "America/New_York");
  assert.equal(first.stamp, "2026-11-01T01:30");
  assert.equal(second.stamp, "2026-11-01T01:30");
  assert.notEqual(first.offset, second.offset);
  assert.equal(localClock("2026-11-02T18:00:00Z", "Not/AZone").zone, "UTC");
});

test("provider failures stay distinct from signing out", () => {
  const kinds = [
    flightProblem({ name: "TimeoutError" }).kind,
    flightProblem({ code: "schedule_unavailable", status: 422 }).kind,
    flightProblem({ code: "provider_unconfigured", status: 503 }).kind,
    flightProblem({ code: "provider_auth", status: 502 }).kind,
    flightProblem({ code: "provider_throttled", status: 429 }).kind,
    flightProblem({ status: 401 }).kind,
    flightProblem({ status: 0 }).kind,
    flightProblem({ status: 502, code: "provider_unavailable" }).kind,
  ];
  assert.deepEqual(kinds, [
    "timeout",
    "future",
    "missing_key",
    "bad_key",
    "throttled",
    "signed_out",
    "network",
    "unavailable",
  ]);
  assert.match(flightProblem({ code: "provider_auth", status: 502 }).message, /type the flight yourself/);
  assert.doesNotMatch(flightProblem({ code: "provider_unconfigured", status: 503 }).message, /temporarily unavailable/);
});

test("creation and editing share one flight schedule control", () => {
  const outbound = legFields("outbound", "2026-10-24");
  const inbound = legFields("inbound", "2026-10-30");
  const connection = connectionFields("2026-10-24");
  for (const html of [outbound, inbound, connection]) {
    assert.match(html, /data-action="refresh-flight"/);
    assert.match(html, /data-action="use-flight-schedule"/);
    assert.match(html, /data-action="edit-flight-manually"/);
    assert.match(html, /name="lookup_on"/);
    assert.equal(html.includes("lookup-flight"), false);
  }
  assert.match(outbound, /value="2026-10-24"/);
  assert.match(inbound, /value="2026-10-30"/);
  assert.match(connection, /data-flight-only hidden/);
  assert.match(outbound, /data-flight-only>/);

  const previous = { edit: state.edit, compose: state.compose };
  state.edit = { kind: "transport", id: 9 };
  state.compose = "";
  try {
    const html = renderTrip({
      id: 1,
      title: "Kyoto",
      status: "planning",
      start_date: "2026-10-24",
      end_date: "2026-10-26",
      origin_label: "SFO",
      counts_as_pto: false,
      pto: { days: "0", leftover_after: "0" },
      span_days: 3,
      nights: 2,
      budget: { currencies: [], lines: [], manual: [] },
      cities: ["Kyoto"],
      stays: [],
      transports: [{
        id: 9,
        role: "outbound",
        mode: "flight",
        number: "UA 837",
        carrier: "UA",
        depart_place: "SFO",
        arrive_place: "NRT",
        depart_at: "2026-11-02T09:15:00",
        arrive_at: "2026-11-04T07:30:00",
        depart_tz: "America/Los_Angeles",
        arrive_tz: "Asia/Tokyo",
        fa_ident: "UAL837",
        fa_scheduled_out: "2026-11-02T18:00:00Z",
        fa_scheduled_in: "2026-11-03T22:30:00Z",
        paid: false,
        status: "planned",
      }],
      days: [],
      outside_plans: [],
      parking: [],
      note_entries: [],
      reminders: [],
    }, "");
    assert.match(html, /data-action="edit-flight-manually"/);
    assert.match(html, /data-action="use-flight-schedule"/);
    assert.match(html, /name="flight_overrides" value="[^"]*depart_at/);
    assert.match(html, /Edited by you/);
    assert.equal(html.includes("lookup-flight"), false);
    assert.deepEqual(overridesFromSaved({
      fa_ident: "UAL837",
      fa_scheduled_out: "2026-11-02T18:00:00Z",
      depart_tz: "America/Los_Angeles",
      depart_at: "2026-11-02T10:00:00",
    }), []);
  } finally {
    state.edit = previous.edit;
    state.compose = previous.compose;
  }
});
