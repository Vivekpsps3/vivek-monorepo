import assert from "node:assert/strict";
import test from "node:test";
import {
  halfNote,
  ratingOptions,
  segmentValue,
} from "../../../frontend/src/rating-model.mjs";

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
