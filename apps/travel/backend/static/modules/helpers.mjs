import { escapeHtml as esc } from '../../shared-browser/dom.mjs';
import { state } from './state.mjs';
import { daysText as daysLabel, parkingChipParts } from './labels.mjs';
export { esc };
export { nightsText, nightsAwayText, spanText, balancePhrase, formatDays } from './labels.mjs';

export function dateParts(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  return new Date(year, month - 1, day);
}
export function isoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
export function prettyDate(iso) {
  if (!iso) return "";
  return dateParts(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
export function prettyRange(start, end) {
  if (!start || !end) return "";
  if (start === end) return prettyDate(start);
  const left = dateParts(start).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const right = dateParts(end).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${left} – ${right}`;
}
export function prettyTime(iso) {
  if (!iso || !iso.includes("T")) return "";
  const [hourText, minute] = iso.split("T")[1].split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}
export function prettyWhen(iso) {
  if (!iso) return "";
  const day = prettyDate(iso.slice(0, 10));
  const time = prettyTime(iso);
  return time ? `${day}, ${time}` : day;
}
export function localInput(iso) {
  return iso ? iso.slice(0, 16) : "";
}
export function money(amount, currency = "USD") {
  if (amount == null || amount === "") return "";
  const value = Number(amount);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${amount} ${currency}`;
  }
}
export function daysText(value) {
  return daysLabel(value);
}
export function budgetText(budget) {
  if (!budget || !budget.currencies.length) return "No costs yet";
  return budget.currencies.map((item) => money(item.total, item.currency)).join(" + ");
}
export function delayText(seconds) {
  if (seconds == null) return "";
  const minutes = Math.round(Number(seconds) / 60);
  if (Math.abs(minutes) < 2) return "No reported delay";
  return minutes > 0 ? `${minutes} min late` : `${Math.abs(minutes)} min early`;
}
export function labelOf(options, value) {
  const found = options.find(([key]) => key === value);
  return found ? found[1] : value || "";
}
export function val(form, name) {
  const element = form.elements[name];
  if (!element || element.type === "checkbox") return null;
  const text = element.value.trim();
  return text ? text : null;
}
export function checked(form, name) {
  return Boolean(form.elements[name] && form.elements[name].checked);
}
function fieldOptions(type, wide, extra) {
  if (type && typeof type === "object") return { type: "text", wide: false, ...type };
  if (wide && typeof wide === "object") return { type: type || "text", wide: Boolean(wide.wide), ...wide };
  return { type: type || "text", wide: Boolean(wide), ...(extra || {}) };
}

function fieldId(name, options) {
  if (options.id) return options.id;
  const scope = options.scope ? `-${options.scope}` : `-${state.fieldSeq++}`;
  return `f-${name}${scope}`;
}

function described(id, options) {
  const ids = [];
  if (options.helper) ids.push(`${id}-help`);
  if (options.error) ids.push(`${id}-error`);
  if (options.describedby) ids.push(options.describedby);
  return ids;
}

function fieldChrome(label, name, id, options, control) {
  const ids = described(id, options);
  const help = options.helper ? `<p class="field-help" id="${id}-help">${esc(options.helper)}</p>` : "";
  const error = options.error ? `<p class="field-error" id="${id}-error" data-error-for="${esc(name)}">⚠ ${esc(options.error)}</p>` : "";
  const required = options.required ? ` <span class="field-note">(required)</span>` : "";
  return `<div class="field${options.wide ? " wide" : ""}${options.error ? " is-invalid" : ""}"><label for="${id}">${esc(label)}${required}</label>${control}${help}${error}</div>`;
}

function inputAttrs(id, name, options) {
  const ids = described(id, options);
  const parts = [
    `id="${id}"`,
    `name="${esc(name)}"`,
    options.required ? `aria-required="true"` : "",
    options.error ? `aria-invalid="true"` : "",
    ids.length ? `aria-describedby="${ids.join(" ")}"` : "",
    options.autocomplete ? `autocomplete="${esc(options.autocomplete)}"` : "",
    options.inputmode ? `inputmode="${esc(options.inputmode)}"` : "",
    options.min != null && options.min !== "" ? `min="${esc(options.min)}"` : "",
    options.max != null && options.max !== "" ? `max="${esc(options.max)}"` : "",
    options.placeholder ? `placeholder="${esc(options.placeholder)}"` : "",
    options.focusKey ? `data-focus-key="${esc(options.focusKey)}"` : "",
    options.maxlength ? `maxlength="${esc(options.maxlength)}"` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export function field(label, name, value, type = "text", wide = false, extra) {
  const options = fieldOptions(type, wide, extra);
  const id = fieldId(name, options);
  const control = `<input ${inputAttrs(id, name, options)} type="${esc(options.type || "text")}" value="${esc(value ?? "")}">`;
  return fieldChrome(label, name, id, options, control);
}
export function area(label, name, value, extra) {
  const options = fieldOptions("text", true, extra);
  options.wide = extra?.wide !== false;
  const id = fieldId(name, options);
  const control = `<textarea ${inputAttrs(id, name, options)}>${esc(value ?? "")}</textarea>`;
  return fieldChrome(label, name, id, options, control);
}
export function select(label, name, value, options, wide = false, extra) {
  const settings = typeof wide === "object" ? { wide: false, ...wide } : { wide: Boolean(wide), ...(extra || {}) };
  const id = fieldId(name, settings);
  const choices = options
    .map(([key, text]) => `<option value="${esc(key)}"${key === value ? " selected" : ""}>${esc(text)}</option>`)
    .join("");
  const control = `<select ${inputAttrs(id, name, settings)}>${choices}</select>`;
  return fieldChrome(label, name, id, settings, control);
}
export function check(label, name, on, extra) {
  const options = extra && typeof extra === "object" ? extra : {};
  const id = fieldId(name, options);
  const flag = options.saveFlag ? ` data-save-flag="${esc(options.saveFlag)}" data-kind="${esc(options.kind || "")}" data-id="${esc(options.itemId || "")}"` : "";
  const focus = options.focusKey ? ` data-focus-key="${esc(options.focusKey)}"` : "";
  return `<div class="${options.wide === false ? "" : "wide"}"><label class="check" for="${id}"><input id="${id}" name="${esc(name)}" type="checkbox"${on ? " checked" : ""}${flag}${focus}> <span>${esc(label)}</span></label></div>`;
}
export function actions(submitLabel) {
  return `<div class="row-actions"><button class="btn btn-primary" type="submit">${esc(submitLabel)}</button><button class="btn btn-ghost" type="button" data-action="cancel">Cancel</button></div>`;
}
export function banner() {
  return "";
}
export function head(title, lede, extra = "") {
  return `<header class="page-head"><div class="page-head-row"><div><h1>${esc(title)}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</div>${extra}</div></header>`;
}
export function leavePhrase(next) {
  if (!next) return "Nothing upcoming";
  if (next.phase === "in_progress") return "In progress";
  if (next.days_until === 0) return "Leaves today";
  if (next.days_until === 1) return "Leaves tomorrow";
  return `In ${next.days_until} days`;
}
export function transportSummary(item) {
  return [item.label, item.route, prettyWhen(item.depart_at), item.cost ? money(item.cost, item.currency) : ""]
    .filter(Boolean)
    .join(" · ");
}
export function flightMeta(item) {
  const bits = [];
  if (item.fa_status) bits.push(item.fa_status);
  if (item.fa_aircraft) bits.push(item.fa_aircraft);
  const depart = [item.fa_terminal_origin ? `T${item.fa_terminal_origin}` : "", item.fa_gate_origin ? `Gate ${item.fa_gate_origin}` : ""]
    .filter(Boolean)
    .join(" ");
  const arrive = [item.fa_terminal_destination ? `T${item.fa_terminal_destination}` : "", item.fa_gate_destination ? `Gate ${item.fa_gate_destination}` : ""]
    .filter(Boolean)
    .join(" ");
  if (depart) bits.push(`Departs ${depart}`);
  if (arrive) bits.push(`Arrives ${arrive}`);
  if (item.fa_baggage_claim) bits.push(`Bag ${item.fa_baggage_claim}`);
  const delay = delayText(item.fa_delay_departure_seconds);
  if (delay) bits.push(delay);
  if (item.depart_tz) bits.push(item.depart_tz);
  return bits.join(" · ");
}
export function parkingChip(item) {
  const parts = parkingChipParts(item);
  return `<span class="${parts.className}">${esc(parts.text)}</span>`;
}
export function plain(value) {
  if (value == null || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value);
}
