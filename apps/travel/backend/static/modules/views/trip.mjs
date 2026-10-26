import { state, ROLES, MODES, KINDS, STATUSES, ARRANGEMENTS, NECESSARY } from '../state.mjs';
import { DECISIONS } from '../decisions.mjs';
import { esc, banner, field, area, select, check, actions, labelOf, prettyRange, prettyDate, money, daysText, budgetText, transportSummary, flightMeta, parkingChip, localInput, spanText, nightsAwayText } from '../helpers.mjs';
import { actionName, sectionHint } from '../copy.mjs';
import { overridesFromSaved, savedProvenance } from '../actions/flight.mjs';
import { hiddenFlight, flightScheduleControls } from './new-trip.mjs';

export function editing(kind, id) {
  return state.edit && state.edit.kind === kind && String(state.edit.id) === String(id);
}

function hid(name, value) {
  return `<input type="hidden" name="${name}" value="${esc(value ?? "")}">`;
}

function composing(kind) {
  return state.compose === kind && !(state.edit && state.edit.kind === kind);
}

function chosenDay(focusDay) {
  if (state.compose === "plan") return state.composeDate || "";
  if (state.compose) return "";
  return focusDay || "";
}

function optionalSection(title, show, body, editor, kind, label, focusKey) {
  if (!show) return "";
  const add = editor || `<button class="btn btn-ghost btn-sm" type="button" data-action="compose" data-compose="${esc(kind)}" data-focus-key="${esc(focusKey)}">${esc(label)}</button>`;
  return `<section class="card"><h2>${esc(title)}</h2>${body}${add}</section>`;
}

function iconButton(verb, noun, label, attrs) {
  const danger = verb === "Delete" ? " btn-danger" : "";
  return `<button class="btn btn-ghost btn-sm${danger}" type="button" ${attrs}>${esc(actionName(verb, noun, label))}</button>`;
}

function flagBox(kind, item, flag, text) {
  const on = Boolean(item[flag]);
  return `<label class="check"><input type="checkbox" data-save-flag="${esc(flag)}" data-kind="${esc(kind)}" data-id="${esc(item.id)}" data-focus-key="flag-${kind}-${item.id}-${flag}"${on ? " checked" : ""}> <span>${esc(text)}</span></label>`;
}

function addForm({ kind, id = "", label, focusKey, controls, hidden = "", pair = false, submitLabel = "Add", cancel = false, required = false }) {
  return `<form class="add-row${pair ? " is-pair" : ""}" data-form="${esc(kind)}"${id !== "" && id != null ? ` data-id="${esc(id)}"` : ""}>
    <label class="add-label" for="${esc(focusKey)}">${esc(label)}${required ? requiredMark() : ""}</label>
    ${controls}
    <button class="btn btn-secondary btn-sm" type="submit">${esc(submitLabel)}</button>
    ${cancel || (id !== "" && id != null) ? `<button class="btn btn-ghost btn-sm" type="button" data-action="cancel">Cancel</button>` : ""}
    ${hidden}
  </form>`;
}

function rowActions(parts) {
  const items = parts.filter(Boolean);
  if (items.length <= 2) return `<div class="row-actions">${items.join("")}</div>`;
  return `<div class="row-actions">${items.slice(0, 2).join("")}<details class="row-more"><summary class="btn btn-ghost btn-sm" aria-label="More actions">⋯</summary>${items.slice(2).join("")}</details></div>`;
}

function textControl(name, value, { id, placeholder = "", required = false, inputmode = "", focusKey = "" } = {}) {
  return `<input id="${esc(id)}" name="${esc(name)}" value="${esc(value ?? "")}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ""} autocomplete="off"${required ? ` required aria-required="true"` : ""}${inputmode ? ` inputmode="${esc(inputmode)}"` : ""}${focusKey ? ` data-focus-key="${esc(focusKey)}"` : ""}>`;
}

function requiredMark() {
  return ` <span class="field-note">(required)</span>`;
}

