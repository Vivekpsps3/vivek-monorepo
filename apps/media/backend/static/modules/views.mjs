import {
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
    primary: null,
    secondary: null,
  };
}

export function libraryEmptyHtml(filters) {
  return emptyState(libraryEmptyCopy(filters));
}

const LIBRARY_MUSIC = new Set(["artist", "album", "track"]);

function libraryKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function albumTitleOf(item) {
  const extra = item?.extra && typeof item.extra === "object" ? item.extra : {};
  return String(item?.album || item?.album_title || extra.album || extra.album_title || "").trim();
}

function ensureArtist(artists, name, index) {
  const label = String(name || "").trim() || "Unknown artist";
  const key = libraryKey(label);
  let node = artists.get(key);
  if (!node) {
    node = { key, name: label, item: null, order: index, albums: new Map(), songs: [] };
    artists.set(key, node);
  } else if (index < node.order) node.order = index;
  return node;
}

function ensureAlbum(artist, title, year) {
  const label = String(title || "").trim() || "Untitled";
  const key = libraryKey(label);
  let album = artist.albums.get(key);
  if (!album) {
    album = { key, title: label, year: year ?? null, item: null, songs: [] };
    artist.albums.set(key, album);
  } else if (album.year == null && year != null) album.year = year;
  return album;
}

function addSong(list, song) {
  const key = libraryKey(song.title);
  const open = list.find(row => libraryKey(row.title) === key && !row.item);
  if (song.item && open) {
    open.item = song.item;
    if (open.rating == null) open.rating = song.rating;
    return;
  }
  if (!song.item && list.some(row => libraryKey(row.title) === key)) return;
  if (song.item && list.some(row => row.item && row.item.id === song.item.id)) return;
  list.push(song);
}

export function buildLibraryTree(items) {
  const rest = [];
  const artists = new Map();
  const artistItems = [];
  const albumItems = [];
  const trackItems = [];
  (items || []).forEach((item, index) => {
    if (!item) return;
    if (item.kind === "artist") artistItems.push([item, index]);
    else if (item.kind === "album") albumItems.push([item, index]);
    else if (item.kind === "track") trackItems.push([item, index]);
    else if (!LIBRARY_MUSIC.has(item.kind)) rest.push(item);
  });
  artistItems.forEach(([item, index]) => {
    const artist = ensureArtist(artists, item.title, index);
    if (!artist.item) artist.item = item;
    (item.music?.albums || []).forEach(album => {
      const node = ensureAlbum(artist, album.title, album.year);
      (album.tracks || []).forEach((track, trackIndex) => {
        addSong(node.songs, {
          title: track.title || "Untitled",
          item: null,
          rating: track.rating,
          position: track.position ?? trackIndex,
        });
      });
    });
  });
  albumItems.forEach(([item, index]) => {
    const artist = ensureArtist(artists, item.creator, index);
    const node = ensureAlbum(artist, item.title, item.year);
    if (!node.item) node.item = item;
  });
  trackItems.forEach(([item, index]) => {
    const artist = ensureArtist(artists, item.creator, index);
    const song = {
      title: item.title || "Untitled",
      item,
      rating: item.rating,
      position: item.position ?? 9999,
    };
    const albumName = albumTitleOf(item);
    if (albumName) {
      addSong(ensureAlbum(artist, albumName, null).songs, song);
      return;
    }
    const matches = [...artist.albums.values()].filter(album => (
      album.songs.some(row => libraryKey(row.title) === libraryKey(song.title))
    ));
    if (matches.length === 1) addSong(matches[0].songs, song);
    else artist.songs.push(song);
  });
  const ordered = [...artists.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return {
    artists: ordered.map(artist => ({
      name: artist.name,
      item: artist.item,
      albums: [...artist.albums.values()]
        .sort((a, b) => {
          if ((a.year == null) !== (b.year == null)) return a.year == null ? 1 : -1;
          if (a.year != null && b.year != null && a.year !== b.year) return a.year - b.year;
          return a.title.localeCompare(b.title);
        })
        .map(album => ({
          title: album.title,
          year: album.year,
          item: album.item,
          songs: [...album.songs].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title)),
        })),
      songs: artist.songs,
    })),
    rest,
  };
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
