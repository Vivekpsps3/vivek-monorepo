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

/** Up to D3 decimals, trailing zeros trimmed. Half away from zero, same as fmt_days. */
export function formatDays(value) {
  if (value == null || value === "") return "";
  const raw = typeof value === "number" ? value.toString() : String(value).trim();
  if (!raw || !Number.isFinite(Number(raw))) return "";
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw.replace(/^\+/, "");
  if (!/^\d+(\.\d+)?$/.test(body)) return "";
  const places = DECISIONS.ptoDayDecimals;
  let [whole, frac = ""] = body.split(".");
  whole = whole.replace(/^0+(?=\d)/, "") || "0";
  const next = frac[places] || "0";
  let kept = (frac + "0".repeat(places)).slice(0, places);
  if (next >= "5") {
    const width = whole.length + kept.length;
    const bumped = (BigInt(whole + (kept || "0")) + 1n).toString().padStart(width, "0");
    whole = bumped.slice(0, bumped.length - places) || "0";
    kept = places ? bumped.slice(-places) : "";
  }
  let text = places && kept ? `${whole}.${kept}` : whole;
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  if (!text || text === "0") return "0";
  return negative ? `-${text}` : text;
}

export function daysText(value) {
  const clean = formatDays(value);
  if (!clean) return "";
  const unit = clean === "1" || clean === "-1" ? "day" : "days";
  return `${clean} ${unit}`;
}

/** Negative balances read as "1.46 days over" rather than a bare minus. */
export function balancePhrase(value) {
  const clean = formatDays(value);
  if (!clean) return "";
  if (clean.startsWith("-")) {
    const abs = clean.slice(1);
    const unit = abs === "1" ? "day" : "days";
    return `${abs} ${unit} over`;
  }
  return daysText(value);
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
