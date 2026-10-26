import { api } from '../api.mjs';
import { state } from '../state.mjs';
import { esc, banner, head, daysText, prettyRange } from '../helpers.mjs';
import { applyFieldError, clearFormErrors, dismissToast, fail, saved } from '../feedback.mjs';
import { weekStartsOn } from '../../../shared-browser/week.mjs';
import { formError } from '../validate.mjs';
import { DECISIONS } from '../decisions.mjs';
import { actionName } from '../copy.mjs';

const PERIOD = { weekly: 7, biweekly: 14, semimonthly: 365 / 24, monthly: 365 / 12, yearly: 365 };
const CADENCE = [
  ["weekly", "Weekly"],
  ["biweekly", "Every 2 weeks"],
  ["semimonthly", "Twice a month"],
  ["monthly", "Monthly"],
  ["yearly", "Yearly"],
];

function iso(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parse(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function pretty(value) {
  if (!value) return "";
  return parse(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function renderPto(pto, home) {
  state.ptoEntries = pto.entries || [];
  const trips = [...home.in_progress, ...home.upcoming].filter((trip) => trip.counts_as_pto);
  return `${banner()}${head("PTO", "Your balance today and what's left after each trip.")}<section id="pto-board" data-policy="${esc(JSON.stringify(pto.policy))}" data-entries="${esc(JSON.stringify(pto.entries || []))}" data-trips="${esc(JSON.stringify(trips.map((trip) => ({ id: trip.id, title: trip.title, start: trip.start_date, end: trip.end_date, days: trip.pto?.days }))))}"></section>`;
}

export function mountPto() {
  const root = document.querySelector("#pto-board");
  if (!root || root.dataset.bound) return;
  root.dataset.bound = "1";
  const policy = JSON.parse(root.dataset.policy || "{}");
  const entries = JSON.parse(root.dataset.entries || "[]");
  const trips = JSON.parse(root.dataset.trips || "[]");
  const draft = {
    balance: policy.balance_saved || "",
    asOf: policy.balance_as_of || iso(new Date()),
    amount: policy.accrual_amount || "",
    unit: policy.accrual_unit || "day",
    hours: policy.hours_per_day || "8",
    cadence: policy.accrual_cadence || "monthly",
    configured: Boolean(policy.configured),
    editing: !policy.configured,
    showAll: false,
    range: null,
  };

  let picking = false;
  root.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest("[data-pto-day]");
    if (!cell || event.button !== 0) return;
    picking = true;
    root.setPointerCapture?.(event.pointerId);
    draft.range = { start: cell.dataset.ptoDay, end: cell.dataset.ptoDay };
    markRange();
  });
  root.addEventListener("pointermove", (event) => {
    if (!picking) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const cell = hit?.closest?.("[data-pto-day]");
    if (!cell) return;
    draft.range.end = cell.dataset.ptoDay;
    markRange();
  });
  root.addEventListener("pointerup", () => {
    if (!picking) return;
    picking = false;
    if (!draft.range?.start) return;
    const [start, end] = ordered(draft.range.start, draft.range.end);
    const form = root.querySelector("[data-form=pto-entry]");
    if (form) {
      form.elements.start_date.value = start;
      form.elements.end_date.value = end;
      form.elements.label.focus();
    }
  });
  root.addEventListener("pointercancel", () => {
    picking = false;
  });
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.editPolicy != null) {
      draft.editing = true;
      paint();
      return;
    }
    if (button.dataset.cancelPolicy != null) {
      draft.editing = false;
      paint();
      return;
    }
    if (button.dataset.cadence) {
      draft.cadence = button.dataset.cadence;
      paint();
      root.querySelector(`[data-cadence="${draft.cadence}"]`)?.focus();
      return;
    }
    if (button.dataset.showAll != null) {
      draft.showAll = true;
      paint();
      return;
    }
    if (button.dataset.savePolicy != null) await savePolicy(button);
  });
  root.addEventListener("change", (event) => {
    if (event.target?.name === "accrual_unit") {
      draft.unit = event.target.value;
      paint();
      root.querySelector("#pto-unit")?.focus();
    }
  });
  root.addEventListener("keydown", (event) => {
    const radio = event.target.closest?.("[data-cadence]");
    if (!radio) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const index = CADENCE.findIndex(([value]) => value === radio.dataset.cadence);
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = CADENCE[(index + delta + CADENCE.length) % CADENCE.length][0];
    draft.cadence = next;
    paint();
    root.querySelector(`[data-cadence="${next}"]`)?.focus();
  });
  root.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.form !== "pto-entry") return;
    event.preventDefault();
    event.stopPropagation();
    clearFormErrors(form);
    const data = Object.fromEntries(new FormData(form).entries());
    const problem = formError("pto-entry", data);
    if (problem) {
      applyFieldError(form, problem.name, problem.message);
      return;
    }
    const body = { label: data.label, start_date: data.start_date, end_date: data.end_date };
    try {
      await api("/api/pto/entries", { method: "POST", body: JSON.stringify(body) });
      dismissToast("pto-entry");
      saved("Time off added.");
      state.focusKey = "pto-name";
      location.hash = "#/pto";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } catch (error) {
      fail(error, { retry: { key: "pto-entry", run: () => resubmit(body) } });
    }
  });

  async function resubmit(body) {
    await api("/api/pto/entries", { method: "POST", body: JSON.stringify(body) });
    dismissToast("pto-entry");
    saved("Time off added.");
    state.focusKey = "pto-name";
    location.hash = "#/pto";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  function readDraft() {
    const form = root.querySelector("[data-pto-form]");
    if (!form) return;
    if (form.elements.balance_days) draft.balance = form.elements.balance_days.value;
    if (form.elements.balance_as_of) draft.asOf = form.elements.balance_as_of.value;
    if (form.elements.accrual_amount) draft.amount = form.elements.accrual_amount.value;
    if (form.elements.accrual_unit) draft.unit = form.elements.accrual_unit.value;
    if (form.elements.hours_per_day) draft.hours = form.elements.hours_per_day.value;
  }

  function ordered(a, b) {
    return a <= b ? [a, b] : [b, a];
  }

  function series() {
    const start = parse(draft.asOf || iso(new Date()));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const begin = start < addDays(today, -14) ? start : addDays(today, -14);
    const days = [];
    let balance = Number(draft.balance) || 0;
    const amount = Number(draft.amount) || 0;
    const daily = draft.unit === "hour"
      ? (amount / (Number(draft.hours) || 8)) / (PERIOD[draft.cadence] || 365)
      : amount / (PERIOD[draft.cadence] || 365);
    const usage = new Map();
    for (const entry of entries) {
      const charges = Array.isArray(entry.charges) && entry.charges.length
        ? entry.charges
        : [{ on_date: entry.start_date, amount: entry.days }];
      for (const charge of charges) {
        if (!charge?.on_date) continue;
        usage.set(charge.on_date, (usage.get(charge.on_date) || 0) + Number(charge.amount || 0));
      }
    }
    for (let cursor = new Date(begin); cursor <= addDays(today, 120); cursor = addDays(cursor, 1)) {
      const key = iso(cursor);
      if (cursor > start) balance += daily;
      if (usage.has(key)) balance -= usage.get(key);
      days.push({ key, balance, used: usage.has(key) });
    }
    return days;
  }

  function policyFields() {
    const hours = DECISIONS.accrualHours && draft.unit === "hour"
      ? `<label for="pto-hours">Hours per workday</label><input id="pto-hours" name="hours_per_day" inputmode="decimal" value="${esc(draft.hours)}">`
      : `<input type="hidden" name="hours_per_day" value="${esc(draft.hours || "8")}">`;
    const unit = DECISIONS.accrualHours
      ? `<label for="pto-unit">Unit</label><select id="pto-unit" name="accrual_unit"><option value="day"${draft.unit === "day" ? " selected" : ""}>days</option><option value="hour"${draft.unit === "hour" ? " selected" : ""}>hours</option></select>`
      : `<input type="hidden" name="accrual_unit" value="day">`;
    const radios = CADENCE.map(([value, label]) => {
      const selected = value === draft.cadence;
      return `<button type="button" role="radio" data-cadence="${value}" aria-checked="${selected ? "true" : "false"}" tabindex="${selected ? "0" : "-1"}">${label}</button>`;
    }).join("");
    return `<form class="stack" data-pto-form>
      <label for="pto-balance">Current balance</label>
      <input id="pto-balance" name="balance_days" inputmode="decimal" value="${esc(draft.balance)}" aria-describedby="pto-balance-unit">
      <span id="pto-balance-unit">days</span>
      <label for="pto-asof">As of</label>
      <input id="pto-asof" name="balance_as_of" type="date" value="${esc(draft.asOf)}" required>
      <label for="pto-amount">You earn</label>
      <input id="pto-amount" name="accrual_amount" inputmode="decimal" value="${esc(draft.amount)}">
      ${unit}
      ${hours}
      <div role="radiogroup" aria-label="How often">${radios}</div>
      <div class="row-actions"><button class="btn btn-primary" type="button" data-save-policy>Save</button>${draft.configured ? `<button class="btn btn-ghost" type="button" data-cancel-policy>Cancel</button>` : ""}</div>
    </form>`;
  }

  function chart(days) {
    if (!days.length) return "";
    const max = Math.max(...days.map((day) => day.balance), 1);
    const min = Math.min(...days.map((day) => day.balance), 0);
    const width = 640;
    const height = 160;
    const span = Math.max(max - min, 1);
    const step = days.length > 1 ? (width - 36) / (days.length - 1) : width;
    const y = (value) => 20 + ((max - value) / span) * (height - 40);
    const line = days.map((day, index) => `${36 + index * step},${y(day.balance)}`).join(" ");
    const months = [];
    days.forEach((day, index) => {
      const label = day.key.slice(0, 7);
      if (!months.length || months[months.length - 1].label !== label) months.push({ label, index, balance: day.balance });
      else months[months.length - 1].balance = day.balance;
    });
    const ticks = months.filter((_, index) => index % Math.ceil(months.length / 4) === 0);
    const labels = ticks.map((tick) => `<text x="${36 + tick.index * step}" y="${height - 2}" font-size="11">${tick.label.slice(5)}</text>`).join("");
    const table = `<table class="sr-only"><caption>Projected balance through ${esc(pretty(days[days.length - 1].key))}.</caption><thead><tr><th>Month</th><th>Balance</th></tr></thead><tbody>${months.map((month) => `<tr><td>${esc(month.label)}</td><td>${esc(daysText(month.balance))}</td></tr>`).join("")}</tbody></table>`;
    return `<figure><svg class="pto-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true"><text x="0" y="16" font-size="11">${esc(daysText(max))}</text><text x="0" y="${height - 18}" font-size="11">${esc(daysText(min))}</text><polyline points="${line}" />${labels}</svg><figcaption>Projected balance through ${esc(pretty(days[days.length - 1].key))}.</figcaption>${table}</figure>`;
  }

  function addForm() {
    const [start, end] = draft.range ? ordered(draft.range.start, draft.range.end) : ["", ""];
    return `<form class="add-row is-pair" data-form="pto-entry">
      <label class="add-label" for="pto-name">Add time off</label>
      <input id="pto-name" name="label" autocomplete="off" placeholder="Name" data-focus-key="pto-name">
      <label class="add-label" for="pto-start">First day</label>
      <input id="pto-start" name="start_date" type="date" value="${esc(start)}">
      <label class="add-label" for="pto-end">Last day</label>
      <input id="pto-end" name="end_date" type="date" value="${esc(end)}" min="${esc(start)}">
      <button class="btn btn-secondary btn-sm" type="submit">Add</button>
    </form>`;
  }

  function entryList() {
    const visible = draft.showAll ? entries : entries.slice(0, 10);
    const rows = visible.map((entry) => `<div class="ride"><div><p>${esc(entry.label)}</p><p class="meta">${esc(prettyRange(entry.start_date, entry.end_date))} · ${esc(daysText(entry.days))}</p></div><button class="btn btn-ghost btn-sm btn-danger" type="button" data-action="delete" data-kind="pto" data-id="${entry.id}">${esc(actionName("Delete", "time off", entry.label))}</button></div>`).join("");
    const more = !draft.showAll && entries.length > 10 ? `<button type="button" class="btn btn-ghost btn-sm" data-show-all>Show all (${entries.length})</button>` : "";
    const tripRows = trips.map((trip) => `<p><a href="#/trips/${trip.id}">${esc(trip.title)}</a> · ${esc(prettyRange(trip.start, trip.end))} · ${esc(daysText(trip.days))}</p>`).join("");
    return `${rows}${more}${tripRows}`;
  }

  function strip(days) {
    const narrow = window.matchMedia?.("(max-width: 767px)").matches;
    const cells = narrow ? weeksOf(days) : days;
    const max = Math.max(...cells.map((day) => day.balance), 1);
    return `<div class="pto-strip" aria-hidden="true">${cells.map((day) => `<div class="pto-day${day.used ? " is-used" : ""}" data-pto-day="${day.key}" tabindex="-1" style="--fill:${Math.max(24, Math.round((Math.abs(day.balance) / max) * 100))}%"></div>`).join("")}</div>`;
  }

  function weeksOf(days) {
    const groups = [];
    days.forEach((day) => {
      const date = parse(day.key);
      const key = iso(addDays(date, -((date.getDay() - weekStartsOn() + 7) % 7)));
      const last = groups[groups.length - 1];
      if (!last || last.key !== key) groups.push({ key, end: day.key, balance: day.balance, used: day.used });
      else {
        last.end = day.key;
        last.balance = day.balance;
        last.used = last.used || day.used;
      }
    });
    return groups.map((group) => ({ key: group.key, balance: group.balance, used: group.used }));
  }

  function markRange() {
    if (!draft.range) return;
    const [from, to] = ordered(draft.range.start, draft.range.end);
    root.querySelectorAll("[data-pto-day]").forEach((cell) => {
      cell.classList.toggle("is-picked", cell.dataset.ptoDay >= from && cell.dataset.ptoDay <= to);
    });
  }

  async function savePolicy(button) {
    const form = root.querySelector("[data-pto-form]");
    clearFormErrors(form);
    const data = {
      balance_days: form.elements.balance_days.value,
      balance_as_of: form.elements.balance_as_of.value,
      accrual_amount: form.elements.accrual_amount.value,
      accrual_unit: form.elements.accrual_unit.value,
      hours_per_day: form.elements.hours_per_day.value || "8",
      accrual_cadence: draft.cadence,
    };
    draft.balance = data.balance_days;
    draft.asOf = data.balance_as_of;
    draft.amount = data.accrual_amount;
    draft.unit = data.accrual_unit;
    draft.hours = data.hours_per_day;
    const problem = formError("pto-policy", data);
    if (problem) {
      applyFieldError(form, problem.name, problem.message);
      return;
    }
    button.textContent = "Saving…";
    button.disabled = true;
    try {
      await api("/api/pto/policy", {
        method: "PUT",
        body: JSON.stringify({
          balance_days: data.balance_days || "0",
          balance_as_of: data.balance_as_of,
          accrual_amount: data.accrual_amount || "0",
          accrual_unit: data.accrual_unit,
          accrual_cadence: data.accrual_cadence,
          hours_per_day: data.hours_per_day || "8",
          annual_cap_days: null,
        }),
      });
      draft.configured = true;
      draft.editing = false;
      dismissToast("pto-policy");
      saved("PTO settings saved.");
      paint();
      root.querySelector("[data-edit-policy]")?.focus();
    } catch (error) {
      button.textContent = "Save";
      button.disabled = false;
      const reported = error?.status === 422 ? error : { message: "Couldn't save your PTO settings.", status: error?.status || 0 };
      fail(reported, {
        form,
        retry: { key: "pto-policy", run: () => savePolicy(button) },
      });
    }
  }

  function paint() {
    readDraft();
    const days = draft.configured || draft.balance ? series() : [];
    const form = draft.editing ? policyFields() : "";
    const balance = draft.configured && !draft.editing
      ? `<section class="card"><p class="kicker">Balance</p><p class="pto-balance">${esc(daysText(draft.balance || 0))}</p><p class="meta">as of ${esc(pretty(draft.asOf))} · +${esc(daysText(draft.amount || 0))} each ${esc(CADENCE.find(([value]) => value === draft.cadence)?.[1]?.toLowerCase() || "period")}</p><button class="btn btn-secondary btn-sm" type="button" data-edit-policy>Edit</button></section>`
      : "";
    const setup = !draft.configured
      ? `<section class="card empty"><h2>Set up PTO</h2><p>Tell Travel your balance and how fast you earn time off, and it will project what's left after each trip.</p>${form}</section>`
      : `${balance}${draft.editing ? `<section class="card">${form}</section>` : ""}`;
    const conflicts = (policy.conflicts || []).map((item) => `${pretty(item.on_date)} adds up to ${daysText(item.amount)} across ${(item.labels || []).join(" and ")}.`).join(" ");
    const conflictLine = conflicts ? `<p class="meta">${esc(conflicts)}</p>` : "";
    const board = draft.configured
      ? `${chart(days)}${strip(days)}${conflictLine}${entries.length ? entryList() : `<p class="meta">No time off planned.</p>`}${addForm()}`
      : "";
    root.innerHTML = `${setup}${board}`;
    root.querySelectorAll("form").forEach((item) => { item.noValidate = true; });
    markRange();
  }

  paint();
}
