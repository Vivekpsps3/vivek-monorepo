import assert from "node:assert/strict";
import test from "node:test";
import {
  halfNote,
  ratingOptions,
  segmentValue,
} from "../../../frontend/src/rating-model.mjs";

test("ratingOptions has 11 options with out-of-10 labels", () => {
  const options = ratingOptions();
  assert.equal(options.length, 11);
  assert.deepEqual(options[0], {
    value: 0,
    label: "0",
    ariaLabel: "0 out of 10",
  });
  assert.deepEqual(options[7], {
    value: 7,
    label: "7",
    ariaLabel: "7 out of 10",
  });
  assert.deepEqual(options[10], {
    value: 10,
    label: "10",
    ariaLabel: "10 out of 10",
  });
});

test("segmentValue accepts integers 0–10 only", () => {
  assert.equal(segmentValue(0), 0);
  assert.equal(segmentValue(7), 7);
  assert.equal(segmentValue(10), 10);
  assert.equal(segmentValue(7.5), null);
  assert.equal(segmentValue(-1), null);
  assert.equal(segmentValue(11), null);
  assert.equal(segmentValue(null), null);
  assert.equal(segmentValue(undefined), null);
  assert.equal(segmentValue("7"), null);
  assert.equal(segmentValue(NaN), null);
});

test("halfNote only for non-integers in range", () => {
  assert.equal(
    halfNote(7.5),
    "Current rating: 7.5. Pick a whole number to change it.",
  );
  assert.equal(
    halfNote(0.5),
    "Current rating: 0.5. Pick a whole number to change it.",
  );
  assert.equal(halfNote(7), "");
  assert.equal(halfNote(0), "");
  assert.equal(halfNote(10), "");
  assert.equal(halfNote(10.5), "");
  assert.equal(halfNote(-0.5), "");
  assert.equal(halfNote(null), "");
  assert.equal(halfNote(undefined), "");
});
