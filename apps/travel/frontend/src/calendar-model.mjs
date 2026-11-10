/** One chronological projection for the trip day strip and itinerary rows. */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const RANK = { parking: 0, departure: 1, activity: 2, arrival: 3, transport: 4 };

function parseIso(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function parseInstant(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(value || ""));
  if (!match || !parseIso(match[1])) return null;
  return { date: match[1], time: match[2] };
}

function addDays(iso, count) {
  const date = parseIso(iso);
  if (!date) return "";
  date.setDate(date.getDate() + count);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function eachDate(start, end) {
  if (!parseIso(start) || !parseIso(end) || start > end) return [];
  const days = [];
  let cursor = start;
  while (cursor <= end && days.length < 3660) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

function dayKicker(iso, start, end) {
  if (iso === start) return "Leave day";
  if (iso === end) return "Return day";
  return "";
}

function dayLabel(iso) {
  const date = parseIso(iso);
  if (!date) return String(iso || "");
  return `${SHORT[date.getDay()]}, ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
}

function dayName(iso, start, end, busy) {
  const date = parseIso(iso);
  if (!date) return String(iso || "");
  const bits = [
    dayLabel(iso),
    `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`,
  ];
  const kicker = dayKicker(iso, start, end);
  if (kicker) bits.push(kicker);
  bits.push(busy ? "busy" : "free");
  return bits.join(", ");
}

function collectPlans(trip) {
  if (Array.isArray(trip.days) || Array.isArray(trip.outside_plans)) {
    return [
      ...(trip.days || []).flatMap((day) => day.items || []),
      ...(trip.outside_plans || []),
    ];
  }
  return trip.plans || [];
}

function clockTime(value) {
  return /^\d{2}:\d{2}/.test(String(value || "")) ? String(value).slice(0, 5) : null;
}

function byTime(left, right) {
  return (
    String(left.time).localeCompare(String(right.time)) ||
    left.rank - right.rank ||
    left.sortOrder - right.sortOrder ||
    left.id - right.id ||
    left.key.localeCompare(right.key)
  );
}

function byLoose(left, right) {
  return (
    String(left.date || "").localeCompare(String(right.date || "")) ||
    String(left.time || "").localeCompare(String(right.time || "")) ||
    left.rank - right.rank ||
    left.sortOrder - right.sortOrder ||
    left.id - right.id ||
    left.key.localeCompare(right.key)
  );
}

/**
 * @param {object} trip
 * Trip days come from start/end. Plans, transports, and parking are placed once.
 * Missing times stay in an unscheduled group. Dates outside the trip stay out of range.
 * A later arrival date, including a red-eye, is its own row on that date.
 */
export function projectItinerary(trip) {
  const start = String(trip.start_date || "");
  const end = String(trip.end_date || "");
  const dates = eachDate(start, end);
  const timed = new Map(dates.map((date) => [date, []]));
  const unscheduledByDay = new Map(dates.map((date) => [date, []]));
  const unscheduled = [];
  const outOfRange = [];
  const seen = new Set();

  function place(entry) {
    if (seen.has(entry.key)) return;
    seen.add(entry.key);
    if (!entry.date) {
      unscheduled.push(entry);
      return;
    }
    if (!dates.length || entry.date < start || entry.date > end) {
      outOfRange.push(entry);
      return;
    }
    if (!entry.time) unscheduledByDay.get(entry.date).push(entry);
    else timed.get(entry.date).push(entry);
  }

  for (const plan of collectPlans(trip)) {
    const date = plan.on_date || null;
    place({
      key: `plan:${plan.id}`,
      source: "plan",
      part: "activity",
      id: Number(plan.id),
      date,
      time: date ? clockTime(plan.start_time) : null,
      rank: RANK.activity,
      sortOrder: Number(plan.sort_order) || 0,
      title: plan.title || "Activity",
      primary: true,
    });
  }

  for (const transport of trip.transports || []) {
    const depart = parseInstant(transport.depart_at);
    const arrive = parseInstant(transport.arrive_at);
    const base = {
      source: "transport",
      id: Number(transport.id),
      sortOrder: Number(transport.sort_order) || 0,
      title: transport.label || "Transport",
    };
    if (!depart && !arrive) {
      place({
        ...base,
        key: `transport:${transport.id}`,
        part: "transport",
        date: null,
        time: null,
        rank: RANK.transport,
        primary: true,
      });
      continue;
    }
    if (depart) {
      place({
        ...base,
        key: `transport:${transport.id}:depart`,
        part: "departure",
        date: depart.date,
        time: depart.time,
        rank: RANK.departure,
        primary: true,
      });
    }
    if (arrive && (!depart || arrive.date !== depart.date || arrive.time !== depart.time)) {
      place({
        ...base,
        key: `transport:${transport.id}:arrive`,
        part: "arrival",
        date: arrive.date,
        time: arrive.time,
        rank: RANK.arrival,
        primary: !depart,
      });
    }
  }

  const transports = trip.transports || [];
  for (const parking of trip.parking || []) {
    const own = parseInstant(parking.start_at);
    const linked = parking.transport_id == null
      ? null
      : transports.find((item) => item.id === parking.transport_id) || null;
    const base = {
      key: `parking:${parking.id}`,
      source: "parking",
      part: "parking",
      id: Number(parking.id),
      rank: RANK.parking,
      sortOrder: 0,
      title: parking.place_name || parking.arrangement || "Parking",
      primary: true,
    };
    if (own) {
      place({ ...base, date: own.date, time: own.time });
      continue;
    }
    const anchor = linked ? parseInstant(linked.depart_at) || parseInstant(linked.arrive_at) : null;
    if (anchor) {
      place({ ...base, date: anchor.date, time: anchor.time });
      continue;
    }
    place({ ...base, date: null, time: null });
  }

  for (const list of timed.values()) list.sort(byTime);
  for (const list of unscheduledByDay.values()) list.sort(byLoose);
  unscheduled.sort(byLoose);
  outOfRange.sort(byLoose);

  return {
    days: dates.map((onDate) => {
      const entries = timed.get(onDate);
      const dayUnscheduled = unscheduledByDay.get(onDate);
      const busy = entries.length + dayUnscheduled.length > 0;
      return {
        onDate,
        label: dayLabel(onDate),
        kicker: dayKicker(onDate, start, end),
        busy,
        accessibleName: dayName(onDate, start, end, busy),
        entries,
        unscheduled: dayUnscheduled,
      };
    }),
    unscheduled,
    outOfRange,
  };
}
