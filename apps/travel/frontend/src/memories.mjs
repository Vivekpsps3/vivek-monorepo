/** Session guards for the trip-memory read. The dates themselves come from the server. */

export function browserZone(zone) {
  const name = String(zone ?? "").trim();
  return name || "UTC";
}

/** A list response may publish only for the load that is still current. */
export function acceptMemoryLoad({ epoch, currentEpoch, sessionActive }) {
  return sessionActive === true && epoch === currentEpoch;
}

/**
 * What to do with a write that has already reached the server.
 * drop: the form moved on, or the session/epoch is gone.
 * reload: another trip's draft is open; refresh the list and leave that draft.
 * apply: this draft still matches the request, so close it and reread.
 */
export function settleMemoryWrite({
  epoch,
  currentEpoch,
  sessionActive,
  tripId,
  editingTripId,
  start,
  end,
  sentStart,
  sentEnd,
}) {
  if (sessionActive !== true || epoch !== currentEpoch) return "drop";
  if (editingTripId == null) return "apply";
  if (Number(editingTripId) !== Number(tripId)) return "reload";
  if (String(start) !== String(sentStart) || String(end) !== String(sentEnd)) return "drop";
  return "apply";
}

/** Private redate fields cleared when the session or owner is no longer current. */
export function clearMemoryDraft() {
  return { tripId: null, start: "", end: "", note: "" };
}
