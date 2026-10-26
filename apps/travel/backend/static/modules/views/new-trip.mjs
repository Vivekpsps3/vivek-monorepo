import { ROLES, MODES } from '../state.mjs';
import { HIDDEN_FLIGHT_FIELDS } from '../actions/flight.mjs';
import { esc, banner, field, select, labelOf } from '../helpers.mjs';

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
export function flightScheduleControls(lookupOn = "", overrides = "", provenance = "") {
  const seeded = provenance ? `<p class="meta" data-flight-provenance>${esc(provenance)}</p>` : "";
  return `${field("Departure date", "lookup_on", lookupOn, "date")}
    <div class="row-actions">
      <button class="btn btn-secondary btn-sm" type="button" data-action="refresh-flight">Refresh schedule</button>
      <button class="btn btn-secondary btn-sm" type="button" data-action="use-flight-schedule">Use flight schedule</button>
      <button class="btn btn-ghost btn-sm" type="button" data-action="edit-flight-manually">Edit manually</button>
    </div>
    <div data-flight-preview aria-live="polite">${seeded}</div>
    <input type="hidden" name="flight_overrides" value="${esc(overrides)}">
    <input type="hidden" data-flight-filled value="">`;
}
export function legFields(role, lookupOn = "") {
  const mode = role === "connection" ? "train" : "flight";
  const flightHidden = mode === "flight" ? "" : " hidden";
  return `<fieldset class="card" data-leg="${role}"><legend>${esc(labelOf(ROLES, role))}</legend><div class="form-grid">
    ${select("How you're getting there", "mode", mode, MODES)}
    ${field("Carrier", "carrier", "")}
    ${field("Flight or route number", "number", "")}
    <div class="wide stack" data-flight-only${flightHidden}>${flightScheduleControls(lookupOn)}</div>
    ${field("From", "depart_place", "")}
    ${field("To", "arrive_place", "")}
    ${field("Departs", "depart_at", "", "datetime-local")}
    ${field("Arrives", "arrive_at", "", "datetime-local")}
    ${field("Cost", "cost", "", "text")}
    ${field("Currency", "currency", "USD")}
  </div>${hiddenFlight(null)}</fieldset>`;
}
export function renderNewTrip() {
  return `${banner()}<header class="page-head"><h1>New trip</h1><p id="composer-summary" class="lede" aria-live="polite">Pick the day you leave.</p></header><section id="trip-composer" aria-label="Trip dates and destinations"></section>`;
}
export function connectionFields(lookupOn = "") {
  return `<div class="form-grid connection-row" data-connection>
    ${select("Mode", "mode", "train", MODES)}
    <div class="wide stack" data-flight-only hidden>
      ${field("Carrier", "carrier", "")}
      ${field("Flight or route number", "number", "")}
      ${flightScheduleControls(lookupOn)}
    </div>
    ${field("From", "depart_place", "")}
    ${field("To", "arrive_place", "")}
    ${field("Departs", "depart_at", "", "datetime-local")}
    ${field("Cost", "cost", "")}
    ${field("Currency", "currency", "USD")}
    ${hiddenFlight(null)}
    <div class="wide"><button class="btn btn-ghost btn-sm" type="button" data-action="remove-row">Remove</button></div>
  </div>`;
}
export function hiddenFlight(item) {
  return HIDDEN_FLIGHT_FIELDS.map((name) => `<input type="hidden" name="${name}" value="${esc(item && item[name] != null ? item[name] : "")}">`).join("");
}
