import { api, loginHref } from "./api.mjs";
import {
  dayLabel,
  draftKey,
  escapeHtml as esc,
  experienceLabel,
  experienceOptions,
  kindLabel,
  monthCells,
  monthLabel,
  ratingText,
  releaseLabel,
  seasonLabel,
  safeUrl,
  shiftMonth,
  statusLabel,
  statusOptions,
  whenLabel,
} from "./format.mjs";

const app = document.querySelector("#app");
const notice = document.querySelector("#notice");
let searchResults = [];
let quickIndex = -1;

function route() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  const episode = path.match(/^\/item\/(\d+)\/episode\/(\d+)$/);
  if (episode) return { name: "episode", id: Number(episode[1]), episodeId: Number(episode[2]), params };
  const season = path.match(/^\/item\/(\d+)\/season\/(\d+)$/);
  if (season) return { name: "season", id: Number(season[1]), seasonNumber: Number(season[2]), params };
  const item = path.match(/^\/item\/(\d+)$/);
  if (item) return { name: "item", id: Number(item[1]), params };
  if (path === "/library") return { name: "library", params };
  if (path === "/calendar") return { name: "calendar", params };
  if (path === "/search") return { name: "search", params };
  if (path === "/new") return { name: "new", params };
  return { name: "home", params };
}

function setNotice(message, kind = "status") {
  notice.textContent = message || "";
  notice.dataset.kind = kind;
}

function fail(error) {
  if (error?.status === 401) {
    location.assign(loginHref());
    return;
  }
  setNotice(error?.message || "Something went wrong.", "alert");
}

function options(rows, selected) {
  return rows.map(row => `<option value="${esc(row.value)}"${row.value === selected ? " selected" : ""}>${esc(row.label)}</option>`).join("");
}

function poster(item) {
  const art = safeUrl(item.artwork_url);
  if (art) return `<img alt="" src="${esc(art)}" width="342" height="513">`;
  return `<span class="poster-fallback">${esc(kindLabel(item.kind))}</span>`;
}

function card(item) {
  return `<a class="card" href="#/item/${item.id}">
    <span class="poster">${poster(item)}</span>
    <span class="card-title">${esc(item.title)}</span>
    <span class="meta">${esc([kindLabel(item.kind), item.year, item.creator].filter(Boolean).join(" · "))}</span>
    <span class="meta">${esc(statusLabel(item.kind, item.status))} · ${esc(ratingText(item.rating))}</span>
  </a>`;
}

function syncTheme() {
  const choice = document.documentElement.getAttribute("data-theme-choice") || "system";
  document.querySelectorAll("[data-theme-value]").forEach(button => {
    const on = button.dataset.themeValue === choice;
    button.setAttribute("aria-pressed", String(on));
  });
}

function setTheme(choice) {
  const theme = choice === "light" || choice === "dark"
    ? choice
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-theme-choice", choice);
  try { localStorage.setItem("media-theme", choice); } catch { /* private mode */ }
  syncTheme();
}

async function viewHome() {
  const summary = await api("/api/summary");
  app.innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow">Journal</p>
        <h1>${summary.counts.in_progress ? `${summary.counts.in_progress} in progress` : "Now"}</h1>
      </div>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/search">Search</a>
        <a class="btn" href="#/new">Add manually</a>
      </div>
    </section>
    ${section("In progress", summary.currently, `<a href="#/search">Search</a>`)}
    ${releaseSection(summary.upcoming)}
    ${reviewSection(summary.recent_reviews)}
    <p class="footnote"><a href="#/calendar">Episode calendar</a> · <a href="#/library">Open the full library</a></p>
  `;
}

async function viewCalendar(params) {
  const requested = params.get("month") || "";
  const query = requested ? `?month=${encodeURIComponent(requested)}` : "";
  const data = await api(`/api/calendar${query}`);
  const label = monthLabel(data.month) || "Calendar";
  const [year] = String(data.month || "").split("-");
  const byDay = new Map((data.days || []).map(day => [day.date, day.events || []]));
  const cells = monthCells(data.month);
  const heads = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    .map(name => `<div class="cal-head">${name}</div>`)
    .join("");
  const grid = cells.map(day => {
    if (!day) return `<div class="cal-day is-outside"></div>`;
    const events = byDay.get(day) || [];
    const today = day === data.today ? " is-today" : "";
    const chips = events.map(event => eventChip(event, true)).join("");
    return `<div class="cal-day${today}"><time class="cal-num" datetime="${esc(day)}">${Number(day.slice(8))}</time>${chips}</div>`;
  }).join("");
  const agendaDays = (data.days || []).filter(day => (day.events || []).length);
  const agenda = agendaDays.length
    ? `<ul class="calendar-agenda">${agendaDays.map(day => `<li><time datetime="${esc(day.date)}">${esc(dayLabel(day.date))}</time><div class="cal-events">${(day.events || []).map(event => eventChip(event, false)).join("")}</div></li>`).join("")}</ul>`
    : `<ul class="calendar-agenda"><li><p class="quiet">Nothing on a specific day this month.</p></li></ul>`;
  app.innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow">Calendar</p>
        <h1>${esc(label)}</h1>
      </div>
      <div class="hero-actions">
        <a class="btn" href="#/calendar?month=${esc(shiftMonth(data.month, -1))}">Previous</a>
        <a class="btn" href="#/calendar?month=${esc(shiftMonth(data.month, 1))}">Next</a>
      </div>
    </section>
    <p class="calendar-legend">
      <span><span class="swatch cal-episode"></span> Episode</span>
      <span><span class="swatch cal-anticipated"></span> Anticipated</span>
      <span><span class="swatch cal-sequel"></span> Sequel</span>
      <span><span class="swatch cal-spinoff"></span> Spin-off</span>
    </p>
    ${data.partial ? `<p class="quiet">Some episode dates and follow-ups could not be loaded yet. What you already saved is still here.</p>` : ""}
    <div class="calendar-grid" aria-label="${esc(label)}">${heads}${grid}</div>
    ${agenda}
    ${band(`Sometime in ${label}`, data.month_band)}
    ${band(`Sometime in ${year || "this year"}`, data.year_band)}
    ${band("Date not set", data.unknown)}
  `;
}

