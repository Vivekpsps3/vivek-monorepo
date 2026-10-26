import { api } from '../api.mjs';
import { applyFieldError, clearFieldError, clearFormErrors, dismissToast, fail, saved } from '../feedback.mjs';
import { parseHash } from '../route-parser.mjs';
import { DECISIONS } from '../decisions.mjs';
import { legFields } from './new-trip.mjs';
import { readLeg, emptyInput } from '../actions/forms.mjs';
import {
  addDays,
  blankRange,
  changeCity,
  cityColor,
  clearRange,
  confirmSpan,
  dayName,
  defaultTripName,
  dragRange,
  gridDay,
  guardSpan,
  monthRows,
  moveChange,
  moveFocus,
  parseIso,
  pickDay,
  removeChange,
  saveState,
  segments,
  shortRange,
  summaryText,
  toIso,
  weekdayHeads,
} from '../composer-model.mjs';

function escapeAttr(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

let stopComposer = () => {};

export function destroyComposer() {
  stopComposer();
  stopComposer = () => {};
}

function daysBetween(after, through) {
  const days = [];
  if (!after || !through) return days;
  for (let cursor = addDays(after, 1); cursor <= through; cursor = addDays(cursor, 1)) days.push(cursor);
  return days;
}

export function mountComposer() {
  const root = document.querySelector("#trip-composer");
  if (!root) {
    destroyComposer();
    return;
  }
  if (root.dataset.bound) return;
  destroyComposer();
  root.dataset.bound = "1";
  const seeded = parseHash().start;
  const today = new Date();
  let model = blankRange(seeded);
  model.anchor = new Date(today.getFullYear(), today.getMonth(), 1);
  if (seeded) {
    const start = new Date(`${seeded}T00:00:00`);
    model.anchor = new Date(start.getFullYear(), start.getMonth(), 1);
  }
  let focusIso = seeded || toIso(new Date(model.anchor.getFullYear(), model.anchor.getMonth(), 1));
  let saving = null;
  let dragging = false;
  let dragOrigin = "";
  let dragMoved = false;
  let dragX = 0;
  let dragY = 0;

  function endDrag() {
    dragging = false;
    dragOrigin = "";
  }

  function focusDay(iso) {
    root.querySelector(`[data-day="${iso}"]:not(.is-out)`)?.focus();
  }

  root.addEventListener("pointerdown", (event) => {
    const day = event.target.closest("[data-day]:not(.is-out)");
    if (!day || event.button !== 0) return;
    if (event.target.closest("input, select, a, button:not([data-day])")) return;
    dragging = true;
    dragMoved = false;
    dragOrigin = day.dataset.day;
    dragX = event.clientX;
    dragY = event.clientY;
    root.setPointerCapture?.(event.pointerId);
  });
  root.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    if (!dragMoved && Math.hypot(event.clientX - dragX, event.clientY - dragY) < 8) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const day = hit?.closest?.("[data-day]:not(.is-out)");
    if (!day || day.dataset.day === dragOrigin) return;
    dragMoved = true;
    model = dragRange(model, dragOrigin, day.dataset.day);
    draw({ announce: false });
  });
  root.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    if (!dragMoved && dragOrigin) {
      model = pickDay(model, dragOrigin, { shift: event.shiftKey });
      focusIso = dragOrigin;
    }
    dragOrigin = "";
    draw({ announce: true });
    if (focusIso) focusDay(focusIso);
  });
  root.addEventListener("pointercancel", endDrag);
  root.addEventListener("lostpointercapture", () => {
    if (dragging) endDrag();
  });
  root.addEventListener("keydown", (event) => {
    const day = event.target.closest?.("[data-day]");
    if (!day || day.classList.contains("is-out")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      const stay = day.dataset.day;
      model = clearRange(model);
      focusIso = stay;
      draw({ announce: true });
      focusDay(stay);
      return;
    }
    if ((event.key === "Home" || event.key === "End") && event.ctrlKey) {
      event.preventDefault();
      const next = event.key === "Home" ? rangeEdge("first") : rangeEdge("last");
      focusIso = next;
      draw({ announce: false });
      focusDay(next);
      return;
    }
    const next = moveFocus(day.dataset.day, event.key);
    if (!next || next === day.dataset.day) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) return;
    event.preventDefault();
    focusIso = next;
    const date = new Date(`${next}T00:00:00`);
    model.anchor = new Date(date.getFullYear(), date.getMonth(), 1);
    draw({ announce: false });
    focusDay(next);
  });
  root.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.dataset.cityStart) {
      model.cities[input.dataset.cityStart] = input.value;
      if (input.name === "city" && input.value.trim()) {
        clearFieldError(root, "city");
        model.cityError = false;
      }
      if (!model.nameTouched) syncTitle();
    }
    if (input.dataset.tripName != null) {
      model.nameTouched = true;
      model.tripName = input.value;
      syncTitle();
    }
    refreshGate();
  });
  root.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.pto != null) {
      model.pto = target.checked;
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset.range) {
      const start = root.querySelector("[data-range=start]")?.value || "";
      const end = root.querySelector("[data-range=end]")?.value || "";
      readDraft();
      model = guardSpan(model, start, end);
      const reveal = target.value || model.start;
      if (reveal && !model.pendingSpan) {
        const date = parseIso(reveal);
        model.anchor = new Date(date.getFullYear(), date.getMonth(), 1);
      }
      draw({ announce: true });
      return;
    }
    if (!(target instanceof HTMLSelectElement)) return;
    readDraft();
    if (target.dataset.changeOn) {
      const nextIso = target.value;
      model = moveChange(model, target.dataset.changeOn, nextIso);
      draw({ announce: true });
      root.querySelector(`[data-change-on="${CSS.escape(nextIso)}"]`)?.focus();
    } else if (target.dataset.addChange != null) {
      model.addChoice = target.value;
    }
  });
  root.addEventListener("click", async (event) => {
    const day = event.target.closest("[data-day]:not(.is-out)");
    if (day && event.detail === 0) {
      model = pickDay(model, day.dataset.day, { shift: event.shiftKey });
      focusIso = day.dataset.day;
      draw({ announce: true });
      focusDay(focusIso);
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.shift) {
      model.anchor = new Date(model.anchor.getFullYear(), model.anchor.getMonth() + Number(button.dataset.shift), 1);
      draw({ announce: false });
      return;
    }
    if (button.dataset.addCity != null) {
      readDraft();
      const iso = root.querySelector("[data-add-change]")?.value;
      model = changeCity(model, iso);
      model.addChoice = "";
      draw({ announce: true });
      if (iso) root.querySelector(`[data-city-start="${CSS.escape(iso)}"]`)?.focus();
      return;
    }
    if (button.dataset.removeChange != null) {
      readDraft();
      model = removeChange(model, button.dataset.removeChange);
      draw({ announce: true });
      return;
    }
    if (button.dataset.confirmSpan != null) {
      readDraft();
      model = confirmSpan(model);
      if (model.start) {
        const date = parseIso(model.start);
        model.anchor = new Date(date.getFullYear(), date.getMonth(), 1);
      }
      draw({ announce: true });
      return;
    }
    if (button.dataset.keepSpan != null) {
      model = { ...model, pendingSpan: null };
      draw({ announce: true });
      return;
    }
    if (button.dataset.save != null) await save();
  });

  function narrow() {
    return window.matchMedia?.("(max-width: 767px)").matches;
  }

  function rangeEdge(which) {
    const start = new Date(model.anchor.getFullYear(), model.anchor.getMonth(), 1);
    const endMonth = narrow() ? start : new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const end = new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0);
    return toIso(which === "first" ? start : end);
  }

  function shell() {
    root.innerHTML = `
      <div class="composer-dates">
        <div>
          <label for="trip-start">Leave date</label>
          <input id="trip-start" type="date" data-range="start" value="${escapeAttr(model.start || "")}">
        </div>
        <div>
          <label for="trip-end">Return date</label>
          <input id="trip-end" type="date" data-range="end" value="${escapeAttr(model.end || "")}">
        </div>
        <p id="composer-span" class="composer-span"></p>
        <div id="composer-range-note" class="composer-range-note" hidden>
          <p></p>
          <button type="button" class="btn btn-ghost btn-sm" data-confirm-span>Shorten anyway</button>
          <button type="button" class="btn btn-ghost btn-sm" data-keep-span>Keep these dates</button>
        </div>
      </div>
      <div class="composer-bar">
        <button type="button" data-shift="-1" aria-label="Previous month">‹ Previous month</button>
        <button type="button" data-shift="1" aria-label="Next month">Next month ›</button>
      </div>
      <div class="composer-months"></div>
      <div class="composer-cities"></div>
      <p class="composer-title" data-title-preview></p>
      <details class="rename-trip">
        <summary>Rename trip</summary>
        <label for="trip-name">Trip title</label>
        <input id="trip-name" data-trip-name value="" autocomplete="off">
      </details>
      <div class="composer-save">
        <label class="check"><input type="checkbox" data-pto checked> <span>Counts as PTO</span></label>
        <button type="button" class="btn btn-primary" data-save aria-disabled="true" aria-describedby="save-help">Save trip</button>
      </div>
      <p id="save-help" class="field-help">Pick dates and name every destination.</p>
      ${DECISIONS.moreDetails ? `<details class="more-details"><summary>Add travel details (optional)</summary>${legFields("outbound")}<div id="connections"></div><p><button class="btn btn-ghost btn-sm" type="button" data-action="add-connection">Add a connection</button></p>${legFields("inbound")}</details>` : ""}`;
  }

  function focusToken(node) {
    if (!(node instanceof HTMLElement) || !root.contains(node)) return null;
    if (node.dataset.cityStart) return { kind: "city", value: node.dataset.cityStart, start: node.selectionStart, end: node.selectionEnd };
    if (node.dataset.tripName != null) return { kind: "title", start: node.selectionStart, end: node.selectionEnd };
    if (node.dataset.changeOn) return { kind: "change", value: node.dataset.changeOn };
    if (node.dataset.addChange != null) return { kind: "add" };
    return null;
  }

  function restoreFocus(token) {
    if (!token) return;
    let node = null;
    if (token.kind === "city") node = root.querySelector(`[data-city-start="${CSS.escape(token.value)}"]`);
    else if (token.kind === "title") node = root.querySelector("[data-trip-name]");
    else if (token.kind === "change") node = root.querySelector(`[data-change-on="${CSS.escape(token.value)}"]`);
    else if (token.kind === "add") node = root.querySelector("[data-add-change]");
    if (!(node instanceof HTMLElement)) return;
    node.focus({ preventScroll: true });
    if (typeof token.start === "number" && node.setSelectionRange) {
      try { node.setSelectionRange(token.start, token.end); } catch { /* date and select inputs */ }
    }
  }

  function readDraft() {
    const parts = segments(model);
    const cities = { ...(model.cities || {}) };
    root.querySelectorAll("[data-city-start]").forEach((input) => {
      if (!parts.length || parts.some((part) => part.key === input.dataset.cityStart)) {
        cities[input.dataset.cityStart] = input.value;
      }
    });
    model.cities = cities;
    const named = root.querySelector("[data-trip-name]");
    if (named && model.nameTouched) model.tripName = named.value;
    else if (!model.nameTouched) model.tripName = "";
    const pto = root.querySelector("[data-pto]");
    if (pto) model.pto = pto.checked;
  }

  function draw({ announce }) {
    const token = focusToken(document.activeElement);
    const offsets = narrow() ? [0] : [0, 1];
    const months = offsets.map((offset) => new Date(model.anchor.getFullYear(), model.anchor.getMonth() + offset, 1));
    const summary = summaryText(model.start, model.end);
    const host = root.querySelector(".composer-months");
    if (host) host.innerHTML = months.map((month) => drawMonth(month)).join("");
    refreshGate();
    paintDays();
    paintCities();
    syncDates();
    syncTitle();
    restoreFocus(token);
    const live = document.querySelector("#composer-summary");
    if (live && (announce || !live.textContent)) live.textContent = summary;
  }

  function syncDates() {
    const start = root.querySelector("[data-range=start]");
    const end = root.querySelector("[data-range=end]");
    if (start) start.value = model.start || "";
    if (end) end.value = model.end || "";
    const span = root.querySelector("#composer-span");
    if (span) span.textContent = summaryText(model.start, model.end);
    const note = root.querySelector("#composer-range-note");
    const text = note?.querySelector("p");
    const confirm = root.querySelector("[data-confirm-span]");
    const pending = model.pendingSpan;
    if (!note || !text || !confirm) return;
    if (!pending?.dropped?.length) {
      note.hidden = true;
      return;
    }
    note.hidden = false;
    const names = pending.dropped.map((item) => item.city).join(", ");
    if (pending.reset) {
      text.textContent = `Starting over drops ${names}. Start over, or keep these dates.`;
      confirm.textContent = "Start over";
    } else if (!pending.end || !pending.start) {
      text.textContent = `That date change drops ${names}. Change the dates, or keep these dates.`;
      confirm.textContent = "Change the dates";
    } else {
      text.textContent = `${names} would fall outside ${shortRange(pending.start, pending.end)}. Shorten anyway, or keep these dates.`;
      confirm.textContent = "Shorten anyway";
    }
  }

  function syncTitle() {
    const generated = defaultTripName({ ...model, nameTouched: false });
    const custom = model.nameTouched ? String(model.tripName || "").trim() : "";
    const shown = custom || generated;
    const preview = root.querySelector("[data-title-preview]");
    if (preview) preview.textContent = shown ? `Trip title: ${shown}` : "Trip title follows the destinations.";
    const input = root.querySelector("[data-trip-name]");
    if (input && document.activeElement !== input && !model.nameTouched) input.value = generated;
  }

  function refreshGate() {
    const gate = saveState(model);
    const button = root.querySelector("[data-save]");
    if (saving) button?.setAttribute("aria-disabled", "true");
    else button?.setAttribute("aria-disabled", gate.ok ? "false" : "true");
    const help = root.querySelector("#save-help");
    if (help && !root.querySelector("[aria-invalid=true]")) help.textContent = gate.ok ? "" : (gate.helper || "Pick dates and name every destination.");
  }

  function drawMonth(monthDate) {
    const label = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const rows = monthRows(monthDate);
    const heads = weekdayHeads(narrow()).map((day) => `<abbr role="columnheader" title="${escapeAttr(day.title)}">${escapeAttr(day.label)}</abbr>`).join("");
    const body = rows.map((row) => `<div role="row">${row.map((cell) => {
      const selected = Boolean(model.start && cell.iso >= model.start && model.end && cell.iso <= model.end) || cell.iso === model.start;
      return gridDay(cell, { focusIso, selected, label: escapeAttr(dayName(cell.iso, model)) });
    }).join("")}</div>`).join("");
    return `<section><h2>${escapeAttr(label)}</h2><div class="composer-grid" role="grid" aria-multiselectable="true" aria-label="${escapeAttr(label)}"><div role="row" class="composer-dow">${heads}</div>${body}</div></section>`;
  }

  function paintDays() {
    const parts = segments(model);
    root.querySelectorAll("[data-day]").forEach((day) => {
      const value = day.dataset.day;
      const index = parts.findIndex((part) => value >= part.arrive && value <= part.leave);
      day.classList.toggle("is-in", index >= 0 && value !== model.start && value !== model.end);
      day.classList.toggle("is-start", value === model.start);
      day.classList.toggle("is-end", Boolean(model.end) && value === model.end);
      day.classList.toggle("is-split", model.splits.includes(value));
      day.style.setProperty("--city", index >= 0 ? cityColor(index) : "");
      day.setAttribute("aria-label", dayName(value, model));
      day.setAttribute("aria-selected", index >= 0 || value === model.start ? "true" : "false");
      day.tabIndex = value === focusIso && !day.classList.contains("is-out") ? 0 : -1;
    });
    const stops = [...root.querySelectorAll("[data-day]")].filter((day) => !day.classList.contains("is-out"));
    if (stops.length && !stops.some((day) => day.tabIndex === 0)) {
      focusIso = stops[0].dataset.day;
      stops[0].tabIndex = 0;
    }
  }

  function optionList(days, selected) {
    return days.map((day) => `<option value="${day}"${day === selected ? " selected" : ""}>${escapeAttr(shortRange(day, day))}</option>`).join("");
  }

  function paintCities() {
    const box = root.querySelector(".composer-cities");
    if (!box) return;
    const parts = segments(model);
    const cards = parts.map((part, index) => {
      const label = index === 0 ? "Destination city" : "Next destination";
      const boundary = index > 0 ? daysBetween(parts[index - 1].arrive, part.leave) : [];
      const change = boundary.length ? `<div class="change-city">
          <label for="change-${escapeAttr(part.key)}">Change city on</label>
          <select id="change-${escapeAttr(part.key)}" data-change-on="${escapeAttr(part.key)}">${optionList(boundary, part.key)}</select>
          <button type="button" class="btn btn-ghost btn-sm" data-remove-change="${escapeAttr(part.key)}">Remove change</button>
        </div>` : "";
      return `<div class="composer-city" style="--city:${cityColor(index)}">
        <span class="city-swatch" aria-hidden="true"></span>
        <label for="city-${escapeAttr(part.key)}">${label} <span class="field-note">(required)</span></label>
        <input id="city-${escapeAttr(part.key)}" data-city-start="${escapeAttr(part.key)}" value="${escapeAttr(model.cities[part.key] || "")}" autocomplete="off" aria-required="true">
        ${change}
      </div>`;
    }).join("");
    const last = parts[parts.length - 1];
    const openDays = last ? daysBetween(last.arrive, last.leave) : [];
    const selectedAdd = openDays.includes(model.addChoice) ? model.addChoice : openDays[Math.floor((openDays.length - 1) / 2)] || "";
    const add = openDays.length ? `<div class="change-city">
        <label for="add-change">Change city on</label>
        <select id="add-change" data-add-change>${optionList(openDays, selectedAdd)}</select>
        <button type="button" class="btn btn-ghost btn-sm" data-add-city>Add destination</button>
      </div>` : "";
    const preview = parts.map((part) => {
      const city = String(model.cities[part.key] || "").trim();
      const when = shortRange(part.arrive, part.leave);
      return `<li>${escapeAttr(city ? `${city} · ${when}` : when)}</li>`;
    }).join("");
    box.innerHTML = `${cards}${add}${preview ? `<ul class="segment-preview">${preview}</ul>` : ""}`;
    if (model.cityError) {
      const input = root.querySelector(`[data-city-start="${CSS.escape(model.cityErrorKey || "")}"]`) || root.querySelector("[data-city-start]");
      if (input) input.name = "city";
      applyFieldError(root, "city", "Name the city.", { focus: false });
    }
  }

  async function save() {
    if (saving) return saving;
    readDraft();
    clearFormErrors(root);
    clearFieldError(root, "city");
    model.cityError = false;
    const gate = saveState(model);
    const help = root.querySelector("#save-help");
    if (!gate.ok) {
      if (help) help.textContent = gate.helper;
      root.querySelector("[data-save]")?.setAttribute("aria-disabled", "true");
      if (gate.focus === "grid") root.querySelector('[data-day][tabindex="0"]')?.focus();
      if (gate.focus === "city") {
        const input = root.querySelector(`[data-city-start="${CSS.escape(gate.cityKey || "")}"]`) || root.querySelector("[data-city-start]");
        model.cityErrorKey = gate.cityKey || input?.dataset.cityStart || "";
        if (input) input.name = "city";
        model.cityError = true;
        applyFieldError(root, "city", "Name the city.");
      }
      return;
    }
    const stays = gate.parts.map((part) => ({
      city: part.city,
      arrive_on: part.arrive,
      leave_on: part.leave,
    }));
    const transports = [];
    for (const role of ["outbound", "inbound"]) {
      const node = root.querySelector(`[data-leg=${role}]`);
      if (!node) continue;
      const leg = readLeg(node, role);
      if (leg.depart_place || leg.arrive_place || leg.carrier || leg.number) transports.push(leg);
    }
    root.querySelectorAll("[data-connection]").forEach((row) => {
      const leg = readLeg(row, "connection");
      if (leg.depart_place || leg.arrive_place) transports.push(leg);
    });
    const button = root.querySelector("[data-save]");
    button?.setAttribute("aria-busy", "true");
    button?.setAttribute("aria-disabled", "true");
    if (button) button.textContent = "Saving…";
    saving = submit(gate, stays, transports);
    return saving;
  }

  async function submit(gate, stays, transports) {
    try {
      const trip = await api("/api/trips", {
        method: "POST",
        body: JSON.stringify({
          title: gate.title,
          start_date: model.start,
          end_date: model.end,
          status: "planning",
          counts_as_pto: model.pto,
          stays,
          transports,
          notes: emptyInput(root, "notes"),
        }),
      });
      dismissToast("composer-save");
      saved("Trip created.");
      location.hash = `#/trips/${trip.id}`;
    } catch (reason) {
      saving = null;
      const button = root.querySelector("[data-save]");
      if (button) button.textContent = "Save trip";
      button?.removeAttribute("aria-busy");
      refreshGate();
      const detail = reason?.message || "Something went wrong.";
      fail(
        { message: `Couldn't save the trip. ${detail}`, status: reason?.status || 0 },
        { retry: { key: "composer-save", run: () => save() } },
      );
    }
  }

  shell();
  draw({ announce: true });
  let wasNarrow = narrow();
  const onResize = () => {
    if (!root.isConnected) {
      destroyComposer();
      return;
    }
    if (narrow() === wasNarrow) return;
    wasNarrow = narrow();
    draw({ announce: false });
  };
  window.addEventListener("resize", onResize);
  stopComposer = () => window.removeEventListener("resize", onResize);
}
