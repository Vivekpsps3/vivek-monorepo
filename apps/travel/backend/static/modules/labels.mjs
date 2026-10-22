import { ARRANGEMENTS } from "./state.mjs";
import { DECISIONS } from "./decisions.mjs";

function lookup(options, value) {
  const found = options.find(([key]) => key === value);
  return found ? found[1] : value || "";
}

export function nightsText(nights) {
  const count = Number(nights) || 0;
  if (count <= 0) return "Day trip";
  if (count === 1) return "1 night";
  return `${count} nights`;
}

export function nightsAwayText(nights) {
  const count = Number(nights) || 0;
  if (count <= 0) return "Day trip";
  if (count === 1) return "1 night away";
  return `${count} nights away`;
}

export function spanText(days) {
  const count = Number(days) || 0;
  if (count === 1) return "1 day";
  return `${count} days`;
}

/** Up to D3 decimals, trailing zeros trimmed. Mirrors the server's fmt_days. */
export function formatDays(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const places = DECISIONS.ptoDayDecimals;
  const factor = 10 ** places;
  const rounded = Math.round(number * factor) / factor;
  let text = rounded.toFixed(places);
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  return text;
}

export function daysText(value) {
  const clean = formatDays(value);
  if (!clean) return "";
  const unit = clean === "1" || clean === "-1" ? "day" : "days";
  return `${clean} ${unit}`;
}

/** Negative balances read as "1.46 days over" rather than a bare minus. */
export function balancePhrase(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (number < 0) {
    const clean = formatDays(Math.abs(number));
    const unit = clean === "1" ? "day" : "days";
    return `${clean} ${unit} over`;
  }
  return daysText(number);
}

export function parkingChipParts(item) {
  if (!item) return { className: "chip", text: "" };
  if (item.necessary === "no" || item.arrangement === "none") {
    return { className: "chip", text: "Parking not needed" };
  }
  if (item.booked) {
    const place = item.place_name ? ` · ${item.place_name}` : "";
    return { className: "chip chip--ok", text: `Parking booked${place}` };
  }
  if (item.necessary === "yes") {
    return { className: "chip chip--warn", text: "Parking needed, not booked" };
  }
  return { className: "chip", text: lookup(ARRANGEMENTS, item.arrangement) || "Parking" };
}
