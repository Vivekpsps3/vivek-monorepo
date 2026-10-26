import { api } from '../api.mjs';
import { state } from '../state.mjs';
import { esc, val, checked, daysText } from '../helpers.mjs';
import { parseHash } from '../route-parser.mjs';
import { renderTrip } from '../views/trip.mjs';
import { clearFormErrors, dismissToast, fail, saved } from '../feedback.mjs';
import { readHiddenFlight } from './flight.mjs';
import { formError } from '../validate.mjs';

export function readLeg(root, role) {
  return {
    role,
    mode: root.querySelector("[name=mode]").value,
    carrier: emptyInput(root, "carrier"),
    number: emptyInput(root, "number"),
    depart_place: emptyInput(root, "depart_place"),
    arrive_place: emptyInput(root, "arrive_place"),
    depart_at: emptyInput(root, "depart_at"),
    arrive_at: emptyInput(root, "arrive_at"),
    cost: emptyInput(root, "cost"),
    currency: (emptyInput(root, "currency") || "USD").toUpperCase(),
    ...readHiddenFlight(root),
  };
}
export function emptyInput(root, name) {
  const element = root.querySelector(`[name="${name}"]`);
  if (!element) return null;
  const text = element.value.trim();
  return text ? text : null;
}
export function showError(error, options = {}) {
  fail(error, options);
}

function readForm(form) {
  const data = {};
  for (const element of form.elements || []) {
    if (!element.name || element.type === "submit") continue;
    data[element.name] = element.type === "checkbox" ? element.checked : element.value;
  }
  return data;
}
export async function refetchTrip(ui) {
  state.trip = await api(`/api/trips/${state.trip.id}`);
  state.edit = null;
  state.compose = "";
  state.error = "";
  const focus = parseHash().focusDay;
  ui.paint(renderTrip(state.trip, focus), "home");
}
export function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function readTransport(form) {
  return {
    role: form.elements.role.value,
    mode: form.elements.mode.value,
    status: form.elements.status.value,
    carrier: val(form, "carrier"),
    number: val(form, "number"),
    depart_place: val(form, "depart_place"),
    arrive_place: val(form, "arrive_place"),
    depart_at: val(form, "depart_at"),
    arrive_at: val(form, "arrive_at"),
    confirmation: val(form, "confirmation"),
    seat: val(form, "seat"),
    cost: val(form, "cost"),
    currency: (val(form, "currency") || "USD").toUpperCase(),
    paid: checked(form, "paid"),
    notes: val(form, "notes"),
    ...readHiddenFlight(form),
  };
}
function committed(kind, message) {
  dismissToast(`form:${kind}`);
  saved(message);
}

export async function submit(kind, form, ui) {
  state.error = "";
  clearFormErrors(form);
  const problem = formError(kind, readForm(form));
  if (problem) {
    fail({ message: problem.message, status: 422 }, { form, field: problem.name });
    return;
  }
  try {
    await submitBody(kind, form, ui);
  } catch (error) {
    fail(error, {
      form,
      retry: { key: `form:${kind}`, run: () => submit(kind, form, ui) },
    });
  }
}