function eventChip(event, compact) {
  const type = ["episode", "anticipated", "sequel", "spinoff"].includes(event.type) ? event.type : "anticipated";
  const className = `cal-event cal-${type}${event.watched ? " is-watched" : ""}`;
  const text = chipText(event, compact);
  const id = Number(event.entry_id);
  if (Number.isInteger(id) && id > 0) return `<a class="${className}" href="#/item/${id}">${esc(text)}</a>`;
  return `<span class="${className}">${esc(text)}</span>`;
}

function chipText(event, compact) {
  if (event.type === "episode") {
    const name = event.title && event.title !== event.short ? `${event.short} ${event.title}` : (event.short || event.title || "Episode");
    return [event.detail, name].filter(Boolean).join(" · ");
  }
  if (compact && event.because) return `${event.title} · ${event.because}`;
  if (compact) return event.short || event.title || "";
  return [event.detail, event.title, event.because].filter(Boolean).join(" · ");
}

function band(title, events) {
  if (!events || !events.length) return "";
  const items = events.map(event => `<li>${eventChip(event, false)}</li>`).join("");
  return `<section><h2>${esc(title)}</h2><ul class="plain">${items}</ul></section>`;
}

function section(title, items, empty) {
  const body = items.length
    ? `<div class="grid">${items.map(card).join("")}</div>`
    : empty;
  return `<section><h2>${esc(title)}</h2>${body}</section>`;
}

function continueItem(items) {
  return (items || []).find(item => item.state === "next") || null;
}

function episodePlace(episode) {
  const season = episode.season_number ?? episode.season;
  const number = episode.episode_number ?? episode.episode;
  const title = episode.title ? ` · ${episode.title}` : "";
  return `${seasonLabel(season)}, Episode ${number}${title}`;
}

function continuePoint(item) {
  if (!item) return "";
  return `<a class="continue" href="#/item/${item.entry_id}?season=${encodeURIComponent(item.season)}">
    <span class="eyebrow">Continue</span>
    <span class="continue-title">${esc(item.show_title)}</span>
    <span class="meta">${esc(episodePlace(item))}</span>
  </a>`;
}

function releaseSection(items) {
  if (!items.length) return "";
  const rows = items.map(item => `<li><a href="#/item/${item.id}">${esc(item.title)}</a><span>${esc(whenLabel(item))}</span></li>`).join("");
  return `<section><h2>Anticipated</h2><ul class="plain">${rows}</ul></section>`;
}

function reviewSection(items) {
  if (!items.length) return "";
  const rows = items.map(item => `<li><a href="#/item/${item.id}">${esc(item.title)}</a><span>${esc(ratingText(item.rating))}${item.review_excerpt ? ` · ${esc(item.review_excerpt)}` : ""}</span></li>`).join("");
  return `<section><h2>Recent notes</h2><ul class="plain">${rows}</ul></section>`;
}

async function viewLibrary(params) {
  const kind = params.get("kind") || "";
  const status = params.get("status") || "";
  const q = params.get("q") || "";
  const sort = params.get("sort") || "activity";
  const query = new URLSearchParams();
  if (kind) query.set("kind", kind);
  if (status) query.set("status", status);
  if (q) query.set("q", q);
  query.set("sort", sort);
  const [payload, summary] = await Promise.all([
    api(`/api/library?${query}`),
    api("/api/summary"),
  ]);
  const resume = (!kind || kind === "tv") ? continueItem(summary.next_episodes) : null;
  const kinds = ["", "movie", "tv", "book", "artist", "album", "track", "game"].map(value => ({
    value,
    label: value ? kindLabel(value) : "All types",
  }));
  const statuses = [{ value: "", label: "Any status" }, ...statusOptions(kind || "movie").map(row => ({ ...row }))];
  if (!kind) {
    statuses.splice(1, statuses.length, 
      { value: "want", label: "Want" },
      { value: "anticipating", label: "Anticipating" },
      { value: "in_progress", label: "In progress" },
      { value: "completed", label: "Finished" },
      { value: "paused", label: "Paused" },
      { value: "dropped", label: "Dropped" },
    );
  }
  app.innerHTML = `
    <section class="hero"><div><p class="eyebrow">Library</p><h1>Saved</h1></div></section>
    ${continuePoint(resume)}
    <form class="filters" data-action="library-filter">
      <label>Type <select name="kind">${options(kinds, kind)}</select></label>
      <label>Status <select name="status">${options(statuses, status)}</select></label>
      <label>Sort <select name="sort">${options([
        { value: "activity", label: "Recent activity" },
        { value: "added", label: "Date added" },
        { value: "rating", label: "Your rating" },
        { value: "release", label: "Release year" },
      ], sort)}</select></label>
      <label>Search <input name="q" value="${esc(q)}" type="search" placeholder="Title or creator"></label>
      <button class="btn" type="submit">Apply</button>
    </form>
    ${payload.items.length ? `<div class="grid">${payload.items.map(card).join("")}</div>` : `<p class="quiet">Nothing matches. <a href="#/search">Search public metadata</a> or <a href="#/new">add it yourself</a>.</p>`}
  `;
}

