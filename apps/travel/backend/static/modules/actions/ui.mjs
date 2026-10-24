import { api } from '../api.mjs';
import { state } from '../state.mjs';
import { esc, val } from '../helpers.mjs';
import { parseHash } from '../route-parser.mjs';
import { renderTrip } from '../views/trip.mjs';
import { renderLogin } from '../views/settings.mjs';
import { cityFields, connectionFields } from '../views/new-trip.mjs';
import { submit, refetchTrip } from './forms.mjs';
import { dismissToast, fail, openConfirm, saved } from '../feedback.mjs';
import { deletionMode, dialogCopy, undoCopy, restoreBody, restorePath, flagBody, flagToast, findItem, deletePath, patchPath } from '../restore.mjs';
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
    const edit = state.edit;
    state.edit = null;
    state.details = null;
    state.compose = "";
    state.error = "";
    if (edit?.kind === "trip") state.focusKey = "edit-trip";
    else if (edit?.kind) state.focusKey = `edit-${edit.kind}-${edit.id}`;
    if (state.trip && parseHash().name === "trip") {
      if (edit?.kind === "trip" && state.trip.title) document.title = `${state.trip.title} · Travel`;
      ui.paint(renderTrip(state.trip, parseHash().focusDay), "home");
    }
    return;
  }
  if (action === "more-details") {
    const kind = button.dataset.kind;
    const id = button.dataset.id || "";
    const same = state.details && state.details.kind === kind && String(state.details.id) === String(id);
    state.details = same ? null : { kind, id };
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
    state.details = null;
    if (button.dataset.kind === "trip") document.title = "Edit trip · Travel";
    ui.paint(renderTrip(state.trip, parseHash().focusDay), "home");
    return;
  }
  if (action === "delete") {
    const kind = button.dataset.kind;
    const id = button.dataset.id;
    await removeItem(kind, id, ui);
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
      box.innerHTML = "";
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
        done: !reminder.done,
        kind: reminder.kind,
        notes: reminder.notes,
      }),
    });
    ui.paint(renderTrip(state.trip), "home");
    return;
  }
  if (action === "retry-route") {
    await ui.render();
    return;
  }
  if (action === "clear-key") {
    const copy = dialogCopy("flight-key");
    openConfirm({
      title: copy.title,
      body: copy.body,
      confirmLabel: copy.confirm,
      onConfirm: async () => {
        await api("/api/settings/flightaware", { method: "DELETE" });
        saved("Key removed.");
        await ui.render();
      },
    });
    return;
  }
  if (action === "show-on-map") {
    const map = window._travelMap;
    if (!map) return;
    const lat = Number(button.dataset.lat);
    const lng = Number(button.dataset.lng);
    map.flyTo([lat, lng], 12);
    const marker = (window._travelMarkers || []).find((item) => {
      const point = item.getLatLng();
      return Math.abs(point.lat - lat) < 0.0001 && Math.abs(point.lng - lng) < 0.0001;
    });
    marker?.openPopup();
    return;
  }
  if (action === "calendar-layout") {
    document.querySelector(".cal-board")?.classList.toggle("is-month");
    return;
  }
  if (action === "menu") {
    const menu = document.querySelector("#more-menu");
    if (!menu) return;
    const open = menu.hasAttribute("hidden");
    if (open) menu.removeAttribute("hidden");
    else menu.setAttribute("hidden", "");
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }
}

async function removeItem(kind, id, ui) {
  const item = findItem(state.trip, kind, id, { entries: state.ptoEntries || [] });
  const mode = deletionMode(kind);
  if (mode === "dialog") {
    const copy = dialogCopy(kind, state.trip);
    openConfirm({
      title: copy.title,
      body: copy.body,
      confirmLabel: copy.confirm,
      onConfirm: async () => {
        await api(deletePath(kind, id), { method: "DELETE" });
      },
      after: async () => {
        if (kind === "trip") {
          state.trip = null;
          saved("Trip deleted.");
          state.holdHash = true;
          state.focusHeading = true;
          location.hash = "#/";
          try {
            if ((location.hash || "#/") === "#/") await ui.render();
          } finally {
            state.holdHash = false;
          }
          return;
        }
        if (kind === "pto") await ui.render();
        else if (state.trip) await refetchTrip(ui);
      },
    });
    return;
  }
  const snapshot = item ? structuredClone(item) : null;
  await api(deletePath(kind, id), { method: "DELETE" });
  const tripId = state.trip?.id;
  const restore = async () => {
    await api(restorePath(kind, tripId), { method: "POST", body: JSON.stringify(restoreBody(kind, snapshot)) });
    if (kind === "pto") await ui.render();
    else await refetchTrip(ui);
  };
  saved(undoCopy(kind), {
    label: "Undo",
    key: `undo-${kind}-${id}`,
    onClick: async () => {
      try {
        await restore();
      } catch (error) {
        fail(error, { retry: { key: `undo-${kind}-${id}`, run: restore } });
      }
    },
  });
  if (kind === "pto") await ui.render();
  else await refetchTrip(ui);
}

