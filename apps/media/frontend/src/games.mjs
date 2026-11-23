/** Game cabinet. Bays follow the stored status. Progress is only what was recorded. */

import { statusLabel, statusOptions } from "./format.mjs";

const BAYS = [
  { id: "playing", status: "in_progress", label: "Playing", empty: "Nothing you're playing right now." },
  { id: "want", status: "want", label: "Want to play", empty: "No games waiting to be played." },
  { id: "played", status: "completed", label: "Played", empty: "No finished games in this cabinet." },
  { id: "anticipating", status: "anticipating", label: "Anticipating", empty: "No anticipated games in this cabinet." },
  { id: "paused", status: "paused", label: "Paused", empty: "No paused games in this cabinet." },
  { id: "dropped", status: "dropped", label: "Dropped", empty: "No dropped games in this cabinet." },
];

const PRIMARY = new Set(["playing", "want", "played"]);

export function gameStateOptions() {
  return statusOptions("game");
}

export function gameStatusWords(status) {
  return statusLabel("game", status);
}

function countText(value) {
  return String(value);
}

/** Hours or a percent the person saved. A finished game is not 100%, and a blank is not playtime. */
export function gameProgressWords(card) {
  const value = card?.progress_value;
  const recorded = typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (!recorded) return "Progress not recorded";
  const unit = typeof card?.progress_unit === "string" ? card.progress_unit : "";
  if (unit === "hour") {
    const hours = countText(value);
    return value === 1 ? `${hours} hour recorded` : `${hours} hours recorded`;
  }
  if (unit === "percent") return `${countText(value)} percent recorded`;
  const label = typeof card?.progress_label === "string" ? card.progress_label.trim() : "";
  return label ? `${label} recorded` : "Progress not recorded";
}

/** Want or anticipating, with no recorded progress. A server flag wins when present. */
export function unopenedCabinet(card) {
  if (!card || card.kind !== "game") return false;
  if (typeof card.unopened === "boolean") return card.unopened;
  const value = card.progress_value;
  if (typeof value === "number" && Number.isFinite(value)) return false;
  return card.status === "want" || card.status === "anticipating";
}

/** Playing, Want to play, and Played stay visible. Other states appear only when a game is there. */
export function visibleBays(items, status) {
  const games = Array.isArray(items) ? items.filter(Boolean) : [];
  const known = new Set(BAYS.map((bay) => bay.status));
  const bays = BAYS.map((bay) => ({
    ...bay,
    games: games.filter((game) => game.status === bay.status),
  }));
  const stray = games.filter((game) => !known.has(game.status));
  if (status) {
    const selected = bays.filter((bay) => bay.status === status);
    if (selected.length) return selected;
    return [
      {
        id: "other",
        status,
        label: gameStatusWords(status),
        empty: "No games in this state.",
        games: games.filter((game) => game.status === status),
      },
    ];
  }
  const visible = bays.filter((bay) => PRIMARY.has(bay.id) || bay.games.length > 0);
  if (stray.length) {
    visible.push({
      id: "other",
      status: "",
      label: "Other recorded states",
      empty: "",
      games: stray,
    });
  }
  return visible;
}
