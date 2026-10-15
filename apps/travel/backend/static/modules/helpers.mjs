import { escapeHtml as esc } from '../../shared-browser/dom.mjs';
import { state } from './state.mjs';
export { esc };

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
  if (value == null || value === "") return "";
  const rounded = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(rounded)) return "";
  const clean = rounded.toFixed(2).replace(/\.?0+$/, "");
  const unit = clean === "1" || clean === "-1" ? "day" : "days";
  return `${clean} ${unit}`;
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
export function field(label, name, value, type = "text", wide = false) {
  const id = `f-${name}-${state.fieldSeq++}`;
  return `<div class="${wide ? "wide" : ""}"><label for="${id}">${esc(label)}</label><input id="${id}" name="${esc(name)}" type="${type}" value="${esc(value ?? "")}"></div>`;
}
export function area(label, name, value) {
  const id = `f-${name}-${state.fieldSeq++}`;
  return `<div class="wide"><label for="${id}">${esc(label)}</label><textarea id="${id}" name="${esc(name)}">${esc(value ?? "")}</textarea></div>`;
}
export function select(label, name, value, options, wide = false) {
  const id = `f-${name}-${state.fieldSeq++}`;
  const choices = options
    .map(([key, text]) => `<option value="${esc(key)}"${key === value ? " selected" : ""}>${esc(text)}</option>`)
    .join("");
  return `<div class="${wide ? "wide" : ""}"><label for="${id}">${esc(label)}</label><select id="${id}" name="${esc(name)}">${choices}</select></div>`;
}
export function check(label, name, on) {
  const id = `f-${name}-${state.fieldSeq++}`;
  return `<div class="wide"><label class="check" for="${id}"><input id="${id}" name="${esc(name)}" type="checkbox"${on ? " checked" : ""}> ${esc(label)}</label></div>`;
}
export function actions(submitLabel) {
  return `<div class="row-actions"><button class="btn btn-primary" type="submit">${esc(submitLabel)}</button><button class="btn btn-ghost" type="button" data-action="cancel">Cancel</button></div>`;
}
export function banner() {
  return state.error ? `<p class="banner" role="alert">${esc(state.error)}</p>` : "";
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
  if (item.necessary === "no" || item.arrangement === "none") return `<span class="chip">Parking not needed</span>`;
  if (item.booked) return `<span class="chip chip--ok">Parking booked${item.place_name ? ` · ${esc(item.place_name)}` : ""}</span>`;
  if (item.necessary === "yes") return `<span class="chip chip--warn">Parking needed, not booked</span>`;
  return `<span class="chip">${esc(labelOf(ARRANGEMENTS, item.arrangement))}</span>`;
}
export function plain(value) {
  if (value == null || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value);
}
