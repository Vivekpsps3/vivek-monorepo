import { state, ROLES, MODES, KINDS, STATUSES } from '../state.mjs';
import { esc, banner, field, area, select, check, actions, labelOf, prettyRange, prettyDate, prettyWhen, money, daysText, budgetText, transportSummary, flightMeta, parkingChip, localInput, spanText, nightsAwayText } from '../helpers.mjs';

export function editing(kind, id) {
  return state.edit && state.edit.kind === kind && state.edit.id === id;
}

function hid(name, value) {
  return `<input type="hidden" name="${name}" value="${esc(value ?? "")}">`;
}

function cityLine(stay) {
  return `<form class="day-add" data-form="stay" data-id="${stay.id}">${hid("region", stay.region)}${hid("country", stay.country)}${hid("arrive_on", stay.arrive_on)}${hid("leave_on", stay.leave_on)}${hid("lodging_name", stay.lodging_name)}${hid("lodging_address", stay.lodging_address)}${hid("notes", stay.notes)}<input name="city" value="${esc(stay.city)}" aria-label="City" required autocomplete="off"><button type="submit" hidden>Save</button></form>`;
}

function planLine(item) {
  return `<form class="day-add" data-form="plan" data-id="${item.id}">${hid("on_date", item.on_date)}${hid("start_time", item.start_time)}${hid("end_time", item.end_time)}${hid("kind", item.kind || "activity")}${hid("place_name", item.place_name)}${hid("address", item.address)}${hid("url", item.url)}${hid("cost", item.cost)}${hid("currency", item.currency || "USD")}${hid("notes", item.notes)}<input type="checkbox" name="paid"${item.paid ? " checked" : ""} hidden><input name="title" value="${esc(item.title || "")}" aria-label="Plan" required autocomplete="off"><button type="submit" hidden>Save</button></form>`;
}

function parkingLine(item) {
  return `<form class="day-add" data-form="parking" data-id="${item.id}">${hid("necessary", item.necessary || "yes")}${hid("arrangement", item.arrangement || "self_park")}${hid("transport_id", item.transport_id || "")}${hid("address", item.address)}${hid("confirmation", item.confirmation)}${hid("start_at", localInput(item.start_at))}${hid("end_at", localInput(item.end_at))}${hid("cost", item.cost)}${hid("currency", item.currency || "USD")}${hid("notes", item.notes)}<input type="checkbox" name="booked"${item.booked ? " checked" : ""} hidden><input type="checkbox" name="paid"${item.paid ? " checked" : ""} hidden><input name="place_name" value="${esc(item.place_name || "")}" aria-label="Parking" required autocomplete="off"><button type="submit" hidden>Save</button></form>`;
}

