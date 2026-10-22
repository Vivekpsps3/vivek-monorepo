import { api } from '../api.mjs';
import { fail, saved, applyFieldError } from '../feedback.mjs';
import { parseHash } from '../route-parser.mjs';
import { DECISIONS } from '../decisions.mjs';
import { legFields } from './new-trip.mjs';
import { readLeg, emptyInput } from '../actions/forms.mjs';
import {
  blankRange,
  cityColor,
  clearRange,
  dayName,
  defaultTripName,
  dragRange,
  monthCells,
  moveFocus,
  pickDay,
  saveState,
  segmentDays,
  segments,
  shortRange,
  summaryText,
  toggleSplit,
  toIso,
  weekdayHeads,
} from '../composer-model.mjs';

function escapeAttr(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export function mountComposer() {
  const root = document.querySelector("#trip-composer");
  if (!root || root.dataset.bound) return;
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
  let dragging = false;
  let dragOrigin = "";
  let dragMoved = false;

  root.addEventListener("pointerdown", (event) => {
    const day = event.target.closest("[data-day]");
    if (!day || event.button !== 0) return;
    if (event.target.closest("input, select, a, button:not([data-day])")) return;
    dragging = true;
    dragMoved = false;
    dragOrigin = day.dataset.day;
    root.setPointerCapture?.(event.pointerId);
  });
  root.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const day = hit?.closest?.("[data-day]");
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
  });
  root.addEventListener("keydown", (event) => {
    const day = event.target.closest?.("[data-day]");
    if (!day) return;
    if (event.key === "Enter") {
      event.preventDefault();
      model = pickDay(model, day.dataset.day, { shift: event.shiftKey });
      draw({ announce: true });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      model = clearRange(model);
      draw({ announce: true });
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
    root.querySelector(`[data-day="${next}"]`)?.focus();
  });
  root.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.dataset.cityStart) {
      model.cities[input.dataset.cityStart] = input.value;
      if (!model.nameTouched) model.tripName = defaultTripName(model);
      const name = root.querySelector("[data-trip-name]");
      if (name && !model.nameTouched) name.value = model.tripName;
    }
    if (input.dataset.tripName != null) {
      model.nameTouched = true;
      model.tripName = input.value;
    }
  });
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.shift) {
      model.anchor = new Date(model.anchor.getFullYear(), model.anchor.getMonth() + Number(button.dataset.shift), 1);
      draw({ announce: false });
      return;
    }
    if (button.dataset.split != null) {
      const select = button.parentElement?.querySelector("[data-split-day]") || root.querySelector(`[data-split-for="${button.dataset.split}"]`);
      model = toggleSplit(model, select?.value || button.dataset.split);
      draw({ announce: true });
      return;
    }
    if (button.dataset.unsplit != null) {
      model = toggleSplit(model, button.dataset.unsplit);
      draw({ announce: true });
      return;
    }
    if (button.dataset.save != null) await save();
  });

  function narrow() {
    return window.matchMedia?.("(max-width: 767px)").matches;
  }

  function shell() {
    root.innerHTML = `
      <div class="composer-bar">
        <button type="button" data-shift="-1" aria-label="Previous month">‹ Previous month</button>
        <button type="button" data-shift="1" aria-label="Next month">Next month ›</button>
        <label class="check"><input type="checkbox" data-pto checked> <span>Counts as PTO</span></label>
        <button type="button" class="btn btn-primary" data-save aria-disabled="true" aria-describedby="save-help">Save trip</button>
      </div>
      <p id="save-help" class="field-help">Pick dates and name at least one city.</p>
      <div class="composer-months"></div>
      <div class="composer-cities"></div>
      ${DECISIONS.moreDetails ? `<details class="more-details"><summary>Add travel details (optional)</summary>${legFields("outbound")}<div id="connections"></div><p><button class="btn btn-ghost btn-sm" type="button" data-action="add-connection">Add a connection</button></p>${legFields("inbound")}</details>` : ""}`;
    root.querySelector("[data-pto]")?.addEventListener("change", (event) => {
      model.pto = event.target.checked;
    });
  }

  function draw({ announce }) {
    const offsets = narrow() ? [0] : [0, 1];
    const months = offsets.map((offset) => new Date(model.anchor.getFullYear(), model.anchor.getMonth() + offset, 1));
    const summary = summaryText(model.start, model.end);
    const gate = saveState({ ...model, tripName: model.tripName || defaultTripName(model) });
    const host = root.querySelector(".composer-months");
    if (host) host.innerHTML = months.map((month) => drawMonth(month)).join("");
    const saveButton = root.querySelector("[data-save]");
    saveButton?.setAttribute("aria-disabled", gate.ok ? "false" : "true");
    const help = root.querySelector("#save-help");
    if (help && !root.querySelector("[aria-invalid=true]")) help.textContent = gate.ok ? "" : "Pick dates and name at least one city.";
    paintDays();
    paintCities();
    const live = document.querySelector("#composer-summary");
    if (live && (announce || !live.textContent)) live.textContent = summary;
  }

  function drawMonth(monthDate) {
    const label = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const cells = monthCells(monthDate);
    const rows = [];
    for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7));
    const heads = weekdayHeads(narrow()).map((day) => `<abbr title="${escapeAttr(day.title)}">${escapeAttr(day.label)}</abbr>`).join("");
    const body = rows.map((row) => `<div role="row">${row.map((cell) => {
      const selected = Boolean(model.start && cell.iso >= model.start && model.end && cell.iso <= model.end) || cell.iso === model.start;
      const tab = cell.iso === focusIso ? "0" : "-1";
      return `<button type="button" role="gridcell" class="composer-day${cell.outside ? " is-out" : ""}" data-day="${cell.iso}" tabindex="${tab}" aria-selected="${selected ? "true" : "false"}" aria-label="${escapeAttr(dayName(cell.iso, model))}">${cell.day}</button>`;
    }).join("")}</div>`).join("");
    return `<section><h2>${escapeAttr(label)}</h2><div class="composer-grid" role="grid" aria-label="${escapeAttr(label)}" style="touch-action:none"><div role="row" class="composer-dow">${heads}</div>${body}</div></section>`;
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
      day.tabIndex = value === focusIso ? 0 : -1;
    });
  }

  function paintCities() {
    const box = root.querySelector(".composer-cities");
    if (!box) return;
    const parts = segments(model);
    box.innerHTML = parts.map((part, index) => {
      const days = segmentDays(part).filter((day) => day > part.arrive);
      const options = days.map((day) => `<option value="${day}">${escapeAttr(shortRange(day, day))}</option>`).join("");
      const remove = index > 0 ? `<button type="button" data-unsplit="${escapeAttr(part.key)}">Remove split</button>` : "";
      return `<div class="composer-city" style="--city:${cityColor(index)}">
        <span class="city-swatch" aria-hidden="true"></span>
        <label for="city-${escapeAttr(part.key)}">City ${index + 1} · ${escapeAttr(shortRange(part.arrive, part.leave))}</label>
        <input id="city-${escapeAttr(part.key)}" data-city-start="${escapeAttr(part.key)}" value="${escapeAttr(model.cities[part.key] || "")}" autocomplete="off">
        ${options ? `<select data-split-day data-split-for="${escapeAttr(part.key)}" aria-label="Split ${index + 1} after">${options}</select><button type="button" data-split="${escapeAttr(part.key)}">Split…</button>` : ""}
        ${remove}
      </div>`;
    }).join("") + (parts.length ? `<label for="trip-name">Trip name</label><input id="trip-name" data-trip-name value="${escapeAttr(model.tripName || defaultTripName(model))}" autocomplete="off">` : "");
  }

  async function save() {
    model.tripName = root.querySelector("[data-trip-name]")?.value ?? model.tripName;
    root.querySelectorAll("[data-city-start]").forEach((input) => {
      model.cities[input.dataset.cityStart] = input.value;
    });
    const gate = saveState(model);
    const help = root.querySelector("#save-help");
    if (!gate.ok) {
      if (help) help.textContent = gate.helper;
      root.querySelector("[data-save]")?.setAttribute("aria-disabled", "true");
      if (gate.focus === "grid") root.querySelector("[role=grid]")?.querySelector("[data-day]")?.focus();
      if (gate.focus === "city") {
        const input = root.querySelector("[data-city-start]");
        applyFieldError(root, input?.name || "city", "Name the city.");
        if (input) {
          input.name = "city";
          input.setAttribute("aria-invalid", "true");
          input.focus();
        }
      }
      return;
    }
    const stays = gate.parts
      .map((part) => ({ city: String(model.cities[part.key] || "").trim(), arrive_on: part.arrive, leave_on: part.leave }))
      .filter((stay) => stay.city);
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
      saved("Trip created.");
      location.hash = `#/trips/${trip.id}`;
    } catch (reason) {
      const detail = reason?.message || "Something went wrong.";
      fail(
        { message: `Couldn't save the trip. ${detail}`, status: reason?.status || 0 },
        { retry: { key: "composer-save", run: () => save() } },
      );
    }
  }

  shell();
  draw({ announce: true });
  window.addEventListener("resize", () => draw({ announce: false }));
}
