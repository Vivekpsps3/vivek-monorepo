import { api, loginHref } from "./api.mjs";
import { browserTimeZone, localTodayIso } from "../../shared-browser/today.mjs";
import { createKeyedFetch, createSequence } from "./guard.mjs";
import {
  NOTE_CONFLICT_TOAST,
  NOTE_RESTORE_LABEL,
  NOT_SAVED_LABEL,
  PROGRESS_TOAST,
  SAVED_HOLD_MS,
  SAVED_LABEL,
  SAVING_DELAY_MS,
  SAVING_LABEL,
  SKELETON_DELAY_MS,
  SORT_TOAST,
  TOAST_ACTION_MS,
  TOAST_MS,
  chooseReview,
  coverImage,
  dayLabel,
  draftKey,
  escapeHtml as esc,
  experienceLabel,
  experienceOptions,
  genericStatusOptions,
  kindLabel,
  monthCells,
  monthLabel,
  normalizeLibraryQuery,
  progressPreview,
  progressUnits,
  ratingText,
  releaseLabel,
  routeErrorCopy,
  seasonLabel,
  safeUrl,
  shiftMonth,
  statusLabel,
  statusOptions,
  weekDayLabels,
  whenLabel,
} from "./format.mjs";

const app = document.querySelector("#app");
const toasts = document.querySelector("#toasts");
const toastAlerts = document.querySelector("#toast-alerts");
const routeLoads = createSequence();
const searchLoads = createKeyedFetch();
let searchResults = [];
let quickIndex = -1;
let progressChain = Promise.resolve();
let progressPendingKey = "";
let skeletonTimer = 0;

function pushToast({ message, kind = "status", action = null }) {
  const region = kind === "alert" ? toastAlerts : toasts;
  if (!region || !message) return;
  const toast = document.createElement("div");
  toast.className = kind === "alert" ? "toast is-alert" : "toast";
  if (kind === "alert") {
    const icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⚠";
    toast.append(icon);
  }
  const text = document.createElement("p");
  text.textContent = message;
  toast.append(text);
  const dismiss = () => {
    window.clearTimeout(timer);
    toast.remove();
  };
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-action";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      if (typeof action.onClick === "function") action.onClick();
      else if (action.href) location.assign(action.href);
      dismiss();
    });
    toast.append(button);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-dismiss";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "✕";
  close.addEventListener("click", dismiss);
  toast.append(close);
  region.append(toast);
  while (region.children.length > 3) region.firstElementChild?.remove();
  let remaining = action ? TOAST_ACTION_MS : TOAST_MS;
  let started = Date.now();
  let timer = window.setTimeout(dismiss, remaining);
  const pause = () => {
    window.clearTimeout(timer);
    remaining -= Date.now() - started;
  };
  const resume = () => {
    started = Date.now();
    timer = window.setTimeout(dismiss, Math.max(0, remaining));
  };
  toast.addEventListener("mouseenter", pause);
  toast.addEventListener("mouseleave", resume);
  toast.addEventListener("focusin", pause);
  toast.addEventListener("focusout", event => {
    if (!toast.contains(event.relatedTarget)) resume();
  });
}

function toast(message, kind = "status", action = null) {
  pushToast({ message, kind, action });
}

function fail(error, action = null) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") return;
  if (error?.status === 401) {
    location.assign(loginHref());
    return;
  }
  if (error?.status === 403) {
    toast(error.message, "alert", { label: "Sign in", href: loginHref() });
    return;
  }
  toast(error?.message || "Something went wrong.", "alert", action);
}

function clearSkeletonTimer() {
  window.clearTimeout(skeletonTimer);
  skeletonTimer = 0;
}

function commitView(html, busy = false) {
  clearSkeletonTimer();
  app.innerHTML = html;
  app.setAttribute("aria-busy", busy ? "true" : "false");
}

function skeletonBlocks(count, className) {
  return Array.from({ length: count }, () => `<span class="skeleton ${className}"></span>`).join("");
}

function skeletonFor(name) {
  if (name === "home") {
    return `<div class="skeleton-home" aria-hidden="true">${skeletonBlocks(1, "skeleton-h1")}${skeletonBlocks(1, "skeleton-stats")}${skeletonBlocks(4, "skeleton-row")}<div class="grid">${skeletonBlocks(6, "skeleton-card")}</div></div>`;
  }
  if (name === "library") {
    return `<div aria-hidden="true"><div class="grid">${skeletonBlocks(12, "skeleton-card")}</div></div>`;
  }
  if (name === "calendar") {
    return `<div class="skeleton-cal" aria-hidden="true">${skeletonBlocks(35, "skeleton-day")}</div>`;
  }
  if (name === "episode") {
    return `<div aria-hidden="true">${skeletonBlocks(1, "skeleton-line skeleton-w40")}${skeletonBlocks(1, "skeleton-h1")}${skeletonBlocks(1, "skeleton-line skeleton-w60")}</div>`;
  }
  return `<div class="skeleton-item detail" aria-hidden="true"><span class="skeleton skeleton-poster"></span><div>${skeletonBlocks(1, "skeleton-line skeleton-w60")}${skeletonBlocks(1, "skeleton-line skeleton-w30")}<div class="skeleton-chips">${skeletonBlocks(3, "skeleton-chip")}</div><div class="skeleton-chips">${skeletonBlocks(3, "skeleton-chip")}</div><div class="skeleton-chips">${skeletonBlocks(3, "skeleton-chip")}</div></div></div>`;
}