function viewSearch(params) {
  const q = params.get("q") || "";
  const kind = params.get("kind") || "";
  app.innerHTML = `
    <section class="hero"><div><p class="eyebrow">Search</p><h1>Find it, then make it yours.</h1></div></section>
    <form class="filters" data-action="search-now" id="search-form">
      <label class="grow">Search <input id="search-q" name="q" value="${esc(q)}" type="search" autocomplete="off" placeholder="Title, artist, or author"></label>
      <label>Type <select id="search-kind" name="kind">${options([
        { value: "", label: "All" },
        { value: "movie", label: "Movies" },
        { value: "tv", label: "Series" },
        { value: "book", label: "Books" },
        { value: "artist", label: "Artists" },
        { value: "album", label: "Albums" },
        { value: "track", label: "Songs" },
        { value: "game", label: "Games" },
      ], kind)}</select></label>
    </form>
    <div id="search-results"><p class="quiet">Type at least two letters. If a work is missing, <a href="#/new">add it manually</a>.</p></div>
  `;
  if (q.length >= 2) runSearch();
}

function providerLine(providers) {
  const names = { tmdb: "TMDB", musicbrainz: "MusicBrainz", openlibrary: "Open Library", rawg: "RAWG", tvmaze: "TVMaze", itunes: "iTunes" };
  const states = { ok: "available", unconfigured: "not configured", error: "unavailable" };
  const bits = Object.entries(providers).map(([name, state]) => `${names[name] || name} ${states[state] || state}`);
  return `<p class="quiet">${esc(bits.join(" · "))}. Your notes are not sent to these services.</p>`;
}

function renderResults(payload) {
  if (!payload.results.length) {
    return `${providerLine(payload.providers)}<p class="quiet">No public match. <a href="#/new?title=${encodeURIComponent(payload.query || "")}">Add “${esc(payload.query)}” manually</a>.</p>`;
  }
  const rows = payload.results.map((item, index) => `
    <article class="result">
      <span class="poster poster-sm">${poster(item)}</span>
      <div>
        <h2>${esc(item.title)}</h2>
        <p class="meta">${esc([kindLabel(item.kind), item.year, item.creator].filter(Boolean).join(" · "))}</p>
        ${item.overview ? `<p class="clamp">${esc(item.overview)}</p>` : ""}
        ${item.already_saved ? `<span class="followed" aria-label="In your library"></span>` : `<button class="follow" type="button" data-action="${item.kind === "artist" ? "follow" : "open-quick"}" data-index="${index}" aria-label="${item.kind === "artist" ? "Follow" : "Add"}"></button>`}
      </div>
    </article>`).join("");
  return `${providerLine(payload.providers)}<div class="results">${rows}</div>`;
}

async function runSearch() {
  const input = document.querySelector("#search-q");
  const kind = document.querySelector("#search-kind")?.value || "";
  const box = document.querySelector("#search-results");
  if (!input || !box) return;
  const q = input.value.trim();
  if (q.length < 2) {
    box.innerHTML = `<p class="quiet">Type at least two letters.</p>`;
    return;
  }
  box.innerHTML = `<p class="quiet" role="status">Searching…</p>`;
  try {
    const payload = await api(`/api/search?${new URLSearchParams({ q, kind })}`);
    if (document.querySelector("#search-q")?.value.trim() !== q) return;
    searchResults = payload.results;
    box.innerHTML = renderResults(payload);
  } catch (error) {
    fail(error);
    box.innerHTML = `<p class="quiet" role="alert">${esc(error.message)}</p><p class="quiet"><a href="#/new">Add it manually</a></p>`;
  }
}

function viewNew(params) {
  const kinds = [
    ["movie", "Movie"], ["tv", "Series"], ["book", "Book"], ["artist", "Artist"],
    ["album", "Album"], ["track", "Song"], ["game", "Game"],
  ];
  app.innerHTML = `
    <form class="stack" data-action="create-manual">
      <input name="title" required value="${esc(params.get("title") || "")}" aria-label="Title" placeholder="Title">
      <div class="status-row">${kinds.map(([value, label], index) => `<label class="status-mark"><input type="radio" name="kind" value="${value}"${index === 0 ? " checked" : ""}>${label}</label>`).join("")}</div>
      <button class="btn btn-primary" type="submit">Add</button>
    </form>`;
}

function scoreMarks(value, label) {
  const current = value === "" || value == null || Number.isNaN(Number(value)) ? null : Number(value);
  const buttons = [];
  for (let step = 1; step <= 10; step += 1) {
    const on = current != null && step <= Math.round(current);
    buttons.push(`<button type="button" class="mark${on ? " is-on" : ""}" data-score="${step}" aria-pressed="${on ? "true" : "false"}" aria-label="${esc(label)} ${step}"></button>`);
  }
  return `<div class="marks" role="group" aria-label="${esc(label)}">${buttons.join("")}</div>`;
}

function chooseSeason(entry, forcedSeason) {
  const seasons = entry.show?.seasons || [];
  const wanted = forcedSeason == null ? route().params.get("season") : String(forcedSeason);
  if (wanted != null && wanted !== "" && seasons.some(item => String(item.season_number) === String(wanted))) {
    return Number(wanted);
  }
  const next = entry.show?.next_episode?.season_number;
  if (seasons.some(item => item.season_number === next)) return next;
  return seasons[0]?.season_number ?? null;
}

