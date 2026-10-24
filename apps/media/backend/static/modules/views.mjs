import {
  dayLabel,
  emptyState,
  escapeHtml as esc,
  experienceLabel,
  genericStatusOptions,
  kindLabel,
  kindPlural,
  ratingText,
  seasonLabel,
  statusLabel,
  statusOptions,
} from "./format.mjs";
import { scoreControl } from "./score.mjs";

const KINDS = [
  ["movie", "Movie"],
  ["tv", "Series"],
  ["book", "Book"],
  ["artist", "Artist"],
  ["album", "Album"],
  ["track", "Song"],
  ["game", "Game"],
];

export function creatorLabel(kind) {
  return {
    movie: "Director",
    tv: "Creator",
    book: "Author",
    artist: "Artist",
    album: "Artist",
    track: "Artist",
    game: "Developer",
  }[kind] || "Creator";
}

export function validateAdd({ title, year }) {
  const errors = {};
  if (!String(title || "").trim()) errors.title = "Enter a title.";
  if (year !== "" && year != null && year !== undefined) {
    const text = String(year).trim();
    if (text) {
      const number = Number(text);
      if (!Number.isInteger(number) || number < 1000 || number > 3000) {
        errors.year = "Year must be a number from 1000 to 3000.";
      }
    }
  }
  return errors;
}

function kindRadios(selected) {
  return KINDS.map(([value, label]) => {
    const on = value === selected;
    return `<label class="status-mark"><input type="radio" name="kind" value="${value}"${on ? " checked" : ""}>${label}</label>`;
  }).join("");
}

function statusRadios(kind, selected) {
  const value = selected || "want";
  return statusOptions(kind).map(opt => {
    const on = opt.value === value;
    return `<label class="status-mark"><input type="radio" name="status" value="${esc(opt.value)}"${on ? " checked" : ""}>${esc(opt.label)}</label>`;
  }).join("");
}

/** One Add form for the #/new page and the search sheet. */
export function addFormInner({
  title = "",
  kind = "movie",
  creator = "",
  year = "",
  status = "want",
  note = "",
  prefilled = false,
} = {}) {
  const selected = KINDS.some(([value]) => value === kind) ? kind : "movie";
  const identity = prefilled
    ? `<div class="add-prefill"><p class="add-title">${esc(title)}</p><p class="meta">${esc([kindLabel(selected), year, creator].filter(Boolean).join(" · "))}</p><input type="hidden" name="title" value="${esc(title)}"><input type="hidden" name="kind" value="${esc(selected)}"><input type="hidden" name="creator" value="${esc(creator)}"><input type="hidden" name="year" value="${esc(year)}"></div>`
    : `<label>Title <input name="title" required value="${esc(title)}" autocomplete="off" aria-describedby="title-error"></label>
      <p id="title-error" class="field-error" hidden></p>
      <div class="status-row" role="radiogroup" aria-label="Type">${kindRadios(selected)}</div>
      <label data-creator-label>${esc(creatorLabel(selected))} <input name="creator" value="${esc(creator)}" autocomplete="off"></label>
      <label>Year <input name="year" inputmode="numeric" value="${esc(year)}" autocomplete="off" aria-describedby="year-error"></label>
      <p id="year-error" class="field-error" hidden></p>`;
  return `${identity}
    <div class="field-label">Status</div>
    <div class="status-row" role="radiogroup" aria-label="Status" data-add-status>${statusRadios(selected, status)}</div>
    <div class="field-label">Your score</div>
    ${scoreControl({ value: null, label: "Your score" })}
    <label>Note <textarea name="review" rows="3">${esc(note)}</textarea></label>
    <p class="form-error" data-form-error role="alert" hidden></p>
    <div class="dialog-actions">
      <button class="btn" type="button" data-action="close-quick">Cancel</button>
      <button class="btn btn-primary" type="submit">Add to library</button>
    </div>`;
}

export function releaseInformative(row) {
  if (!row) return false;
  if (row.platform || row.region) return true;
  return row.precision === "day" || row.precision === "month";
}

export function overviewHtml(text) {
  if (!text) return "";
  return `<p class="overview is-clamped" id="overview">${esc(text)}</p><button type="button" data-action="toggle-overview" aria-expanded="false" aria-controls="overview">More</button>`;
}

export function noteCountText(text) {
  const length = String(text || "").length;
  if (length <= 18000) return "";
  return `${length.toLocaleString("en-US")} / 20,000`;
}

export function historyWhen(row) {
  const iso = row?.finished_on || row?.started_on || "";
  return dayLabel(String(iso).slice(0, 10)) || "an undated day";
}

export function historyRemoveName(row) {
  return `Remove ${experienceLabel(row?.kind)} on ${historyWhen(row)}`;
}

export function historyLine(row) {
  const score = row?.rating == null || row?.rating === "" ? "" : ` · ${ratingText(row.rating)}`;
  const note = row?.notes ? ` · ${row.notes}` : "";
  return `${experienceLabel(row?.kind)} · ${historyWhen(row)}${score}${note}`;
}

export function loggedToast(kind) {
  return `Logged a ${experienceLabel(kind).toLowerCase()}. Your overall score didn't change.`;
}

