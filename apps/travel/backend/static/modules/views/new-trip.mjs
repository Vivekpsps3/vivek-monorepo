import { ROLES, MODES, KINDS, ARRANGEMENTS, NECESSARY } from '../state.mjs';
import { esc, banner, head, field, area, select, check, actions, labelOf, transportSummary, localInput } from '../helpers.mjs';

export function cityFields() {
  return `<div class="form-grid city-row" data-city>
    ${field("City", "city", "")}
    ${field("Region", "region", "")}
    ${field("Country", "country", "")}
    ${field("Arrive", "arrive_on", "", "date")}
    ${field("Leave", "leave_on", "", "date")}
    ${field("Lodging", "lodging_name", "", "text", true)}
    <div class="wide"><button class="btn btn-ghost btn-sm" type="button" data-action="remove-row">Remove city</button></div>
  </div>`;
}
export function legFields(role) {
  return `<fieldset class="card" data-leg="${role}"><legend>${esc(labelOf(ROLES, role))}</legend><div class="form-grid">
    ${select("How you're getting there", "mode", role === "connection" ? "train" : "flight", MODES)}
    ${field("Carrier", "carrier", "")}
    ${field("Flight or route number", "number", "")}
    ${field("From", "depart_place", "")}
    ${field("To", "arrive_place", "")}
    ${field("Departs", "depart_at", "", "datetime-local")}
    ${field("Arrives", "arrive_at", "", "datetime-local")}
    ${field("Cost", "cost", "", "text")}
    ${field("Currency", "currency", "USD")}
  </div></fieldset>`;
}
export function renderNewTrip() {
  return `${banner()}<section id="trip-composer" aria-label="Trip dates"></section>`;
}
export function connectionFields() {
  return `<div class="form-grid connection-row" data-connection>
    ${select("Mode", "mode", "train", MODES)}
    ${field("From", "depart_place", "")}
    ${field("To", "arrive_place", "")}
    ${field("Departs", "depart_at", "", "datetime-local")}
    ${field("Cost", "cost", "")}
    ${field("Currency", "currency", "USD")}
    <div class="wide"><button class="btn btn-ghost btn-sm" type="button" data-action="remove-row">Remove</button></div>
  </div>`;
}
export function hiddenFlight(item) {
  const names = ["fa_ident", "fa_status", "fa_aircraft", "fa_gate_origin", "fa_gate_destination", "fa_terminal_origin", "fa_terminal_destination", "fa_baggage_claim", "fa_delay_departure_seconds", "fa_delay_arrival_seconds", "fa_scheduled_out", "fa_estimated_out", "fa_actual_out", "fa_scheduled_in", "fa_estimated_in", "fa_actual_in", "depart_tz", "arrive_tz"];
  return names.map((name) => `<input type="hidden" name="${name}" value="${esc(item && item[name] != null ? item[name] : "")}">`).join("");
}
export function transportForm(item, role) {
  const current = item || { role, mode: "flight", currency: "USD", status: "planned", paid: false };
  return `<form class="stack" data-form="transport" data-id="${item ? item.id : ""}"><div class="form-grid">
      ${select("Part of the trip", "role", current.role, ROLES)}
      ${select("Mode", "mode", current.mode, MODES)}
      ${select("Status", "status", current.status || "planned", [["planned", "Planned"], ["booked", "Booked"], ["completed", "Completed"], ["cancelled", "Cancelled"]])}
      ${field("Carrier", "carrier", current.carrier || "")}
      ${field("Number", "number", current.number || "")}
      ${field("From", "depart_place", current.depart_place || "")}
      ${field("To", "arrive_place", current.arrive_place || "")}
      ${field("Departs", "depart_at", localInput(current.depart_at), "datetime-local")}
      ${field("Arrives", "arrive_at", localInput(current.arrive_at), "datetime-local")}
      ${field("Confirmation", "confirmation", current.confirmation || "")}
      ${field("Seat", "seat", current.seat || "")}
      ${field("Cost", "cost", current.cost || "")}
      ${field("Currency", "currency", current.currency || "USD")}
      ${check("Paid", "paid", Boolean(current.paid))}
      ${area("Notes", "notes", current.notes || "")}
    </div>
    <div data-flight-only ${current.mode === "flight" ? "" : "hidden"}>
      <p class="meta">Lookup sends the flight number and this date to FlightAware. You can type the flight instead.</p>
      <div class="form-grid">${field("Lookup date", "lookup_on", (current.depart_at || "").slice(0, 10), "date")}</div>
      <button class="btn btn-secondary btn-sm" type="button" data-action="lookup-flight">Look up flight</button>
      <div id="flight-results"></div>
    </div>
    ${hiddenFlight(current)}
    ${actions(item ? "Save ride" : "Add ride")}
  </form>`;
}
export function stayForm(item) {
  const current = item || {};
  return `<form class="stack" data-form="stay" data-id="${item ? item.id : ""}"><div class="form-grid">
    ${field("City", "city", current.city || "")}
    ${field("Region", "region", current.region || "")}
    ${field("Country", "country", current.country || "")}
    ${field("Arrive", "arrive_on", current.arrive_on || "", "date")}
    ${field("Leave", "leave_on", current.leave_on || "", "date")}
    ${field("Lodging", "lodging_name", current.lodging_name || "", "text", true)}
    ${field("Address", "lodging_address", current.lodging_address || "", "text", true)}
    ${field("Latitude", "lat", current.lat ?? "")}
    ${field("Longitude", "lng", current.lng ?? "")}
    ${area("Notes", "notes", current.notes || "")}
  </div><p class="meta">Find on map sends the address to OpenStreetMap.</p><button class="btn btn-secondary btn-sm" type="button" data-action="find-place">Find on map</button><div data-place-hits></div>${actions(item ? "Save city" : "Add city")}</form>`;
}
export function planForm(item, dateValue) {
  const current = item || { on_date: dateValue, kind: "restaurant", currency: "USD" };
  return `<form class="stack" data-form="plan" data-id="${item ? item.id : ""}"><div class="form-grid">
    ${field("Date", "on_date", current.on_date || "", "date")}
    ${field("Start", "start_time", current.start_time || "", "time")}
    ${field("End", "end_time", current.end_time || "", "time")}
    ${select("Kind", "kind", current.kind || "activity", KINDS)}
    ${field("Name", "title", current.title || "", "text", true)}
    ${field("Place", "place_name", current.place_name || "")}
    ${field("Address", "address", current.address || "")}
    ${field("Latitude", "lat", current.lat ?? "")}
    ${field("Longitude", "lng", current.lng ?? "")}
    ${field("Link", "url", current.url || "", "url")}
    ${field("Cost", "cost", current.cost || "")}
    ${field("Currency", "currency", current.currency || "USD")}
    ${check("Paid", "paid", Boolean(current.paid))}
    ${area("Notes", "notes", current.notes || "")}
  </div><p class="meta">Find on map sends the address to OpenStreetMap.</p><button class="btn btn-secondary btn-sm" type="button" data-action="find-place">Find on map</button><div data-place-hits></div>${actions(item ? "Save plan" : "Add plan")}</form>`;
}
export function parkingForm(item, transports) {
  const current = item || { necessary: "yes", arrangement: "self_park", currency: "USD", booked: false };
  const transportOptions = [["", "Not tied to one ride"], ...transports.map((ride) => [String(ride.id), transportSummary(ride)])];
  return `<form class="stack" data-form="parking" data-id="${item ? item.id : ""}"><div class="form-grid">
    ${select("Is parking necessary?", "necessary", current.necessary, NECESSARY)}
    ${select("How you'll handle it", "arrangement", current.arrangement, ARRANGEMENTS)}
    ${select("Tied to", "transport_id", current.transport_id ? String(current.transport_id) : "", transportOptions, true)}
    ${field("Place", "place_name", current.place_name || "", "text", true)}
    ${field("Address", "address", current.address || "", "text", true)}
    ${field("Latitude", "lat", current.lat ?? "")}
    ${field("Longitude", "lng", current.lng ?? "")}
    ${field("Confirmation", "confirmation", current.confirmation || "")}
    ${field("From", "start_at", localInput(current.start_at), "datetime-local")}
    ${field("Until", "end_at", localInput(current.end_at), "datetime-local")}
    ${field("Cost", "cost", current.cost || "")}
    ${field("Currency", "currency", current.currency || "USD")}
    ${check("Booked", "booked", Boolean(current.booked))}
    ${check("Paid", "paid", Boolean(current.paid))}
    ${area("Notes", "notes", current.notes || "")}
  </div><button class="btn btn-secondary btn-sm" type="button" data-action="find-place">Find on map</button><div data-place-hits></div>${actions(item ? "Save parking" : "Add parking")}</form>`;
}
