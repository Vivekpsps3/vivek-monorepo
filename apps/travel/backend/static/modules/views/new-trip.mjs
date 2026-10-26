import { ROLES, MODES } from '../state.mjs';
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
  return `${banner()}<header class="page-head"><h1>New trip</h1><p id="composer-summary" class="lede" aria-live="polite">Pick the day you leave.</p></header><section id="trip-composer" aria-label="Trip dates and destinations"></section>`;
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
