/** A calendar preview is not a saved trip until the user confirms it. */

import { draftSavedNotice } from "./draft-model.mjs";

export const UNREADABLE_CALENDAR =
  "This file is not a readable calendar booking. Nothing was saved.";

export function clearCalendarImport() {
  return { fileName: "", text: "", settledText: "", notice: "", error: "" };
}

export function calendarSectionDirty({ text, settledText }) {
  return String(text || "") !== "" && String(text || "") !== String(settledText || "");
}

export function previewApplies({ epoch, currentEpoch, sessionActive, submittedText, currentText }) {
  return Boolean(sessionActive) && epoch === currentEpoch && submittedText === currentText;
}

/**
 * A late or losing response does not replace the booking on screen.
 * Invalidation drops it. A failure leaves the current file text in place.
 */
export function settleImport({ epoch, currentEpoch, sessionActive, ok, submittedUid, currentUid }) {
  if (!sessionActive || epoch !== currentEpoch || submittedUid !== currentUid) {
    return { apply: false, keepInput: true, failed: false };
  }
  if (!ok) return { apply: false, keepInput: true, failed: true };
  return { apply: true, keepInput: true, failed: false };
}

export function normalizePreview(body) {
  if (!body || typeof body !== "object" || typeof body.ok !== "boolean" || typeof body.reason !== "string") {
    return {
      ok: false,
      code: "malformed",
      reason: UNREADABLE_CALENDAR,
      booking: null,
      existing: null,
    };
  }
  const booking = body.booking && typeof body.booking === "object" ? body.booking : null;
  const existing = body.existing && typeof body.existing === "object" ? body.existing : null;
  return {
    ok: body.ok === true && Boolean(booking),
    code: typeof body.code === "string" ? body.code : "",
    reason: body.reason,
    booking: body.ok === true ? booking : null,
    existing: body.ok === true ? existing : null,
  };
}

export function canSaveBooking(preview) {
  const booking = preview?.booking;
  if (!preview || preview.ok !== true || preview.existing || !booking) return false;
  return Boolean(booking.uid && booking.number && booking.depart_at && booking.origin && booking.destination);
}

export function existingNotice(existing) {
  const title = String(existing?.title || "").trim();
  if (existing?.kind === "trip") {
    return `This booking is already a leg on ${title || "your trip"}. Use that leg instead of adding another.`;
  }
  return `This booking is already the outbound leg on ${title || "your draft"}. Use that leg instead of adding another.`;
}

export function legFromBooking(booking) {
  return {
    role: "outbound",
    mode: "flight",
    number: booking.number,
    depart_place: booking.origin,
    arrive_place: booking.destination,
    depart_at: booking.depart_at,
    arrive_at: booking.arrive_at,
    depart_tz: booking.depart_tz,
    arrive_tz: booking.arrive_tz,
    confirmation: booking.uid,
    currency: "USD",
    paid: false,
    status: "planned",
  };
}

/**
 * The arrival day stays on the leg. It is not a return date and not a PTO charge.
 */
export function draftFromBooking(booking) {
  const start = String(booking?.depart_at || "").slice(0, 10);
  if (!booking?.uid || !booking.number || !start || !booking.origin || !booking.destination) {
    return { ok: false, helper: "Choose a flight booking before saving." };
  }
  return {
    ok: true,
    helper: "",
    body: {
      title: `Flight ${booking.number}`,
      start_date: start,
      end_date: null,
      destination_label: null,
      origin_label: null,
      notes: null,
      legs: [legFromBooking(booking)],
      proposals: [],
    },
  };
}

export function savedBookingNotice() {
  return draftSavedNotice("", false);
}
