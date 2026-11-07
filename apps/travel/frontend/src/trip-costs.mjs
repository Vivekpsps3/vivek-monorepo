/** Pure helpers for the trip cost view (T2). Also used by T4 and T5. */

const BUCKET_ORDER = ["transport", "stays_plans", "parking", "other"];

export const BUCKET_SHORT = {
  transport: "Transport",
  stays_plans: "Stays and plans",
  parking: "Parking",
  other: "Other costs",
};

/** Mirrors T1's server bucket mapping (services/budget.py). Unknown → other. */
const BUCKET_FOR_CATEGORY = {
  outbound_flight: "transport",
  inbound_flight: "transport",
  connection_flight: "transport",
  drive: "transport",
  transport: "transport",
  lodging: "stays_plans",
  food: "stays_plans",
  activity: "stays_plans",
  parking: "parking",
  other: "other",
};

export function bucketForCategory(category) {
  return BUCKET_FOR_CATEGORY[category] || "other";
}

/** "120.50" → 12050; "120.5" → 12050; "0" → 0; null, "" or non-numeric → null. Integer maths only. */
export function toCents(text) {
  if (text == null) return null;
  const raw = String(text).trim();
  if (!raw) return null;
  const match = /^(-?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/.exec(raw);
  if (!match) return null;
  const whole = match[2] || "0";
  const fraction = match[3] ?? match[4] ?? "";
  const cents =
    Number.parseInt(whole, 10) * 100 +
    Number.parseInt((fraction + "00").slice(0, 2), 10);
  if (!Number.isSafeInteger(cents)) return null;
  return match[1] === "-" && cents !== 0 ? -cents : cents;
}

/** Percent widths for the paid/unpaid split bar, one decimal, summing to exactly 100. */
export function splitWidths(paid, total) {
  if (total == null || !(total > 0)) return null;
  if (!(paid > 0)) return { paid: 0, unpaid: 100 };
  if (paid >= total) return { paid: 100, unpaid: 0 };
  const raw = (paid / total) * 100;
  let paidPct;
  if (raw < 2) paidPct = 2;
  else if (100 - raw < 2) paidPct = 98;
  else {
    paidPct = Math.round(raw * 10) / 10;
    if (paidPct > 0 && paidPct < 2) paidPct = 2;
    else if (100 - paidPct > 0 && 100 - paidPct < 2) paidPct = 98;
  }
  return { paid: paidPct, unpaid: Math.round((100 - paidPct) * 10) / 10 };
}

/** Buckets in T1 order. Drops entries whose bucket key is unknown. Never invents zero rows. */
export function bucketRows(currencyItem) {
  const buckets = currencyItem?.buckets;
  if (!Array.isArray(buckets)) return [];
  return buckets
    .filter((row) => row && BUCKET_ORDER.includes(row.bucket))
    .slice()
    .sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket));
}

function spendRowsFor(lookup, tripId) {
  let raw = lookup;
  if (typeof raw === "function") raw = raw(tripId);
  if (raw == null) return null;
  if (raw instanceof Map) raw = raw.get(tripId) ?? raw.get(String(tripId));
  else if (!Array.isArray(raw) && typeof raw === "object") {
    raw = raw[tripId] ?? raw[String(tripId)] ?? raw.rows;
  }
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [];
}

/**
 * lookup null → locked (Finance vault locked / registry unavailable).
 * Otherwise lookup is the registry's spend rows (all trips or just this one):
 * entries shaped { trip_id?, currency, cents, count? }.
 */
export function spendState(lookup, tripId) {
  if (lookup == null) return { kind: "locked" };
  const entries = spendRowsFor(lookup, tripId);
  if (entries == null) return { kind: "locked" };
  const byCurrency = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const entryTrip = entry.trip_id ?? entry.tripId;
    if (entryTrip != null && Number(entryTrip) !== Number(tripId)) continue;
    const currency = String(entry.currency || "").trim();
    if (!currency) continue;
    const cents = Number(entry.cents ?? entry.total_cents ?? entry.amount_cents ?? 0) || 0;
    const count = Number(entry.count ?? 1) || 0;
    const existing = byCurrency.get(currency);
    if (existing) {
      existing.cents += cents;
      existing.count += count;
    } else {
      byCurrency.set(currency, { currency, cents, count });
    }
  }
  const rows = [...byCurrency.values()].sort((a, b) =>
    a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0,
  );
  if (!rows.length || rows.every((row) => row.cents === 0)) return { kind: "none" };
  return { kind: "some", rows };
}

export function countLabel(n) {
  return n === 1 ? "1 transaction" : `${n} transactions`;
}
