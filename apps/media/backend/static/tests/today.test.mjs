import assert from "node:assert/strict";
import test from "node:test";

import { isoDateInZone } from "../../../../../packages/browser/runtime/today.mjs";

test("local today crosses the UTC day boundary", () => {
  const lateEveningPacific = new Date("2026-10-22T06:30:00.000Z");
  assert.equal(isoDateInZone(lateEveningPacific, "America/Los_Angeles"), "2026-10-21");
  assert.equal(isoDateInZone(lateEveningPacific, "UTC"), "2026-10-22");
  const justAfterPacificMidnight = new Date("2026-10-22T07:00:00.000Z");
  assert.equal(isoDateInZone(justAfterPacificMidnight, "America/Los_Angeles"), "2026-10-22");
});
