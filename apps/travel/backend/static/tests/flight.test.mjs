import assert from "node:assert/strict";
import test from "node:test";
import { clearPrivateDraft, decideCandidates, editManually, fillPreview, flightProblem, invalidateCandidate, localClock, lookupStillCurrent, scheduleChangeNote, scheduleNotice, typeField, useSchedule } from "../../../frontend/src/flight-model.mjs";

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
  assert.match(flightProblem({ code: "provider_auth", status: 502 }).message, /Type the times yourself/);
  assert.match(flightProblem({ code: "schedule_unavailable", status: 422 }).message, /no schedule for that date/);
  assert.match(flightProblem({ code: "provider_unconfigured", status: 503 }).message, /Add a FlightAware AeroAPI key/);
  assert.match(flightProblem({ code: "provider_throttled", status: 429 }).message, /Try again shortly/);
  assert.match(flightProblem({ code: "provider_timeout" }).message, /took too long/);
  assert.equal(
    flightProblem({ status: 504, error: { code: "timeout" } }).kind,
    "timeout",
  );
  assert.match(
    flightProblem({ status: 504, error: { code: "timeout" } }).message,
    /took too long/,
  );
  assert.equal(flightProblem({ code: "provider_entitlement", status: 502 }).kind, "entitlement");
  assert.doesNotMatch(flightProblem({ code: "provider_unconfigured", status: 503 }).message, /temporarily unavailable/);
  const messages = new Set(kinds.map((_, index) => flightProblem([
    { name: "TimeoutError" },
    { code: "schedule_unavailable", status: 422 },
    { code: "provider_unconfigured", status: 503 },
    { code: "provider_auth", status: 502 },
    { code: "provider_throttled", status: 429 },
    { status: 401 },
    { status: 0 },
    { status: 502, code: "provider_unavailable" },
  ][index]).message));
  assert.equal(messages.size, kinds.length);
});

test("a late lookup does not replace the draft, and ordinary failure keeps the typed time", () => {
  const typed = typeField(blank(), [], "depart_at", "2027-05-19T09:15");
  const started = 1;
  let epoch = started;
  epoch += 1;
  assert.equal(lookupStillCurrent(started, epoch), false);
  const kept = lookupStillCurrent(started, epoch)
    ? fillPreview(typed.values, UA, typed.overrides)
    : typed;
  assert.equal(kept.values.depart_at, "2027-05-19T09:15");
  assert.equal(kept.values.depart_place, "");

  const failed = typed;
  assert.equal(failed.values.depart_at, "2027-05-19T09:15");
  assert.match(flightProblem({ code: "provider_timeout" }).message, /Type the times yourself/);

  const schedule = {
    ...UA,
    source: "schedules",
    origin_timezone: "",
    destination_timezone: "",
    fa_flight_id: "",
    scheduled_out: "2027-05-19T18:00:00Z",
    scheduled_in: "2027-05-20T22:30:00Z",
  };
  const filled = fillPreview(blank(), schedule, []);
  const locked = typeField(filled.values, filled.overrides, "depart_at", "2027-05-19T09:15");
  const cleared = invalidateCandidate(locked.values, filled.filled, locked.overrides);
  assert.equal(cleared.depart_at, "2027-05-19T09:15");
  assert.equal(cleared.depart_place, "");
  assert.equal(cleared.fa_flight_id, "");
  assert.equal(cleared.fa_ident, "");

  const refreshed = {
    ...schedule,
    source: "flights",
    fa_flight_id: "UAL837-synthetic",
    scheduled_out: "2027-05-19T19:00:00Z",
    origin_timezone: "America/Los_Angeles",
    destination_timezone: "Asia/Tokyo",
  };
  const again = fillPreview(locked.values, refreshed, locked.overrides);
  assert.equal(again.values.depart_at, "2027-05-19T09:15");
  assert.equal(again.values.fa_flight_id, "UAL837-synthetic");
  assert.equal(again.values.fa_scheduled_out, "2027-05-19T19:00:00Z");
  assert.match(scheduleChangeNote(locked.values, refreshed), /edited time is unchanged/);
  assert.match(scheduleNotice(schedule, "2026-11-19T00:00:00+00:00"), /Published timetable/);
  assert.match(scheduleNotice(schedule, "2026-11-19T00:00:00+00:00"), /Fetched 2026-11-19T00:00:00\+00:00/);
  assert.equal(decideCandidates([schedule, { ...schedule, origin_iata: "LAX" }], "2027-05-19").kind, "choose");
  assert.equal(decideCandidates([schedule], "2027-05-19", { incomplete: true }).kind, "choose");

  const dropped = clearPrivateDraft();
  assert.deepEqual(dropped.values, {});
  assert.deepEqual(dropped.overrides, []);
  assert.equal(dropped.flightDate, "");
});
