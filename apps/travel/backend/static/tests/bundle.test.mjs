import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { actionName, flightAdminNote, flightStatus, sectionHint } from "../modules/copy.mjs";
import {
  deletionMode,
  dialogCopy,
  findItem,
  flagBody,
  flagToast,
  pieceCount,
  restoreBody,
  restorePath,
  undoCopy,
} from "../modules/restore.mjs";
import { DECISIONS } from "../modules/decisions.mjs";

const root = new URL("../", import.meta.url);

test("edit and delete names include the object", () => {
  const names = [
    actionName("Edit", "city", "Kyoto"),
    actionName("Delete", "city", "Osaka"),
    actionName("Delete", "reminder", "Book parking"),
    actionName("Delete", "reminder", "Pack a coat"),
  ];
  assert.deepEqual(names, [
    "Edit city Kyoto",
    "Delete city Osaka",
    "Delete reminder Book parking",
    "Delete reminder Pack a coat",
  ]);
  assert.equal(new Set(names.filter((name) => name.startsWith("Delete reminder"))).size, 2);
});

test("empty sections name the missing ride group", () => {
  assert.equal(sectionHint("cities", { empty: true }), "Add the first city.");
  assert.equal(sectionHint("role", { empty: true, roleLabel: "Outbound" }), "No outbound ride yet.");
  assert.equal(sectionHint("budget", { empty: true }), "No costs yet.");
  assert.equal(sectionHint("notes", { empty: true }), "");
});

test("row deletes undo and trip delete uses a dialog", () => {
  assert.equal(DECISIONS.undoRowDeletes, true);
  assert.equal(deletionMode("transport"), "undo");
  assert.equal(deletionMode("trip"), "dialog");
  assert.equal(deletionMode("flight-key"), "dialog");
  assert.equal(undoCopy("transport"), "Ride deleted.");
  const trip = {
    title: "Kyoto",
    days: [{ items: [{}, {}] }],
    outside_plans: [{}],
    transports: [{}, {}],
    parking: [{}],
    note_entries: [{}],
    reminders: [{}],
  };
  assert.equal(pieceCount(trip), 8);
  const copy = dialogCopy("trip", trip);
  assert.equal(copy.title, "Delete Kyoto?");
  assert.match(copy.body, /its 8 plans, rides, parking, notes and reminders/);
  assert.equal(copy.confirm, "Delete trip");
  assert.equal(dialogCopy("flight-key").title, "Remove the saved key?");
});

test("undo posts the captured ride and a booked flag sends the whole parking row", () => {
  const ride = { id: 4, role: "outbound", mode: "train", depart_place: "Tokyo", arrive_place: "Kyoto", paid: false, status: "planned" };
  const body = restoreBody("transport", ride);
  assert.equal(body.depart_place, "Tokyo");
  assert.equal(body.mode, "train");
  assert.equal(body.id, undefined);
  assert.equal(restorePath("transport", 9), "/api/trips/9/transports");
  const parking = { id: 2, place_name: "Lot", necessary: "yes", booked: false, paid: false, arrangement: "self_park" };
  const booked = flagBody("parking", parking, "booked", true);
  assert.equal(booked.booked, true);
  assert.equal(booked.place_name, "Lot");
  assert.equal(flagToast("parking", "booked", true), "Parking marked booked.");
  assert.equal(flagToast("reminder", "done", true), "Reminder marked done.");
  assert.equal(findItem({ parking: [parking] }, "parking", "2").place_name, "Lot");
});

test("settings copy drops the environment sentence unless the server owns the key", () => {
  assert.equal(flightStatus({ configured: false }), "No key saved. Flights are typed in by hand.");
  assert.equal(flightStatus({ configured: true, source: "database", last4: "1234" }), "Key saved · ending 1234 · from this app");
  assert.equal(flightAdminNote({ source: "database" }), "");
  assert.match(flightAdminNote({ source: "environment" }), /administrator/);
});

test("the trip screen no longer asks the browser to confirm a delete", () => {
  const ui = readFileSync(new URL("modules/actions/ui.mjs", root), "utf8");
  const trip = readFileSync(new URL("modules/views/trip.mjs", root), "utf8");
  const html = readFileSync(new URL("index.html", root), "utf8");
  assert.equal(ui.includes("window.confirm"), false);
  assert.match(ui, /deletionMode/);
  assert.match(ui, /openConfirm/);
  assert.match(trip, /Edit trip/);
  assert.match(trip, /class="add-row/);
  assert.match(trip, /flagBox\("parking", item, "booked"/);
  assert.match(trip, /sectionHint\("role"/);
  assert.match(html, /id="confirm"/);
  const css = readFileSync(new URL("app.css", root), "utf8");
  assert.equal(css.includes(".day-add input"), false);
});
