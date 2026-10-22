import { state, ROLES, MODES, KINDS, STATUSES } from '../state.mjs';
import { DECISIONS } from '../decisions.mjs';
import { esc, banner, field, area, select, check, actions, labelOf, prettyRange, prettyDate, money, daysText, budgetText, transportSummary, flightMeta, parkingChip, localInput, spanText, nightsAwayText } from '../helpers.mjs';
import { actionName, sectionHint } from '../copy.mjs';
import { stayForm, transportForm, planForm, parkingForm } from './new-trip.mjs';

export function editing(kind, id) {
  return state.edit && state.edit.kind === kind && String(state.edit.id) === String(id);
}

function detailsOpen(kind, id) {
  return DECISIONS.moreDetails && state.details && state.details.kind === kind && String(state.details.id) === String(id);
}

function hid(name, value) {
  return `<input type="hidden" name="${name}" value="${esc(value ?? "")}">`;
}

function moreButton(kind, id) {
  if (!DECISIONS.moreDetails) return "";
  return `<button class="btn btn-ghost btn-sm" type="button" data-action="more-details" data-kind="${esc(kind)}" data-id="${esc(id)}">More details</button>`;
}

function iconButton(verb, noun, label, attrs) {
  const danger = verb === "Delete" ? " btn-danger" : "";
  return `<button class="btn btn-ghost btn-sm${danger}" type="button" ${attrs}>${esc(actionName(verb, noun, label))}</button>`;
}

function flagBox(kind, item, flag, text) {
  const on = Boolean(item[flag]);
  return `<label class="check"><input type="checkbox" data-save-flag="${esc(flag)}" data-kind="${esc(kind)}" data-id="${esc(item.id)}" data-focus-key="flag-${kind}-${item.id}-${flag}"${on ? " checked" : ""}> <span>${esc(text)}</span></label>`;
}

function addForm({ kind, id = "", label, focusKey, controls, hidden = "", pair = false, submitLabel = "Add" }) {
  return `<form class="add-row${pair ? " is-pair" : ""}" data-form="${esc(kind)}"${id !== "" && id != null ? ` data-id="${esc(id)}"` : ""}>
    <label class="add-label" for="${esc(focusKey)}">${esc(label)}</label>
    ${controls}
    <button class="btn btn-secondary btn-sm" type="submit">${esc(submitLabel)}</button>
    ${moreButton(kind, id || "")}
    ${id !== "" && id != null ? `<button class="btn btn-ghost btn-sm" type="button" data-action="cancel" data-focus-key="edit-${kind}-${id}">Cancel</button>` : ""}
    ${hidden}
  </form>`;
}

function textControl(name, value, { id, placeholder = "", required = false, inputmode = "" } = {}) {
  return `<input id="${esc(id)}" name="${esc(name)}" value="${esc(value ?? "")}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ""} autocomplete="off"${required ? ` required aria-required="true"` : ""}${inputmode ? ` inputmode="${esc(inputmode)}"` : ""}>`;
}

function cityEditor(stay, trip) {
  if (detailsOpen("stay", stay ? stay.id : "")) return stayForm(stay || { arrive_on: trip.start_date, leave_on: trip.end_date });
  if (stay && editing("stay", stay.id)) {
    return addForm({
      kind: "stay",
      id: stay.id,
      label: "City",
      focusKey: `edit-stay-${stay.id}`,
      submitLabel: "Save",
      controls: textControl("city", stay.city, { id: `edit-stay-${stay.id}`, required: true }),
      hidden: `${hid("region", stay.region)}${hid("country", stay.country)}${hid("arrive_on", stay.arrive_on)}${hid("leave_on", stay.leave_on)}${hid("lodging_name", stay.lodging_name)}${hid("lodging_address", stay.lodging_address)}${hid("lat", stay.lat)}${hid("lng", stay.lng)}${hid("notes", stay.notes)}`,
    });
  }
  return "";
}

