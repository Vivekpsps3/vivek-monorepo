import assert from "node:assert/strict";
import test from "node:test";

import {
  BUCKET_SHORT,
  bucketForCategory,
  bucketRows,
  countLabel,
  spendState,
  splitWidths,
  toCents,
} from "../../../frontend/src/trip-costs.mjs";

test("toCents parses two-decimal, one-decimal, integer and rejects junk", () => {
  assert.equal(toCents("120.50"), 12050);
  assert.equal(toCents("120.5"), 12050);
  assert.equal(toCents("0"), 0);
  assert.equal(toCents("7"), 700);
  assert.equal(toCents("0.01"), 1);
  assert.equal(toCents("10.999"), 1099);
  assert.equal(toCents(null), null);
  assert.equal(toCents(undefined), null);
  assert.equal(toCents(""), null);
  assert.equal(toCents("abc"), null);
  assert.equal(toCents("12a"), null);
  assert.equal(toCents("1,200.50"), null);
});

test("splitWidths sums to 100 and applies 2 percent minimums", () => {
  assert.deepEqual(splitWidths(5000, 10000), { paid: 50, unpaid: 50 });
  assert.deepEqual(splitWidths(1, 3), { paid: 33.3, unpaid: 66.7 });
  // A 1-cent paid share of $10,000 still shows a sliver of the bar.
  assert.deepEqual(splitWidths(1, 1000000), { paid: 2, unpaid: 98 });
  assert.deepEqual(splitWidths(999999, 1000000), { paid: 98, unpaid: 2 });
  assert.deepEqual(splitWidths(0, 10000), { paid: 0, unpaid: 100 });
  assert.deepEqual(splitWidths(10000, 10000), { paid: 100, unpaid: 0 });
  for (const [paid, total] of [
    [1, 7],
    [2, 9],
    [333, 1000],
    [9999, 10000],
  ]) {
    const widths = splitWidths(paid, total);
    assert.equal(Math.round((widths.paid + widths.unpaid) * 10) / 10, 100);
  }
});

test("splitWidths returns null for zero total", () => {
  assert.equal(splitWidths(0, 0), null);
  assert.equal(splitWidths(100, 0), null);
  assert.equal(splitWidths(100, -5), null);
});

test("bucketRows keeps T1 order and drops unknown keys", () => {
  const item = {
    buckets: [
      { bucket: "other", label: "Other costs", total_cents: 100 },
      { bucket: "mystery", label: "Mystery", total_cents: 999 },
      { bucket: "parking", label: "Parking", total_cents: 300 },
      { bucket: "transport", label: "Transport", total_cents: 200 },
      { bucket: "stays_plans", label: "Stays and plans", total_cents: 400 },
    ],
  };
  assert.deepEqual(
    bucketRows(item).map((row) => row.bucket),
    ["transport", "stays_plans", "parking", "other"],
  );
  // Never invents zero rows for buckets the payload does not carry.
  assert.deepEqual(bucketRows({ buckets: [] }), []);
  assert.deepEqual(bucketRows({}), []);
  assert.deepEqual(bucketRows(null), []);
  assert.equal(BUCKET_SHORT.transport, "Transport");
  assert.equal(BUCKET_SHORT.stays_plans, "Stays and plans");
});

test("spendState locked none and some", () => {
  assert.deepEqual(spendState(null, 7), { kind: "locked" });
  assert.deepEqual(spendState(undefined, 7), { kind: "locked" });
  assert.deepEqual(spendState([], 7), { kind: "none" });
  assert.deepEqual(spendState([{ trip_id: 7, currency: "USD", cents: 0, count: 2 }], 7), {
    kind: "none",
  });
  assert.deepEqual(spendState([{ trip_id: 8, currency: "USD", cents: 500, count: 1 }], 7), {
    kind: "none",
  });
  assert.deepEqual(
    spendState(
      [
        { trip_id: 7, currency: "USD", cents: 500, count: 1 },
        { trip_id: 7, currency: "EUR", cents: 1200, count: 3 },
        { trip_id: 7, currency: "USD", cents: 250, count: 2 },
        { trip_id: 9, currency: "JPY", cents: 999, count: 1 },
      ],
      7,
    ),
    {
      kind: "some",
      rows: [
        { currency: "EUR", cents: 1200, count: 3 },
        { currency: "USD", cents: 750, count: 3 },
      ],
    },
  );
});

test("countLabel singular and plural", () => {
  assert.equal(countLabel(1), "1 transaction");
  assert.equal(countLabel(0), "0 transactions");
  assert.equal(countLabel(2), "2 transactions");
  assert.equal(countLabel(12), "12 transactions");
});

test("bucketForCategory maps unknown to other", () => {
  assert.equal(bucketForCategory("transport"), "transport");
  assert.equal(bucketForCategory("outbound_flight"), "transport");
  assert.equal(bucketForCategory("drive"), "transport");
  assert.equal(bucketForCategory("lodging"), "stays_plans");
  assert.equal(bucketForCategory("food"), "stays_plans");
  assert.equal(bucketForCategory("activity"), "stays_plans");
  assert.equal(bucketForCategory("parking"), "parking");
  assert.equal(bucketForCategory("other"), "other");
  assert.equal(bucketForCategory("souvenirs"), "other");
  assert.equal(bucketForCategory(""), "other");
  assert.equal(bucketForCategory(null), "other");
  assert.equal(bucketForCategory(undefined), "other");
});