async function viewItem(id, forcedSeason = null) {
  const entry = await api(`/api/entries/${id}`);
  const seasonNumber = entry.kind === "tv" ? chooseSeason(entry, forcedSeason) : null;
  if (entry.kind === "tv" && seasonNumber != null) {
    const desired = `#/item/${id}?season=${seasonNumber}`;
    if (location.hash !== desired) {
      history.replaceState(null, "", `${location.pathname}${location.search}${desired}`);
    }
  }
  const draft = readDraft(id);
  const review = draft ?? entry.review ?? "";
  const progress = entry.kind === "book" || entry.kind === "game";
  app.innerHTML = `
    <article class="detail">
      <div class="poster poster-lg">${poster(entry)}</div>
      <div>
        <p class="eyebrow">${esc(kindLabel(entry.kind))}${entry.catalog.source === "manual" ? " · Added manually" : ""}</p>
        <h1>${esc(entry.title)}</h1>
        <p class="lede">${esc([entry.creator, entry.year].filter(Boolean).join(" · "))}</p>
        ${entry.catalog.overview ? `<p class="overview">${esc(entry.catalog.overview)}</p>` : ""}
        ${externalRatings(entry.catalog.external_ratings)}
        ${releaseLine(entry.releases)}
        ${entry.kind === "tv" ? showEpisodes(entry, seasonNumber) : ""}
        ${entry.kind === "movie" || entry.kind === "tv" ? `<div class="web" data-web="${entry.id}" hidden></div>` : ""}
        <div class="opinion" data-id="${entry.id}" data-favorite="${entry.favorite ? "true" : "false"}" data-anticipated="${entry.anticipated ? "true" : "false"}">
          <div class="status-row">${statusOptions(entry.kind).map(opt => `<button type="button" class="status-mark${opt.value === entry.status ? " is-on" : ""}" data-set-status="${opt.value}">${esc(opt.label)}</button>`).join("")}</div>
          ${scoreMarks(entry.rating, "Score")}
          <div class="flag-row">
            <button type="button" class="flag${entry.favorite ? " is-on" : ""}" data-flag="favorite" aria-pressed="${entry.favorite ? "true" : "false"}">Favorite</button>
            <button type="button" class="flag${entry.anticipated ? " is-on" : ""}" data-flag="anticipated" aria-pressed="${entry.anticipated ? "true" : "false"}">Soon</button>
          </div>
          <textarea name="review" data-draft="${esc(draftKey(entry.id))}" data-review="${entry.id}" rows="3" aria-label="Note">${esc(review)}</textarea>
          ${progress ? `<input name="progress_value" data-progress="${entry.id}" data-unit="${esc(entry.progress_unit || "percent")}" inputmode="decimal" value="${entry.progress_value ?? ""}" aria-label="Progress">` : ""}
        </div>
        ${entry.kind === "artist" ? musicBlock(entry) : ""}
        ${experienceBlock(entry)}
        <form data-action="delete-entry" data-id="${entry.id}"><button class="btn btn-danger" type="submit">Remove</button></form>
      </div>
    </article>
  `;
  loadWeb(entry);
}

function progressUnits(kind) {
  if (kind === "book") return [{ value: "page", label: "Pages" }, { value: "percent", label: "Percent" }];
  return [{ value: "percent", label: "Percent" }, { value: "hour", label: "Hours" }];
}

function externalRatings(rows) {
  if (!rows?.length) return "";
  const items = rows.map(row => `<li><span>${esc(row.label || row.provider)}</span><strong>${esc(row.value)}</strong><span>${esc(row.scale || "")}</span></li>`).join("");
  return `<ul class="ratings" aria-label="Public ratings">${items}</ul>`;
}

function releaseLine(releases) {
  if (!releases?.length) return "";
  return `<ul class="plain">${releases.map(row => `<li><span>${esc([row.platform, row.region].filter(Boolean).join(" · ") || "Release")}</span><span>${esc(releaseLabel(row))}</span></li>`).join("")}</ul>`;
}

function experienceBlock(entry) {
  const kind = experienceOptions(entry.kind)[0]?.value || "watch";
  const rows = (entry.experiences || []).map(row => `
    <li class="exp">
      <span>${esc(experienceLabel(row.kind))}</span>
      <span>${esc(row.finished_on || row.started_on || "")}</span>
      <button type="button" data-action="delete-experience" data-id="${entry.id}" data-experience="${row.id}" aria-label="Remove">✕</button>
    </li>`).join("");
  return `
    <section class="exps">
      <ul class="exp-list">${rows}</ul>
      <button type="button" class="flag" data-action="log-again" data-id="${entry.id}" data-kind="${kind}">Again</button>
    </section>`;
}

function showEpisodes(entry, seasonNumber) {
  const show = entry.show || { episodes: [], seasons: [] };
  const seasons = show.seasons || [];
  const episodes = (show.episodes || [])
    .filter(episode => seasonNumber == null || episode.season_number === seasonNumber)
    .sort((a, b) => a.episode_number - b.episode_number || a.id - b.id);
  const chips = seasons.map(item => {
    const current = item.season_number === seasonNumber ? " is-current" : "";
    const done = item.watched ? " is-done" : "";
    return `<button type="button" class="season-chip${current}${done}" data-season-jump data-id="${entry.id}" data-season="${item.season_number}" data-current="${seasonNumber ?? ""}" aria-pressed="${item.watched ? "true" : "false"}" aria-label="Season ${item.season_number}">${item.season_number}</button>`;
  }).join("");
  const rating = seasons.find(item => item.season_number === seasonNumber);
  const score = rating
    ? `<div data-season-marks data-id="${entry.id}" data-season="${rating.season_number}" data-watched="${rating.watched ? "true" : "false"}">${scoreMarks(rating.rating, "Season")}</div>`
    : "";
  const tiles = episodes.map(episode => {
    const label = episodePlace(episode);
    return `<li><button type="button" class="episode-tile${episode.watched ? " is-watched" : ""}" data-episode-tile data-id="${entry.id}" data-episode="${episode.id}" aria-pressed="${episode.watched ? "true" : "false"}" aria-label="${esc(label)}"><span>${esc(episode.episode_number)}</span><strong>${esc(episode.title || label)}</strong></button><a class="episode-open" href="#/item/${entry.id}/episode/${episode.id}" aria-label="Open ${esc(label)}"></a></li>`;
  }).join("");
  return `<section class="episodes-section">
    <div class="season-strip">${chips}${score}</div>
    <ol class="episode-tiles">${tiles}</ol>
  </section>`;
}

