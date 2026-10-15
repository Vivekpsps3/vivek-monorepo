import { state, ROLES, MODES, KINDS, ARRANGEMENTS, STATUSES } from '../state.mjs';
import { esc, banner, field, area, select, check, actions, labelOf, prettyRange, prettyDate, prettyWhen, money, daysText, budgetText, transportSummary, flightMeta, parkingChip } from '../helpers.mjs';
import { stayForm, transportForm, planForm, parkingForm } from './new-trip.mjs';

export function editing(kind, id) {
  return state.edit && state.edit.kind === kind && state.edit.id === id;
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
    : `<header class="page-head"><div class="page-head-row"><div><p class="kicker">${esc(labelOf(STATUSES, trip.status))} · ${esc(trip.phase === "in_progress" ? "In progress" : trip.phase)} · ${esc(prettyRange(trip.start_date, trip.end_date))}</p><h1>${esc(trip.title)}</h1><p class="lede">${trip.origin_label ? `From ${esc(trip.origin_label)}. ` : ""}${esc(trip.notes || "The days below are the trip.")}</p></div><div class="row-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="edit" data-kind="trip" data-id="${trip.id}">Edit</button><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="trip" data-id="${trip.id}">Delete</button></div></div></header>`;
  const ptoLine = trip.counts_as_pto
    ? `<article class="metric"><b>${esc(daysText(trip.pto.days))}</b><span>${esc(trip.pto.leftover_after ? `${daysText(trip.pto.balance_when_you_leave)} when you leave · ${daysText(trip.pto.leftover_after)} left after` : trip.pto.note || "PTO")}</span></article>`
    : `<article class="metric"><b>Not PTO</b><span>This trip does not use PTO.</span></article>`;
  const metrics = `<section class="metrics">
      <article class="metric"><b>${trip.span_days}</b><span>${trip.nights} nights away</span></article>
      <article class="metric"><b>${esc(budgetText(trip.budget))}</b><span>Trip budget</span></article>
      ${ptoLine}
      <article class="metric"><b>${trip.cities.length || "—"}</b><span>${esc(trip.cities.join(" · ") || "No cities yet")}</span></article>
    </section>`;
  const stays = trip.stays
    .map((stay) => editing("stay", stay.id)
      ? stayForm(stay)
      : `<div class="ride"><div><strong>${esc(stay.city)}</strong><p class="meta">${esc(prettyRange(stay.arrive_on, stay.leave_on))}${stay.lodging_name ? ` · ${esc(stay.lodging_name)}` : ""}${stay.outside ? " · outside the trip dates" : ""}</p></div><button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-kind="stay" data-id="${stay.id}">Edit</button></div>`)
    .join("");
  const cityBlock = `<section class="card"><div class="card-head"><h2>Cities</h2><button class="btn btn-secondary btn-sm" type="button" data-action="compose" data-compose="stay">Add city</button></div>${state.compose === "stay" ? stayForm(null) : ""}${stays || "<p class='meta'>Add each city you stay in. More than one city is a multi-city trip.</p>"}</section>`;
  const groups = ROLES.map(([role, label]) => {
    const rows = trip.transports.filter((item) => item.role === role);
    if (!rows.length && (role === "connection" || role === "local") && state.compose !== `transport:${role}`) return "";
    const body = rows
      .map((item) => {
        if (editing("transport", item.id)) return transportForm(item, item.role);
        const meta = flightMeta(item);
        return `<div class="ride"><div><p class="kicker">${esc(labelOf(MODES, item.mode))}</p><p>${esc(transportSummary(item))}</p>${meta ? `<p class="meta">${esc(meta)}</p>` : ""}</div><div class="row-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-kind="transport" data-id="${item.id}">Edit</button><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="transport" data-id="${item.id}">Delete</button></div></div>`;
      })
      .join("");
    const composer = state.compose === `transport:${role}` ? transportForm(null, role) : "";
    return `<section class="section"><div class="card-head"><h3>${esc(label)}</h3><button class="btn btn-secondary btn-sm" type="button" data-action="compose" data-compose="transport:${role}" data-role="${role}">Add</button></div>${composer}${body || "<p class='meta'>Nothing here yet.</p>"}</section>`;
  }).join("");
  const days = trip.days
    .map((day) => {
      const focused = focusDay === day.on_date ? " data-focus" : "";
      const moves = day.transports.map((item) => `<p>${esc(item.movement === "arrives" ? "Arrives" : item.movement === "both" ? "Departs and arrives" : "Departs")} · ${esc(transportSummary(item))}</p>`).join("");
      const items = day.items
        .map((item) => editing("plan", item.id)
          ? planForm(item)
          : `<div class="plan"><div><p>${item.start_time ? `<strong>${esc(item.start_time)}</strong> · ` : ""}<span class="chip">${esc(labelOf(KINDS, item.kind))}</span> ${esc(item.title)}</p><p class="meta">${[item.place_name, item.address, item.cost ? money(item.cost, item.currency) : "", item.notes].filter(Boolean).map(esc).join(" · ")}</p></div><div class="row-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-kind="plan" data-id="${item.id}">Edit</button><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="plan" data-id="${item.id}">Delete</button></div></div>`)
        .join("");
      const adder = state.compose === "plan" && state.composeDate === day.on_date ? planForm(null, day.on_date) : "";
      return `<div class="day" id="day-${day.on_date}"${focused}><div class="day-date">${esc(prettyDate(day.on_date))}${day.city ? `<br>${esc(day.city)}` : ""}<br><button class="btn btn-ghost btn-sm" type="button" data-action="compose" data-compose="plan" data-date="${day.on_date}">Add</button></div><div>${adder}${moves}${items || "<p class='meta'>Nothing planned.</p>"}</div></div>`;
    })
    .join("");
  const outside = trip.outside_plans.length
    ? `<div class="section"><h3>Outside the trip dates</h3>${trip.outside_plans.map((item) => `<p>${esc(item.on_date)} · ${esc(item.title)}</p>`).join("")}</div>`
    : "";
  const parkingRows = trip.parking
    .map((item) => editing("parking", item.id)
      ? parkingForm(item, trip.transports)
      : `<div class="ride"><div>${parkingChip(item)}<p>${esc(item.place_name || "Parking")}</p><p class="meta">${esc(labelOf(ARRANGEMENTS, item.arrangement))}${item.confirmation ? ` · ${esc(item.confirmation)}` : ""}${item.cost ? ` · ${esc(money(item.cost, item.currency))}` : ""}</p>${item.notes ? `<p>${esc(item.notes)}</p>` : ""}</div><div class="row-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-kind="parking" data-id="${item.id}">Edit</button>${item.necessary === "yes" && !item.booked ? `<button class="btn btn-ghost btn-sm" type="button" data-action="remind-parking" data-id="${item.id}">Remind me</button>` : ""}<button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="parking" data-id="${item.id}">Delete</button></div></div>`)
    .join("");
  const budgetLines = trip.budget.lines
    .map((line) => `<div class="ride"><div><p>${esc(line.category_label)} · ${esc(line.label)}</p><p class="meta">${line.paid ? "Paid" : "Not marked paid"}</p></div><strong>${esc(money(line.amount, line.currency))}</strong></div>`)
    .join("");
  const manual = trip.budget.manual
    .map((line) => `<div class="ride"><div><p>${esc(line.label)}</p><p class="meta">Extra line · ${esc(line.category_label)}</p></div><div class="row-actions"><strong>${esc(money(line.amount, line.currency))}</strong><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="budget" data-id="${line.id}">Delete</button></div></div>`)
    .join("");
  const budgetForm = state.compose === "budget"
    ? `<form class="stack" data-form="budget"><div class="form-grid">${select("Category", "category", "other", [["outbound_flight", "Outbound flight"], ["inbound_flight", "Inbound flight"], ["lodging", "Lodging"], ["food", "Food"], ["activity", "Activities"], ["parking", "Parking"], ["other", "Other"]], true)}${field("Name", "label", "", "text", true)}${field("Amount", "amount", "")}${field("Currency", "currency", "USD")}${check("Paid", "paid", false)}${area("Notes", "notes", "")}</div>${actions("Add cost")}</form>`
    : "";
  const notes = trip.note_entries
    .map((note) => `<div class="ride"><div><p>${esc(note.body)}</p><p class="meta">${note.on_date ? esc(prettyDate(note.on_date)) : "Trip note"}</p></div><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="note" data-id="${note.id}">Delete</button></div>`)
    .join("");
  const noteForm = state.compose === "note"
    ? `<form class="stack" data-form="note"><div class="form-grid">${field("Date, optional", "on_date", "", "date", true)}${area("Note", "body", "")}</div>${actions("Add note")}</form>`
    : "";
  const reminders = trip.reminders
    .map((item) => `<div class="ride"><label class="check"><input type="checkbox" data-action="toggle-reminder" data-id="${item.id}"${item.done ? " checked" : ""}> ${esc(item.title)}</label><div><p class="meta">${item.due_at ? esc(prettyWhen(item.due_at)) : esc(item.kind)}${item.notes ? ` · ${esc(item.notes)}` : ""}</p><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="reminder" data-id="${item.id}">Delete</button></div></div>`)
    .join("");
  const reminderForm = state.compose === "reminder"
    ? `<form class="stack" data-form="reminder"><div class="form-grid">${field("Reminder", "title", "", "text", true)}${select("Kind", "kind", "general", [["general", "General"], ["parking", "Parking"], ["flight", "Flight"], ["packing", "Packing"]])}${field("When", "due_at", "", "datetime-local")}${area("Notes", "notes", "")}</div>${actions("Add reminder")}</form>`
    : "";
  const points = collectPoints(trip);
  const links = points
    .map((point) => `<a href="https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=16/${point.lat}/${point.lng}">${esc(point.kind)} · ${esc(point.label)}</a>`)
    .join("");
  const mapCard = `<aside class="card map-card"><h2>Map</h2><div id="map" class="map"${points.length ? "" : " hidden"}></div><p class="meta">${points.length ? "Pins are the cities, plans, and parking spots that have a location." : "Use Find on map when you add an address to drop a pin."}</p><div class="map-links">${links}</div></aside>`;
  return `${banner()}${header}${metrics}<div class="split"><div>
      ${cityBlock}
      <section class="card"><h2>Getting there</h2>${groups}</section>
      <section class="card"><div class="card-head"><h2>Days</h2></div>${days}${outside}</section>
      <section class="card"><div class="card-head"><h2>Parking and pickup</h2><button class="btn btn-secondary btn-sm" type="button" data-action="compose" data-compose="parking">Add</button></div><p class="meta">Say whether a spot is necessary, whether it is booked, and whether you are parking, being dropped off, or picked up.</p>${state.compose === "parking" ? parkingForm(null, trip.transports) : ""}${parkingRows || "<p class='meta'>No parking notes yet.</p>"}</section>
      <section class="card"><div class="card-head"><h2>Budget</h2><button class="btn btn-secondary btn-sm" type="button" data-action="compose" data-compose="budget">Add extra cost</button></div><p class="meta">Flight, drive, plan, and parking costs are included when you type them. Add a line only for something that is not already on the trip. Different currencies stay separate.</p>${budgetForm}${budgetLines}${manual}</section>
      <section class="card"><div class="card-head"><h2>Notes</h2><button class="btn btn-secondary btn-sm" type="button" data-action="compose" data-compose="note">Add note</button></div>${noteForm}${notes || "<p class='meta'>Notes stay on this trip.</p>"}</section>
      <section class="card"><div class="card-head"><h2>Reminders</h2><button class="btn btn-secondary btn-sm" type="button" data-action="compose" data-compose="reminder">Add reminder</button></div>${reminderForm}${reminders || "<p class='meta'>Reminders for parking, check-in, or packing.</p>"}</section>
    </div>${mapCard}</div>`;
}
export function collectPoints(trip) {
  const points = [];
  trip.stays.forEach((stay) => {
    if (stay.lat != null && stay.lng != null) points.push({ lat: stay.lat, lng: stay.lng, label: stay.city, kind: "City" });
  });
  trip.days.forEach((day) => day.items.forEach((item) => {
    if (item.lat != null && item.lng != null) points.push({ lat: item.lat, lng: item.lng, label: item.title, kind: labelOf(KINDS, item.kind) });
  }));
  trip.parking.forEach((item) => {
    if (item.lat != null && item.lng != null) points.push({ lat: item.lat, lng: item.lng, label: item.place_name || "Parking", kind: "Parking" });
  });
  return points;
}
export function mountMap() {
  const element = document.querySelector("#map");
  if (!element || element.hidden) return;
  const points = state.trip ? collectPoints(state.trip) : [];
  if (!points.length || !window.L) {
    element.hidden = false;
    element.textContent = window.L ? "" : "The map library did not load. Use the OpenStreetMap links.";
    return;
  }
  const map = window.L.map(element);
  window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  const markers = points.map((point) => window.L.marker([point.lat, point.lng]).bindPopup(`<strong>${esc(point.label)}</strong><br>${esc(point.kind)}`));
  const group = window.L.featureGroup(markers).addTo(map);
  map.fitBounds(group.getBounds().pad(0.3));
  window._travelMap = map;
  setTimeout(() => map.invalidateSize(), 0);
}
