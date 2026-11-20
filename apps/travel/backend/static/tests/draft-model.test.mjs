import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPrivateTripDraft,
  draftRequest,
  draftSavedNotice,
  settleDraftResponse,
} from "../../../frontend/src/draft-model.mjs";

const outbound = {
  role: "outbound",
  mode: "flight",
  depart_place: "SFO",
  arrive_place: "NRT",
  depart_at: "2026-06-01T09:00",
  arrive_at: "2026-06-02T14:30",
  label: "UA 837",
};

test("an outbound leg does not invent a return, a city, or a PTO fact", () => {
  const built = draftRequest({
    start: "2026-06-01",
    end: "",
    transports: [outbound],
    proposals: [
      { field: "end_date", value: "2026-06-09", source: "inferred" },
      { field: "destination_city", value: "Tokyo", source: "inferred" },
      { field: "counts_as_pto", value: "true", source: "inferred" },
      { field: "end_date", value: "2026-06-10", source: "confirmed" },
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.body.title, "Draft");
  assert.equal(built.body.start_date, "2026-06-01");
  assert.equal(built.body.end_date, null);
  assert.equal(built.body.destination_label, null);
  assert.equal(built.body.legs[0].arrive_at, "2026-06-02T14:30");
  assert.equal(built.body.legs[0].arrive_place, "NRT");
  assert.equal("label" in built.body.legs[0], false);
  assert.deepEqual(
    built.body.proposals.map((item) => item.field),
    ["end_date", "destination_city", "counts_as_pto"],
  );
  assert.equal(built.body.proposals.every((item) => item.source === "inferred"), true);
  for (const key of ["counts_as_pto", "stays", "pto_dates"]) {
    assert.equal(Object.hasOwn(built.body, key), false);
  }
});

test("a typed return and city stay confirmed and still omit PTO", () => {
  const built = draftRequest({
    title: "June hop",
    start: "2026-06-01",
    end: "2026-06-04",
    destination: "Tokyo",
    transports: [outbound],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.body.title, "June hop");
  assert.equal(built.body.end_date, "2026-06-04");
  assert.equal(built.body.destination_label, "Tokyo");
  assert.deepEqual(built.body.proposals, []);
  assert.equal(Object.hasOwn(built.body, "counts_as_pto"), false);
});

test("a draft needs a departure and an outbound leg, and a reversed return fails", () => {
  assert.equal(draftRequest({ transports: [outbound] }).ok, false);
  assert.equal(draftRequest({ start: "2026-06-01", transports: [] }).field, "transport");
  assert.equal(
    draftRequest({
      start: "2026-06-01",
      transports: [{ role: "inbound", mode: "flight" }],
    }).field,
    "transport",
  );
  const reversed = draftRequest({
    start: "2026-06-04",
    end: "2026-06-01",
    transports: [outbound],
  });
  assert.equal(reversed.ok, false);
  assert.match(reversed.helper, /return date/);
});

test("invalidation drops the response and a failure keeps the current input", () => {
  const submitted = { start: "2026-06-01", end: "" };
  const current = { start: "2026-06-03", end: "" };
  const late = settleDraftResponse({
    epoch: 1,
    currentEpoch: 2,
    sessionActive: true,
    ok: true,
    submitted,
    current,
  });
  assert.equal(late.apply, false);
  assert.equal(late.keepForm, true);
  assert.equal(late.notice, "");

  const signedOut = settleDraftResponse({
    epoch: 1,
    currentEpoch: 1,
    sessionActive: false,
    ok: true,
    submitted,
    current: submitted,
  });
  assert.equal(signedOut.apply, false);

  const failed = settleDraftResponse({
    epoch: 1,
    currentEpoch: 1,
    sessionActive: true,
    ok: false,
    submitted,
    current,
  });
  assert.equal(failed.apply, false);
  assert.equal(failed.failed, true);
  assert.equal(failed.keepForm, true);

  const saved = settleDraftResponse({
    epoch: 4,
    currentEpoch: 4,
    sessionActive: true,
    ok: true,
    submitted,
    current,
  });
  assert.equal(saved.apply, true);
  assert.equal(saved.keepForm, true);
  assert.equal(saved.notice, draftSavedNotice("", true));
  assert.match(saved.notice, /newer edits still need saving/);
  assert.match(draftSavedNotice("", false), /unknown/);
  assert.match(draftSavedNotice("2026-06-04", false), /This return date is saved/);
});

test("clearing a private draft removes the recoverable fields", () => {
  const cleared = clearPrivateTripDraft();
  assert.equal(cleared.start, "");
  assert.equal(cleared.end, "");
  assert.deepEqual(cleared.transports, []);
  assert.deepEqual(cleared.charges, {});
  assert.deepEqual(cleared.cities, {});
  assert.equal(cleared.tripName, "");
  assert.equal(cleared.draftId, null);
  assert.equal(cleared.revision, null);
  assert.equal(cleared.notice, "");
  assert.equal(cleared.error, "");
});
