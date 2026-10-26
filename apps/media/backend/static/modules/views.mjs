import {
  artworkUrl,
  dayLabel,
  emptyState,
  escapeHtml as esc,
  genericStatusOptions,
  kindLabel,
  kindPlural,
  ratingText,
  seasonLabel,
  statusLabel,
  statusOptions,
  defaultStatus,
} from "./format.mjs";
import { icon } from "./icons.mjs";
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
  const options = statusOptions(kind);
  const value = options.some(opt => opt.value === selected) ? selected : defaultStatus(kind);
  return options.map(opt => {
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
    : `<label>Title <span class="field-note">(required)</span> <input name="title" required value="${esc(title)}" autocomplete="off" aria-describedby="title-error" aria-required="true"></label>
      <p id="title-error" class="field-error" hidden></p>
      <div class="status-row" role="radiogroup" aria-label="Type">${kindRadios(selected)}</div>
      <label data-creator-label>${esc(creatorLabel(selected))} <span class="field-note">(optional)</span> <input name="creator" value="${esc(creator)}" autocomplete="off"></label>
      <label>Year <span class="field-note">(optional)</span> <input name="year" inputmode="numeric" value="${esc(year)}" autocomplete="off" aria-describedby="year-error"></label>
      <p id="year-error" class="field-error" hidden></p>`;
  return `${identity}
    <div class="field-label" data-status-label>${selected === "artist" ? "Following" : "Status"}</div>
    <div class="status-row" role="radiogroup" aria-label="Status" data-add-status>${statusRadios(selected, status)}</div>
    <div class="field-label">Your score</div>
    ${scoreControl({ value: null, label: "Your score" })}
    <label>Note <span class="field-note">(optional)</span> <textarea name="review" rows="3">${esc(note)}</textarea></label>
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
    primary: { href: "#/search", label: "Search" },
    secondary: { href: "#/new", label: "Add by title" },
  };
}

export function libraryEmptyHtml(filters) {
  return emptyState(libraryEmptyCopy(filters));
}

function posterHtml(item) {
  const art = artworkUrl(item);
  if (art) return `<img alt="" src="${esc(art)}" width="342" height="513" loading="lazy" decoding="async">`;
  const letter = kindLabel(item?.kind || "").slice(0, 1) || "M";
  return `<span class="poster-fallback" aria-hidden="true">${esc(letter)}</span>`;
}

function cardFields(item) {
  const progress = item.progress_label ? ` · ${item.progress_label}` : "";
  const star = item.favorite ? `<span class="fav-badge" aria-label="Favorite">★</span>` : "";
  const percent = item.progress_unit === "percent" && item.progress_value != null
    ? `<span class="progress-bar" style="width:${Math.max(0, Math.min(100, Number(item.progress_value)))}%"></span>`
    : "";
  const artistName = item.artist?.title && item.artist.title !== item.creator ? item.artist.title : "";
  const identity = [kindLabel(item.kind), item.year, item.creator, artistName].filter(value => value != null && value !== "").join(" · ");
  const status = item.status ? statusLabel(item.kind, item.status) : "";
  const state = `${status}${status ? " · " : ""}${ratingText(item.rating)}${progress}`;
  return { star, percent, identity, state };
}

/** One library row. Artists add a collapsed saved-child toggle that is not the Open link. */
export function libraryCard(item, { expanded = false, nested = false, savedHtml = "", ready = false } = {}) {
  if (!item || item.id == null) return "";
  const href = `#/item/${item.id}`;
  const fields = cardFields(item);
  const poster = `<span class="poster">${posterHtml(item)}${fields.star}${fields.percent}</span>`;
  const text = `<span class="card-title">${esc(item.title)}</span><span class="meta">${esc(fields.identity)}</span><span class="meta">${esc(fields.state)}</span>`;
  if (nested) {
    return `<a class="card card-nested" href="${href}">${poster}<span class="card-copy">${text}</span></a>`;
  }
  if (item.kind !== "artist") return `<a class="card" href="${href}">${poster}${text}</a>`;
  const id = esc(item.id);
  const known = Number.isInteger(item.saved_count) ? item.saved_count : null;
  const label = known == null ? "Saved albums and songs" : `Saved albums and songs, ${known}`;
  const count = known == null ? "" : `<span class="saved-count">${known}</span>`;
  const hidden = expanded ? "" : " hidden";
  const filled = ready ? ` data-ready="true"` : "";
  return `<article class="card is-artist" data-library-card="${id}"><a class="card-open" href="${href}">${poster}${text}</a><button type="button" class="saved-toggle" data-action="toggle-saved" data-artist="${id}" aria-expanded="${expanded ? "true" : "false"}" aria-controls="saved-${id}" aria-label="${esc(label)}">${icon("chevron")}${count}</button><div id="saved-${id}" class="saved-children"${hidden}${filled}>${savedHtml}</div></article>`;
}

function childCard(row, kind) {
  if (!row || row.id == null) return "";
  return libraryCard({
    id: row.id,
    kind,
    title: row.title || "Untitled",
    year: row.year,
    creator: row.creator || "",
    artwork_url: row.artwork_url,
    rating: row.rating,
    status: row.status || "",
  }, { nested: true });
}

/** Saved albums and songs for one artist. Remote discography rows do not belong here. */
export function savedExpansion(artistId, music, { browse = false } = {}) {
  const rows = [];
  (music?.albums || []).forEach(album => {
    const card = childCard(album, "album");
    if (card) rows.push(card);
    (album?.tracks || []).forEach(track => {
      const song = childCard(track, "track");
      if (song) rows.push(song);
    });
  });
  (music?.songs || []).forEach(song => {
    const card = childCard(song, "track");
    if (card) rows.push(card);
  });
  const link = `<a href="#/item/${esc(artistId)}/discography">Browse discography</a>`;
  if (!rows.length) return `<p class="quiet">No saved albums or songs.</p>${browse ? link : ""}`;
  return `<div class="saved-list">${rows.join("")}</div>${browse ? link : ""}`;
}

export const DISCOGRAPHY_RELEASES = [
  ["studio", "Studio albums"],
  ["single", "Singles"],
  ["ep", "EPs"],
  ["live", "Live"],
  ["remix", "Remixes"],
  ["compilation", "Compilations"],
];

const DISCOGRAPHY_KIND = {
  studio: "Album",
  single: "Single",
  ep: "EP",
  live: "Live",
  remix: "Remix",
  compilation: "Compilation",
};

export function discographyRelease(value) {
  return DISCOGRAPHY_RELEASES.some(([item]) => item === value) ? value : "studio";
}

export function discographyNote(release) {
  if (!release || release === "studio") {
    return "Studio albums only. Singles, EPs, live albums, remixes, and compilations are listed separately, so a missing title here is not proof it does not exist.";
  }
  const label = DISCOGRAPHY_RELEASES.find(([item]) => item === release)?.[1] || "Releases";
  return `${label} from the public catalog. Nothing here is saved until you add it.`;
}

function discoverAction(row, kind, album) {
  if (row?.saved) {
    const open = row.saved_id ? ` <a href="#/item/${esc(row.saved_id)}">Open</a>` : "";
    return `<span class="in-library">Saved</span>${open}`;
  }
  if (!row?.source_id) return `<span class="meta">No provider id</span>`;
  const year = row.year ? ` data-year="${esc(row.year)}"` : "";
  const art = row.artwork_url ? ` data-art="${esc(row.artwork_url)}"` : "";
  const albumSource = album?.source_id ? ` data-album-source="${esc(album.source_id)}"` : "";
  const albumTitle = album?.title ? ` data-album-title="${esc(album.title)}"` : "";
  const position = kind === "track" && row.position ? ` data-position="${esc(row.position)}"` : "";
  return `<button type="button" class="btn btn-secondary btn-sm" data-action="save-discovered" data-kind="${kind}" data-source="${esc(row.source_id)}" data-title="${esc(row.title || "Untitled")}"${year}${art}${albumSource}${albumTitle}${position}>Add</button>`;
}

export function discographyHtml({
  artistId,
  artist = "",
  release = "studio",
  albums = [],
  partial = false,
  loading = false,
  error = "",
} = {}) {
  const selected = discographyRelease(release);
  const filters = DISCOGRAPHY_RELEASES.map(([value, label]) => {
    const on = value === selected;
    return `<button type="button" class="flag${on ? " is-on" : ""}" data-action="discography-filter" data-release="${value}" aria-pressed="${on ? "true" : "false"}">${esc(label)}</button>`;
  }).join("");
  const kindWord = DISCOGRAPHY_KIND[selected] || "Album";
  const rows = (albums || []).map(album => {
    const tracks = (album.tracks || []).map(track => {
      const title = track.position ? `${track.position}. ${track.title || "Untitled"}` : (track.title || "Untitled");
      return `<li class="discog-track"><span>${esc(title)}</span>${discoverAction(track, "track", album)}</li>`;
    }).join("");
    const meta = [album.year, kindWord].filter(value => value != null && value !== "").join(" · ");
    return `<article class="discog-album" data-source="${esc(album.source_id || "")}"><div class="discog-album-head"><h2>${esc(album.title || "Untitled")}</h2><p class="meta">${esc(meta)}</p>${discoverAction(album, "album", null)}</div>${tracks ? `<ol class="discog-tracks">${tracks}</ol>` : ""}</article>`;
  }).join("");
  const status = loading && !(albums || []).length ? `<p class="quiet" role="status">Loading discography…</p>` : "";
  const problem = error
    ? `<p class="quiet" role="alert">${esc(error)}</p><button type="button" class="btn" data-action="discography-retry">Try again</button>`
    : "";
  const empty = !loading && !error && !(albums || []).length ? `<p class="quiet">Nothing in this list.</p>` : "";
  const more = partial && !loading ? `<button type="button" class="btn" data-action="discography-more">Load more</button>` : "";
  const loadingMore = loading && (albums || []).length ? `<p class="quiet" role="status">Loading more…</p>` : "";
  return `<article class="discog-page" data-discography="${esc(artistId)}"><p class="eyebrow"><a href="#/item/${esc(artistId)}">${esc(artist || "Artist")}</a></p><h1>Discography</h1><p class="quiet">${esc(discographyNote(selected))}</p><div class="chip-row" role="group" aria-label="Release type">${filters}</div>${problem}<div class="discog-list" aria-busy="${loading ? "true" : "false"}">${status}${rows}${empty}</div>${loadingMore}${more}</article>`;
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
