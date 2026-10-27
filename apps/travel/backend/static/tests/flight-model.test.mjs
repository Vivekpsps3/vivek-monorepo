import assert from "node:assert/strict";
import test from "node:test";

import { arrivalNote, departureDay, fillPreview, flightProblem, localClock } from "../../../frontend/src/flight-model.mjs";

test("Angular HTTP errors keep the provider code on the response body", () => {
  const missing = flightProblem({
    name: "HttpErrorResponse",
    status: 503,
    error: { code: "provider_unconfigured", message: "Add a key" },
  });
  assert.equal(missing.kind, "missing_key");
  assert.match(missing.message, /Settings/);
  assert.equal(flightProblem({ name: "TimeoutError" }).kind, "timeout");
});

test("a date-line arrival and a repeated local hour stay distinct", () => {
  const dateline = {
    ident: "NH1",
    origin_iata: "HND",
    origin_timezone: "Asia/Tokyo",
    destination_iata: "HNL",
    destination_timezone: "Pacific/Honolulu",
    scheduled_out: "2026-11-02T15:00:00Z",
    scheduled_in: "2026-11-02T20:00:00Z",
  };
  assert.equal(localClock(dateline.scheduled_out, dateline.origin_timezone).stamp, "2026-11-03T00:00");
  assert.equal(localClock(dateline.scheduled_in, dateline.destination_timezone).stamp, "2026-11-02T10:00");
  assert.equal(departureDay(dateline), "2026-11-03");
  assert.equal(arrivalNote(dateline), "Arrives on an earlier local date");
  const filled = fillPreview({}, dateline, []);
  assert.equal(filled.values.depart_at, "2026-11-03T00:00");
  assert.equal(filled.values.arrive_at, "2026-11-02T10:00");
  assert.equal(filled.values.depart_place, "HND");
  assert.equal(filled.values.arrive_place, "HNL");

  const first = localClock("2026-11-01T05:30:00Z", "America/New_York");
  const second = localClock("2026-11-01T06:30:00Z", "America/New_York");
  assert.equal(first.stamp, "2026-11-01T01:30");
  assert.equal(second.stamp, "2026-11-01T01:30");
  assert.notEqual(first.offset, second.offset);
  assert.equal(localClock("2026-11-02T18:00:00Z", "Not/AZone").zone, "UTC");
});
