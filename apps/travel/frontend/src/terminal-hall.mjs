/** Terminal hall projection. Trips stay on the home payload; this file does not store them. */

const OBJECTS = new Set(["board", "desk", "table"]);

function text(value) {
  return value == null ? "" : String(value).trim();
}

export function hallDate(value) {
  const day = text(value);
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const parsed = new Date(day + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : "";
}

function positiveId(value) {
  return /^[1-9]\d{0,15}$/.test(text(value));
}

function roleLabel(role) {
  if (role === "outbound") return "Departure";
  if (role === "inbound" || role === "return") return "Return";
  if (role === "local") return "Local";
  return "Transport";
}

/** Saved trips in home order, once each. Drafts are not in this payload. */
export function hallTrips(home) {
  const seen = new Set();
  const rows = [];
  for (const group of [home?.in_progress, home?.upcoming, home?.past]) {
    for (const trip of group || []) {
      const id = Number(trip?.id);
      if (!trip || !positiveId(id) || seen.has(id)) continue;
      seen.add(id);
      rows.push(trip);
    }
  }
  return rows;
}

export function hallIsEmpty(home) {
  return hallTrips(home).length === 0;
}

/**
 * One row per saved leg. A missing return is not invented, and a departure
 * time is not turned into a trip end.
 */
export function departureRows(home) {
  const rows = [];
  for (const trip of hallTrips(home)) {
    for (const leg of trip.transports || []) {
      const transportId = Number(leg?.id);
      if (!positiveId(transportId)) continue;
      const departAt = text(leg.depart_at);
      const day = hallDate(departAt.slice(0, 10)) || hallDate(trip.start_date);
      const role = text(leg.role);
      rows.push({
        tripId: Number(trip.id),
        transportId,
        title: text(trip.title) || "Trip",
        role,
        roleLabel: roleLabel(role),
        mode: text(leg.mode),
        number: text(leg.number),
        from: text(leg.depart_place),
        to: text(leg.arrive_place),
        departAt,
        arriveAt: text(leg.arrive_at),
        day,
      });
    }
  }
  return rows;
}

/** Local days the trip already has. The span is not filled in here. */
export function itineraryRows(home) {
  const rows = [];
  for (const trip of hallTrips(home)) {
    for (const day of trip.days || []) {
      const onDate = hallDate(day?.on_date);
      if (!onDate) continue;
      rows.push({
        tripId: Number(trip.id),
        title: text(trip.title) || "Trip",
        day: onDate,
        city: text(day.city),
      });
    }
  }
  return rows;
}

export function legActionLabel(row) {
  const lead = row.number ? `Open ${row.roleLabel.toLowerCase()} ${row.number}` : `Open ${row.roleLabel.toLowerCase()}`;
  const route = [row.from, row.to].filter(Boolean).join(" to ");
  return [lead, route, row.day, row.title].filter(Boolean).join(", ");
}

export function dayActionLabel(row) {
  return [`Open day ${row.day}`, row.title, row.city].filter(Boolean).join(", ");
}

export function readHallQuery(params) {
  const object = text(params?.get?.("object"));
  const trip = text(params?.get?.("trip"));
  const leg = text(params?.get?.("leg"));
  const day = text(params?.get?.("day"));
  return {
    object: OBJECTS.has(object) ? object : "",
    trip: positiveId(trip) ? Number(trip) : null,
    leg: positiveId(leg) ? Number(leg) : null,
    day: hallDate(day),
  };
}

/** Query string returnPath will keep, in the same key order. */
export function hallReturnPath(input) {
  const params = new URLSearchParams();
  const object = OBJECTS.has(input?.object) ? input.object : "";
  if (object) params.set("object", object);
  if (positiveId(input?.trip)) params.set("trip", String(Number(input.trip)));
  if (object === "board" && positiveId(input?.leg)) params.set("leg", String(Number(input.leg)));
  const day = hallDate(input?.day);
  if (day) params.set("day", day);
  const query = params.toString();
  return query ? `/travel/terminal?${query}` : "/travel/terminal";
}

export function matchingLeg(rows, query) {
  if (query?.object !== "board" || query.leg == null) return null;
  return (
    rows.find(
      (row) => row.transportId === query.leg && (query.trip == null || row.tripId === query.trip),
    ) || null
  );
}

export function matchingDay(rows, query) {
  if (query?.object !== "table" || !query.day || query.trip == null) return null;
  return rows.find((row) => row.tripId === query.trip && row.day === query.day) || null;
}

/** Open the saved leg. This never allocates a new trip id. */
export function legTarget(row) {
  if (!row || !positiveId(row.tripId) || !positiveId(row.transportId)) return null;
  return {
    tripId: row.tripId,
    transportId: row.transportId,
    day: row.day || "",
    createsTrip: false,
  };
}

export function acceptHallLoad({ epoch, currentEpoch, sessionActive }) {
  return sessionActive === true && epoch === currentEpoch;
}

export function clearHallDesk() {
  return { ident: "", departOn: "", actionError: "", home: null };
}