function searchSkeleton() {
  return `<div aria-hidden="true">${skeletonBlocks(5, "skeleton-row")}</div>`;
}

function errorPanelHtml(name, error) {
  const copy = routeErrorCopy(name, error);
  const retry = copy.retry ? `<button type="button" class="btn btn-primary" data-action="retry-route">Try again</button>` : "";
  const links = copy.links.map(link => `<a class="btn" href="${esc(link.href)}">${esc(link.label)}</a>`).join("");
  return `<section class="error-panel" role="alert"><h1 tabindex="-1" data-error-title>${esc(copy.title)}</h1><p>${esc(copy.body)}</p><div class="hero-actions">${retry}${links}</div></section>`;
}

function focusErrorTitle() {
  const heading = app.querySelector("[data-error-title]");
  if (heading instanceof HTMLElement) heading.focus();
}

function focusPageHeading() {
  const heading = app.querySelector("h1");
  if (!(heading instanceof HTMLElement)) return;
  if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  heading.focus();
}

function focusKeyOf(node) {
  const element = node instanceof Element ? node.closest("[data-focus-key]") : null;
  return element instanceof HTMLElement ? (element.dataset.focusKey || "") : "";
}

function restoreFocus(key) {
  if (!key) return;
  const match = [...app.querySelectorAll("[data-focus-key]")].find(element => element.dataset.focusKey === key);
  if (match instanceof HTMLElement) match.focus();
}

function itemIdFromHash(hash) {
  const match = /^#\/item\/(\d+)/.exec(String(hash || ""));
  return match ? match[1] : "";
}

function armSaving(status) {
  if (status) status.classList.remove("is-error");
  const timer = window.setTimeout(() => {
    if (status?.isConnected && !status.classList.contains("is-error")) status.textContent = SAVING_LABEL;
  }, SAVING_DELAY_MS);
  return () => window.clearTimeout(timer);
}

function showSaved(status) {
  if (!status) return;
  status.classList.remove("is-error");
  status.setAttribute("role", "status");
  status.textContent = SAVED_LABEL;
  if (status.id === "progress-status") {
    document.querySelector("#progress")?.setAttribute("aria-invalid", "false");
  }
  window.setTimeout(() => {
    if (status.isConnected && status.textContent === SAVED_LABEL) status.textContent = "";
  }, SAVED_HOLD_MS);
}

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

function options(rows, selected) {
  return rows.map(row => `<option value="${esc(row.value)}"${row.value === selected ? " selected" : ""}>${esc(row.label)}</option>`).join("");
}

function poster(item) {
  const art = safeUrl(item.artwork_url);
  if (art) return `<img alt="" src="${esc(art)}" width="342" height="513">`;
  return `<span class="poster-fallback">${esc(kindLabel(item.kind))}</span>`;
}