async function viewEpisode(entryId, episodeId) {
  const entry = await api(`/api/entries/${entryId}`);
  const episode = (entry.show?.episodes || []).find(item => item.id === episodeId);
  if (!episode) {
    app.innerHTML = `<p class="quiet">That episode is not on this show.</p>`;
    return;
  }
  const label = episodePlace(episode);
  app.innerHTML = `
    <article class="episode-page${episode.watched ? " is-watched" : ""}">
      <p class="eyebrow"><a href="#/item/${entry.id}?season=${episode.season_number}">${esc(entry.title)}</a></p>
      <button type="button" class="episode-toggle" data-episode-page data-id="${entry.id}" data-episode="${episode.id}" aria-pressed="${episode.watched ? "true" : "false"}">
        <h1>${esc(episode.title || label)}</h1>
        <p class="lede">${esc(label)}${episode.air_date ? ` · ${esc(episode.air_date)}` : ""}</p>
      </button>
      ${episode.overview ? `<p class="overview">${esc(episode.overview)}</p>` : ""}
    </article>`;
}

function musicBlock(entry) {
  const music = entry.music || { albums: [], partial: false };
  const albums = music.albums.map(album => `
    <li class="cover" data-album-row data-id="${entry.id}" data-album="${album.id}">
      <button type="button" class="cover-face" data-album-open style="${album.artwork_url ? `background-image:url(${esc(album.artwork_url)})` : ""}" aria-label="${esc(album.title)}">
        <span>${esc(album.title)}</span>
      </button>
      ${scoreMarks(album.rating, album.title)}
      <ol class="cover-tracks" hidden>
        ${(album.tracks || []).map(track => `<li data-track-row data-id="${entry.id}" data-track="${track.id}"><span>${esc(track.title)}</span>${scoreMarks(track.rating, track.title)}</li>`).join("")}
      </ol>
    </li>`).join("");
  return `
    <section class="discog">
      <div class="web" data-web="${entry.id}" hidden></div>
      <ul class="covers">${albums}</ul>
      <form class="cover cover-add" data-action="add-album" data-id="${entry.id}">
        <input name="title" aria-label="Album" placeholder="Album" required>
        <input name="year" aria-label="Year" inputmode="numeric" placeholder="Year">
        <button type="submit" aria-label="Add album">+</button>
      </form>
    </section>`;
}