function cityEditor(stay) {
  if (!stay || !editing("stay", stay.id)) return "";
  const focus = `edit-stay-${stay.id}`;
  return `<form class="stack editor" data-form="stay" data-id="${esc(stay.id)}"><div class="form-grid">
      ${field("City", "city", stay.city || "", { required: true, focusKey: focus, scope: `stay-${stay.id}` })}
    </div>
    <details class="ride-more"><summary>More details</summary><div class="form-grid">
      ${field("Region", "region", stay.region || "", { scope: `stay-${stay.id}` })}
      ${field("Country", "country", stay.country || "", { scope: `stay-${stay.id}` })}
      ${field("Arrive", "arrive_on", stay.arrive_on || "", "date", { scope: `stay-${stay.id}` })}
      ${field("Leave", "leave_on", stay.leave_on || "", "date", { scope: `stay-${stay.id}` })}
      ${field("Lodging", "lodging_name", stay.lodging_name || "", { scope: `stay-${stay.id}` })}
      ${field("Address", "lodging_address", stay.lodging_address || "", { wide: true, scope: `stay-${stay.id}` })}
      ${field("Latitude", "lat", stay.lat ?? "", { scope: `stay-${stay.id}` })}
      ${field("Longitude", "lng", stay.lng ?? "", { scope: `stay-${stay.id}` })}
      ${area("Notes", "notes", stay.notes || "", { scope: `stay-${stay.id}` })}
    </div><button class="btn btn-secondary btn-sm" type="button" data-action="find-place">Find on map</button><div data-place-hits></div></details>
    ${actions("Save city")}</form>`;
}

function cityRow(stay) {
  const open = cityEditor(stay);
  if (open) return open;
  return `<div class="ride"${stay.lat != null ? ` data-map-lat="${stay.lat}" data-map-lng="${stay.lng}"` : ""}><div><strong>${esc(stay.city)}</strong><p class="meta">${esc(prettyRange(stay.arrive_on, stay.leave_on))}${stay.lodging_name ? ` · ${esc(stay.lodging_name)}` : ""}</p></div><div class="row-actions">${iconButton("Edit", "city", stay.city, `data-action="edit" data-kind="stay" data-id="${stay.id}" data-focus-key="edit-stay-${stay.id}"`)}${iconButton("Delete", "city", stay.city, `data-action="delete" data-kind="stay" data-id="${stay.id}"`)}</div></div>`;
}

function modeControl(id, selected, focusKey) {
  const options = MODES.map(([key, text]) => `<option value="${esc(key)}"${key === selected ? " selected" : ""}>${esc(text)}</option>`).join("");
  const focus = focusKey ? ` data-focus-key="${esc(focusKey)}"` : "";
  return `<label class="add-label" for="mode-${esc(id)}">Mode${requiredMark()}</label><select id="mode-${esc(id)}" name="mode" required${focus}><option value="">Choose…</option>${options}</select>`;
}

function roleControl(role) {
  const options = ROLES.map(([key, text]) => `<option value="${esc(key)}"${key === role ? " selected" : ""}>${esc(text)}</option>`).join("");
  return `<label class="add-label" for="ride-role">Part of the trip</label><select id="ride-role" name="role">${options}</select>`;
}

function rideForm(item) {
  const role = item?.role || state.composeRole || "outbound";
  const focus = item ? `edit-transport-${item.id}` : `add-transport-${role}`;
  const mode = item?.mode || "";
  const legend = item
    ? `<legend class="add-label">Edit ride</legend>`
    : `<legend class="add-label">Add a ride</legend>`;
  const flightHidden = mode === "flight" ? "" : " hidden";
  const moreOpen = mode === "flight" ? " open" : "";
  const suggested = role === "inbound" ? (state.trip?.end_date || state.trip?.start_date) : state.trip?.start_date;
  const lookupOn = (item?.depart_at || "").slice(0, 10) || suggested || "";
  return `<form class="stack editor" data-form="transport"${item?.id ? ` data-id="${esc(item.id)}"` : ""}>
    <fieldset class="add-row is-pair">
      ${legend}
      ${modeControl(item?.id || role, mode, item ? focus : "add-transport")}
      ${roleControl(role)}
      <label for="${focus}">From</label>
      ${textControl("depart_place", item?.depart_place || "", { id: focus, required: true })}
      <label for="${focus}-to">To</label>
      ${textControl("arrive_place", item?.arrive_place || "", { id: `${focus}-to` })}
    </fieldset>
    <div class="form-grid">
      ${field("Departs", "depart_at", localInput(item?.depart_at), "datetime-local", { scope: `ride-${focus}` })}
      ${field("Arrives", "arrive_at", localInput(item?.arrive_at), "datetime-local", { scope: `ride-${focus}` })}
    </div>
    <div data-flight-only${flightHidden}>
      <div class="form-grid">
        ${field("Carrier", "carrier", item?.carrier || "", { scope: `ride-${focus}` })}
        ${field("Number", "number", item?.number || "", { scope: `ride-${focus}` })}
      </div>
      ${flightScheduleControls(lookupOn, overridesFromSaved(item).join(","), savedProvenance(item))}
    </div>
    <details class="ride-more"${moreOpen}><summary>More details</summary><div class="form-grid">
      ${select("Status", "status", item?.status || "planned", DECISIONS.legStatuses, { scope: `ride-${focus}` })}
      ${field("Confirmation", "confirmation", item?.confirmation || "", { scope: `ride-${focus}` })}
      ${field("Seat", "seat", item?.seat || "", { scope: `ride-${focus}` })}
      ${field("Cost", "cost", item?.cost || "", { scope: `ride-${focus}` })}
      ${field("Currency", "currency", item?.currency || "USD", { scope: `ride-${focus}` })}
      ${check("Paid", "paid", Boolean(item?.paid))}
      ${area("Notes", "notes", item?.notes || "", { scope: `ride-${focus}` })}
    </div></details>
    ${hiddenFlight(item)}
    ${actions(item ? "Save ride" : "Add ride")}
  </form>`;
}

