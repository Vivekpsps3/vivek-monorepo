import { episodeLabel } from "./next-episode.mjs";

const VIEWED_ON = /^\d{4}-\d{2}-\d{2}$/;

/** A user-recorded film date, or "" when blank. Null means the value is not a date. */
export function recordedViewing(value) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") return null;
  const day = value.slice(0, 10);
  return VIEWED_ON.test(day) ? day : null;
}

/**
 * The one film fact on a poster. Planned and watched differ by the status the
 * person recorded. A date is included only when that person recorded one.
 */
export function filmShelf(status, viewedOn) {
  const recorded = recordedViewing(viewedOn);
  const date = recorded ? recorded : null;
  if (status === "want" || status === "anticipating") {
    return { tone: "planned", fact: "Planned", viewedOn: null };
  }
  if (status === "completed") {
    return { tone: "watched", fact: "Watched", viewedOn: date };
  }
  if (status === "in_progress") {
    return { tone: "watching", fact: "Watching", viewedOn: null };
  }
  if (status === "paused") return { tone: "other", fact: "Paused", viewedOn: null };
  if (status === "dropped") return { tone: "other", fact: "Dropped", viewedOn: null };
  return { tone: "other", fact: "Saved", viewedOn: null };
}

const LIFECYCLE_LABEL = {
  ongoing: "Ongoing",
  ended: "Ended",
  canceled: "Canceled",
  planned: "Planned",
  unknown: "Status unknown",
};

function continuationCode(continuation) {
  const season = Number(continuation?.season);
  const episode = Number(continuation?.episode);
  if (!Number.isInteger(season) || !Number.isInteger(episode)) return "";
  return episodeLabel(season, episode);
}

/**
 * Series lifecycle and watched progress stay different facts.
 * Caught up is never renamed to ended, and a next aired episode wins over caught up.
 */
export function seriesShelf(card) {
  const raw = String(card?.lifecycle?.raw_value || "").trim().toLowerCase();
  const state = String(card?.lifecycle?.state || "");
  let lifecycle = "unknown";
  if (raw === "planned" || raw === "pilot") lifecycle = "planned";
  else if (state === "ongoing" || state === "ended" || state === "canceled") lifecycle = state;
  const continuation =
    card?.continuation && typeof card.continuation === "object" ? card.continuation : null;
  const code = continuation ? continuationCode(continuation) : "";
  let progress = "none";
  let fact = "No episodes logged";
  if (continuation?.state === "next" && code) {
    progress = "next";
    fact = `Next ${code}`;
  } else if (card?.caught_up === true) {
    progress = "caught-up";
    fact = "Caught up";
  } else if (continuation?.state === "upcoming" && code) {
    progress = "upcoming";
    fact = `Next ${code}`;
  }
  return {
    lifecycle,
    lifecycleLabel: LIFECYCLE_LABEL[lifecycle],
    progress,
    fact,
  };
}

function episodeChoice(episode) {
  if (!episode || typeof episode !== "object") return null;
  const season = Number(episode.season_number);
  const number = Number(episode.episode_number);
  const id = Number(episode.id);
  if (!Number.isInteger(season) || !Number.isInteger(number) || !Number.isInteger(id)) return null;
  return {
    episode_id: id,
    season,
    episode: number,
    title: episode.title == null ? null : episode.title,
    air_date: episode.air_date ?? null,
    state: episode.released ? "next" : "upcoming",
  };
}

/** The shelf continuation, taken from the show payload. A null title stays null. */
export function continuationFromShow(show) {
  if (!show || typeof show !== "object") return null;
  const upcoming = show.next_episode ? null : show.upcoming_episodes?.[0];
  return episodeChoice(show.next_episode ?? upcoming ?? null);
}

/** The continuation already stored on a card. This is not a second calculation. */
export function showContinuation(card) {
  const row = card?.continuation;
  if (!row || typeof row !== "object") return null;
  return row;
}
