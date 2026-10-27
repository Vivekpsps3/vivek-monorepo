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

test("night counts use the singular and a day trip reads as one", () => {
  assert.equal(nightsText(1), "1 night");
  assert.equal(nightsText(6), "6 nights");
  assert.equal(nightsText(0), "Day trip");
  assert.equal(nightsAwayText(1), "1 night away");
  assert.equal(nightsAwayText(5), "5 nights away");
  assert.equal(spanText(6), "6 days");
  assert.equal(spanText(1), "1 day");
});

test("PTO days trim trailing zeros and a negative balance says over", () => {
  assert.equal(daysText("12.5000"), "12.5 days");
  assert.equal(daysText("5.0000"), "5 days");
  assert.equal(daysText("0.25"), "0.25 days");
  assert.equal(daysText(1), "1 day");
  assert.equal(balancePhrase("-1.46"), "1.46 days over");
  assert.equal(balancePhrase("2"), "2 days");
});

test("every parking chip branch has its own sentence", () => {
  assert.equal(parkingChipParts({ necessary: "no", arrangement: "self_park" }).text, "Parking not needed");
  assert.equal(parkingChipParts({ necessary: "unknown", arrangement: "none" }).text, "Parking not needed");
  assert.equal(parkingChipParts({ necessary: "yes", booked: true, place_name: "SFO" }).text, "Parking booked · SFO");
  assert.equal(parkingChipParts({ necessary: "yes", booked: false }).text, "Parking needed, not booked");
  assert.equal(parkingChipParts({ necessary: "unknown", arrangement: "valet", booked: false }).text, "Valet");
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