function cityRow(stay) {
  const open = cityEditor(stay);
  if (open && (editing("stay", stay.id) || detailsOpen("stay", stay.id))) return open;
  return `<div class="ride"${stay.lat != null ? ` data-map-lat="${stay.lat}" data-map-lng="${stay.lng}"` : ""}><div><strong>${esc(stay.city)}</strong><p class="meta">${esc(prettyRange(stay.arrive_on, stay.leave_on))}${stay.lodging_name ? ` · ${esc(stay.lodging_name)}` : ""}</p></div><div class="row-actions">${iconButton("Edit", "city", stay.city, `data-action="edit" data-kind="stay" data-id="${stay.id}" data-focus-key="edit-stay-${stay.id}"`)}${iconButton("Delete", "city", stay.city, `data-action="delete" data-kind="stay" data-id="${stay.id}"`)}</div></div>`;
}

function rideEditor(item) {
  if (detailsOpen("transport", item.id)) return transportForm(item, item.role);
  if (!editing("transport", item.id)) return "";
  const extras = ["carrier", "number", "confirmation", "seat", "cost", "currency", "notes", "depart_tz", "arrive_tz", "fa_ident", "fa_status", "fa_aircraft", "fa_gate_origin", "fa_gate_destination", "fa_terminal_origin", "fa_terminal_destination", "fa_baggage_claim", "fa_delay_departure_seconds", "fa_delay_arrival_seconds", "fa_scheduled_out", "fa_estimated_out", "fa_actual_out", "fa_scheduled_in", "fa_estimated_in", "fa_actual_in"]
    .map((name) => hid(name, item[name])).join("");
  return addForm({
    kind: "transport",
    id: item.id,
    label: "From",
    focusKey: `edit-transport-${item.id}`,
    pair: true,
    submitLabel: "Save",
    controls: `${textControl("depart_place", item.depart_place || "", { id: `edit-transport-${item.id}`, required: true })}${textControl("arrive_place", item.arrive_place || "", { id: `edit-transport-${item.id}-to`, placeholder: "To" })}`,
    hidden: `${hid("role", item.role)}${hid("mode", item.mode)}${hid("status", item.status || "planned")}${hid("depart_at", localInput(item.depart_at))}${hid("arrive_at", localInput(item.arrive_at))}${hid("paid", "")}<input type="checkbox" name="paid"${item.paid ? " checked" : ""} hidden>${extras}`,
  });
}

function rideRow(item) {
  const editor = rideEditor(item);
  if (editor) return editor;
  const meta = flightMeta(item);
  const name = transportSummary(item) || labelOf(MODES, item.mode);
  return `<div class="ride"><div><p class="kicker">${esc(labelOf(MODES, item.mode))}</p><p>${esc(transportSummary(item))}</p>${meta ? `<p class="meta">${esc(meta)}</p>` : ""}</div><div class="row-actions">${flagBox("transport", item, "paid", "Paid")}${iconButton("Edit", "ride", name, `data-action="edit" data-kind="transport" data-id="${item.id}" data-focus-key="edit-transport-${item.id}"`)}${iconButton("Delete", "ride", name, `data-action="delete" data-kind="transport" data-id="${item.id}"`)}</div></div>`;
}

function modeControl(role) {
  if (DECISIONS.moreDetails) return `<input type="hidden" name="mode" value="flight">`;
  const options = MODES.map(([key, text]) => `<option value="${esc(key)}">${esc(text)}</option>`).join("");
  return `<label class="add-label" for="mode-${esc(role)}">Mode</label><select id="mode-${esc(role)}" name="mode">${options}</select>`;
}

function rideAdd(role) {
  if (detailsOpen("transport", `add-${role}`)) {
    return transportForm(null, role);
  }
  const focus = `add-transport-${role}`;
  return `<form class="add-row is-pair" data-form="transport">
    <label class="add-label" for="${focus}">Add a ride</label>
    ${textControl("depart_place", "", { id: focus, placeholder: "From", required: true })}
    ${textControl("arrive_place", "", { id: `${focus}-to`, placeholder: "To" })}
    ${modeControl(role)}
    <button class="btn btn-secondary btn-sm" type="submit">Add</button>
    ${moreButton("transport", `add-${role}`)}
    <input type="hidden" name="role" value="${esc(role)}"><input type="hidden" name="status" value="planned">
  </form>`;
}