/** Clicking a song keeps the artist in the center of Related. */
export function graphCenter(artist) {
  return artist || "";
}

export function connectionsFailureHtml() {
  return `<p>Connections couldn't load.</p><button type="button" class="btn" data-action="retry-web">Try again</button>`;
}

export function relatedHtml(nodes) {
  const rows = (nodes || []).filter(node => node && (node.name || node.title));
  if (!rows.length) return "";
  const items = rows.slice(0, 12).map(node => {
    const name = node.name || node.title;
    return `<li><a href="#/search?q=${encodeURIComponent(name)}">${esc(name)}</a></li>`;
  }).join("");
  return `<section class="related"><h2>Related</h2><ul class="plain">${items}</ul><svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12"><circle cx="6" cy="6" r="2"></circle></svg></section>`;
}

export function statusWord(kind, status) {
  if (!status) return "";
  if (!kind) return genericStatusOptions().find(row => row.value === status)?.label || status;
  return statusLabel(kind, status);
}

export function libraryEmptyCopy({ kind = "", status = "", q = "" } = {}) {
  if (q) {
    return {
      title: `No matches for “${q}”`,
      body: "Try another title, or search the public catalogs.",
      primary: { href: `#/search?q=${encodeURIComponent(q)}`, label: `Search all of Media for “${q}”` },
      secondary: { href: "#/library", label: "Clear filters" },
    };
  }
  if (kind || status) {
    const noun = kind ? kindPlural(kind).toLowerCase() : "items";
    const marked = status ? ` marked ${statusWord(kind, status)}` : "";
    return {
      title: `No ${noun}${marked}`,
      body: "Clear a filter to see the rest of your library.",
      primary: { href: "#/library", label: "Clear filters" },
      secondary: null,
    };
  }
  return {
    title: "Your library is empty",
    body: "Save things you've watched, read, played or want to.",
    primary: { href: "#/search", label: "Find something to add" },
    secondary: null,
  };
}

export function libraryEmptyHtml(filters) {
  return emptyState(libraryEmptyCopy(filters));
}

export const LIBRARY_PAGE_SIZE = 60;

export function searchResultHeading() {
  return ".result h2";
}

export function searchIdleHtml(query) {
  const q = String(query || "");
  if (!q) return `<p class="quiet">Search books, films, series, games and music. Results come from public catalogs.</p>`;
  if (q.trim().length < 2) return `<p class="quiet">Type at least 2 letters.</p>`;
  return "";
}

const EVENT_WORDS = {
  episode: "Episode",
  anticipated: "Anticipated",
  sequel: "Sequel",
  spinoff: "Spin-off",
};

export function eventWord(type) {
  return EVENT_WORDS[type] || "Anticipated";
}

export function monthEventCount(data) {
  const days = (data?.days || []).reduce((sum, day) => sum + (day.events || []).length, 0);
  return days
    + (data?.month_band || []).length
    + (data?.year_band || []).length
    + (data?.unknown || []).length;
}

export function legendHtml(data) {
  if (!monthEventCount(data)) return "";
  return `<ul class="calendar-legend">${Object.entries(EVENT_WORDS).map(([type, word]) => `<li><span class="swatch cal-${type}"></span> ${word}</li>`).join("")}</ul>`;
}

export function emptyMonthHtml(label, nextHref) {
  const monthName = String(label || "").split(" ")[0] || "this month";
  const card = emptyState({
    title: `Nothing scheduled in ${monthName}`,
    body: "Episodes from shows you save, and releases you're anticipating, show up here.",
    primary: { href: "#/search?kind=tv", label: "Find a show" },
    secondary: null,
  });
  const next = nextHref ? `<a class="btn" href="${esc(nextHref)}">Next month</a>` : "";
  return `<div class="empty-month-wrap">${card}<div class="hero-actions">${next}</div></div>`;
}

export function relativeWhen(iso, now = new Date()) {
  const text = String(iso || "");
  const day = text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}/.test(day)) return "";
  const then = new Date(`${day}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today - then) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return dayLabel(day);
}

export function noteCardHtml(item, now) {
  const score = item?.rating == null ? "" : `<span class="score-badge">${esc(ratingText(item.rating))}</span>`;
  const excerpt = item?.review_excerpt ? `<span class="excerpt">${esc(item.review_excerpt)}</span>` : "";
  return `<a class="note-card" href="#/item/${item.id}"><span class="card-title">${esc(item.title)}</span>${score}${excerpt}<span class="meta">${esc(relativeWhen(item.review_updated_at, now))}</span></a>`;
}

export function episodeCode(season, episode) {
  return `S${season} E${episode}`;
}

export function caughtUpText(show) {
  if (!show) return "";
  const watched = show.watched_count || 0;
  const total = show.episode_count || 0;
  const summary = total ? `${watched} of ${total} watched` : "";
  if (show.caught_up) return `${summary}${summary ? " · " : ""}Caught up ✓`;
  const next = show.next_episode;
  if (!next) return summary;
  return summary;
}

export function markNextLabel(show) {
  const next = show?.next_episode;
  if (!next || show.caught_up) return "";
  return `Mark ${episodeCode(next.season_number, next.episode_number)} watched`;
}