function card(item) {
  const progress = item.progress_label ? ` · ${item.progress_label}` : "";
  return `<a class="card" href="#/item/${item.id}">
    <span class="poster">${poster(item)}</span>
    <span class="card-title">${esc(item.title)}</span>
    <span class="meta">${esc([kindLabel(item.kind), item.year, item.creator].filter(Boolean).join(" · "))}</span>
    <span class="meta">${esc(`${statusLabel(item.kind, item.status)} · ${ratingText(item.rating)}${progress}`)}</span>
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

async function viewHome(ticket) {
  const summary = await api("/api/summary", { signal: ticket.signal });
  if (!ticket.isCurrent()) return;
  commitView(`
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
  `);
}

async function viewCalendar(params, ticket) {
  const requested = params.get("month") || "";
  const query = new URLSearchParams();
  if (requested) query.set("month", requested);
  query.set("tz", browserTimeZone());
  const data = await api(`/api/calendar?${query}`, { signal: ticket.signal });
  if (!ticket.isCurrent()) return;
  const today = localTodayIso();
  const label = monthLabel(data.month) || "Calendar";
  const [year] = String(data.month || "").split("-");
  const byDay = new Map((data.days || []).map(day => [day.date, day.events || []]));
  const cells = monthCells(data.month);
  const heads = weekDayLabels()
    .map(name => `<div class="cal-head">${name}</div>`)
    .join("");
  const grid = cells.map(day => {
    if (!day) return `<div class="cal-day is-outside"></div>`;
    const events = byDay.get(day) || [];
    const todayClass = day === today ? " is-today" : "";
    const current = day === today ? ` aria-current="date"` : "";
    const chips = events.map(event => eventChip(event, true)).join("");
    return `<div class="cal-day${todayClass}"${current}><time class="cal-num" datetime="${esc(day)}">${Number(day.slice(8))}</time>${chips}</div>`;
  }).join("");
  const agendaDays = (data.days || []).filter(day => (day.events || []).length);
  const agenda = agendaDays.length
    ? `<ul class="calendar-agenda">${agendaDays.map(day => `<li><time datetime="${esc(day.date)}">${esc(dayLabel(day.date))}</time><div class="cal-events">${(day.events || []).map(event => eventChip(event, false)).join("")}</div></li>`).join("")}</ul>`
    : `<ul class="calendar-agenda"><li><p class="quiet">Nothing on a specific day this month.</p></li></ul>`;
  commitView(`
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
  `);
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

function libraryPage(kind, status, q, sort, body, resume) {
  const kinds = ["", "movie", "tv", "book", "artist", "album", "track", "game"].map(value => ({
    value,
    label: value ? kindLabel(value) : "All types",
  }));
  const statuses = [{ value: "", label: "Any status" }, ...(kind ? statusOptions(kind) : genericStatusOptions())];
  const sorts = [
    { value: "activity", label: "Recently active" },
    { value: "added", label: "Recently added" },
    { value: "title", label: "Title A–Z" },
    { value: "rating", label: "Your score" },
    { value: "release", label: "Release year" },
  ];
  return `
    <section class="hero"><div><p class="eyebrow">Library</p><h1>Saved</h1></div></section>
    <label class="sort-field">Sort <select id="library-sort" data-library-sort>${options(sorts, sort)}</select></label>
    ${continuePoint(resume)}
    <div class="status-row">${kinds.map(item => `<a class="status-mark${item.value === kind ? " is-on" : ""}" href="#/library?${new URLSearchParams({ kind: item.value, status, sort, q })}">${esc(item.label)}</a>`).join("")}</div>
    <div class="status-row">${statuses.map(item => `<a class="flag${item.value === status ? " is-on" : ""}" href="#/library?${new URLSearchParams({ kind, status: item.value, sort, q })}">${esc(item.label)}</a>`).join("")}</div>
    <div data-library-body>${body}</div>
  `;
}

async function viewLibrary(params, ticket) {
  const kind = params.get("kind") || "";
  const status = params.get("status") || "";
  const q = params.get("q") || "";
  const sort = params.get("sort") || "activity";
  const query = new URLSearchParams();
  if (kind) query.set("kind", kind);
  if (status) query.set("status", status);
  if (q) query.set("q", q);
  query.set("sort", sort);
  const fromLibrary = String(app.dataset.view || "").startsWith("#/library");
  const previousCards = fromLibrary ? (app.querySelector("[data-library-body]")?.innerHTML || "") : "";
  commitView(libraryPage(kind, status, q, sort, previousCards, null), true);
  const cardsTimer = window.setTimeout(() => {
    if (!ticket.isCurrent()) return;
    const slot = app.querySelector("[data-library-body]");
    if (!slot) return;
    slot.innerHTML = `<div class="grid" aria-hidden="true">${skeletonBlocks(12, "skeleton-card")}</div>`;
  }, SKELETON_DELAY_MS);
  try {
    const [payload, summary] = await Promise.all([
      api(`/api/library?${query}`, { signal: ticket.signal }),
      api("/api/summary", { signal: ticket.signal }),
    ]);
    window.clearTimeout(cardsTimer);
    if (!ticket.isCurrent()) return;
    const resume = (!kind || kind === "tv") ? continueItem(summary.next_episodes) : null;
    const body = payload.items.length
      ? `<div class="grid">${payload.items.map(card).join("")}</div>`
      : `<p class="quiet"><a href="#/search">Search</a></p>`;
    commitView(libraryPage(kind, status, q, sort, body, resume));
  } catch (error) {
    window.clearTimeout(cardsTimer);
    throw error;
  }
}

function viewSearch(params) {
  const q = params.get("q") || "";
  const kind = params.get("kind") || "";
  commitView(`
    <section class="hero"><div><h1>Search</h1></div></section>
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
    <div id="search-results"></div>
  `);
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

async function runSearch({ focusError = false } = {}) {
  const input = document.querySelector("#search-q");
  const kind = document.querySelector("#search-kind")?.value || "";
  const box = document.querySelector("#search-results");
  if (!input || !box) return;
  const q = input.value.trim();
  if (q.length < 2) {
    searchLoads.start("");
    box.innerHTML = "";
    box.setAttribute("aria-busy", "false");
    return;
  }
  const ticket = searchLoads.start(`${q}\u0000${kind}`);
  box.setAttribute("aria-busy", "true");
  box.innerHTML = `<p class="quiet" role="status" data-search-status>Searching…</p>`;
  const resultsTimer = window.setTimeout(() => {
    if (!ticket.matches()) return;
    if (!box.querySelector(".skeleton")) box.insertAdjacentHTML("beforeend", searchSkeleton());
  }, SKELETON_DELAY_MS);
  try {
    const payload = await api(`/api/search?${new URLSearchParams({ q, kind })}`, { signal: ticket.signal });
    window.clearTimeout(resultsTimer);
    if (!ticket.matches()) return;
    const liveQ = document.querySelector("#search-q")?.value.trim() || "";
    const liveKind = document.querySelector("#search-kind")?.value || "";
    if (`${liveQ}\u0000${liveKind}` !== `${q}\u0000${kind}`) return;
    searchResults = payload.results;
    box.innerHTML = renderResults(payload);
    box.setAttribute("aria-busy", "false");
  } catch (error) {
    window.clearTimeout(resultsTimer);
    if (error?.name === "AbortError" || !ticket.matches()) return;
    box.setAttribute("aria-busy", "false");
    const copy = routeErrorCopy("search", error);
    box.innerHTML = `<div class="error-panel" role="alert"><h2 tabindex="-1" data-error-title>${esc(copy.title)}</h2><p>${esc(copy.body)}</p><div class="hero-actions"><button type="button" class="btn btn-primary" data-action="retry-search">Try again</button><a class="btn" href="#/new?title=${encodeURIComponent(q)}">Add “${esc(q)}” by title</a></div></div>`;
    if (focusError) focusErrorTitle();
  }
}

function viewNew(params) {
  const kinds = [
    ["movie", "Movie"], ["tv", "Series"], ["book", "Book"], ["artist", "Artist"],
    ["album", "Album"], ["track", "Song"], ["game", "Game"],
  ];
  commitView(`
    <form class="stack" data-action="create-manual">
      <input name="title" required value="${esc(params.get("title") || "")}" aria-label="Title" placeholder="Title">
      <div class="status-row">${kinds.map(([value, label], index) => `<label class="status-mark"><input type="radio" name="kind" value="${value}"${index === 0 ? " checked" : ""}>${label}</label>`).join("")}</div>
      <button class="btn btn-primary" type="submit">Add</button>
    </form>`);
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

async function viewItem(id, ticket, forcedSeason = null) {
  const entry = await api(`/api/entries/${id}`, { signal: ticket.signal });
  if (!ticket.isCurrent()) return;
  const seasonNumber = entry.kind === "tv" ? chooseSeason(entry, forcedSeason) : null;
  if (entry.kind === "tv" && seasonNumber != null) {
    const desired = `#/item/${id}?season=${seasonNumber}`;
    if (location.hash !== desired) {
      history.replaceState(null, "", `${location.pathname}${location.search}${desired}`);
    }
  }
  const review = chooseReview(entry.review, entry.review_updated_at, readDraftRecord(id));
  const progress = entry.kind === "book" || entry.kind === "game";
  commitView(`
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
          <div class="status-row">${statusOptions(entry.kind).map(opt => `<button type="button" class="status-mark${opt.value === entry.status ? " is-on" : ""}" data-set-status="${opt.value}" data-focus-key="status:${esc(opt.value)}">${esc(opt.label)}</button>`).join("")}</div>
          ${scoreMarks(entry.rating, "Score")}
          <div class="flag-row">
            <button type="button" class="flag${entry.favorite ? " is-on" : ""}" data-flag="favorite" data-focus-key="flag-favorite" aria-pressed="${entry.favorite ? "true" : "false"}">Favorite</button>
            <button type="button" class="flag${entry.anticipated ? " is-on" : ""}" data-flag="anticipated" data-focus-key="flag-anticipated" aria-pressed="${entry.anticipated ? "true" : "false"}">Soon</button>
          </div>
          <textarea name="review" data-draft="${esc(draftKey(entry.id))}" data-review="${entry.id}" rows="3" aria-label="Note">${esc(review.text)}</textarea>
          <p id="note-status" class="progress-status" role="status"></p>
          ${review.restore ? `<p id="note-draft" class="save-draft">${esc(NOTE_RESTORE_LABEL)} <button type="button" data-restore-note="${entry.id}">Restore</button> <button type="button" data-discard-note="${entry.id}">Discard</button></p>` : ""}
          ${progress ? progressField(entry) : ""}
        </div>
        ${entry.kind === "artist" ? musicBlock(entry) : ""}
        ${experienceBlock(entry)}
        <form data-action="delete-entry" data-id="${entry.id}"><button class="btn btn-danger" type="submit">Remove</button></form>
      </div>
    </article>
  `);
  const note = app.querySelector("textarea[data-review]");
  if (note instanceof HTMLTextAreaElement) {
    note.dataset.saved = entry.review ?? "";
    note.dataset.reviewBase = entry.review_updated_at ?? "";
  }
  loadWeb(entry, ticket);
}