function rideLine(item) {
  const extras = ["carrier", "number", "confirmation", "seat", "cost", "currency", "notes", "depart_tz", "arrive_tz", "fa_ident", "fa_status", "fa_aircraft", "fa_gate_origin", "fa_gate_destination", "fa_terminal_origin", "fa_terminal_destination", "fa_baggage_claim", "fa_delay_departure_seconds", "fa_delay_arrival_seconds", "fa_scheduled_out", "fa_estimated_out", "fa_actual_out", "fa_scheduled_in", "fa_estimated_in", "fa_actual_in"]
    .map((name) => hid(name, item[name])).join("");
  return `<form class="day-add" data-form="transport" data-id="${item.id}">${hid("role", item.role)}${hid("mode", item.mode)}${hid("status", item.status || "planned")}${hid("depart_at", localInput(item.depart_at))}${hid("arrive_at", localInput(item.arrive_at))}<input type="checkbox" name="paid"${item.paid ? " checked" : ""} hidden>${extras}<input name="depart_place" value="${esc(item.depart_place || "")}" aria-label="From" required autocomplete="off"><input name="arrive_place" value="${esc(item.arrive_place || "")}" aria-label="To" autocomplete="off"><button type="submit" hidden>Save</button></form>`;
}
export function renderTrip(trip, focusDay) {
  const editingTrip = editing("trip", trip.id);
  const tripForm = `<form class="stack" data-form="trip" data-id="${trip.id}"><div class="form-grid">
      ${field("Trip name", "title", trip.title, "text", true)}
      ${field("Day you leave", "start_date", trip.start_date, "date")}
      ${field("Day you come back", "end_date", trip.end_date, "date")}
      ${field("Leaving from", "origin_label", trip.origin_label || "")}
      ${select("Status", "status", trip.status, STATUSES)}
      ${check("Count as PTO", "counts_as_pto", trip.counts_as_pto)}
      ${field("PTO days override", "pto_days", trip.pto_days || "", "text", true)}
      ${area("Overview", "notes", trip.notes || "")}
    </div>${actions("Save trip")}</form>`;
  const header = editingTrip
    ? tripForm
    : `<header class="page-head"><div class="page-head-row"><div><p class="kicker">${esc(labelOf(STATUSES, trip.status))} · ${esc(prettyRange(trip.start_date, trip.end_date))}</p><h1>${esc(trip.title)}</h1></div><div class="row-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="edit" data-kind="trip" data-id="${trip.id}" data-focus-key="edit-trip">Edit</button><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="trip" data-id="${trip.id}">Delete</button></div></div></header>`;
  const ptoLine = trip.counts_as_pto
    ? `<article class="metric"><b>${esc(daysText(trip.pto.days))}</b><span>PTO</span></article>`
    : "";
  const metrics = `<section class="metrics">
      <article class="metric"><b>${esc(spanText(trip.span_days))}</b><span>${esc(nightsAwayText(trip.nights))}</span></article>
      <article class="metric"><b>${esc(budgetText(trip.budget))}</b><span>Trip budget</span></article>
      ${ptoLine}
      <article class="metric"><b>${trip.cities.length || "—"}</b><span>${esc(trip.cities.join(" · ") || "No cities yet")}</span></article>
    </section>`;
  const stays = trip.stays
    .map((stay) => editing("stay", stay.id)
      ? cityLine(stay)
      : `<div class="ride"${stay.lat != null ? ` data-map-lat="${stay.lat}" data-map-lng="${stay.lng}"` : ""}><div><strong>${esc(stay.city)}</strong><p class="meta">${esc(prettyRange(stay.arrive_on, stay.leave_on))}${stay.lodging_name ? ` · ${esc(stay.lodging_name)}` : ""}</p></div><button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-kind="stay" data-id="${stay.id}" data-focus-key="edit-stay-${stay.id}">Edit</button></div>`)
    .join("");
  const cityBlock = `<section class="card"><h2>Cities</h2>${stays}<form class="day-add" data-form="stay"><input type="hidden" name="arrive_on" value="${esc(trip.start_date)}"><input type="hidden" name="leave_on" value="${esc(trip.end_date)}"><input name="city" aria-label="City" placeholder="City" required autocomplete="off" data-focus-key="add-city"></form></section>`;
  const groups = ROLES.map(([role, label]) => {
    const rows = trip.transports.filter((item) => item.role === role);
    if (!rows.length && (role === "connection" || role === "local") && state.compose !== `transport:${role}`) return "";
    const body = rows
      .map((item) => {
        if (editing("transport", item.id)) return rideLine(item);
        const meta = flightMeta(item);
        return `<div class="ride"><div><p class="kicker">${esc(labelOf(MODES, item.mode))}</p><p>${esc(transportSummary(item))}</p>${meta ? `<p class="meta">${esc(meta)}</p>` : ""}</div><div class="row-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-kind="transport" data-id="${item.id}" data-focus-key="edit-transport-${item.id}">Edit</button><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="transport" data-id="${item.id}">Delete</button></div></div>`;
      })
      .join("");
    const composer = `<form class="day-add" data-form="transport"><input type="hidden" name="role" value="${esc(role)}"><input type="hidden" name="mode" value="flight"><input type="hidden" name="status" value="planned"><input name="depart_place" aria-label="From" placeholder="From" required autocomplete="off" data-focus-key="add-transport-${role}"><input name="arrive_place" aria-label="To" placeholder="To" autocomplete="off"><button type="submit" hidden>Add</button></form>`;
    return `<section class="section"><h3>${esc(label)}</h3>${body}${composer}</section>`;
  }).join("");
  const days = trip.days
    .map((day) => {
      const focused = focusDay === day.on_date ? " data-focus" : "";
      const heading = focusDay === day.on_date ? " tabindex=\"-1\" data-day-heading" : "";
      const moves = day.transports.map((item) => `<p>${esc(item.movement === "arrives" ? "Arrives" : item.movement === "both" ? "Departs and arrives" : "Departs")} · ${esc(transportSummary(item))}</p>`).join("");
      const items = day.items
        .map((item) => editing("plan", item.id)
          ? planLine(item)
          : `<div class="plan"><div><p>${item.start_time ? `<strong>${esc(item.start_time)}</strong> · ` : ""}<span class="chip">${esc(labelOf(KINDS, item.kind))}</span> ${esc(item.title)}</p></div><div class="row-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-kind="plan" data-id="${item.id}" data-focus-key="edit-plan-${item.id}">Edit</button><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="plan" data-id="${item.id}">Delete</button></div></div>`)
        .join("");
      const adder = `<form class="day-add" data-form="plan"><input type="hidden" name="on_date" value="${day.on_date}"><input type="hidden" name="kind" value="activity"><input name="title" aria-label="Plan" placeholder="${esc(day.city || prettyDate(day.on_date))}" autocomplete="off" data-focus-key="add-plan-${day.on_date}"></form>`;
      const here = trip.stays.find((stay) => stay.city === day.city && stay.lat != null);
      const pin = here ? ` data-map-lat="${here.lat}" data-map-lng="${here.lng}"` : "";
      return `<div class="day" id="day-${day.on_date}"${focused}${pin}><div class="day-date"${heading}>${esc(prettyDate(day.on_date))}${day.city ? `<br>${esc(day.city)}` : ""}</div><div>${moves}${items}${adder}</div></div>`;
    })
    .join("");
  const outside = trip.outside_plans.length
    ? `<div class="section"><h3>Outside the trip dates</h3>${trip.outside_plans.map((item) => `<p>${esc(item.on_date)} · ${esc(item.title)}</p>`).join("")}</div>`
    : "";
  const parkingRows = trip.parking
    .map((item) => editing("parking", item.id)
      ? parkingLine(item)
      : `<div class="ride"><div>${parkingChip(item)}<p>${esc(item.place_name || "Parking")}</p></div><div class="row-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-kind="parking" data-id="${item.id}" data-focus-key="edit-parking-${item.id}">Edit</button><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="parking" data-id="${item.id}">Delete</button></div></div>`)
    .join("");
  const budgetLines = trip.budget.lines
    .map((line) => `<div class="ride"><div><p>${esc(line.label)}</p></div><strong>${esc(money(line.amount, line.currency))}</strong></div>`)
    .join("");
  const manual = trip.budget.manual
    .map((line) => `<div class="ride"><div><p>${esc(line.label)}</p></div><div class="row-actions"><strong>${esc(money(line.amount, line.currency))}</strong><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="budget" data-id="${line.id}">Delete</button></div></div>`)
    .join("");
  const budgetForm = `<form class="day-add" data-form="budget"><input type="hidden" name="category" value="other"><input name="label" aria-label="Cost" placeholder="Cost" required autocomplete="off" data-focus-key="add-cost"><input name="amount" aria-label="Amount" inputmode="decimal" placeholder="0.00" required><button type="submit" hidden>Add</button></form>`;
  const notes = trip.note_entries
    .map((note) => `<div class="ride"><div><p>${esc(note.body)}</p></div><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="note" data-id="${note.id}">Delete</button></div>`)
    .join("");
  const noteForm = `<form class="day-add" data-form="note"><input name="body" aria-label="Note" placeholder="Note" required autocomplete="off" data-focus-key="add-note"></form>`;
  const reminders = trip.reminders
    .map((item) => `<div class="ride"><button type="button" class="reminder${item.done ? " is-done" : ""}" data-action="toggle-reminder" data-id="${item.id}" aria-pressed="${item.done ? "true" : "false"}">${esc(item.title)}</button><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="reminder" data-id="${item.id}" aria-label="Delete">✕</button></div>`)
    .join("");
  const reminderForm = `<form class="day-add" data-form="reminder"><input type="hidden" name="kind" value="general"><input name="title" aria-label="Reminder" placeholder="Reminder" required autocomplete="off" data-focus-key="add-reminder"></form>`;
  const points = collectPoints(trip);
  const mapCard = points.length ? `<aside class="card map-card"><div id="map" class="map"></div></aside>` : "";
  return `${banner()}${header}${metrics}<div class="split"><div>
      ${cityBlock}
      <section class="card"><h2>Getting there</h2>${groups}</section>
      <section class="card"><div class="card-head"><h2>Days</h2></div>${days}${outside}</section>
      <section class="card"><h2>Parking</h2>${parkingRows}<form class="day-add" data-form="parking"><input type="hidden" name="necessary" value="yes"><input type="hidden" name="arrangement" value="self_park"><input name="place_name" aria-label="Parking" placeholder="Parking" required autocomplete="off" data-focus-key="add-parking"></form></section>
      <section class="card"><h2>Budget</h2>${budgetLines}${manual}${budgetForm}</section>
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
const CITY_COLORS = ["#1f6f6a", "#c4a574", "#7d9a78", "#8d7ea8", "#c47c6a"];

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
  window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  const route = points.filter((point) => point.kind === "City");
  if (route.length > 1) {
    window.L.polyline(route.map((point) => [point.lat, point.lng]), {
      color: "#1f6f6a",
      weight: 3,
      opacity: 0.85,
    }).addTo(map);
  }
  const markers = points.map((point) => {
    const color = CITY_COLORS[(point.order || 0) % CITY_COLORS.length];
    const icon = window.L.divIcon({
      className: "map-pin",
      html: `<span style="background:${color}"></span>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    return window.L.marker([point.lat, point.lng], { icon }).bindPopup(`<strong>${esc(point.label)}</strong>`);
  });
  const group = window.L.featureGroup(markers).addTo(map);
  if (points.length === 1) map.setView([points[0].lat, points[0].lng], 11);
  else map.fitBounds(group.getBounds().pad(0.35));
  window._travelMap = map;
  document.querySelectorAll("[data-map-lat]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("button, input, a")) return;
      map.flyTo([Number(node.dataset.mapLat), Number(node.dataset.mapLng)], 12);
    });
  });
  setTimeout(() => map.invalidateSize(), 0);
}