async function submitBody(kind, form, ui) {
  if (kind === "create-trip") {
    const start = val(form, "start_date");
    const end = val(form, "end_date");
    const stays = [];
    form.querySelectorAll("[data-city]").forEach((row) => {
      const city = emptyInput(row, "city");
      if (!city) return;
      stays.push({
        city,
        region: emptyInput(row, "region"),
        country: emptyInput(row, "country"),
        arrive_on: emptyInput(row, "arrive_on") || start,
        leave_on: emptyInput(row, "leave_on") || end,
        lodging_name: emptyInput(row, "lodging_name"),
      });
    });
    const transports = [readLeg(form.querySelector("[data-leg=outbound]"), "outbound")];
    form.querySelectorAll("[data-connection]").forEach((row) => transports.push(readLeg(row, "connection")));
    transports.push(readLeg(form.querySelector("[data-leg=inbound]"), "inbound"));
    const trip = await api("/api/trips", {
      method: "POST",
      body: JSON.stringify({
        title: val(form, "title"),
        start_date: start,
        end_date: end,
        origin_label: val(form, "origin_label"),
        status: form.elements.status.value,
        counts_as_pto: checked(form, "counts_as_pto"),
        pto_days: val(form, "pto_days"),
        notes: val(form, "notes"),
        stays,
        transports,
      }),
    });
    committed(kind, "Trip created.");
    location.hash = `#/trips/${trip.id}`;
    return;
  }
  if (kind === "trip") {
    const body = {
      title: val(form, "title"),
      start_date: val(form, "start_date"),
      end_date: val(form, "end_date"),
      origin_label: val(form, "origin_label"),
      status: form.elements.status.value,
      notes: val(form, "notes"),
    };
    if (form.elements.counts_as_pto) body.counts_as_pto = checked(form, "counts_as_pto");
    if (form.elements.pto_days) body.pto_days = val(form, "pto_days");
    state.trip = await api(`/api/trips/${form.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    state.edit = null;
    state.focusKey = "edit-trip";
    document.title = `${state.trip.title} · Travel`;
    committed(kind, "Trip saved.");
    ui.paint(renderTrip(state.trip, parseHash().focusDay), "home");
    return;
  }
  if (kind === "stay") {
    const body = {
      city: val(form, "city"),
      region: val(form, "region"),
      country: val(form, "country"),
      arrive_on: val(form, "arrive_on"),
      leave_on: val(form, "leave_on"),
      lodging_name: val(form, "lodging_name"),
      lodging_address: val(form, "lodging_address"),
      lat: numberOrNull(val(form, "lat")),
      lng: numberOrNull(val(form, "lng")),
      notes: val(form, "notes"),
    };
    const path = form.dataset.id ? `/api/stays/${form.dataset.id}` : `/api/trips/${state.trip.id}/stays`;
    state.trip = await api(path, { method: form.dataset.id ? "PATCH" : "POST", body: JSON.stringify(body) });
    state.compose = "";
    state.edit = null;
    state.focusKey = form.dataset.id ? `edit-stay-${form.dataset.id}` : "add-city";
    committed(kind, form.dataset.id ? "City saved." : "City added.");
    ui.paint(renderTrip(state.trip), "home");
    return;
  }
  if (kind === "transport") {
    const body = readTransport(form);
    const path = form.dataset.id ? `/api/transports/${form.dataset.id}` : `/api/trips/${state.trip.id}/transports`;
    state.trip = await api(path, { method: form.dataset.id ? "PATCH" : "POST", body: JSON.stringify(body) });
    state.compose = "";
    state.edit = null;
    state.focusKey = form.dataset.id ? `edit-transport-${form.dataset.id}` : "add-transport";
    committed(kind, form.dataset.id ? "Ride saved." : "Ride added.");
    ui.paint(renderTrip(state.trip), "home");
    return;
  }
  if (kind === "plan") {
    const body = {
      on_date: val(form, "on_date"),
      start_time: val(form, "start_time"),
      end_time: val(form, "end_time"),
      kind: form.elements.kind.value,
      title: val(form, "title"),
      place_name: val(form, "place_name"),
      address: val(form, "address"),
      lat: numberOrNull(val(form, "lat")),
      lng: numberOrNull(val(form, "lng")),
      url: val(form, "url"),
      cost: val(form, "cost"),
      currency: (val(form, "currency") || "USD").toUpperCase(),
      paid: checked(form, "paid"),
      notes: val(form, "notes"),
    };
    const path = form.dataset.id ? `/api/plans/${form.dataset.id}` : `/api/trips/${state.trip.id}/plans`;
    state.trip = await api(path, { method: form.dataset.id ? "PATCH" : "POST", body: JSON.stringify(body) });
    state.compose = "";
    state.edit = null;
    state.focusKey = form.dataset.id ? `edit-plan-${form.dataset.id}` : `day-${body.on_date}`;
    committed(kind, form.dataset.id ? "Plan saved." : "Plan added.");
    ui.paint(renderTrip(state.trip, body.on_date), "home");
    return;
  }
  if (kind === "parking") {
    const transportId = val(form, "transport_id");
    const body = {
      transport_id: transportId ? Number(transportId) : null,
      necessary: form.elements.necessary.value,
      arrangement: form.elements.arrangement.value,
      booked: checked(form, "booked"),
      place_name: val(form, "place_name"),
      address: val(form, "address"),
      lat: numberOrNull(val(form, "lat")),
      lng: numberOrNull(val(form, "lng")),
      confirmation: val(form, "confirmation"),
      start_at: val(form, "start_at"),
      end_at: val(form, "end_at"),
      cost: val(form, "cost"),
      currency: (val(form, "currency") || "USD").toUpperCase(),
      paid: checked(form, "paid"),
      notes: val(form, "notes"),
    };
    const path = form.dataset.id ? `/api/parking/${form.dataset.id}` : `/api/trips/${state.trip.id}/parking`;
    state.trip = await api(path, { method: form.dataset.id ? "PATCH" : "POST", body: JSON.stringify(body) });
    state.compose = "";
    state.edit = null;
    state.focusKey = form.dataset.id ? `edit-parking-${form.dataset.id}` : "add-parking";
    committed(kind, form.dataset.id ? "Parking saved." : "Parking added.");
    ui.paint(renderTrip(state.trip), "home");
    return;
  }
  if (kind === "note") {
    state.trip = await api(`/api/trips/${state.trip.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: val(form, "body"), on_date: val(form, "on_date") }),
    });
    state.compose = "";
    state.focusKey = "add-note";
    committed(kind, "Note added.");
    ui.paint(renderTrip(state.trip), "home");
    return;
  }
  if (kind === "reminder") {
    state.trip = await api(`/api/trips/${state.trip.id}/reminders`, {
      method: "POST",
      body: JSON.stringify({
        title: val(form, "title"),
        kind: form.elements.kind.value,
        due_at: val(form, "due_at"),
        notes: val(form, "notes"),
        done: false,
      }),
    });
    state.compose = "";
    state.focusKey = "add-reminder";
    committed(kind, "Reminder added.");
    ui.paint(renderTrip(state.trip), "home");
    return;
  }
  if (kind === "budget") {
    state.trip = await api(`/api/trips/${state.trip.id}/budget-lines`, {
      method: "POST",
      body: JSON.stringify({
        category: form.elements.category.value,
        label: val(form, "label"),
        amount: val(form, "amount"),
        currency: (val(form, "currency") || "USD").toUpperCase(),
        paid: checked(form, "paid"),
        notes: val(form, "notes"),
      }),
    });
    state.compose = "";
    state.focusKey = "add-cost";
    committed(kind, "Cost added.");
    ui.paint(renderTrip(state.trip), "home");
    return;
  }
  if (kind === "pto-policy") {
    await api("/api/pto/policy", {
      method: "PUT",
      body: JSON.stringify({
        balance_days: val(form, "balance_days") || "0",
        balance_as_of: val(form, "balance_as_of"),
        accrual_amount: val(form, "accrual_amount") || "0",
        accrual_unit: form.elements.accrual_unit.value,
        accrual_cadence: form.elements.accrual_cadence.value,
        hours_per_day: val(form, "hours_per_day") || "8",
        annual_cap_days: val(form, "annual_cap_days"),
      }),
    });
    committed(kind, "PTO settings saved.");
    await ui.render();
    return;
  }
  if (kind === "pto-entry") {
    await api("/api/pto/entries", {
      method: "POST",
      body: JSON.stringify({
        label: val(form, "label"),
        start_date: val(form, "start_date"),
        end_date: val(form, "end_date"),
        days: val(form, "days"),
        notes: val(form, "notes"),
      }),
    });
    committed(kind, "Time off added.");
    await ui.render();
    return;
  }
  if (kind === "pto-preview") {
    const params = new URLSearchParams({ start: val(form, "start"), end: val(form, "end") });
    if (val(form, "days")) params.set("days", val(form, "days"));
    const result = await api(`/api/pto/preview?${params.toString()}`);
    const box = document.querySelector("#pto-preview");
    const numbers = result.balance_when_you_leave
      ? `<p><strong>${esc(daysText(result.balance_when_you_leave))}</strong> when you leave.</p><p><strong>${esc(daysText(result.leftover_after))}</strong> left after ${esc(daysText(result.days))}.</p>`
      : "";
    box.innerHTML = `<div class="section">${numbers}<p class="meta">${esc(result.note || "")}</p></div>`;
    return;
  }
  if (kind === "flight-key") {
    await api("/api/settings/flightaware", { method: "PUT", body: JSON.stringify({ api_key: val(form, "api_key") || "" }) });
    state.focusKey = "flight-key";
    committed(kind, "Key saved.");
    await ui.render();
  }
}