function rideEditor(item) {
  if (!editing("transport", item.id)) return "";
  return rideForm(item);
}

function rideRow(item) {
  const editor = rideEditor(item);
  if (editor) return editor;
  const meta = [flightMeta(item), savedProvenance(item)].filter(Boolean).join(" · ");
  const name = transportSummary(item) || labelOf(MODES, item.mode);
  return `<div class="ride"><div><p class="kicker">${esc(labelOf(MODES, item.mode))}</p><p>${esc(transportSummary(item))}</p>${meta ? `<p class="meta">${esc(meta)}</p>` : ""}</div>${rowActions([
    flagBox("transport", item, "paid", "Paid"),
    iconButton("Edit", "ride", name, `data-action="edit" data-kind="transport" data-id="${item.id}" data-focus-key="edit-transport-${item.id}"`),
    iconButton("Delete", "ride", name, `data-action="delete" data-kind="transport" data-id="${item.id}"`),
  ])}</div>`;
}

function freeTime(item) {
  return item.kind === "other"
    && String(item.title || "").trim().toLowerCase() === "free time"
    && !item.place_name
    && !item.start_time
    && !item.notes;
}

function planDetails(item, scope) {
  return `<details class="ride-more"><summary>More details</summary><div class="form-grid">
      ${select("Kind", "kind", item?.kind || "activity", KINDS, { scope })}
      ${field("Start", "start_time", item?.start_time || "", "time", { scope })}
      ${field("End", "end_time", item?.end_time || "", "time", { scope })}
      ${field("Place", "place_name", item?.place_name || "", { scope })}
      ${field("Address", "address", item?.address || "", { wide: true, scope })}
      ${field("Latitude", "lat", item?.lat ?? "", { scope })}
      ${field("Longitude", "lng", item?.lng ?? "", { scope })}
      ${field("Link", "url", item?.url || "", "url", { scope })}
      ${field("Cost", "cost", item?.cost || "", { scope })}
      ${field("Currency", "currency", item?.currency || "USD", { scope })}
      ${check("Paid", "paid", Boolean(item?.paid))}
      ${area("Notes", "notes", item?.notes || "", { scope })}
    </div><button class="btn btn-secondary btn-sm" type="button" data-action="find-place">Find on map</button><div data-place-hits></div></details>`;
}

function planEditor(item) {
  if (!editing("plan", item.id)) return "";
  const focus = `edit-plan-${item.id}`;
  return `<form class="stack editor" data-form="plan" data-id="${esc(item.id)}">
      <label class="add-label" for="${focus}">Activity${requiredMark()}</label>
      ${textControl("title", item.title || "", { id: focus, required: true, focusKey: focus })}
      ${hid("on_date", item.on_date)}
      ${planDetails(item, `plan-${item.id}`)}
      ${actions("Save plan")}
    </form>`;
}

function planRow(item) {
  const editor = planEditor(item);
  if (editor) return editor;
  if (freeTime(item)) {
    return `<div class="plan"><div><p class="meta">Free time</p></div>${rowActions([
      iconButton("Edit", "plan", item.title, `data-action="edit" data-kind="plan" data-id="${item.id}" data-focus-key="edit-plan-${item.id}"`),
      iconButton("Delete", "plan", item.title, `data-action="delete" data-kind="plan" data-id="${item.id}"`),
    ])}</div>`;
  }
  return `<div class="plan"><div><p>${item.start_time ? `<strong>${esc(item.start_time)}</strong> · ` : ""}<span class="chip">${esc(labelOf(KINDS, item.kind))}</span> ${esc(item.title)}</p></div>${rowActions([
    flagBox("plan", item, "paid", "Paid"),
    iconButton("Edit", "plan", item.title, `data-action="edit" data-kind="plan" data-id="${item.id}" data-focus-key="edit-plan-${item.id}"`),
    iconButton("Delete", "plan", item.title, `data-action="delete" data-kind="plan" data-id="${item.id}"`),
  ])}</div>`;
}

