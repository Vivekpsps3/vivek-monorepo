import assert from "node:assert/strict";
import test from "node:test";

import {
  BUCKET_SHORT,
  bucketForCategory,
  bucketRows,
  countLabel,
  countedCents,
  linkChoices,
  linkedPostingMissing,
  reconcileStages,
  settleCostLink,
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

test("spendState keeps narrow postings and still omits the field when none exist", () => {
  assert.deepEqual(
    spendState(
      [
        {
          trip_id: 7,
          currency: "USD",
          cents: 42000,
          count: 1,
          postings: [{ id: 4, cents: 42000, label: "2026-11-02 · Travel" }],
        },
        {
          trip_id: 7,
          currency: "USD",
          cents: 1500,
          count: 1,
          postings: [
            { id: 4, cents: 100, label: "duplicate" },
            { id: 5, cents: 1500, label: "2026-11-03 · Travel" },
          ],
        },
      ],
      7,
    ),
    {
      kind: "some",
      rows: [
        {
          currency: "USD",
          cents: 43500,
          count: 2,
          postings: [
            { id: 4, cents: 42000, label: "2026-11-02 · Travel" },
            { id: 5, cents: 1500, label: "2026-11-03 · Travel" },
          ],
        },
      ],
    },
  );
});

const flight = {
  source: "transport",
  source_id: 11,
  currency: "USD",
  amount_cents: 42000,
  paid: true,
};
const museum = {
  source: "plan",
  source_id: 12,
  currency: "USD",
  amount_cents: 1500,
  paid: false,
};
const guide = {
  source: "plan",
  source_id: 13,
  currency: "EUR",
  amount_cents: 800,
  paid: false,
};
const lines = [flight, museum, guide];
const posted = {
  kind: "some",
  rows: [
    {
      currency: "USD",
      cents: 42000,
      count: 1,
      postings: [{ id: 4, cents: 42000, label: "2026-11-02 · Travel" }],
    },
  ],
};
const link = { tripId: 7, source: "transport", sourceId: 11, transactionId: 4 };

test("reconcileStages counts a linked booked flight once and keeps currencies apart", () => {
  assert.equal(countedCents(42000, 42000), 42000);
  assert.equal(countedCents(42000, -325), 0);
  assert.deepEqual(reconcileStages(lines, posted, [link], "USD", 7), {
    currency: "USD",
    planned: 1500,
    booked: 42000,
    posted: 42000,
    countedOnce: 42000,
    locked: false,
  });
  assert.deepEqual(reconcileStages(lines, posted, [link], "EUR", 7), {
    currency: "EUR",
    planned: 800,
    booked: 0,
    posted: null,
    countedOnce: 0,
    locked: false,
  });
  assert.equal(
    reconcileStages(lines, posted, [link, link], "USD", 7).countedOnce,
    42000,
  );
  const shorter = {
    kind: "some",
    rows: [{
      currency: "USD",
      cents: 40000,
      count: 1,
      postings: [{ id: 4, cents: 40000, label: "2026-11-02 · Travel" }],
    }],
  };
  assert.equal(reconcileStages(lines, shorter, [link], "USD", 7).countedOnce, 40000);
  const extra = {
    kind: "some",
    rows: [{
      currency: "USD",
      cents: 43500,
      count: 2,
      postings: [
        { id: 4, cents: 42000, label: "2026-11-02 · Travel" },
        { id: 5, cents: 1500, label: "2026-11-03 · Travel" },
      ],
    }],
  };
  const stage = reconcileStages(lines, extra, [link], "USD", 7);
  assert.equal(stage.posted, 43500);
  assert.equal(stage.countedOnce, 42000);
  const refund = {
    kind: "some",
    rows: [{
      currency: "USD",
      cents: 41700,
      count: 2,
      postings: [
        { id: 4, cents: 42000, label: "2026-11-02 · Travel" },
        { id: 6, cents: -300, label: "2026-11-04 · Travel" },
      ],
    }],
  };
  assert.equal(
    reconcileStages(lines, refund, [{ ...link, transactionId: 6 }], "USD", 7).countedOnce,
    0,
  );
});

test("reconcileStages hides posted overlap while Finance is locked and when the posting is gone", () => {
  assert.deepEqual(reconcileStages(lines, { kind: "locked" }, [link], "USD", 7), {
    currency: "USD",
    planned: 1500,
    booked: 42000,
    posted: null,
    countedOnce: 0,
    locked: true,
  });
  const gone = { kind: "none" };
  assert.equal(reconcileStages(lines, gone, [link], "USD", 7).countedOnce, 0);
  assert.equal(reconcileStages(lines, gone, [link], "USD", 7).posted, null);
  assert.equal(linkedPostingMissing(flight, gone, link), true);
  assert.equal(linkedPostingMissing(flight, { kind: "locked" }, link), false);
  assert.equal(linkedPostingMissing(flight, posted, link), false);
  assert.deepEqual(linkChoices(posted.rows[0].postings, [link], flight), posted.rows[0].postings);
  assert.deepEqual(
    linkChoices(posted.rows[0].postings, [link], { ...museum, paid: true, amount_cents: 1500 }),
    [],
  );
  const second = [{ id: 4, cents: 42000, label: "2026-11-02 · Travel" }, { id: 5, cents: 1500, label: "2026-11-03 · Travel" }];
  assert.deepEqual(linkChoices(second, [link], { ...museum, paid: true }).map((row) => row.id), [5]);
  assert.deepEqual(linkChoices(second, [], museum), []);
});

function current(patch = {}) {
  return {
    epoch: 3,
    tripId: 7,
    source: "transport",
    sourceId: 11,
    transactionId: 4,
    sessionActive: true,
    spendLocked: false,
    ...patch,
  };
}

test("settleCostLink applies only the current posted choice", () => {
  const request = {
    epoch: 3,
    tripId: 7,
    source: "transport",
    sourceId: 11,
    transactionId: 4,
    status: "posted",
    posting: { id: 4, cents: 42000, label: "2026-11-02 · Travel" },
  };
  assert.equal(settleCostLink(request, current()).action, "apply");
  assert.deepEqual(settleCostLink({ ...request, epoch: 2 }, current()), {
    action: "drop",
    clearDraft: false,
    error: null,
  });
  assert.equal(settleCostLink(request, null).action, "drop");
  assert.equal(settleCostLink({ ...request, status: "invalid", posting: null }, current()).clearDraft, true);
  assert.equal(settleCostLink(request, current({ sessionActive: false })).clearDraft, true);
  assert.equal(settleCostLink(request, current({ spendLocked: true })).error, null);
  assert.deepEqual(settleCostLink({ ...request, status: "failed", posting: null }, current()), {
    action: "keep",
    clearDraft: false,
    error: "Couldn't save this link. Try again.",
  });
  assert.deepEqual(settleCostLink({ ...request, status: "missing", posting: null }, current()), {
    action: "drop",
    clearDraft: true,
    error: "That posted transaction is no longer available.",
  });
  assert.equal(
    settleCostLink({ ...request, posting: { id: 9, cents: 100, label: "other" } }, current()).action,
    "drop",
  );
});