function progressField(entry) {
  const units = progressUnits(entry.kind);
  const serverUnit = units.some(item => item.value === entry.progress_unit) ? entry.progress_unit : units[0].value;
  const serverValue = entry.progress_value ?? "";
  const preview = progressPreview(serverValue, serverUnit);
  return `<div class="progress-field">
    <label for="progress">Progress</label>
    <div class="progress-controls">
      <input id="progress" name="progress_value" type="text" inputmode="decimal" autocomplete="off" data-progress="${entry.id}" data-saved="${esc(`${serverValue}|${serverUnit}`)}" value="${esc(serverValue)}" aria-invalid="false" aria-describedby="progress-help progress-status">
      <select id="progress-unit" aria-label="Unit" data-progress-unit="${entry.id}">${units.map(item => `<option value="${esc(item.value)}"${item.value === serverUnit ? " selected" : ""}>${esc(item.label)}</option>`).join("")}</select>
    </div>
    <p id="progress-help" class="meta">${esc(preview)}</p>
    <p id="progress-status" class="progress-status" role="status"></p>
    ${progressDraftChoice(entry, serverValue, serverUnit)}
  </div>`;
}

function offeredUnit(select, preferred) {
  const values = select instanceof HTMLSelectElement
    ? [...select.options].map(option => option.value).filter(Boolean)
    : [];
  if (preferred && values.includes(preferred)) return preferred;
  if (select instanceof HTMLSelectElement && select.value && values.includes(select.value)) return select.value;
  return values[0] || "";
}