function planAdd(day) {
  const focus = `add-plan-${day.on_date}`;
  const open = day.items.length
    ? ""
    : `<p class="meta">No plans yet. A quiet day is fine.</p><form data-form="plan" class="quiet-free">${hid("on_date", day.on_date)}${hid("kind", "other")}${hid("title", "Free time")}<button class="btn btn-ghost btn-sm" type="submit">Mark as free time</button></form>`;
  return `${open}<form class="add-row" data-form="plan">
      <label class="add-label" for="${focus}">Add activity${requiredMark()}</label>
      ${textControl("title", "", { id: focus, required: true, focusKey: focus })}
      <button class="btn btn-secondary btn-sm" type="submit">Add</button>
      <button class="btn btn-ghost btn-sm" type="button" data-action="cancel">Cancel</button>
      ${hid("on_date", day.on_date)}
      ${planDetails(null, `plan-${day.on_date}`)}
    </form>`;
}

function parkingForm(item) {
  const focus = item?.id ? `edit-parking-${item.id}` : "add-parking";
  const rides = state.trip?.transports || [];
  const tied = [["", "Not tied to one ride"], ...rides.map((ride) => [String(ride.id), transportSummary(ride) || labelOf(MODES, ride.mode)])];
  return `<form class="stack editor" data-form="parking"${item?.id ? ` data-id="${esc(item.id)}"` : ""}>
      <label class="add-label" for="${focus}">Parking${requiredMark()}</label>
      ${textControl("place_name", item?.place_name || "", { id: focus, required: true, focusKey: focus })}
      <details class="ride-more"><summary>More details</summary><div class="form-grid">
        ${select("Is parking necessary?", "necessary", item?.necessary || "yes", NECESSARY, { scope: focus })}
        ${select("How you'll handle it", "arrangement", item?.arrangement || "self_park", ARRANGEMENTS, { scope: focus })}
        ${select("Tied to", "transport_id", item?.transport_id ? String(item.transport_id) : "", tied, { scope: focus })}
        ${field("Address", "address", item?.address || "", { wide: true, scope: focus })}
        ${field("Latitude", "lat", item?.lat ?? "", { scope: focus })}
        ${field("Longitude", "lng", item?.lng ?? "", { scope: focus })}
        ${field("Confirmation", "confirmation", item?.confirmation || "", { scope: focus })}
        ${field("From", "start_at", localInput(item?.start_at), "datetime-local", { scope: focus })}
        ${field("Until", "end_at", localInput(item?.end_at), "datetime-local", { scope: focus })}
        ${field("Cost", "cost", item?.cost || "", { scope: focus })}
        ${field("Currency", "currency", item?.currency || "USD", { scope: focus })}
        ${check("Booked", "booked", Boolean(item?.booked))}
        ${check("Paid", "paid", Boolean(item?.paid))}
        ${area("Notes", "notes", item?.notes || "", { scope: focus })}
      </div><button class="btn btn-secondary btn-sm" type="button" data-action="find-place">Find on map</button><div data-place-hits></div></details>
      ${actions(item ? "Save parking" : "Add parking")}
    </form>`;
}

export function defaultPtoAmount(iso) {
  const day = new Date(`${iso}T00:00:00`).getDay();
  return day === 0 || day === 6 ? "0" : "1";
}