function planEditor(item) {
  if (detailsOpen("plan", item.id)) return planForm(item, item.on_date);
  if (!editing("plan", item.id)) return "";
  return addForm({
    kind: "plan",
    id: item.id,
    label: "Plan",
    focusKey: `edit-plan-${item.id}`,
    submitLabel: "Save",
    controls: textControl("title", item.title || "", { id: `edit-plan-${item.id}`, required: true }),
    hidden: `${hid("on_date", item.on_date)}${hid("start_time", item.start_time)}${hid("end_time", item.end_time)}${hid("kind", item.kind || "activity")}${hid("place_name", item.place_name)}${hid("address", item.address)}${hid("lat", item.lat)}${hid("lng", item.lng)}${hid("url", item.url)}${hid("cost", item.cost)}${hid("currency", item.currency || "USD")}${hid("notes", item.notes)}<input type="checkbox" name="paid"${item.paid ? " checked" : ""} hidden>`,
  });
}

function planRow(item) {
  const editor = planEditor(item);
  if (editor) return editor;
  return `<div class="plan"><div><p>${item.start_time ? `<strong>${esc(item.start_time)}</strong> · ` : ""}<span class="chip">${esc(labelOf(KINDS, item.kind))}</span> ${esc(item.title)}</p></div><div class="row-actions">${flagBox("plan", item, "paid", "Paid")}${iconButton("Edit", "plan", item.title, `data-action="edit" data-kind="plan" data-id="${item.id}" data-focus-key="edit-plan-${item.id}"`)}${iconButton("Delete", "plan", item.title, `data-action="delete" data-kind="plan" data-id="${item.id}"`)}</div></div>`;
}

function parkingEditor(item) {
  if (detailsOpen("parking", item ? item.id : "")) return parkingForm(item, state.trip?.transports || []);
  if (!item || !editing("parking", item.id)) return "";
  return addForm({
    kind: "parking",
    id: item.id,
    label: "Parking",
    focusKey: `edit-parking-${item.id}`,
    submitLabel: "Save",
    controls: textControl("place_name", item.place_name || "", { id: `edit-parking-${item.id}`, required: true }),
    hidden: `${hid("necessary", item.necessary || "yes")}${hid("arrangement", item.arrangement || "self_park")}${hid("transport_id", item.transport_id || "")}${hid("address", item.address)}${hid("lat", item.lat)}${hid("lng", item.lng)}${hid("confirmation", item.confirmation)}${hid("start_at", localInput(item.start_at))}${hid("end_at", localInput(item.end_at))}${hid("cost", item.cost)}${hid("currency", item.currency || "USD")}${hid("notes", item.notes)}<input type="checkbox" name="booked"${item.booked ? " checked" : ""} hidden><input type="checkbox" name="paid"${item.paid ? " checked" : ""} hidden>`,
  });
}

function parkingRow(item) {
  const name = item.place_name || "Parking";
  const editor = parkingEditor(item);
  if (editor) return editor;
  return `<div class="ride"><div>${parkingChip(item)}<p>${esc(name)}</p></div><div class="row-actions">${flagBox("parking", item, "booked", "Booked")}${flagBox("parking", item, "paid", "Paid")}${iconButton("Edit", "parking", name, `data-action="edit" data-kind="parking" data-id="${item.id}" data-focus-key="edit-parking-${item.id}"`)}${iconButton("Delete", "parking", name, `data-action="delete" data-kind="parking" data-id="${item.id}"`)}</div></div>`;
}

