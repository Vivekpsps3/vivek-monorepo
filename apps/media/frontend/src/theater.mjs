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

/** The progress stamp shared by a library card and the show payload it came from. */
export function progressKey(card) {
  const row = card?.continuation;
  return [
    card?.watched_count ?? "",
    card?.caught_up === true ? "1" : "0",
    row?.episode_id ?? "",
    row?.state ?? "",
    row?.season ?? "",
    row?.episode ?? "",
  ].join(":");
}

/** The same stamp, read from a detail show without a second next-episode rule. */
export function progressKeyFromShow(show) {
  return progressKey({
    watched_count: show?.watched_count,
    caught_up: show?.caught_up === true,
    continuation: continuationFromShow(show),
  });
}

const SEAT_LABEL = {
  watched: "Watched",
  next: "Next",
  aired: "Aired",
  future: "Future",
  unknown: "Air date unknown",
  special: "Special",
};

function seatAirDate(value) {
  if (typeof value !== "string") return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * One saved episode in the lounge.
 * Future and unknown air dates are not watched and are not the series lifecycle.
 * The next seat is the show's next aired episode, not a new calculation.
 */
export function episodeSeat(episode, nextId) {
  if (!episode || typeof episode !== "object") return null;
  const season = Number(episode.season_number);
  const number = Number(episode.episode_number);
  const id = Number(episode.id);
  if (!Number.isInteger(season) || !Number.isInteger(number) || !Number.isInteger(id)) return null;
  const airDate = seatAirDate(episode.air_date);
  const watchedOn = seatAirDate(episode.watched_on);
  const watched = episode.watched === true;
  const released = episode.released === true;
  let place = "aired";
  if (watched) place = "watched";
  else if (airDate == null) place = "unknown";
  else if (!released) place = "future";
  else if (season <= 0) place = "special";
  else if (nextId != null && id === Number(nextId)) place = "next";
  return {
    id,
    season,
    episode: number,
    title: episode.title == null ? null : String(episode.title),
    airDate,
    watchedOn: watched ? watchedOn : null,
    place,
    label: SEAT_LABEL[place],
    code: episodeLabel(season, number),
  };
}

/** Seasons in saved order. Season 0 stays the specials row. */
export function seatingRows(episodes, nextId) {
  const grouped = new Map();
  for (const episode of episodes || []) {
    const seat = episodeSeat(episode, nextId);
    if (!seat) continue;
    const row = grouped.get(seat.season) || [];
    row.push(seat);
    grouped.set(seat.season, row);
  }
  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([season, seats]) => ({
      season,
      label: season <= 0 ? "Specials" : `Season ${season}`,
      seats: seats.sort((left, right) => left.episode - right.episode || left.id - right.id),
    }));
}
