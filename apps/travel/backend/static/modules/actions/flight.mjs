import { escapeHtml as esc } from '../../../shared-browser/dom.mjs';

export function toDatetimeLocal(iso, timeZone) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function bestTime(flight, which) {
  if (which === "out") return flight.actual_out || flight.estimated_out || flight.scheduled_out;
  return flight.actual_in || flight.estimated_in || flight.scheduled_in;
}
export function applyFlight(form, flight) {
  const set = (name, value) => {
    if (form.elements[name]) form.elements[name].value = value ?? "";
  };
  set("number", flight.ident_iata || flight.ident || "");
  set("depart_place", flight.origin_iata || "");
  set("arrive_place", flight.destination_iata || "");
  set("depart_at", toDatetimeLocal(bestTime(flight, "out"), flight.origin_timezone));
  set("arrive_at", toDatetimeLocal(bestTime(flight, "in"), flight.destination_timezone));
  set("depart_tz", flight.origin_timezone || "");
  set("arrive_tz", flight.destination_timezone || "");
  set("fa_ident", flight.ident || "");
  set("fa_status", flight.status || "");
  set("fa_aircraft", flight.aircraft_type || "");
  set("fa_gate_origin", flight.gate_origin || "");
  set("fa_gate_destination", flight.gate_destination || "");
  set("fa_terminal_origin", flight.terminal_origin || "");
  set("fa_terminal_destination", flight.terminal_destination || "");
  set("fa_baggage_claim", flight.baggage_claim || "");
  set("fa_delay_departure_seconds", flight.departure_delay_seconds ?? "");
  set("fa_delay_arrival_seconds", flight.arrival_delay_seconds ?? "");
  set("fa_scheduled_out", flight.scheduled_out || "");
  set("fa_estimated_out", flight.estimated_out || "");
  set("fa_actual_out", flight.actual_out || "");
  set("fa_scheduled_in", flight.scheduled_in || "");
  set("fa_estimated_in", flight.estimated_in || "");
  set("fa_actual_in", flight.actual_in || "");
}
export function renderFlightChoices(form, flights) {
  const box = form.querySelector("#flight-results");
  if (!box) return;
  if (!flights.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = flights
    .map((flight, index) => `<button class="choice" type="button" data-action="use-flight" data-index="${index}"><strong>${esc(flight.ident_iata || flight.ident)}</strong><span>${esc(flight.origin_iata || "")} → ${esc(flight.destination_iata || "")} · ${esc(flight.status || "Scheduled")}</span></button>`)
    .join("");
}