function paintWeb(center, nodes) {
  const box = document.querySelector("[data-web]");
  if (!box || !nodes.length) return;
  const count = Math.min(nodes.length, 12);
  const cx = 160;
  const cy = 118;
  const radius = 92;
  const marks = nodes.slice(0, count).map((node, index) => {
    const angle = (-Math.PI / 2) + (index / count) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const label = String(node.name || node.title || "").slice(0, 18);
    const query = encodeURIComponent(node.name || node.title || "");
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line><a href="#/search?q=${query}"><text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${esc(label)}</text></a>`;
  }).join("");
  box.hidden = false;
  box.innerHTML = `<svg viewBox="0 0 320 240" role="img" aria-label="Connections"><g>${marks}</g><circle cx="${cx}" cy="${cy}" r="26"></circle><text x="${cx}" y="${cy + 4}" text-anchor="middle">${esc(String(center).slice(0, 16))}</text></svg>`;
}

async function loadWeb(entry) {
  if (entry.kind !== "artist" && entry.kind !== "movie" && entry.kind !== "tv") return;
  try {
    const web = await api(`/api/entries/${entry.id}/web`);
    const current = route();
    if (current.name !== "item" || current.id !== entry.id) return;
    paintWeb(entry.title, web.nodes || []);
  } catch { /* the title still stands on its own */ }
}

function releaseForm(entry) {
  return `
    <form class="stack" data-action="add-release" data-id="${entry.id}">
      <h2>Release</h2>
      <label>Date <input name="release_on" type="date"></label>
      <label>Precision <select name="release_precision">${options([
        { value: "day", label: "Exact day" },
        { value: "month", label: "Month" },
        { value: "year", label: "Year" },
        { value: "unknown", label: "Unknown" },
      ], "day")}</select></label>
      <label>Status <select name="release_status">${options([
        { value: "scheduled", label: "Scheduled" },
        { value: "released", label: "Released" },
        { value: "postponed", label: "Postponed" },
        { value: "unknown", label: "Unknown" },
      ], "scheduled")}</select></label>
      <label>Platform <input name="platform" maxlength="80"></label>
      <button class="btn" type="submit">Record release</button>
    </form>`;
}

function readDraft(id) {
  try {
    const value = localStorage.getItem(draftKey(id));
    return value;
  } catch {
    return null;
  }
}

function clearDraft(id) {
  try { localStorage.removeItem(draftKey(id)); } catch { /* ignore */ }
}

function formBody(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  for (const box of form.querySelectorAll('input[type="checkbox"]')) data[box.name] = box.checked;
  return data;
}

function openQuick(index) {
  const item = searchResults[index];
  const dialog = document.querySelector("#quick-add");
  if (!item || !dialog) return;
  quickIndex = index;
  dialog.querySelector("#quick-title").textContent = item.title;
  dialog.querySelector("#quick-meta").textContent = [kindLabel(item.kind), item.year, item.creator].filter(Boolean).join(" · ");
  const status = dialog.querySelector("select[name=status]");
  status.innerHTML = options(statusOptions(item.kind), "completed");
  dialog.querySelector("input[name=rating]").value = "";
  dialog.querySelector("textarea[name=review]").value = "";
  dialog.showModal();
  dialog.querySelector("input[name=rating]").focus();
}

function clickTarget(event) {
  const node = event.target;
  if (node instanceof Element) return node;
  return node?.parentElement instanceof Element ? node.parentElement : null;
}

function setPressed(element, pressed, className) {
  element.setAttribute("aria-pressed", String(pressed));
  element.classList.toggle(className, pressed);
}

function keepButtonClick(event, target) {
  const button = target.closest("button");
  if (button && button.getAttribute("type") !== "submit") event.preventDefault();
}

async function render() {
  document.querySelectorAll("[data-nav]").forEach(link => {
    link.setAttribute("aria-current", link.dataset.nav === route().name ? "page" : "false");
  });
  syncTheme();
  const current = route();
  const scrolling = document.scrollingElement;
  const scrollY = scrolling ? scrolling.scrollTop : 0;
  const same = app.dataset.view === location.hash;
  try {
    if (current.name === "home") await viewHome();
    else if (current.name === "calendar") await viewCalendar(current.params);
    else if (current.name === "library") await viewLibrary(current.params);
    else if (current.name === "search") viewSearch(current.params);
    else if (current.name === "new") viewNew(current.params);
    else if (current.name === "episode") await viewEpisode(current.id, current.episodeId);
    else await viewItem(current.id, current.name === "season" ? current.seasonNumber : null);
    app.dataset.view = location.hash;
    if (scrolling) scrolling.scrollTop = same ? scrollY : 0;
  } catch (error) {
    app.innerHTML = `<p class="quiet" role="alert">${esc(error.message || "Could not load this page.")}</p>`;
    fail(error);
  }
}

document.addEventListener("click", async event => {
  const target = clickTarget(event);
  if (!target) return;
  const theme = target.closest("[data-theme-value]");
  if (theme) {
    keepButtonClick(event, target);
    setTheme(theme.dataset.themeValue);
    return;
  }
  const mark = target.closest("[data-score]");
  if (mark) {
    keepButtonClick(event, target);
    const group = mark.closest(".marks");
    const chosen = Number(mark.dataset.score);
    const current = group.querySelectorAll(".mark.is-on").length;
    const next = chosen === current ? null : chosen;
    group.querySelectorAll(".mark").forEach(button => {
      const on = next != null && Number(button.dataset.score) <= next;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-pressed", String(on));
    });
    const season = mark.closest("[data-season-marks]");
    const track = mark.closest("[data-track-row]");
    const album = mark.closest("[data-album-row]");
    const opinion = mark.closest(".opinion");
    try {
      if (season) {
        await api(`/api/entries/${season.dataset.id}/seasons`, {
          method: "POST",
          body: JSON.stringify({
            season_number: Number(season.dataset.season),
            watched: season.dataset.watched === "true",
            rating: next,
          }),
        });
      } else if (track) {
        await api(`/api/entries/${track.dataset.id}/tracks/${track.dataset.track}/rating`, {
          method: "POST",
          body: JSON.stringify({ rating: next }),
        });
      } else if (album) {
        await api(`/api/entries/${album.dataset.id}/albums/${album.dataset.album}/rating`, {
          method: "POST",
          body: JSON.stringify({ rating: next }),
        });
      } else if (opinion) {
        await api(`/api/entries/${opinion.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ rating: next }),
        });
      }
    } catch (error) {
      fail(error);
      await render();
    }
    return;
  }
  const statusButton = target.closest("[data-set-status]");
  if (statusButton) {
    keepButtonClick(event, target);
    const opinion = statusButton.closest(".opinion");
    try {
      await api(`/api/entries/${opinion.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: statusButton.dataset.setStatus }),
      });
      await render();
    } catch (error) {
      fail(error);
    }
    return;
  }
  const flag = target.closest("[data-flag]");
  if (flag) {
    keepButtonClick(event, target);
    const opinion = flag.closest(".opinion");
    const on = flag.getAttribute("aria-pressed") !== "true";
    try {
      await api(`/api/entries/${opinion.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [flag.dataset.flag]: on }),
      });
      await render();
    } catch (error) {
      fail(error);
    }
    return;
  }
  const episodePage = target.closest("[data-episode-page]");
  if (episodePage) {
    keepButtonClick(event, target);
    const watched = episodePage.getAttribute("aria-pressed") !== "true";
    episodePage.setAttribute("aria-pressed", String(watched));
    episodePage.closest(".episode-page")?.classList.toggle("is-watched", watched);
    try {
      await api(`/api/entries/${episodePage.dataset.id}/episodes/${episodePage.dataset.episode}/watched`, {
        method: "POST",
        body: JSON.stringify({ watched }),
      });
    } catch (error) {
      episodePage.setAttribute("aria-pressed", String(!watched));
      episodePage.closest(".episode-page")?.classList.toggle("is-watched", !watched);
      fail(error);
    }
    return;
  }
  const tile = target.closest("[data-episode-tile]");
  if (tile) {
    keepButtonClick(event, target);
    const watched = tile.getAttribute("aria-pressed") !== "true";
    setPressed(tile, watched, "is-watched");
    try {
      await api(`/api/entries/${tile.dataset.id}/episodes/${tile.dataset.episode}/watched`, {
        method: "POST",
        body: JSON.stringify({ watched }),
      });
    } catch (error) {
      setPressed(tile, !watched, "is-watched");
      fail(error);
    }
    return;
  }
  const season = target.closest("[data-season-jump]");
  if (season) {
    keepButtonClick(event, target);
    if (String(season.dataset.season) !== String(season.dataset.current)) {
      location.hash = `#/item/${season.dataset.id}?season=${season.dataset.season}`;
      return;
    }
    const watched = season.getAttribute("aria-pressed") !== "true";
    setPressed(season, watched, "is-done");
    try {
      const marks = document.querySelector(`[data-season-marks][data-season="${season.dataset.season}"]`);
      const filled = marks ? marks.querySelectorAll(".mark.is-on").length : 0;
      await api(`/api/entries/${season.dataset.id}/seasons`, {
        method: "POST",
        body: JSON.stringify({
          season_number: Number(season.dataset.season),
          watched,
          rating: filled || null,
        }),
      });
    } catch (error) {
      setPressed(season, !watched, "is-done");
      fail(error);
    }
    return;
  }
  const cover = target.closest("[data-album-open]");
  if (cover) {
    keepButtonClick(event, target);
    const tracks = cover.parentElement?.querySelector(".cover-tracks");
    if (tracks) tracks.hidden = !tracks.hidden;
    return;
  }
  const button = target.closest("[data-action]");
  if (!button) return;
  keepButtonClick(event, target);
  const action = button.dataset.action;
  try {
    if (action === "open-quick" || action === "follow") {
      const item = searchResults[Number(button.dataset.index)];
      if (!item) return;
      const created = await api("/api/library/from-provider", {
        method: "POST",
        body: JSON.stringify({ ...item, status: "want" }),
      });
      location.hash = `#/item/${created.id}`;
    }
    if (action === "close-quick") document.querySelector("#quick-add")?.close();
    if (action === "log-again") {
      const today = new Date();
      const finished = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      await api(`/api/entries/${button.dataset.id}/experiences`, {
        method: "POST",
        body: JSON.stringify({ kind: button.dataset.kind, finished_on: finished }),
      });
      await render();
    }
    if (action === "delete-experience") {
      await api(`/api/entries/${button.dataset.id}/experiences/${button.dataset.experience}`, { method: "DELETE" });
      setNotice("Experience removed. The overall review was left as it is.");
      await render();
    }
  } catch (error) {
    fail(error);
  }
});