function progressDraftChoice(entry, serverValue, serverUnit) {
  const draft = readProgressDraft(entry.id);
  if (!draft) return "";
  const units = progressUnits(entry.kind);
  const draftUnit = units.some(item => item.value === draft.unit) ? draft.unit : serverUnit;
  const serverKey = `${serverValue}|${serverUnit}`;
  if (`${draft.value}|${draftUnit}` === serverKey) {
    clearProgressDraft(entry.id);
    return "";
  }
  const preview = progressPreview(draft.value, draftUnit) || draft.value;
  const serverPreview = progressPreview(serverValue, serverUnit) || String(serverValue || "cleared");
  const elsewhere = draft.base !== serverKey ? ` Saved elsewhere since: ${esc(serverPreview)}.` : "";
  return `<p id="progress-draft" class="save-draft">Unsaved progress from earlier (${esc(preview)}).${elsewhere} <button type="button" data-restore-progress="${entry.id}">Restore</button> <button type="button" data-discard-progress="${entry.id}">Discard</button></p>`;
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
      <button type="button" class="flag" data-action="log-again" data-focus-key="again" data-id="${entry.id}" data-kind="${kind}">Again</button>
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

async function viewEpisode(entryId, episodeId, ticket) {
  const entry = await api(`/api/entries/${entryId}`, { signal: ticket.signal });
  if (!ticket.isCurrent()) return;
  const episode = (entry.show?.episodes || []).find(item => item.id === episodeId);
  if (!episode) {
    commitView(`<p class="quiet">That episode is not on this show.</p>`);
    return;
  }
  const label = episodePlace(episode);
  commitView(`
    <article class="episode-page${episode.watched ? " is-watched" : ""}">
      <p class="eyebrow"><a href="#/item/${entry.id}?season=${episode.season_number}">${esc(entry.title)}</a></p>
      <button type="button" class="episode-toggle" data-episode-page data-id="${entry.id}" data-episode="${episode.id}" aria-pressed="${episode.watched ? "true" : "false"}">
        <h1>${esc(episode.title || label)}</h1>
        <p class="lede">${esc(label)}${episode.air_date ? ` · ${esc(episode.air_date)}` : ""}</p>
      </button>
      ${episode.overview ? `<p class="overview">${esc(episode.overview)}</p>` : ""}
    </article>`);
}

function musicBlock(entry) {
  const music = entry.music || { albums: [], partial: false };
  const albums = music.albums.map(album => `
    <li class="cover" data-album-row data-id="${entry.id}" data-album="${album.id}">
      <button type="button" class="cover-face" data-album-open aria-label="${esc(album.title)}">
        ${coverImage(album.artwork_url)}
        <span>${esc(album.title)}</span>
      </button>
      ${scoreMarks(album.rating, album.title)}
      <ol class="cover-tracks" hidden>
        ${(album.tracks || []).map(track => `<li data-track-row data-id="${entry.id}" data-track="${track.id}"><button type="button" class="song-name" data-song-center="${esc(track.title)}">${esc(track.title)}</button>${scoreMarks(track.rating, track.title)}</li>`).join("")}
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

let webNodes = [];

function paintWeb(center, nodes = webNodes) {
  webNodes = nodes || [];
  const box = document.querySelector("[data-web]");
  if (!box || !webNodes.length) return;
  const count = Math.min(webNodes.length, 12);
  const cx = 160;
  const cy = 118;
  const radius = 92;
  const marks = webNodes.slice(0, count).map((node, index) => {
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

async function loadWeb(entry, ticket) {
  if (entry.kind !== "artist" && entry.kind !== "movie" && entry.kind !== "tv") return;
  try {
    const web = await api(`/api/entries/${entry.id}/web`, { signal: ticket?.signal });
    if (ticket && !ticket.isCurrent()) return;
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

function readDraftRecord(id) {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw || !raw.startsWith("{")) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.text !== "string") return null;
    const record = { text: parsed.text, at: typeof parsed.at === "string" ? parsed.at : "" };
    if (Object.prototype.hasOwnProperty.call(parsed, "base")) record.base = parsed.base ?? "";
    return record;
  } catch {
    return null;
  }
}

function writeDraft(id, text, base) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify({
      text,
      at: new Date().toISOString(),
      base: base ?? "",
    }));
  } catch { /* private mode */ }
}

function progressDraftKey(id) {
  return `media-progress-draft:${id}`;
}

function readProgressDraft(id) {
  try {
    const raw = localStorage.getItem(progressDraftKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.value !== "string" || typeof parsed.unit !== "string") return null;
    return {
      value: parsed.value,
      unit: parsed.unit,
      base: typeof parsed.base === "string" ? parsed.base : "",
    };
  } catch {
    return null;
  }
}

function writeProgressDraft(id, value, unit, base) {
  try {
    localStorage.setItem(progressDraftKey(id), JSON.stringify({
      value,
      unit,
      base: base ?? "",
    }));
  } catch { /* private mode */ }
}

function clearProgressDraft(id) {
  try { localStorage.removeItem(progressDraftKey(id)); } catch { /* ignore */ }
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

function settleLibraryHash() {
  const current = route();
  if (current.name !== "library") return { droppedSort: false };
  const normalized = normalizeLibraryQuery(current.params);
  if (!normalized.changed) return { droppedSort: false };
  const query = normalized.params.toString();
  const hash = query ? `#/library?${query}` : "#/library";
  history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
  return { droppedSort: normalized.droppedSort };
}

async function render() {
  const focusKey = focusKeyOf(document.activeElement);
  const progress = document.querySelector("#progress");
  const staying = itemIdFromHash(app.dataset.view) !== ""
    && itemIdFromHash(app.dataset.view) === itemIdFromHash(location.hash);
  if (progress instanceof HTMLInputElement && progress.dataset.dirty === "true") saveProgress();
  searchLoads.start("");
  const ticket = routeLoads.start();
  if (staying) await progressChain;
  if (!ticket.isCurrent()) return;
  const libraryNotice = settleLibraryHash();
  document.querySelectorAll("[data-nav]").forEach(link => {
    link.setAttribute("aria-current", link.dataset.nav === route().name ? "page" : "false");
  });
  syncTheme();
  if (libraryNotice.droppedSort) toast(SORT_TOAST);
  const current = route();
  const scrolling = document.scrollingElement;
  const scrollY = scrolling ? scrolling.scrollTop : 0;
  const same = app.dataset.view === location.hash;
  const waits = current.name !== "search" && current.name !== "new";
  if (waits) {
    app.setAttribute("aria-busy", "true");
    clearSkeletonTimer();
    if (!same && !staying) {
      skeletonTimer = window.setTimeout(() => {
        if (!ticket.isCurrent()) return;
        app.innerHTML = skeletonFor(current.name);
      }, SKELETON_DELAY_MS);
    }
  }
  try {
    if (current.name === "home") await viewHome(ticket);
    else if (current.name === "calendar") await viewCalendar(current.params, ticket);
    else if (current.name === "library") await viewLibrary(current.params, ticket);
    else if (current.name === "search") viewSearch(current.params);
    else if (current.name === "new") viewNew(current.params);
    else if (current.name === "episode") await viewEpisode(current.id, current.episodeId, ticket);
    else await viewItem(current.id, ticket, current.name === "season" ? current.seasonNumber : null);
    if (!ticket.isCurrent()) return;
    app.dataset.view = location.hash;
    restoreFocus(focusKey);
    if (scrolling) scrolling.scrollTop = same ? scrollY : 0;
  } catch (error) {
    if (error?.name === "AbortError" || !ticket.isCurrent()) return;
    if (error?.status === 401) {
      location.assign(loginHref());
      return;
    }
    commitView(errorPanelHtml(route().name, error));
    app.dataset.view = location.hash;
    focusErrorTitle();
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
  const song = target.closest("[data-song-center]");
  if (song) {
    keepButtonClick(event, target);
    paintWeb(song.dataset.songCenter);
    return;
  }
  const cover = target.closest("[data-album-open]");
  if (cover) {
    keepButtonClick(event, target);
    const tracks = cover.parentElement?.querySelector(".cover-tracks");
    if (tracks) tracks.hidden = !tracks.hidden;
    return;
  }
  const restore = target.closest("[data-restore-note]");
  if (restore) {
    keepButtonClick(event, target);
    const draft = readDraftRecord(restore.getAttribute("data-restore-note"));
    const box = document.querySelector("textarea[data-review]");
    if (draft && box instanceof HTMLTextAreaElement) {
      box.value = draft.text;
      document.querySelector("#note-draft")?.remove();
      box.focus();
    }
    return;
  }
  const discardNote = target.closest("[data-discard-note]");
  if (discardNote) {
    keepButtonClick(event, target);
    const id = discardNote.getAttribute("data-discard-note");
    clearDraft(id);
    document.querySelector("#note-draft")?.remove();
    document.querySelector("textarea[data-review]")?.focus();
    return;
  }
  const restoreProgress = target.closest("[data-restore-progress]");
  if (restoreProgress) {
    keepButtonClick(event, target);
    const draft = readProgressDraft(restoreProgress.getAttribute("data-restore-progress"));
    const input = document.querySelector("#progress");
    const unit = document.querySelector("#progress-unit");
    if (draft && input instanceof HTMLInputElement) {
      const chosen = offeredUnit(unit, draft.unit);
      if (unit instanceof HTMLSelectElement && chosen) unit.value = chosen;
      input.value = draft.value;
      const help = document.querySelector("#progress-help");
      if (help) help.textContent = progressPreview(input.value, chosen);
      const key = `${input.value.trim()}|${chosen}`;
      const id = restoreProgress.getAttribute("data-restore-progress");
      if (input.dataset.saved === key) clearProgressDraft(id);
      else input.dataset.dirty = "true";
      document.querySelector("#progress-draft")?.remove();
      input.focus();
    }
    return;
  }
  const discardProgress = target.closest("[data-discard-progress]");
  if (discardProgress) {
    keepButtonClick(event, target);
    clearProgressDraft(discardProgress.getAttribute("data-discard-progress"));
    document.querySelector("#progress-draft")?.remove();
    document.querySelector("#progress")?.focus();
    return;
  }
  const button = target.closest("[data-action]");
  if (!button) return;
  keepButtonClick(event, target);
  const action = button.dataset.action;
  try {
    if (action === "retry-route") {
      await render();
      if (!app.querySelector("[data-error-title]")) focusPageHeading();
      return;
    }
    if (action === "retry-search") {
      await runSearch({ focusError: true });
      return;
    }
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
      toast("Experience removed. The overall review was left as it is.");
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
      await runSearch({ focusError: true });
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
      toast("Saved in your library.");
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
      toast("Overall opinion saved.");
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
      toast("Experience added. The overall review was not changed.");
      await render();
      return;
    }
    if (form.dataset.action === "save-experience") {
      await api(`/api/entries/${id}/experiences/${form.dataset.experience}`, { method: "PATCH", body: JSON.stringify({
        notes: data.notes,
        rating: data.rating === "" ? null : data.rating,
        spoiler: Boolean(data.spoiler),
      }) });
      toast("Experience updated.");
      await render();
      return;
    }
    if (form.dataset.action === "add-album") {
      await api(`/api/entries/${id}/albums`, { method: "POST", body: JSON.stringify({
        title: data.title,
        year: data.year || null,
      }) });
      toast("Album added.");
      await render();
      return;
    }
    if (form.dataset.action === "add-track") {
      await api(`/api/entries/${id}/albums/${form.dataset.album}/tracks`, { method: "POST", body: JSON.stringify({
        title: data.title,
      }) });
      toast("Song added.");
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
      toast(still
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
      toast("Episode added.");
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
      toast("Release recorded.");
      await render();
      return;
    }
    if (form.dataset.action === "delete-entry") {
      if (!confirm("Remove this from your library? The overall review, season scores, and experiences go with it.")) return;
      await api(`/api/entries/${id}`, { method: "DELETE" });
      toast("Removed from your library.");
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
      toast(created.already_saved ? "Already in your library." : "Saved in your library.");
      location.hash = `#/item/${created.id}`;
    }
  } catch (error) {
    fail(error);
  }
});

let searchTimer = 0;
document.addEventListener("focusout", async event => {
  const box = event.target;
  if (box instanceof HTMLInputElement && box.dataset.progress) {
    if (box.dataset.dirty === "true") await saveProgress();
    return;
  }
  if (!(box instanceof HTMLTextAreaElement) || !box.dataset.review) return;
  await saveNote(box);
});

async function saveNote(box) {
  if (!(box instanceof HTMLTextAreaElement) || !box.dataset.review) return;
  if (box.dataset.conflict === "true") return;
  if (box.value === (box.dataset.saved ?? "")) return;
  const id = box.dataset.review;
  const sent = box.value;
  const status = document.querySelector("#note-status");
  const stopSaving = armSaving(status);
  try {
    const updated = await api(`/api/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ review: sent, review_base: box.dataset.reviewBase ?? "" }),
    });
    stopSaving();
    if (readDraftRecord(id)?.text === sent) clearDraft(id);
    if (box.isConnected) {
      box.dataset.saved = sent;
      box.dataset.reviewBase = updated?.review_updated_at || "";
      showSaved(status);
    }
  } catch (error) {
    stopSaving();
    if (error?.status === 409) {
      box.dataset.conflict = "true";
      if (status?.isConnected) status.textContent = "";
      toast(NOTE_CONFLICT_TOAST, "alert", { label: "Reload", onClick: () => { void render(); } });
      return;
    }
    if (status?.isConnected) {
      status.classList.add("is-error");
      status.textContent = NOT_SAVED_LABEL;
    }
    fail(error, { label: "Retry", onClick: () => { void saveNote(box); } });
  }
}

document.addEventListener("input", event => {
  const target = event.target;
  if (target instanceof HTMLTextAreaElement && target.dataset.review) {
    writeDraft(target.dataset.review, target.value, target.dataset.reviewBase ?? "");
  }
  if (target instanceof HTMLInputElement && target.id === "progress") {
    target.dataset.dirty = "true";
    const help = document.querySelector("#progress-help");
    const unit = document.querySelector("#progress-unit");
    if (help) help.textContent = progressPreview(target.value, unit instanceof HTMLSelectElement ? unit.value : "");
  }
  if (target instanceof HTMLInputElement && target.id === "search-q") {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => runSearch(), 220);
  }
});

document.addEventListener("change", async event => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.id === "progress-unit") {
    const help = document.querySelector("#progress-help");
    const input = document.querySelector("#progress");
    if (help && input instanceof HTMLInputElement) help.textContent = progressPreview(input.value, target.value);
    await saveProgress();
    return;
  }
  if (target instanceof HTMLSelectElement && target.dataset.librarySort != null) {
    const params = new URLSearchParams(route().params);
    if (!target.value || target.value === "activity") params.delete("sort");
    else params.set("sort", target.value);
    const query = params.toString();
    location.hash = query ? `#/library?${query}` : "#/library";
    return;
  }
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
    toast(notice);
    await render();
  } catch (error) {
    fail(error);
  }
}

function progressSnapshot() {
  const input = document.querySelector("#progress");
  const unit = document.querySelector("#progress-unit");
  if (!(input instanceof HTMLInputElement) || !input.dataset.progress) return null;
  return {
    input,
    id: input.dataset.progress,
    value: input.value.trim(),
    unit: offeredUnit(unit, "") || "percent",
  };
}

function setProgressStatus(message, failed = false, announce = false) {
  const status = document.querySelector("#progress-status");
  const input = document.querySelector("#progress");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", failed);
  status.setAttribute("role", announce ? "alert" : "status");
  if (input) input.setAttribute("aria-invalid", failed ? "true" : "false");
}

function progressProblem(value, unit) {
  if (value === "") return "";
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return "Progress must be a number.";
  if (Number(value) < 0) return "Progress must be zero or more.";
  if (unit === "percent" && Number(value) > 100) return "Percent progress is between 0 and 100.";
  return "";
}

function retryProgress(payload) {
  const input = document.querySelector("#progress");
  let next = payload;
  if (input instanceof HTMLInputElement && input.dataset.progress === String(payload.id)) {
    input.value = payload.value;
    const unit = document.querySelector("#progress-unit");
    if (unit instanceof HTMLSelectElement) {
      const chosen = offeredUnit(unit, payload.unit);
      if (chosen) unit.value = chosen;
    }
    input.dataset.dirty = "true";
    next = { ...payload, input };
  }
  const task = progressChain.then(() => commitProgress(next));
  progressChain = task.catch(() => {});
  return task;
}

function failProgress(payload, message, keepDraft = true) {
  if (keepDraft) {
    writeProgressDraft(payload.id, payload.value, payload.unit, payload.input?.dataset.saved || "");
  }
  if (payload.input?.isConnected) setProgressStatus(keepDraft ? NOT_SAVED_LABEL : message, true, !keepDraft);
  if (keepDraft) {
    toast(PROGRESS_TOAST, "alert", { label: "Retry", onClick: () => { void retryProgress(payload); } });
  }
}

function saveProgress() {
  const snap = progressSnapshot();
  if (!snap) return progressChain;
  const key = `${snap.value}|${snap.unit}`;
  if (snap.input.dataset.saved === key) return progressChain;
  const pending = `${snap.id}|${key}`;
  if (progressPendingKey === pending) return progressChain;
  progressPendingKey = pending;
  const payload = { id: snap.id, value: snap.value, unit: snap.unit, key, input: snap.input };
  const task = progressChain.then(() => commitProgress(payload));
  const tracked = task.finally(() => {
    if (progressPendingKey === pending) progressPendingKey = "";
  });
  progressChain = tracked.catch(() => {});
  return task;
}

async function commitProgress(payload) {
  if (payload.input.isConnected && payload.input.dataset.saved === payload.key) return;
  const problem = progressProblem(payload.value, payload.unit);
  if (problem) {
    failProgress(payload, problem, false);
    return;
  }
  const status = payload.input.isConnected ? document.querySelector("#progress-status") : null;
  const stopSaving = armSaving(status);
  try {
    await api(`/api/entries/${payload.id}`, {
      method: "PATCH",
      keepalive: true,
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        progress_value: payload.value === "" ? null : payload.value,
        progress_unit: payload.unit,
      }),
    });
    stopSaving();
    clearProgressDraft(payload.id);
    document.querySelector(`[data-restore-progress="${payload.id}"]`)?.closest("#progress-draft")?.remove();
    if (payload.input.isConnected) {
      payload.input.dataset.saved = payload.key;
      delete payload.input.dataset.dirty;
      showSaved(status);
    }
  } catch (error) {
    stopSaving();
    if (error?.status === 401) {
      fail(error);
      return;
    }
    failProgress(payload, error?.message || NOT_SAVED_LABEL);
  }
}

document.addEventListener("keydown", event => {
  if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.dataset.progress) {
    event.preventDefault();
    saveProgress();
    return;
  }
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

function paintToday() {
  const today = localTodayIso();
  document.querySelectorAll(".cal-day").forEach(cell => {
    const time = cell.querySelector("time");
    const on = Boolean(time && time.getAttribute("datetime") === today);
    cell.classList.toggle("is-today", on);
    if (on) cell.setAttribute("aria-current", "date");
    else cell.removeAttribute("aria-current");
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") paintToday();
});

window.addEventListener("hashchange", () => {
  void render();
});
render();