export function renderTrip(trip, focusDay) {
  const editingTrip = editing("trip", trip.id);
  const tripForm = `<header class="page-head"><h1>Edit trip</h1></header><form class="stack" data-form="trip" data-id="${trip.id}"><div class="form-grid">
      ${field("Trip name", "title", trip.title, { required: true, wide: true, scope: `trip-${trip.id}` })}
      ${field("Day you leave", "start_date", trip.start_date, { type: "date", scope: `trip-${trip.id}` })}
      ${field("Day you come back", "end_date", trip.end_date, { type: "date", min: trip.start_date, scope: `trip-${trip.id}` })}
      ${field("Leaving from", "origin_label", trip.origin_label || "", { scope: `trip-${trip.id}` })}
      ${select("Status", "status", trip.status, STATUSES, { scope: `trip-${trip.id}` })}
      ${check("Count as PTO", "counts_as_pto", trip.counts_as_pto, { scope: `trip-${trip.id}` })}
      ${field("PTO days", "pto_days", trip.pto_days || "", { wide: true, scope: `trip-${trip.id}`, inputmode: "decimal", helper: "Leave blank to count weekdays automatically." })}
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
  const cityAdd = detailsOpen("stay", "")
    ? stayForm({ arrive_on: trip.start_date, leave_on: trip.end_date })
    : addForm({
      kind: "stay",
      label: "Add a city",
      focusKey: "add-city",
      controls: textControl("city", "", { id: "add-city", placeholder: "City", required: true }),
      hidden: `${hid("arrive_on", trip.start_date)}${hid("leave_on", trip.end_date)}`,
    });
  const cityBlock = `<section class="card"><h2>Cities</h2>${cityHint ? `<p class="meta">${esc(cityHint)}</p>` : ""}${trip.stays.map(cityRow).join("")}${cityAdd}</section>`;
  const groups = ROLES.map(([role, label]) => {
    const rows = trip.transports.filter((item) => item.role === role);
    const hint = sectionHint("role", { empty: !rows.length, roleLabel: label });
    return `<section class="section"><h3>${esc(label)}</h3>${hint ? `<p class="meta">${esc(hint)}</p>` : ""}${rows.map(rideRow).join("")}${rideAdd(role)}</section>`;
  }).join("");
  const transportHint = sectionHint("transport", { empty: !trip.transports.length });
  const days = trip.days
    .map((day) => {
      const focused = focusDay === day.on_date ? " data-focus" : "";
      const heading = focusDay === day.on_date ? ` tabindex="-1" data-day-heading` : "";
      const moves = day.transports.map((item) => `<p>${esc(item.movement === "arrives" ? "Arrives" : item.movement === "both" ? "Departs and arrives" : "Departs")} · ${esc(transportSummary(item))}</p>`).join("");
      const items = day.items.map(planRow).join("");
      const focus = `add-plan-${day.on_date}`;
      const adder = detailsOpen("plan", day.on_date)
        ? planForm(null, day.on_date)
        : `<form class="add-row" data-form="plan"><label class="add-label" for="${focus}">Add a plan for ${esc(prettyDate(day.on_date))}</label>${textControl("title", "", { id: focus, placeholder: day.city || prettyDate(day.on_date), required: true })}<button class="btn btn-secondary btn-sm" type="submit">Add</button>${moreButton("plan", day.on_date)}<input type="hidden" name="on_date" value="${esc(day.on_date)}"><input type="hidden" name="kind" value="activity"></form>`;
      const here = trip.stays.find((stay) => stay.city === day.city && stay.lat != null);
      const pin = here ? ` data-map-lat="${here.lat}" data-map-lng="${here.lng}"` : "";
      return `<div class="day" id="day-${day.on_date}"${focused}${pin}><div class="day-date"${heading}>${esc(prettyDate(day.on_date))}${day.city ? `<br>${esc(day.city)}` : ""}</div><div>${moves}${items}${adder}</div></div>`;
    })
    .join("");
  const outside = trip.outside_plans.length
    ? `<div class="section"><h3>Outside the trip dates</h3>${trip.outside_plans.map((item) => planRow(item)).join("")}</div>`
    : "";
  const parkingHint = sectionHint("parking", { empty: !trip.parking.length });
  const parkingAdd = detailsOpen("parking", "")
    ? parkingForm(null, trip.transports || [])
    : addForm({
      kind: "parking",
      label: "Add parking",
      focusKey: "add-parking",
      controls: textControl("place_name", "", { id: "add-parking", placeholder: "Parking", required: true }),
      hidden: `${hid("necessary", "yes")}${hid("arrangement", "self_park")}`,
    });
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
  const budgetHint = sectionHint("budget", { empty: !derived.length && !(trip.budget.manual || []).length });
  const budgetForm = `<form class="add-row is-pair" data-form="budget"><label class="add-label" for="add-cost">Add a cost</label>${textControl("label", "", { id: "add-cost", placeholder: "Cost", required: true })}${textControl("amount", "", { id: "add-cost-amount", placeholder: "0.00", required: true, inputmode: "decimal" })}<button class="btn btn-secondary btn-sm" type="submit">Add</button><input type="hidden" name="category" value="other"></form>`;
  const notes = trip.note_entries
    .map((note) => `<div class="ride"><div><p>${esc(note.body)}</p></div>${iconButton("Delete", "note", note.body, `data-action="delete" data-kind="note" data-id="${note.id}"`)}</div>`)
    .join("");
  const noteForm = addForm({
    kind: "note",
    label: "Add a note",
    focusKey: "add-note",
    controls: textControl("body", "", { id: "add-note", placeholder: "Note", required: true }),
  });
  const reminders = trip.reminders
    .map((item) => `<div class="ride"><label class="check reminder${item.done ? " is-done" : ""}"><input type="checkbox" data-save-flag="done" data-kind="reminder" data-id="${item.id}" data-focus-key="flag-reminder-${item.id}-done" aria-pressed="${item.done ? "true" : "false"}"${item.done ? " checked" : ""}> <span>${esc(item.title)}${item.done ? " ✓" : ""}</span></label>${iconButton("Delete", "reminder", item.title, `data-action="delete" data-kind="reminder" data-id="${item.id}"`)}</div>`)
    .join("");
  const reminderKind = DECISIONS.showPackingKind
    ? `<label class="add-label" for="reminder-kind">Kind</label><select id="reminder-kind" name="kind"><option value="general">General</option><option value="packing">Packing</option></select>`
    : `<input type="hidden" name="kind" value="general">`;
  const reminderForm = `<form class="add-row" data-form="reminder"><label class="add-label" for="add-reminder">Add a reminder</label>${textControl("title", "", { id: "add-reminder", placeholder: "Reminder", required: true })}<button class="btn btn-secondary btn-sm" type="submit">Add</button>${reminderKind}</form>`;
  const points = collectPoints(trip);
  const mapCard = points.length ? `<aside class="card map-card"><div id="map" class="map" role="region" aria-label="Trip map"></div></aside>` : "";
  return `${banner()}${header}${metrics}<div class="split"><div>
      ${cityBlock}
      <section class="card"><h2>Getting there</h2>${transportHint ? `<p class="meta">${esc(transportHint)}</p>` : ""}${groups}</section>
      <section class="card"><div class="card-head"><h2>Days</h2></div>${days}${outside}</section>
      <section class="card"><h2>Parking</h2>${parkingHint ? `<p class="meta">${esc(parkingHint)}</p>` : ""}${trip.parking.map(parkingRow).join("")}${parkingAdd}</section>
      <section class="card"><h2>Budget</h2>${budgetHint ? `<p class="meta">${esc(budgetHint)}</p>` : ""}${budgetLines}${manual}${totals}${budgetForm}</section>
      <section class="card"><h2>Notes</h2>${notes}${noteForm}</section>
      <section class="card"><h2>Reminders</h2>${reminders}${reminderForm}</section>
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
    window.L.polyline(route.map((point) => [point.lat, point.lng]), {
      color: "var(--city-1)",
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
  setTimeout(() => map.invalidateSize(), 0);
}
