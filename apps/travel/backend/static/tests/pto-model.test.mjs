import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCRUAL_COPY,
  CAP_COPY,
  HPD_COPY,
  NAME_COPY,
  RANGE_COPY,
  START_COPY,
  YEAR_COPY,
  asOfCopy,
  blurHours,
  blurHoursPerDay,
  commitHour,
  entryErrors,
  fieldErrorMap,
  fieldHint,
  formatBalance,
  hoursPerDayError,
  periodWord,
  policyBody,
  policyErrors,
  previewKey,
  softAccrual,
  softStart,
} from "../../../frontend/src/pto-model.mjs";

const TODAY = "2026-11-01";

test("balances lead with days and trim zeros", () => {
  assert.equal(formatBalance(100, 8), "12.5 days \u00b7 100 h");
  assert.equal(formatBalance(100, 7.5), "13.33 days \u00b7 100 h");
  assert.equal(formatBalance(40, 8), "5 days \u00b7 40 h");
  assert.equal(formatBalance(-12, 8), "\u22121.5 days \u00b7 \u221212 h");
});

test("hard limits use the server copy and grandfather a stored value", () => {
  const draft = {
    start_balance_hours: "10",
    balance_as_of: "2026-01-01",
    accrual_hours: "8",
    accrual_cadence: "monthly",
    cap_hours: "",
    year_month: "01",
    year_day: "01",
  };
  assert.deepEqual(policyErrors(draft, null, TODAY), {});
  assert.equal(
    policyErrors({ ...draft, start_balance_hours: "8785" }, null, TODAY).start_balance_hours,
    START_COPY,
  );
  assert.equal(policyErrors({ ...draft, start_balance_hours: "-8785" }, null, TODAY).start_balance_hours, START_COPY);
  assert.equal(policyErrors({ ...draft, accrual_hours: "-1" }, null, TODAY).accrual_hours, ACCRUAL_COPY);
  assert.equal(policyErrors({ ...draft, cap_hours: "0" }, null, TODAY).cap_hours, CAP_COPY);
  assert.equal(policyErrors({ ...draft, cap_hours: "8785" }, null, TODAY).cap_hours, CAP_COPY);
  assert.equal(policyErrors({ ...draft, year_month: "02", year_day: "29" }, null, TODAY).year_start, YEAR_COPY);
  assert.equal(
    policyErrors({ ...draft, balance_as_of: "1999-12-31" }, null, TODAY).balance_as_of,
    asOfCopy(TODAY),
  );
  assert.match(asOfCopy(TODAY), /Nov 2, 2027/);
  const stored = { ...draft, accrual_hours: "10000", start_balance_hours: "9000.123456", year_start: "01-01" };
  const kept = policyErrors(
    { ...draft, accrual_hours: "10000", start_balance_hours: "9000.123456" },
    stored,
    TODAY,
  );
  assert.equal(kept.accrual_hours, undefined);
  assert.equal(kept.start_balance_hours, undefined);
  assert.equal(policyErrors({ ...draft, accrual_hours: "9000" }, stored, TODAY).accrual_hours, ACCRUAL_COPY);
});

test("soft warnings stay helpers and quarter rounding is blur-only", () => {
  assert.equal(softStart(2001, 8), "That's 250.13 days. Double-check the hours.");
  assert.equal(softStart(2000, 8), "");
  assert.equal(softAccrual(401, "monthly"), "That's a lot per month. Double-check.");
  assert.equal(softAccrual(400, "monthly"), "");
  assert.equal(periodWord("semimonthly"), "half-month");
  assert.equal(periodWord("biweekly"), "two weeks");
  assert.equal(fieldHint("start_balance_hours", "2001", 8, "monthly", ""), softStart(2001, 8));
  assert.equal(fieldHint("accrual_hours", "8", 8, "weekly", ""), "= 1 days");
  const blurred = blurHours("12,3");
  assert.equal(blurred.text, "12.25");
  assert.equal(blurred.note, "Rounded to 12.25 h.");
  assert.equal(blurHours("12,5").text, "12.5");
  assert.equal(blurHours("12,5").note, "");
  assert.equal(hoursPerDayError("7.5", null), "");
  assert.equal(hoursPerDayError("7.125", null), HPD_COPY);
  assert.equal(hoursPerDayError("25", null), HPD_COPY);
  assert.equal(hoursPerDayError("24", null), "");
  assert.equal(hoursPerDayError("7.125", "7.125"), "");
});

