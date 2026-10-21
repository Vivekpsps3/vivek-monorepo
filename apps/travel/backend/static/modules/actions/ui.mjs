import { api } from '../api.mjs';
import { state } from '../state.mjs';
import { esc, val } from '../helpers.mjs';
import { parseHash } from '../route-parser.mjs';
import { renderTrip } from '../views/trip.mjs';
import { renderLogin } from '../views/settings.mjs';
import { cityFields, connectionFields } from '../views/new-trip.mjs';
import { submit, showError, refetchTrip } from './forms.mjs';
import { applyFlight, renderFlightChoices } from './flight.mjs';
import { safeStorageSet } from '../../../shared-browser/dom.mjs';

const THEME_CHOICES = ["system", "light", "dark"];
let schemeListenerBound = false;

export async function onAction(button, ui) {
  const action = button.dataset.action;
  if (action === "theme") {
    const requested = button.dataset.themeValue;
    const current = document.documentElement.dataset.themeChoice || "system";
    const next = THEME_CHOICES.includes(requested)
      ? requested
      : THEME_CHOICES[(Math.max(THEME_CHOICES.indexOf(current), 0) + 1) % THEME_CHOICES.length];
    applyTheme(next);
    return;
  }
  if (action === "cancel") {
    state.edit = null;
    state.compose = "";
    state.error = "";
    if (state.trip && parseHash().name === "trip") ui.paint(renderTrip(state.trip, parseHash().focusDay), "home");
    return;
  }
  if (action === "add-city") {
    document.querySelector("#cities").insertAdjacentHTML("beforeend", cityFields());
    return;
  }
  if (action === "add-connection") {
    document.querySelector("#connections").insertAdjacentHTML("beforeend", connectionFields());
    return;
  }
  if (action === "remove-row") {
    const row = button.closest("[data-city], [data-connection]");
    if (row) row.remove();
    return;
  }
  if (action === "compose") {
    state.compose = button.dataset.compose;
    state.composeDate = button.dataset.date || "";
    state.composeRole = button.dataset.role || "outbound";
    state.edit = null;
    ui.paint(renderTrip(state.trip, state.composeDate), "home");
    return;
  }
  if (action === "edit") {
    state.edit = { kind: button.dataset.kind, id: Number(button.dataset.id) };
    state.compose = "";
    ui.paint(renderTrip(state.trip, parseHash().focusDay), "home");
    return;
  }
  if (action === "delete") {
    const kind = button.dataset.kind;
    const id = button.dataset.id;
    const prompts = {
      trip: "Delete this trip and its plans?",
      transport: "Delete this ride?",
      plan: "Delete this plan?",
      parking: "Delete this parking note?",
      note: "Delete this note?",
      reminder: "Delete this reminder?",
      budget: "Delete this extra cost?",
      pto: "Delete this PTO entry?",
      stay: "Delete this city?",
    };
    if (!window.confirm(prompts[kind] || "Delete this?")) return;
    const paths = {
      trip: `/api/trips/${id}`,
      transport: `/api/transports/${id}`,
      plan: `/api/plans/${id}`,
      parking: `/api/parking/${id}`,
      note: `/api/notes/${id}`,
      reminder: `/api/reminders/${id}`,
      budget: `/api/budget-lines/${id}`,
      pto: `/api/pto/entries/${id}`,
      stay: `/api/stays/${id}`,
    };
    await api(paths[kind], { method: "DELETE" });
    if (kind === "trip") {
      state.trip = null;
      location.hash = "#/";
      if ((location.hash || "#/") === "#/") await ui.render();
      return;
    }
    if (kind === "pto") {
      await ui.render();
      return;
    }
    await refetchTrip(ui);
    return;
  }
  if (action === "lookup-flight") {
    const form = button.closest("form");
    const ident = val(form, "number");
    const departOn = val(form, "lookup_on") || (val(form, "depart_at") || "").slice(0, 10);
    const result = await api("/api/flights/lookup", { method: "POST", body: JSON.stringify({ ident, depart_on: departOn }) });
    state.flights = result.flights;
    renderFlightChoices(form, result.flights);
    return;
  }
  if (action === "use-flight") {
    const form = button.closest("form");
    applyFlight(form, state.flights[Number(button.dataset.index)]);
    const box = form.querySelector("#flight-results");
    if (box) box.innerHTML = `<p class="meta">Filled from FlightAware in airport local time. Review it, then save.</p>`;
    return;
  }
  if (action === "find-place") {
    const form = button.closest("form");
    const query = val(form, "address") || val(form, "lodging_address") || val(form, "place_name") || val(form, "city");
    const result = await api(`/api/places/search?q=${encodeURIComponent(query || "")}`);
    const box = form.querySelector("[data-place-hits]");
    if (!result.results.length) {
      box.innerHTML = `<p class="meta">No match. You can type latitude and longitude instead.</p>`;
      return;
    }
    box.innerHTML = result.results
      .map((hit, index) => `<button class="choice" type="button" data-action="use-place" data-index="${index}" data-lat="${hit.lat}" data-lng="${hit.lng}">${esc(hit.label)}</button>`)
      .join("");
    return;
  }
  if (action === "use-place") {
    const form = button.closest("form");
    if (form.elements.lat) form.elements.lat.value = button.dataset.lat;
    if (form.elements.lng) form.elements.lng.value = button.dataset.lng;
    const address = form.elements.address || form.elements.lodging_address;
    if (address && !address.value) address.value = button.textContent;
    return;
  }
  if (action === "remind-parking") {
    const parking = state.trip.parking.find((item) => item.id === Number(button.dataset.id));
    state.trip = await api(`/api/trips/${state.trip.id}/reminders`, {
      method: "POST",
      body: JSON.stringify({ title: `Book parking${parking && parking.place_name ? ` at ${parking.place_name}` : ""}`, kind: "parking", done: false }),
    });
    ui.paint(renderTrip(state.trip), "home");
    return;
  }
  if (action === "toggle-reminder") {
    const reminder = state.trip.reminders.find((item) => item.id === Number(button.dataset.id));
    state.trip = await api(`/api/reminders/${reminder.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: reminder.title,
        due_at: reminder.due_at,
        done: button.checked,
        kind: reminder.kind,
        notes: reminder.notes,
      }),
    });
    return;
  }
  if (action === "clear-key") {
    await api("/api/settings/flightaware", { method: "DELETE" });
    await ui.render();
    return;
  }
}
function themeChoice(value) {
  return THEME_CHOICES.includes(value) ? value : "system";
}

function resolvedTheme(choice) {
  if (choice === "light" || choice === "dark") return choice;
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function bindSchemeListener() {
  if (schemeListenerBound) return;
  schemeListenerBound = true;
  let media = null;
  try {
    media = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
  } catch {
    media = null;
  }
  if (!media) return;
  const apply = () => {
    if (document.documentElement.dataset.themeChoice !== "system") return;
    document.documentElement.dataset.theme = media.matches ? "dark" : "light";
  };
  if (typeof media.addEventListener === "function") media.addEventListener("change", apply);
  else if (typeof media.addListener === "function") media.addListener(apply);
}

export function applyTheme(value) {
  const choice = themeChoice(value);
  safeStorageSet("travel-theme", choice);
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(choice);
  root.dataset.themeChoice = choice;
  document.querySelectorAll("[data-action=theme]").forEach((button) => {
    const selected = button.dataset.themeValue === choice;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  bindSchemeListener();
}

export function bindEvents(ui) {
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
    event.preventDefault();
    const submitButton = form.querySelector("[type=submit]");
    if (submitButton) submitButton.disabled = true;
    onActionSafe(async () => {
      try {
        await submit(form.dataset.form, form, ui);
      } finally {
        if (submitButton && submitButton.isConnected) submitButton.disabled = false;
      }
    }, ui);
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement ?? null;
    const button = target && target.closest("[data-action]");
    if (!button || button.tagName === "A") return;
    if (button.tagName === "BUTTON" && button.getAttribute("type") !== "submit") {
      event.preventDefault();
    }
    onActionSafe(() => onAction(button, ui), ui);
  });

  document.addEventListener("change", (event) => {
    if (event.target.name !== "mode") return;
    const form = event.target.closest("form");
    const flight = form && form.querySelector("[data-flight-only]");
    if (flight) flight.hidden = event.target.value !== "flight";
  });
}

async function onActionSafe(work, ui) {
  try {
    await work();
  } catch (error) {
    if (error.status === 401) {
      ui.paint(renderLogin(), parseHash().name);
      return;
    }
    showError(error);
  }
}
