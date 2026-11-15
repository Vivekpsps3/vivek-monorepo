import assert from "node:assert/strict";
import test from "node:test";
import { balancePhrase, formatDays, daysText, nightsAwayText, nightsText, parkingChipParts, spanText } from "../../../frontend/src/labels.mjs";
import { fieldForMessage, messageFrom } from "../../../frontend/src/messages.mjs";
import { balanceError, formError } from "../../../frontend/src/validate.mjs";

test("network and server failures use the travel sentences", () => {
  assert.equal(messageFrom(null, 0), "Can't reach Travel. Check your connection.");
  assert.equal(messageFrom({ detail: "Failed to fetch" }, 0), "Can't reach Travel. Check your connection.");
  assert.equal(messageFrom(null, 500), "Something went wrong on our side.");
  assert.equal(messageFrom({ detail: "Internal Server Error" }, 500), "Something went wrong on our side.");
  assert.equal(messageFrom({ detail: "Request failed (500)." }, 500), "Something went wrong on our side.");
  assert.equal(messageFrom(null, 503), "Travel is temporarily unavailable.");
  assert.equal(messageFrom({ detail: "Name the city." }, 422), "Name the city.");
  assert.equal(messageFrom({ detail: "Synthetic server error." }, 500), "Synthetic server error.");
  assert.equal(messageFrom(null, 500).includes("Request failed"), false);
});

test("a 422 sentence maps back to the field that failed", () => {
  assert.equal(fieldForMessage("Give the trip a name."), "title");
  assert.equal(fieldForMessage("Balance has to be between -366 and 366 days."), "balance_days");
  assert.equal(fieldForMessage("Something else."), "");
});

test("an out of range PTO balance is rejected before a request", () => {
  assert.equal(balanceError("9999"), "Balance has to be between -366 and 366 days.");
  assert.equal(balanceError("12.5"), "");
  assert.equal(balanceError("-366"), "");
  assert.equal(balanceError("366.1"), "Balance has to be between -366 and 366 days.");
});

test("trip, plan, note, and key forms reuse the server sentences", () => {
  assert.deepEqual(formError("trip", { title: "  " }), { name: "title", message: "Give the trip a name." });
  assert.deepEqual(formError("trip", { title: "Kyoto", start_date: "2026-10-30", end_date: "2026-10-24" }), {
    name: "end_date",
    message: "The return date has to be on or after the day you leave.",
  });
  assert.equal(formError("plan", { title: "" })?.message, "Name this plan.");
  assert.equal(formError("note", { body: "" })?.message, "Write the note.");
  assert.equal(formError("flight-key", { api_key: "" })?.message, "Paste your AeroAPI key.");
  assert.equal(formError("stay", { city: "Lisbon" }), null);
});

test("client day rounding matches half away from zero", () => {
  assert.equal(formatDays("-0.125"), "-0.13");
  assert.equal(formatDays("1.005"), "1.01");
  assert.equal(formatDays("-0.001"), "0");
  assert.equal(formatDays("1.239"), "1.24");
  assert.equal(balancePhrase("-0.001"), "0 days");
  assert.equal(balancePhrase("-0.125"), "0.13 days over");
});