test("entry copy and the preview key follow the inputs", () => {
  assert.equal(entryErrors({ label: "  ", start_date: "2026-05-02", end_date: "2026-05-01" }).label, NAME_COPY);
  assert.equal(
    entryErrors({ label: "Clinic", start_date: "2026-05-02", end_date: "2026-05-01" }).end_date,
    RANGE_COPY,
  );
  assert.deepEqual(entryErrors({ label: "Clinic", start_date: "2026-05-01", end_date: "2026-05-01" }), {});
  const first = previewKey({ start_date: "2026-05-01", end_date: "2026-05-02", days: "", bucket: "pto" });
  const second = previewKey({ start_date: "2026-05-03", end_date: "2026-05-02", days: "", bucket: "pto" });
  const sick = previewKey({ start_date: "2026-05-01", end_date: "2026-05-02", days: "", bucket: "sick" });
  assert.notEqual(first, second);
  assert.notEqual(first, sick);
  const deps = {
    start_date: "2026-05-01",
    end_date: "2026-05-02",
    days: "",
    bucket: "pto",
    hours_per_day: "8",
    policy: { accrual_hours: "8", start_balance_hours: "80" },
    entries: [{ id: 1, days: "2" }],
  };
  assert.notEqual(previewKey(deps), previewKey({ ...deps, hours_per_day: "7.5" }));
  assert.notEqual(previewKey(deps), previewKey({ ...deps, policy: { accrual_hours: "9", start_balance_hours: "80" } }));
  assert.notEqual(previewKey(deps), previewKey({ ...deps, entries: [{ id: 1, days: "3" }] }));
  assert.equal(previewKey(deps), previewKey({ ...deps, label: "ignored" }));
});

test("edited hours round on quarter ties and untouched stored text does not", () => {
  assert.equal(blurHours("12,3").text, "12.25");
  assert.equal(blurHours("12.3").note, "Rounded to 12.25 h.");
  assert.equal(blurHours("12.125").text, "12.25");
  assert.equal(blurHours("-0.125").text, "-0.25");
  assert.equal(blurHours("0.125").note, "Rounded to 0.25 h.");
  assert.equal(commitHour("12,3", "12.3", true).text, "12.3");
  assert.equal(commitHour("12,3", "12.3", true).note, "");
  assert.equal(commitHour("12.3", "8", true).text, "12.25");
  assert.equal(commitHour("12.3", "12.3", false).text, "12.3");
  const draft = {
    start_balance_hours: "12.3",
    balance_as_of: "2026-01-01",
    accrual_hours: "10000",
    accrual_cadence: "yearly",
    cap_hours: "",
    year_month: "01",
    year_day: "01",
    carry_forward: true,
  };
  const stored = { start_balance_hours: "12.3", accrual_hours: "10000", cap_hours: "", year_start: "01-01" };
  const kept = policyBody(draft, stored, new Set());
  assert.equal(kept.start_balance_hours, "12.3");
  assert.equal(kept.accrual_hours, "10000");
  assert.equal(kept.cap_hours, null);
  const changed = policyBody({ ...draft, accrual_hours: "12,3" }, stored, new Set(["accrual_hours"]));
  assert.equal(changed.start_balance_hours, "12.3");
  assert.equal(changed.accrual_hours, "12.25");
  assert.equal(blurHoursPerDay("7,5", "8").text, "7.5");
  assert.equal(blurHoursPerDay("7,5", "8").error, "");
  assert.equal(blurHoursPerDay("7.125", "8").error, HPD_COPY);
  assert.equal(blurHoursPerDay("7,125", "7.125").text, "7.125");
  assert.equal(blurHoursPerDay("7,125", "7.125").error, "");
  assert.deepEqual(fieldErrorMap({ field_errors: { accrual_hours: ACCRUAL_COPY } }), { accrual_hours: ACCRUAL_COPY });
  assert.equal(fieldErrorMap({ message: "no" }), null);
});