document.addEventListener("submit", async event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.action) return;
  event.preventDefault();
  const data = formBody(form);
  const id = form.dataset.id;
  try {
    if (form.dataset.action === "library-filter") {
      location.hash = `#/library?${new URLSearchParams({ kind: data.kind, status: data.status, sort: data.sort, q: data.q })}`;
      return;
    }
    if (form.dataset.action === "search-now") {
      await runSearch();
      return;
    }
    if (form.dataset.action === "create-manual") {
      const body = {
        kind: data.kind || "movie",
        title: data.title,
        creator: data.creator || null,
        year: data.year || null,
        artwork_url: data.artwork_url || null,
        status: data.status || "want",
        rating: data.rating === "" || data.rating == null ? null : data.rating,
        review: data.review || null,
        anticipated: Boolean(data.anticipated),
      };
      if (data.release_on || data.release_precision === "unknown") {
        body.release_on = data.release_on || null;
        body.release_precision = data.release_precision;
        body.release_status = data.anticipated ? "scheduled" : "released";
      }
      const created = await api("/api/library", { method: "POST", body: JSON.stringify(body) });
      setNotice("Saved in your library.");
      location.hash = `#/item/${created.id}`;
      return;
    }
    if (form.dataset.action === "save-entry") {
      const body = {
        status: data.status,
        rating: data.rating === "" ? null : data.rating,
        review: data.review,
        summary: data.summary,
        review_spoiler: Boolean(data.review_spoiler),
        favorite: Boolean(data.favorite),
        anticipated: Boolean(data.anticipated),
      };
      if ("progress_value" in data) {
        body.progress_value = data.progress_value === "" ? null : data.progress_value;
        body.progress_unit = data.progress_unit || null;
      }
      await api(`/api/entries/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      clearDraft(id);
      setNotice("Overall opinion saved.");
      await render();
      return;
    }
    if (form.dataset.action === "add-experience") {
      await api(`/api/entries/${id}/experiences`, { method: "POST", body: JSON.stringify({
        kind: data.kind,
        started_on: data.started_on || null,
        finished_on: data.finished_on || null,
        notes: data.notes || null,
        rating: data.rating === "" ? null : data.rating,
        spoiler: Boolean(data.spoiler),
      }) });
      setNotice("Experience added. The overall review was not changed.");
      await render();
      return;
    }
    if (form.dataset.action === "save-experience") {
      await api(`/api/entries/${id}/experiences/${form.dataset.experience}`, { method: "PATCH", body: JSON.stringify({
        notes: data.notes,
        rating: data.rating === "" ? null : data.rating,
        spoiler: Boolean(data.spoiler),
      }) });
      setNotice("Experience updated.");
      await render();
      return;
    }
    if (form.dataset.action === "add-album") {
      await api(`/api/entries/${id}/albums`, { method: "POST", body: JSON.stringify({
        title: data.title,
        year: data.year || null,
      }) });
      setNotice("Album added.");
      await render();
      return;
    }
    if (form.dataset.action === "add-track") {
      await api(`/api/entries/${id}/albums/${form.dataset.album}/tracks`, { method: "POST", body: JSON.stringify({
        title: data.title,
      }) });
      setNotice("Song added.");
      await render();
      return;
    }
    if (form.dataset.action === "add-season") {
      const saved = await api(`/api/entries/${id}/seasons`, { method: "POST", body: JSON.stringify({
        season_number: Number(data.season_number),
        watched: Boolean(data.watched),
        rating: data.rating === "" ? null : data.rating,
      }) });
      const number = Number(data.season_number);
      const still = (saved.show?.seasons || []).some(item => item.season_number === number);
      setNotice(still
        ? "Season saved. The overall review was left as it is."
        : "Season cleared. The overall review was left as it is.");
      await render();
      return;
    }
    if (form.dataset.action === "add-episode") {
      await api(`/api/entries/${id}/episodes`, { method: "POST", body: JSON.stringify({
        season_number: Number(data.season_number),
        episode_number: Number(data.episode_number),
        title: data.title || null,
        air_date: data.air_date || null,
      }) });
      setNotice("Episode added.");
      history.replaceState(null, "", `${location.pathname}${location.search}#/item/${id}?season=${Number(data.season_number)}`);
      await render();
      return;
    }
    if (form.dataset.action === "add-release") {
      await api(`/api/entries/${id}`, { method: "PATCH", body: JSON.stringify({
        release_on: data.release_on || null,
        release_precision: data.release_precision,
        release_status: data.release_status,
        platform: data.platform || null,
        anticipated: true,
      }) });
      setNotice("Release recorded.");
      await render();
      return;
    }
    if (form.dataset.action === "delete-entry") {
      if (!confirm("Remove this from your library? The overall review, season scores, and experiences go with it.")) return;
      await api(`/api/entries/${id}`, { method: "DELETE" });
      setNotice("Removed from your library.");
      location.hash = "#/library";
      return;
    }
    if (form.dataset.action === "quick-add") {
      const item = searchResults[quickIndex];
      if (!item) return;
      const created = await api("/api/library/from-provider", {
        method: "POST",
        body: JSON.stringify({
          ...item,
          status: data.status,
          rating: data.rating === "" ? null : data.rating,
          review: data.review || null,
        }),
      });
      document.querySelector("#quick-add")?.close();
      setNotice(created.already_saved ? "Already in your library." : "Saved in your library.");
      location.hash = `#/item/${created.id}`;
    }
  } catch (error) {
    fail(error);
  }
});

