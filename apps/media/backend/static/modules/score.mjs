import { escapeHtml } from "./format.mjs";

/** Null is unrated. Numbers are 0–10 in half steps. */
export function scoreValue(raw) {
  if (raw === "" || raw == null) return null;
  const number = Number(raw);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.min(10, Math.max(0, number)) * 2) / 2;
}

/** Left half of segment n sets n−0.5 (segment 1's left half is 0.5). Right half sets n. */
export function pointerScore(segment, fraction) {
  const n = Number(segment);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return 0;
  if (fraction < 0.5) return n === 1 ? 0.5 : scoreValue(n - 0.5);
  return n;
}

/**
 * Keyboard matrix. Returns undefined when the key is not a score key,
 * null for Unrated, and a number otherwise.
 */
export function keyboardScore(current, key, shift = false) {
  const value = scoreValue(current);
  if (key === "Home") return 0;
  if (key === "End") return 10;
  if (key === "Delete" || key === "Backspace") return null;
  const step = shift ? 1 : 0.5;
  if (key === "ArrowLeft" || key === "ArrowDown") {
    if (value == null) return null;
    return scoreValue(value - step);
  }
  if (key === "ArrowRight" || key === "ArrowUp") {
    if (value == null) return 0;
    return scoreValue(value + step);
  }
  return undefined;
}

export function scoreControl({ value, label = "Your score", child = false } = {}) {
  const current = scoreValue(value);
  const groupClass = child ? "score score-child marks" : "score marks";
  const stops = [
    { score: "", text: "–", name: "Unrated" },
    { score: "0", text: "0", name: "0 out of 10" },
  ];
  for (let step = 1; step <= 10; step += 1) {
    stops.push({ score: String(step), text: String(step), name: `${step} out of 10` });
  }
  const checkedIndex = current == null ? 0 : current === 0 ? 1 : Math.ceil(current) + 1;
  const buttons = stops.map((stop, index) => {
    const n = stop.score === "" ? null : Number(stop.score);
    const full = current != null && n != null && n >= 1 && n <= Math.floor(current);
    const half = current != null && n != null && n >= 1 && current % 1 !== 0 && n === Math.ceil(current);
    const checked = index === checkedIndex;
    const name = checked && current != null && current % 1 !== 0 ? `${current} out of 10` : stop.name;
    const valuetext = checked && current != null ? ` aria-valuetext="${escapeHtml(`${current} out of 10`)}"` : "";
    return `<button type="button" class="mark${full ? " is-on" : ""}${half ? " is-half" : ""}" role="radio" aria-checked="${checked ? "true" : "false"}" aria-label="${escapeHtml(name)}"${valuetext} tabindex="${checked ? "0" : "-1"}" data-score="${stop.score}">${escapeHtml(stop.text)}</button>`;
  });
  return `<div class="${groupClass}" role="radiogroup" aria-label="${escapeHtml(label)}" data-score-value="${current == null ? "" : current}">${buttons.join("")}</div>`;
}