async function saveFlagValue(kind, id, flag, next, ui) {
  const item = findItem(state.trip, kind, id);
  if (!item || !flag) return;
  state.focusKey = `flag-${kind}-${id}-${flag}`;
  try {
    state.trip = await api(patchPath(kind, id), {
      method: "PATCH",
      body: JSON.stringify(flagBody(kind, item, flag, next)),
    });
    dismissToast(`flag-${kind}-${id}`);
    saved(flagToast(kind, flag, next));
    if (parseHash().name === "trip") ui.paint(renderTrip(state.trip, parseHash().focusDay), "home");
  } catch (error) {
    const input = [...document.querySelectorAll("[data-save-flag]")].find((node) => node.dataset.saveFlag === flag && node.dataset.kind === kind && node.dataset.id === String(id));
    if (input) input.checked = !next;
    fail(error, { retry: { key: `flag-${kind}-${id}`, run: () => saveFlagValue(kind, id, flag, next, ui) } });
  }
}

async function saveFlag(input, ui) {
  return saveFlagValue(input.dataset.kind, input.dataset.id, input.dataset.saveFlag, input.checked, ui);
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
    button.removeAttribute("aria-pressed");
    button.setAttribute("aria-checked", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
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
    const node = event.target;
    const target = node instanceof Element ? node : node?.parentElement ?? null;
    const button = target && target.closest("[data-action]");
    if (!button || button.tagName === "A") return;
    if (button.tagName === "BUTTON" && button.getAttribute("type") !== "submit") {
      event.preventDefault();
    }
    onActionSafe(() => onAction(button, ui), ui);
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target?.dataset?.saveFlag) {
      onActionSafe(() => saveFlag(target, ui), ui);
      return;
    }
    if (target?.name === "notes") updateNotesCount(target);
    if (target?.name !== "mode") return;
    const form = target.closest("form");
    const flight = form && form.querySelector("[data-flight-only]");
    if (flight) flight.hidden = target.value !== "flight";
  });
  document.addEventListener("input", (event) => {
    if (event.target?.name === "notes") updateNotesCount(event.target);
  });
  document.addEventListener("keydown", (event) => {
    const themeRadio = event.target?.closest?.("[data-action=theme]");
    if (themeRadio && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const buttons = [...document.querySelectorAll("[data-action=theme]")];
      const index = buttons.indexOf(themeRadio);
      const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const next = buttons[(index + delta + buttons.length) % buttons.length];
      if (!next) return;
      applyTheme(next.dataset.themeValue);
      next.focus();
      return;
    }
    if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
    const menu = document.querySelector("#more-menu");
    if (menu && !menu.hasAttribute("hidden")) {
      menu.setAttribute("hidden", "");
      const opener = document.querySelector("[data-action=menu]");
      if (opener) {
        opener.setAttribute("aria-expanded", "false");
        opener.focus();
      }
      return;
    }
    if (!state.edit && !state.details) return;
    const edit = state.edit;
    state.edit = null;
    state.details = null;
    state.compose = "";
    if (edit?.kind === "trip") state.focusKey = "edit-trip";
    else if (edit?.kind) state.focusKey = `edit-${edit.kind}-${edit.id}`;
    if (state.trip && parseHash().name === "trip") ui.paint(renderTrip(state.trip, parseHash().focusDay), "home");
  });
}

function updateNotesCount(field) {
  const note = field.form?.querySelector("[data-notes-count]") || document.querySelector("[data-notes-count]");
  if (!note) return;
  const length = field.value.length;
  if (length < 7000) {
    note.hidden = true;
    note.textContent = "";
    return;
  }
  note.hidden = false;
  note.textContent = `${length} of 8000 characters`;
}

async function onActionSafe(work, ui) {
  try {
    await work();
  } catch (error) {
    if (error.status === 401) {
      ui.paint(renderLogin(), "");
      const heading = document.querySelector("#app h1");
      if (heading instanceof HTMLElement) {
        heading.tabIndex = -1;
        heading.focus();
      }
      return;
    }
    fail(error, { retry: error.status === 422 ? null : { key: "action", run: () => onActionSafe(work, ui) } });
  }
}