let searchTimer = 0;
document.addEventListener("focusout", async event => {
  const box = event.target;
  if (!(box instanceof HTMLTextAreaElement) || !box.dataset.review) return;
  try {
    await api(`/api/entries/${box.dataset.review}`, {
      method: "PATCH",
      body: JSON.stringify({ review: box.value }),
    });
  } catch (error) {
    fail(error);
  }
});

document.addEventListener("input", event => {
  const target = event.target;
  if (target instanceof HTMLTextAreaElement && target.dataset.draft) {
    try { localStorage.setItem(target.dataset.draft, target.value); } catch { /* ignore */ }
  }
  if (target instanceof HTMLInputElement && target.id === "search-q") {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => runSearch(), 220);
  }
});

document.addEventListener("change", async event => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.id === "search-kind") runSearch();
  if (target instanceof HTMLInputElement && target.name === "rating") {
    const track = target.closest("[data-track-row]");
    if (track) {
      await saveMusicScore(track, "tracks", track.dataset.track, "Song rating saved.", target);
      return;
    }
    const album = target.closest("[data-album-row]");
    if (album) {
      await saveMusicScore(album, "albums", album.dataset.album, "Album rating saved.", target);
      return;
    }
  }
  const row = target instanceof HTMLInputElement ? target.closest("[data-season-row]") : null;
  if (!row) return;
  try {
    await api(`/api/entries/${row.dataset.id}/seasons`, {
      method: "POST",
      body: JSON.stringify({
        season_number: Number(row.dataset.season),
        watched: row.dataset.watched === "true",
        rating: row.value !== "" ? row.value : null,
      }),
    });
    await render();
  } catch (error) {
    fail(error);
  }
});

async function saveMusicScore(row, kind, itemId, notice, input) {
  const rating = input instanceof HTMLInputElement ? input : row.querySelector('input[name="rating"]');
  const path = kind === "albums"
    ? `/api/entries/${row.dataset.id}/albums/${itemId}/rating`
    : `/api/entries/${row.dataset.id}/tracks/${itemId}/rating`;
  try {
    await api(path, {
      method: "POST",
      body: JSON.stringify({ rating: rating && rating.value !== "" ? rating.value : null }),
    });
    setNotice(notice);
    await render();
  } catch (error) {
    fail(error);
  }
}

document.addEventListener("keydown", event => {
  if (event.key !== "ArrowDown" || document.activeElement?.id !== "search-q") return;
  const first = document.querySelector("#search-results button, #search-results a");
  if (first) {
    event.preventDefault();
    first.focus();
  }
});

try {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((document.documentElement.getAttribute("data-theme-choice") || "system") === "system") setTheme("system");
  });
} catch { /* older browsers */ }

window.addEventListener("hashchange", () => { setNotice(""); render(); });
render();