export function spanDates(start, end) {
  if (!start || !end || end < start) return [];
  const days = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    days.push(`${cursor.getFullYear()}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function datesOutside(start, end, dates) {
  if (!start || !end || end < start) return [...(dates || [])];
  return (dates || []).filter((day) => day < start || day > end);
}

function ptoChoiceLabel(day) {
  const amount = Number(day.amount);
  if (!amount) return "Not PTO";
  if (amount === 1) return "PTO";
  return `PTO ${day.amount}`;
}

function conflictCopy(trip) {
  const items = trip.pto?.conflicts || [];
  if (!items.length) return "";
  const text = items.map((item) => {
    const labels = [...(item.labels || [])];
    const index = labels.indexOf(trip.title);
    if (index >= 0) labels.splice(index, 1);
    const who = labels.join(", ") || "other time off";
    return `${prettyDate(item.on_date)} is also counted on ${who}.`;
  }).join(" ");
  return `<p class="meta">${esc(text)}</p>`;
}

function ptoActions() {
  return `<div class="row-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="pto-weekdays" data-focus-key="pto-weekdays">Select weekdays</button><button class="btn btn-ghost btn-sm" type="button" data-action="pto-clear" data-focus-key="pto-clear">Clear</button></div>`;
}

function ptoEditor(trip) {
  if (!trip.pto_mode && !trip.pto_dates) return "";
  const conflicts = conflictCopy(trip);
  if (trip.pto_mode === "legacy") {
    const total = daysText(trip.pto_days || trip.pto?.days || "");
    return `<section class="card" id="pto-days"><h2>PTO</h2><p>Custom total of ${esc(total)}, not assigned to dates.</p><p class="meta">Saturday and Sunday start as not PTO. Choosing days replaces this total.</p>${ptoActions()}${conflicts}</section>`;
  }
  const counted = daysText(trip.pto?.days || 0);
  const kept = !trip.counts_as_pto
    ? `<p class="meta">This trip is not counted as PTO. Day choices are kept${trip.pto_days_effective ? ` (${esc(daysText(trip.pto_days_effective))} saved)` : ""}.</p>`
    : `<p class="meta">Saturday and Sunday start as not PTO.</p>`;
  const rows = (trip.pto_dates || []).map((day) => {
    const on = Number(day.amount) > 0;
    return `<div class="ride"><div><p>${esc(prettyDate(day.on_date))}</p></div><button class="btn btn-ghost btn-sm" type="button" data-action="pto-day" data-date="${esc(day.on_date)}" data-on="${on ? "1" : "0"}" data-focus-key="pto-${esc(day.on_date)}" aria-pressed="${on ? "true" : "false"}">${esc(ptoChoiceLabel(day))}</button></div>`;
  }).join("");
  return `<section class="card" id="pto-days"><h2>PTO</h2>${kept}<p data-pto-total>Total ${esc(counted)}</p>${ptoActions()}${rows}${conflicts}</section>`;
}

function parkingEditor(item) {
  if (!item || !editing("parking", item.id)) return "";
  return parkingForm(item);
}

function parkingRow(item) {
  const name = item.place_name || "Parking";
  const editor = parkingEditor(item);
  if (editor) return editor;
  return `<div class="ride"><div>${parkingChip(item)}<p>${esc(name)}</p></div>${rowActions([
    flagBox("parking", item, "booked", "Booked"),
    flagBox("parking", item, "paid", "Paid"),
    iconButton("Edit", "parking", name, `data-action="edit" data-kind="parking" data-id="${item.id}" data-focus-key="edit-parking-${item.id}"`),
    iconButton("Delete", "parking", name, `data-action="delete" data-kind="parking" data-id="${item.id}"`),
  ])}</div>`;
}

export function renderTrip(trip, focusDay) {
  const editingTrip = editing("trip", trip.id);
  const savedPtoDates = (trip.pto_dates || []).map((day) => day.on_date);
  const tripForm = `<header class="page-head"><h1>Edit trip</h1></header><form class="stack" data-form="trip" data-id="${trip.id}" data-pto-dates="${esc(JSON.stringify(savedPtoDates))}"><div class="form-grid">
      ${field("Trip name", "title", trip.title, { required: true, wide: true, scope: `trip-${trip.id}`, focusKey: "edit-trip" })}
      ${field("Day you leave", "start_date", trip.start_date, { type: "date", scope: `trip-${trip.id}` })}
      ${field("Day you come back", "end_date", trip.end_date, { type: "date", min: trip.start_date, scope: `trip-${trip.id}` })}
      ${field("Leaving from", "origin_label", trip.origin_label || "", { scope: `trip-${trip.id}` })}
      ${select("Status", "status", trip.status, STATUSES, { scope: `trip-${trip.id}` })}
      ${check("Count as PTO", "counts_as_pto", trip.counts_as_pto, { scope: `trip-${trip.id}` })}
      <p class="field-help wide">Saturday and Sunday start as not PTO. Each day is chosen on the trip.</p>
      <p class="field-help wide" data-pto-removed hidden></p>
      ${area("Overview", "notes", trip.notes || "", { scope: `trip-${trip.id}`, maxlength: 8000 })}
    </div><p class="field-help" data-notes-count hidden></p>${actions("Save trip")}</form>`;
  const header = editingTrip
    ? tripForm
    : `<header class="page-head"><div class="page-head-row"><div><p class="kicker">${esc(labelOf(STATUSES, trip.status))} · ${esc(prettyRange(trip.start_date, trip.end_date))}</p><h1>${esc(trip.title)}</h1></div><div class="row-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="edit" data-kind="trip" data-id="${trip.id}" data-focus-key="edit-trip">Edit trip</button><button class="btn btn-ghost btn-sm btn-danger" type="button" data-action="delete" data-kind="trip" data-id="${trip.id}">Delete trip</button></div></div></header>`;
  const ptoLine = trip.counts_as_pto
    ? `<article class="metric${Number(trip.pto?.leftover_after) < 0 ? " metric--warn" : ""}"><b>${esc(daysText(trip.pto.days))}</b><span>PTO</span></article>`
    : "";
  const metrics = `<section class="metrics">
      <article class="metric"><b>${esc(spanText(trip.span_days))}</b><span>${esc(nightsAwayText(trip.nights))}</span></article>
      <article class="metric"><b>${esc(budgetText(trip.budget))}</b><span>Trip budget</span></article>
      ${ptoLine}
      <article class="metric"><b>${trip.cities.length || "—"}</b><span>${esc(trip.cities.join(" · ") || "No cities yet")}</span></article>
    </section>`;
  const cityHint = sectionHint("cities", { empty: !trip.stays.length });
  const cityAdd = addForm({
    kind: "stay",
    label: "Add a city",
    focusKey: "add-city",
    controls: textControl("city", "", { id: "add-city", placeholder: "City", required: true, focusKey: "add-city" }),
    hidden: `${hid("arrive_on", trip.start_date)}${hid("leave_on", trip.end_date)}`,
    required: true,
  });
  const cityBlock = `<section class="card"><h2>Cities</h2>${cityHint ? `<p class="meta">${esc(cityHint)}</p>` : ""}${trip.stays.map(cityRow).join("")}${cityAdd}</section>`;
  const groups = ROLES.map(([role, label]) => {
    const rows = trip.transports.filter((item) => item.role === role);
    if (!rows.length) return "";
    return `<section class="section"><h3>${esc(label)}</h3>${rows.map(rideRow).join("")}</section>`;
  }).join("");
  const transportEditor = composing("transport") ? rideForm(null) : `<button class="btn btn-ghost btn-sm" type="button" data-action="compose" data-compose="transport" data-role="outbound" data-focus-key="add-transport">Add transport</button>`;
  const selected = chosenDay(focusDay);
  const quietDays = trip.days.filter((day) => !day.items.length && !day.transports.length).length;
  const quietLine = quietDays ? `<p class="meta quiet-days">${quietDays === 1 ? "1 quiet day" : `${quietDays} quiet days`}</p>` : "";
  const activityDate = (trip.days.find((day) => !day.items.length) || trip.days[0] || {}).on_date || "";
  const strip = trip.days.map((day) => {
    const on = day.on_date === selected;
    return `<button type="button" class="date-chip${on ? " is-selected" : ""}${day.items.length ? " has-plan" : ""}" data-action="compose" data-compose="plan" data-date="${esc(day.on_date)}" data-focus-key="day-${esc(day.on_date)}"${on ? ` aria-current="date"` : ""}>${esc(prettyDate(day.on_date))}</button>`;
  }).join("");
  const days = trip.days
    .filter((day) => day.on_date === selected || day.items.length || day.transports.length)
    .map((day) => {
      const focused = day.on_date === selected ? " data-focus" : "";
      const heading = day.on_date === selected ? ` tabindex="-1" data-day-heading` : "";
      const moves = day.transports.map((item) => `<p>${esc(item.movement === "arrives" ? "Arrives" : item.movement === "both" ? "Departs and arrives" : "Departs")} · ${esc(transportSummary(item))}</p>`).join("");
      const items = day.items.map(planRow).join("");
      const adder = day.on_date === selected ? planAdd(day) : "";
      const here = trip.stays.find((stay) => stay.city === day.city && stay.lat != null);
      const pin = here ? ` data-map-lat="${here.lat}" data-map-lng="${here.lng}"` : "";
      return `<div class="day" id="day-${day.on_date}"${focused}${pin}><div class="day-date"${heading}>${esc(prettyDate(day.on_date))}${day.city ? `<br>${esc(day.city)}` : ""}</div><div>${moves}${items}${adder}</div></div>`;
    })
    .join("");
  const outside = trip.outside_plans.length
    ? `<div class="section"><h3>Outside the trip dates</h3>${trip.outside_plans.map((item) => planRow(item)).join("")}</div>`
    : "";
  const derived = (trip.budget.lines || []).filter((line) => line.source !== "manual");
  const budgetLines = derived
    .map((line) => `<div class="ride ride--muted"><div><p>${esc(line.label)}</p><p class="meta">${esc(line.category_label || line.category || "")}</p></div><strong class="money">${esc(money(line.amount, line.currency))}</strong></div>`)
    .join("");
  const manual = (trip.budget.manual || [])
    .map((line) => `<div class="ride"><div><p>${esc(line.label)}</p></div><div class="row-actions"><strong class="money">${esc(money(line.amount, line.currency))}</strong>${iconButton("Delete", "cost", line.label, `data-action="delete" data-kind="budget" data-id="${line.id}"`)}</div></div>`)
    .join("");
  const totals = (trip.budget.currencies || [])
    .map((item) => `<p class="meta">Total ${esc(money(item.total, item.currency))}</p>`)
    .join("");
  const budgetForm = composing("budget")
    ? `<form class="add-row is-pair" data-form="budget"><label class="add-label" for="add-cost">Cost${requiredMark()}</label>${textControl("label", "", { id: "add-cost", placeholder: "Cost", required: true, focusKey: "add-cost" })}<label class="add-label" for="add-cost-amount">Amount${requiredMark()}</label>${textControl("amount", "", { id: "add-cost-amount", placeholder: "0.00", required: true, inputmode: "decimal" })}<label class="add-label" for="add-cost-currency">Currency</label>${textControl("currency", "USD", { id: "add-cost-currency" })}<button class="btn btn-secondary btn-sm" type="submit">Add</button><button class="btn btn-ghost btn-sm" type="button" data-action="cancel">Cancel</button><input type="hidden" name="category" value="other"></form>`
    : "";
  const notes = trip.note_entries
    .map((note) => `<div class="ride"><div><p>${esc(note.body)}</p></div>${iconButton("Delete", "note", note.body, `data-action="delete" data-kind="note" data-id="${note.id}"`)}</div>`)
    .join("");
  const noteForm = composing("note")
    ? addForm({
      kind: "note",
      label: "Add a note",
      focusKey: "add-note",
      controls: textControl("body", "", { id: "add-note", placeholder: "Note", required: true, focusKey: "add-note" }),
      cancel: true,
      required: true,
    })
    : "";
  const reminders = trip.reminders
    .map((item) => `<div class="ride"><label class="check reminder${item.done ? " is-done" : ""}"><input type="checkbox" data-save-flag="done" data-kind="reminder" data-id="${item.id}" data-focus-key="flag-reminder-${item.id}-done" ${item.done ? " checked" : ""}> <span>${esc(item.title)}${item.done ? " ✓" : ""}</span></label>${iconButton("Delete", "reminder", item.title, `data-action="delete" data-kind="reminder" data-id="${item.id}"`)}</div>`)
    .join("");
  const reminderKind = DECISIONS.showPackingKind
    ? `<label class="add-label" for="reminder-kind">Kind</label><select id="reminder-kind" name="kind"><option value="general">General</option><option value="packing">Packing</option></select>`
    : `<input type="hidden" name="kind" value="general">`;
  const reminderForm = composing("reminder")
    ? `<form class="add-row" data-form="reminder"><label class="add-label" for="add-reminder">Add a reminder${requiredMark()}</label>${textControl("title", "", { id: "add-reminder", placeholder: "Reminder", required: true, focusKey: "add-reminder" })}<button class="btn btn-secondary btn-sm" type="submit">Add</button><button class="btn btn-ghost btn-sm" type="button" data-action="cancel">Cancel</button>${reminderKind}</form>`
    : "";
  const parkingBlock = optionalSection("Parking", trip.parking.length || composing("parking"), trip.parking.map(parkingRow).join(""), composing("parking") ? parkingForm(null) : "", "parking", "Add parking", "add-parking");
  const budgetBlock = optionalSection("Budget", derived.length || (trip.budget.manual || []).length || composing("budget"), `${budgetLines}${manual}${totals}`, budgetForm, "budget", "Add cost", "add-cost");
  const noteBlock = optionalSection("Notes", trip.note_entries.length || composing("note"), notes, noteForm, "note", "Add note", "add-note");
  const reminderBlock = optionalSection("Reminders", trip.reminders.length || composing("reminder"), reminders, reminderForm, "reminder", "Add reminder", "add-reminder");
  const menu = [
    ["parking", trip.parking.length, "Add parking", "add-parking"],
    ["budget", derived.length || (trip.budget.manual || []).length, "Add cost", "add-cost"],
    ["note", trip.note_entries.length, "Add note", "add-note"],
    ["reminder", trip.reminders.length, "Add reminder", "add-reminder"],
  ].filter(([kind, filled]) => !filled && !composing(kind))
    .map(([kind, , label, key]) => `<button class="btn btn-ghost btn-sm" type="button" data-action="compose" data-compose="${kind}" data-focus-key="${key}">${label}</button>`)
    .join("");
  const points = collectPoints(trip);
  const places = points.map((point, index) => {
    const stay = point.kind === "City" ? trip.stays.find((item) => item.city === point.label) : null;
    const when = stay ? ` · ${prettyRange(stay.arrive_on, stay.leave_on)}` : "";
    return `<li><span>${index + 1} ${esc(point.label)}${esc(when)}</span> <button type="button" class="btn btn-ghost btn-sm" data-action="show-on-map" data-lat="${point.lat}" data-lng="${point.lng}">Show ${esc(point.label)} on map</button></li>`;
  }).join("");
  const mapCard = points.length ? `<aside class="card map-card"><details class="map-fold"><summary>Show map</summary><div id="map" class="map" role="region" aria-label="Trip map"></div><p class="meta" data-tile-error hidden>Map tiles couldn't load.</p></details><ol class="places">${places}</ol></aside>` : "";
  const addMenu = menu ? `<div class="add-menu">${menu}</div>` : "";
  const ptoCard = editingTrip ? "" : ptoEditor(trip);
  return `${banner()}${header}${metrics}${ptoCard}<div class="split"><div>
      ${cityBlock}
      <section class="card"><h2>Getting there</h2>${groups}${transportEditor}</section>
      <section class="card"><div class="card-head"><h2>Days</h2><button class="btn btn-ghost btn-sm" type="button" data-action="compose" data-compose="plan" data-date="${esc(activityDate)}">Add activity</button></div><div class="date-strip">${strip}</div>${quietLine}${days}${outside}</section>
      ${parkingBlock}
      ${budgetBlock}
      ${noteBlock}
      ${reminderBlock}
      ${addMenu}
    </div>${mapCard}</div>`;
}

export function collectPoints(trip) {
  const points = [];
  trip.stays.forEach((stay, index) => {
    if (stay.lat != null && stay.lng != null) {
      points.push({ lat: stay.lat, lng: stay.lng, label: stay.city, kind: "City", order: index });
    }
  });
  trip.days.forEach((day) => day.items.forEach((item) => {
    if (item.lat != null && item.lng != null) {
      points.push({ lat: item.lat, lng: item.lng, label: item.title, kind: labelOf(KINDS, item.kind), order: 0 });
    }
  }));
  trip.parking.forEach((item) => {
    if (item.lat != null && item.lng != null) {
      points.push({ lat: item.lat, lng: item.lng, label: item.place_name || "Parking", kind: "Parking", order: 0 });
    }
  });
  return points;
}
const CITY_COLORS = ["var(--city-1)", "var(--city-2)", "var(--city-3)", "var(--city-4)", "var(--city-5)"];

export function mountMap() {
  const element = document.querySelector("#map");
  if (!element) return;
  const points = state.trip ? collectPoints(state.trip) : [];
  if (!points.length || !window.L) return;
  if (window._travelMap) {
    window._travelMap.remove();
    window._travelMap = null;
  }
  const map = window.L.map(element, { scrollWheelZoom: false });
  const tiles = window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  let loaded = false;
  tiles.on("tileload", () => { loaded = true; });
  tiles.on("tileerror", () => {
    window.setTimeout(() => {
      if (loaded) return;
      const note = document.querySelector("[data-tile-error]");
      if (note) note.hidden = false;
    }, 5000);
  });
  const route = points.filter((point) => point.kind === "City");
  if (route.length > 1) {
    const probe = document.createElement("span");
    probe.style.color = "var(--city-1)";
    document.body.append(probe);
    const line = getComputedStyle(probe).color;
    probe.remove();
    window.L.polyline(route.map((point) => [point.lat, point.lng]), {
      color: line,
      weight: 3,
      opacity: 0.85,
    }).addTo(map);
  }
  const markers = points.map((point) => {
    const named = point.kind === "City" ? `City: ${point.label}` : `${point.kind}: ${point.label}`;
    const color = CITY_COLORS[(point.order || 0) % CITY_COLORS.length];
    const number = point.kind === "City" ? String((point.order || 0) + 1) : "";
    const icon = window.L.divIcon({
      className: "map-pin",
      html: `<span class="map-pin-dot" style="background:${color}">${esc(number)}</span>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    return window.L.marker([point.lat, point.lng], { icon, title: named, alt: named, keyboard: true }).bindPopup(`<strong>${esc(point.label)}</strong>`);
  });
  window._travelMarkers = markers;
  const group = window.L.featureGroup(markers).addTo(map);
  if (points.length === 1) map.setView([points[0].lat, points[0].lng], 11);
  else map.fitBounds(group.getBounds().pad(0.35));
  window._travelMap = map;
  element.setAttribute("role", "region");
  element.setAttribute("aria-label", "Trip map");
  const fold = element.closest("details");
  fold?.addEventListener("toggle", () => map.invalidateSize());
  const narrow = window.matchMedia?.("(max-width: 767px)").matches;
  if (fold) fold.open = !(DECISIONS.mapCollapsedNarrow && narrow);
  setTimeout(() => map.invalidateSize(), 0);
}
