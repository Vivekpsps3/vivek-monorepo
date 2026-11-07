import assert from "node:assert/strict";
import test from "node:test";

import {
  SOON_DAYS,
  dueParts,
  groupReminders,
  isOverdue,
  validateTitle,
} from "../../../frontend/src/reminders.mjs";

const NOW = "2026-12-10T12:00";
const reminder = (id, due_at, done = false) => ({ id, title: "R" + id, due_at, done });

test("groups soon later done with 7 day window", () => {
  assert.equal(SOON_DAYS, 7);
  const groups = groupReminders(
    [
      reminder(1, "2026-12-09T09:00"), // overdue counts as soon
      reminder(2, "2026-12-10T12:00"), // exactly now counts as soon
      reminder(3, "2026-12-16T12:00"), // inside the window
      reminder(4, "2026-12-17T12:00"), // exactly now + 7 days is later
      reminder(5, "2026-12-30T09:00"),
      reminder(6, null),
      reminder(7, "2026-12-11T09:00", true),
      reminder(8, null, true),
    ],
    NOW,
  );
  assert.deepEqual(
    groups.soon.map((row) => row.id),
    [1, 2, 3],
  );
  assert.deepEqual(
    groups.later.map((row) => row.id),
    [4, 5, 6],
  );
  // Done reminders are most recent id first.
  assert.deepEqual(
    groups.done.map((row) => row.id),
    [8, 7],
  );
});

test("sorts by due then id with nulls last", () => {
  const groups = groupReminders(
    [
      reminder(9, null),
      reminder(5, "2027-01-05T09:00"),
      reminder(3, "2027-01-05T09:00"),
      reminder(7, null),
      reminder(4, "2027-01-01T09:00"),
    ],
    NOW,
  );
  assert.deepEqual(
    groups.later.map((row) => row.id),
    [4, 3, 5, 7, 9],
  );
  const soon = groupReminders(
    [reminder(6, "2026-12-12T09:00"), reminder(2, "2026-12-12T09:00"), reminder(1, "2026-12-11T09:00")],
    NOW,
  );
  assert.deepEqual(
    soon.soon.map((row) => row.id),
    [1, 2, 6],
  );
});

test("isOverdue strict and ignores done", () => {
  assert.equal(isOverdue(reminder(1, "2026-12-10T11:59"), NOW), true);
  // Due exactly now is not overdue: the comparison is strict.
  assert.equal(isOverdue(reminder(2, "2026-12-10T12:00"), NOW), false);
  assert.equal(isOverdue(reminder(3, "2026-12-10T12:01"), NOW), false);
  assert.equal(isOverdue(reminder(4, "2026-12-01T09:00", true), NOW), false);
  assert.equal(isOverdue(reminder(5, null), NOW), false);
});

test("dueParts midnight is date-only", () => {
  assert.deepEqual(dueParts("2026-12-12T09:00"), { date: "2026-12-12", time: "09:00" });
  assert.deepEqual(dueParts("2026-12-12T00:00"), { date: "2026-12-12", time: null });
  assert.deepEqual(dueParts("2026-12-12"), { date: "2026-12-12", time: null });
  assert.equal(dueParts(null), null);
  assert.equal(dueParts(""), null);
});

test("validateTitle empty and 200 limit", () => {
  assert.equal(validateTitle(""), "Enter a reminder.");
  assert.equal(validateTitle("   "), "Enter a reminder.");
  assert.equal(validateTitle("x".repeat(201)), "Keep it under 200 characters.");
  assert.equal(validateTitle("x".repeat(200)), null);
  assert.equal(validateTitle("  Pack the charger  "), null);
});
