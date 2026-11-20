import assert from "node:assert/strict";
import test from "node:test";

import {
  UNREADABLE_CALENDAR,
  calendarSectionDirty,
  canSaveBooking,
  clearCalendarImport,
  draftFromBooking,
  existingNotice,
  legFromBooking,
  normalizePreview,
  previewApplies,
  savedBookingNotice,
  settleImport,
} from "../../../frontend/src/calendar-booking.mjs";

const booking = {
  uid: "synthetic-ua837-20261102",
  number: "UA837",
  origin: "SFO",
  destination: "NRT",
  depart_at: "2026-11-02T10:00:00",
  arrive_at: "2026-11-04T07:30:00",
  depart_tz: "America/Los_Angeles",
  arrive_tz: "Asia/Tokyo",
  depart_label: "2026-11-02 10:00 America/Los_Angeles",
  arrive_label: "2026-11-04 07:30 Asia/Tokyo",
};

test("a confirmed booking keeps the arrival off the return and off PTO", () => {
  const built = draftFromBooking(booking);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.body.start_date, "2026-11-02");
  assert.equal(built.body.end_date, null);
  assert.equal(built.body.destination_label, null);
  assert.equal("counts_as_pto" in built.body, false);
  assert.equal("pto_dates" in built.body, false);
  assert.equal("stays" in built.body, false);
  assert.deepEqual(built.body.proposals, []);
  assert.equal(built.body.legs[0].confirmation, booking.uid);
  assert.equal(built.body.legs[0].depart_tz, "America/Los_Angeles");
  assert.equal(built.body.legs[0].arrive_at, "2026-11-04T07:30:00");
  assert.equal(savedBookingNotice(), "Draft saved. The return date is still unknown, and this draft has no PTO charge.");
  const leg = legFromBooking(booking);
  assert.equal("end_date" in leg, false);
  assert.equal(leg.number, "UA837");
});

test("an existing leg is the choice and a bad preview cannot save", () => {
  const existing = { kind: "draft", id: 4, title: "Flight UA837", leg_id: 9 };
  assert.match(existingNotice(existing), /already the outbound leg on Flight UA837/);
  assert.match(existingNotice({ kind: "trip", title: "Lisbon week" }), /already a leg on Lisbon week/);
  const preview = { ok: true, code: "preview", reason: "", booking, existing };
  assert.equal(canSaveBooking(preview), false);
  assert.equal(canSaveBooking({ ok: false, code: "malformed", reason: "No", booking: null, existing: null }), false);
  assert.equal(normalizePreview(null).reason, UNREADABLE_CALENDAR);
  assert.equal(normalizePreview({ ok: false, reason: "The departure time has no single time zone. Nothing was saved." }).booking, null);
});

test("a late response and a failed save leave the current calendar text alone", () => {
  assert.equal(previewApplies({
    epoch: 1,
    currentEpoch: 2,
    sessionActive: true,
    submittedText: "old",
    currentText: "new",
  }), false);
  assert.equal(previewApplies({
    epoch: 2,
    currentEpoch: 2,
    sessionActive: false,
    submittedText: "new",
    currentText: "new",
  }), false);
  const stale = settleImport({
    epoch: 1,
    currentEpoch: 2,
    sessionActive: true,
    ok: true,
    submittedUid: "synthetic-ua837-20261102",
    currentUid: "synthetic-ua838-20261102",
  });
  assert.deepEqual(stale, { apply: false, keepInput: true, failed: false });
  const failed = settleImport({
    epoch: 3,
    currentEpoch: 3,
    sessionActive: true,
    ok: false,
    submittedUid: booking.uid,
    currentUid: booking.uid,
  });
  assert.deepEqual(failed, { apply: false, keepInput: true, failed: true });
  assert.equal(calendarSectionDirty({ text: "BEGIN:VCALENDAR", settledText: "" }), true);
  assert.equal(calendarSectionDirty({ text: "BEGIN:VCALENDAR", settledText: "BEGIN:VCALENDAR" }), false);
  const cleared = clearCalendarImport();
  assert.equal(cleared.text, "");
  assert.equal(cleared.fileName, "");
  assert.equal(calendarSectionDirty(cleared), false);
});
