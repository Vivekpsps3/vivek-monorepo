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
      absorbPostings(existing, entry);
    } else {
      const row = { currency, cents, count };
      absorbPostings(row, entry);
      byCurrency.set(currency, row);
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

function absorbPostings(target, entry) {
  if (!Array.isArray(entry?.postings)) return;
  for (const posting of entry.postings) {
    if (!posting || typeof posting !== "object") continue;
    const id = Number(posting.id);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const cents = Number(posting.cents);
    if (!Number.isFinite(cents)) continue;
    const label = typeof posting.label === "string" ? posting.label : "";
    if (!target.postings) target.postings = [];
    if (target.postings.some((row) => row.id === id)) continue;
    target.postings.push({ id, cents, label });
  }
}

function lineSourceId(line) {
  return Number(line?.source_id ?? line?.sourceId);
}

/** Positive booked cost and positive posted row share one payment. Refunds add nothing. */
export function countedCents(lineCents, postingCents) {
  if (!(lineCents > 0) || !(postingCents > 0)) return 0;
  return Math.min(lineCents, postingCents);
}

/**
 * Planned and booked are Travel line amounts. Posted is the unlocked facade total
 * for that currency, or null when Finance is locked or has no row in that currency.
 * countedOnce is the overlap of an explicit link, each line and posting at most once.
 */
export function reconcileStages(lines, spend, links, currency, tripId) {
  const code = String(currency || "").trim();
  const rows = (Array.isArray(lines) ? lines : []).filter(
    (line) => line && String(line.currency || "").trim() === code,
  );
  let planned = 0;
  let booked = 0;
  for (const line of rows) {
    const cents = Number(line.amount_cents);
    if (!Number.isFinite(cents)) continue;
    if (line.paid) booked += cents;
    else planned += cents;
  }
  const locked = spend == null || spend.kind === "locked";
  let posted = null;
  let postings = [];
  if (!locked && spend.kind === "some") {
    const row = (spend.rows || []).find((item) => item && item.currency === code);
    if (row) {
      posted = Number.isFinite(Number(row.cents)) ? Number(row.cents) : 0;
      postings = Array.isArray(row.postings) ? row.postings : [];
    }
  }
  const tripLinks = (Array.isArray(links) ? links : []).filter(
    (link) => link && Number(link.tripId) === Number(tripId),
  );
  let countedOnce = 0;
  const usedLines = new Set();
  const usedPostings = new Set();
  if (!locked && posted != null) {
    for (const link of tripLinks) {
      const sourceId = Number(link.sourceId ?? link.source_id);
      const line = rows.find(
        (item) => item.paid && item.source === link.source && lineSourceId(item) === sourceId,
      );
      if (!line) continue;
      const lineKey = `${line.source}:${lineSourceId(line)}`;
      if (usedLines.has(lineKey)) continue;
      const postingId = Number(link.transactionId);
      if (usedPostings.has(postingId)) continue;
      const posting = postings.find((item) => Number(item?.id) === postingId);
      if (!posting) continue;
      usedLines.add(lineKey);
      usedPostings.add(postingId);
      countedOnce += countedCents(Number(line.amount_cents), Number(posting.cents));
    }
  }
  return { currency: code, planned, booked, posted, countedOnce, locked };
}

/** Paid lines can choose a posting that is not already linked to another line. */
export function linkChoices(postings, links, line) {
  if (!line?.paid) return [];
  const ownId = lineSourceId(line);
  const taken = new Set(
    (Array.isArray(links) ? links : [])
      .filter((link) => !(link && link.source === line.source && Number(link.sourceId ?? link.source_id) === ownId))
      .map((link) => Number(link.transactionId)),
  );
  return (Array.isArray(postings) ? postings : []).filter(
    (posting) => posting && !taken.has(Number(posting.id)),
  );
}

/** Unlocked spend no longer contains the linked posting. Locked spend stays private. */
export function linkedPostingMissing(line, spend, link) {
  if (!line || !link) return false;
  if (spend == null || spend.kind === "locked") return false;
  const rows = spend.kind === "some" ? spend.rows || [] : [];
  const row = rows.find((item) => item && item.currency === String(line.currency || "").trim());
  const postings = Array.isArray(row?.postings) ? row.postings : [];
  return !postings.some((posting) => Number(posting?.id) === Number(link.transactionId));
}

const SAVE_ERROR = "Couldn't save this link. Try again.";
const MISSING_ERROR = "That posted transaction is no longer available.";

/**
 * Apply a confirm result only when it still matches the current selection.
 * A late or losing response drops. Invalidation clears the draft. A failed
 * read keeps the draft so the same choice can be retried.
 */
export function settleCostLink(request, current) {
  const same = current
    && request
    && request.epoch === current.epoch
    && Number(request.tripId) === Number(current.tripId)
    && request.source === current.source
    && Number(request.sourceId) === Number(current.sourceId)
    && Number(request.transactionId) === Number(current.transactionId);
  if (!same) return { action: "drop", clearDraft: false, error: null };
  if (!current.sessionActive || current.spendLocked || request.status === "invalid") {
    return { action: "drop", clearDraft: true, error: null };
  }
  if (request.status === "failed") {
    return { action: "keep", clearDraft: false, error: SAVE_ERROR };
  }
  const posting = request.posting;
  if (request.status !== "posted" || !posting || Number(posting.id) !== Number(request.transactionId)) {
    return { action: "drop", clearDraft: true, error: MISSING_ERROR };
  }
  return { action: "apply", clearDraft: true, error: null };
}
