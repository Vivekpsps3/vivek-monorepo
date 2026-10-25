import { NETWORK_MESSAGE, api, loginHref } from "./api.mjs";
import { browserTimeZone, localTodayIso } from "../../shared-browser/today.mjs";
import { createToastLayer, itemIdFromHash } from "../../shared-browser/toast.mjs";
import { writeWeekStart, weekStartsOn } from "../../shared-browser/week.mjs";
import { icon } from "./icons.mjs";
import { keyboardScore, pointerScore, scoreControl, scoreValue } from "./score.mjs";
import { affectedSentence, orderGroups } from "./search-groups.mjs";
import {
  LIBRARY_PAGE_SIZE,
  addFormInner,
  caughtUpText,
  connectionsFailureHtml,
  creatorLabel,
  emptyMonthHtml,
  episodeCode,
  eventWord,
  graphCenter,
  legendHtml,
  libraryEmptyHtml,
  markNextLabel,
  monthEventCount,
  noteCardHtml,
  noteCountText,
  overviewHtml,
  relatedHtml,
  releaseInformative,
  searchIdleHtml,
  searchResultHeading,
  validateAdd,
} from "./views.mjs";
import {
  documentTitle,
  msUntilLocalMidnight,
  navKey,
  notFoundHtml,
  parseRoute,
  screenTitle,
  tabBarHidden,
} from "./shell.mjs";
import { createKeyedFetch, createSequence } from "./guard.mjs";
import {
  NOTE_CONFLICT_STATUS,
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
  chooseReview,
  failedNoteAfterReload,
  coverImage,
  dayLabel,
  draftKey,
  emptyState,
  escapeHtml as esc,
  genericStatusOptions,
  kindLabel,
  kindPlural,
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
const routeLoads = createSequence();
const searchLoads = createKeyedFetch();
let searchResults = [];
let quickIndex = -1;
let progressChain = Promise.resolve();
let progressQueuedKey = "";
let noteChain = Promise.resolve();
let noteOutcome = null;
let skeletonTimer = 0;
const { toast, pushToast, dismissToast, toastNodes, retireOtherItemToasts } = createToastLayer();

const WRITE_TIMEOUT_MS = 10_000;

function writeTimedOut(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError";
}

function visibleItemTitle(id) {
  if (itemIdFromHash(location.hash) !== String(id)) return "";
  return document.querySelector("article h1")?.textContent?.trim() || "";
}

function dismissItemSave(field, id) {
  dismissToast(`${field}:${id}`);
  dismissToast(`save-failed:${field}:${id}`);
}

// A failure stays tied to the item it was saving. If that item is still open,
// the toast uses the field key (`rating:12`) so a later success clears it and
// opening a different item retires it. If the reader has already moved on,
// the key is `save-failed:` so item-change retirement — which only removes
// toasts already on screen — cannot drop a failure that has not been shown.
// #15's createToastLayer can absorb this wrapper; the layer itself stays
// item-agnostic.
function reportItemSaveFailure({ id, field, title, error, message, retry }) {
  if (error?.status === 401 || error?.status === 403) {
    fail(error);
    return;
  }
  const here = itemIdFromHash(location.hash) === String(id);
  const key = here ? `${field}:${id}` : `save-failed:${field}:${id}`;
  dismissItemSave(field, id);
  pushToast({
    message: here ? message : `Save failed for ${title || "this item"}.`,
    kind: "alert",
    key,
    persist: true,
    action: {
      label: "Retry",
      onClick: () => { void retry(); },
    },
  });
}

function patchOpinion(id, body) {
  return api(`/api/entries/${id}`, {
    method: "PATCH",
    signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    body: JSON.stringify(body),
  });
}

async function saveStatus(id, status, title = visibleItemTitle(id)) {
  try {
    await patchOpinion(id, { status, anticipated: status === "anticipating" });
    dismissItemSave("status", id);
    await render();
  } catch (error) {
    reportItemSaveFailure({
      id,
      field: "status",
      title,
      error,
      message: writeTimedOut(error) ? NOT_SAVED_LABEL : (error?.message || "Something went wrong."),
      retry: () => saveStatus(id, status, title),
    });
  }
}

async function saveFlag(id, flag, on, title = visibleItemTitle(id)) {
  try {
    await patchOpinion(id, { [flag]: on });
    dismissItemSave(flag, id);
    await render();
  } catch (error) {
    reportItemSaveFailure({
      id,
      field: flag,
      title,
      error,
      message: writeTimedOut(error) ? NOT_SAVED_LABEL : (error?.message || "Something went wrong."),
      retry: () => saveFlag(id, flag, on, title),
    });
  }
}

async function saveRating(id, rating, title = visibleItemTitle(id)) {
  const status = document.querySelector("#score-status");
  const cancel = armSaving(status);
  try {
    await patchOpinion(id, { rating });
    cancel();
    dismissItemSave("rating", id);
    document.querySelector(`.opinion[data-id="${id}"] .score`)?.removeAttribute("data-pending-save");
    showSaved(status);
  } catch (error) {
    cancel();
    document.querySelector(`.opinion[data-id="${id}"] .score`)?.setAttribute("data-pending-save", "true");
    reportItemSaveFailure({
      id,
      field: "rating",
      title,
      error,
      message: writeTimedOut(error) ? NOT_SAVED_LABEL : (error?.message || "Something went wrong."),
      retry: () => saveRating(id, rating, title),
    });
  }
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
  return `<section class="error-panel"><h1 tabindex="-1" data-error-title>${esc(copy.title)}</h1><p>${esc(copy.body)}</p><div class="hero-actions">${retry}${links}</div></section>`;
}

function focusErrorTitle() {
  const heading = app.querySelector("[data-error-title]");
  if (heading instanceof HTMLElement) heading.focus();
}

function focusPageHeading() {
  const heading = app.querySelector("h1, h2");
  if (!(heading instanceof HTMLElement)) return;
  if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  heading.focus();
}

function focusSearchResult(box) {
  const heading = box.querySelector(searchResultHeading());
  if (heading instanceof HTMLElement) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    return;
  }
  const input = document.querySelector("#search-q");
  if (input instanceof HTMLElement) input.focus({ preventScroll: true });
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
  status.removeAttribute("aria-live");
  status.textContent = SAVED_LABEL;
  if (status.id === "progress-status") {
    document.querySelector("#progress")?.setAttribute("aria-invalid", "false");
  }
  window.setTimeout(() => {
    if (status.isConnected && status.textContent === SAVED_LABEL) status.textContent = "";
  }, SAVED_HOLD_MS);
}

function route() {
  return parseRoute(location.hash);
}

function paintIcons() {
  document.querySelectorAll("[data-icon]").forEach(node => {
    if (node.dataset.iconReady === "true") return;
    node.innerHTML = icon(node.dataset.icon);
    node.dataset.iconReady = "true";
  });
}

function applyChrome(current, extra = {}) {
  document.title = documentTitle(current, extra);
  const label = screenTitle(current, extra);
  document.querySelectorAll("[data-screen-title]").forEach(node => {
    node.textContent = label;
  });
  const currentNav = navKey(current.name);
  document.querySelectorAll("[data-nav]").forEach(link => {
    if (currentNav && link.dataset.nav === currentNav) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const links = [...document.querySelectorAll(".nav [data-nav]")];
  const active = links.find(link => link.getAttribute("aria-current") === "page") || links[0];
  links.forEach(link => {
    link.tabIndex = link === active ? 0 : -1;
  });
}

function closeAccountMenus() {
  document.querySelectorAll(".account-menu").forEach(menu => {
    menu.hidden = true;
  });
  document.querySelectorAll("[data-action='account-menu']").forEach(button => {
    button.setAttribute("aria-expanded", "false");
  });
}

function options(rows, selected) {
  return rows.map(row => `<option value="${esc(row.value)}"${row.value === selected ? " selected" : ""}>${esc(row.label)}</option>`).join("");
}

function poster(item) {
  const art = safeUrl(item.artwork_url);
  if (art) return `<img alt="" src="${esc(art)}" width="342" height="513" loading="lazy" decoding="async">`;
  return `<span class="poster-fallback" aria-hidden="true">${esc(kindLabel(item.kind).slice(0, 1))}</span>`;
}

function card(item) {
  const progress = item.progress_label ? ` · ${item.progress_label}` : "";
  const star = item.favorite ? `<span class="fav-badge" aria-label="Favorite">★</span>` : "";
  const percent = item.progress_unit === "percent" && item.progress_value != null
    ? `<span class="progress-bar" style="width:${Math.max(0, Math.min(100, Number(item.progress_value)))}%"></span>`
    : "";
  return `<a class="card" href="#/item/${item.id}">
    <span class="poster">${poster(item)}${star}${percent}</span>
    <span class="card-title">${esc(item.title)}</span>
    <span class="meta">${esc([kindLabel(item.kind), item.year, item.creator].filter(Boolean).join(" · "))}</span>
    <span class="meta">${esc(`${statusLabel(item.kind, item.status)} · ${ratingText(item.rating)}${progress}`)}</span>
  </a>`;
}

function syncWeek() {
  const start = String(weekStartsOn());
  document.querySelectorAll("[data-week-start]").forEach(button => {
    button.setAttribute("aria-checked", String(button.dataset.weekStart === start));
  });
}

function syncTheme() {
  const choice = document.documentElement.getAttribute("data-theme-choice") || "system";
  document.querySelectorAll("[data-theme-value]").forEach(button => {
    const on = button.dataset.themeValue === choice;
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-checked", String(on));
  });
}

function setTheme(choice) {
  const theme = choice === "light" || choice === "dark"
    ? choice
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-theme-choice", choice);
  try {
    localStorage.setItem("suite-theme", choice);
    localStorage.setItem("media-theme", choice);
  } catch { /* private mode */ }
  syncTheme();
}

async function viewHome(ticket) {
  const summary = await api("/api/summary", { signal: ticket.signal });
  if (!ticket.isCurrent()) return;
  const counts = summary.counts || {};
  const current = summary.currently || [];
  const upcoming = summary.upcoming || [];
  const notes = summary.recent_reviews || [];
  const next = summary.next_episodes || [];
  const allEmpty = !current.length && !upcoming.length && !next.length && !notes.length;
  const stats = `<p class="stats"><a href="#/library?status=in_progress">${counts.in_progress || 0} in progress</a> · <a href="#/library">${counts.library || 0} in library</a> · <a href="#/library?status=anticipating">${counts.anticipated || 0} coming up</a></p>`;
  const hero = `<section class="hero"><div>${stats}</div><div class="hero-actions"><a class="btn btn-primary" href="#/search">Find something to add</a></div></section>`;
  if (allEmpty) {
    commitView(`${hero}${emptyState({
      title: "Nothing in progress yet",
      body: "Find a book, show, film, album or game and it will show up here while you're on it.",
      primary: { href: "#/search", label: "Find something to add" },
      secondary: { href: "#/new", label: "Add by title" },
    })}`);
    return;
  }
  const nextRows = next.map(item => {
    const code = episodeCode(item.season, item.episode);
    const airs = item.state === "upcoming" && item.air_date ? `<span class="next-when">Airs ${esc(dayLabel(String(item.air_date).slice(0, 10)).split(",")[0])}</span>` : "";
    const button = item.episode_id && item.state !== "upcoming"
      ? `<button type="button" class="btn btn-secondary btn-sm" data-action="mark-watched" data-id="${item.entry_id}" data-episode="${item.episode_id}" data-label="${esc(code)}">Mark watched</button>`
      : "";
    const name = `${esc(code)}${item.title ? ` · ${esc(item.title)}` : ""}`;
    return `<li class="next-row"><a href="#/item/${item.entry_id}?season=${encodeURIComponent(item.season)}"><span class="poster poster-next">${poster(item)}</span><span class="next-copy"><strong>${esc(item.show_title)}</strong><span class="next-name">${name}</span>${airs}</span></a>${button}</li>`;
  }).join("");
  const inProgress = current.length
    ? `<div class="grid">${current.map(card).join("")}</div>`
    : `<p class="quiet">Nothing in progress. <a href="#/library?status=want">Open library</a></p>`;
  const coming = upcoming.length
    ? `<ul class="plain">${upcoming.map(item => `<li><a href="#/item/${item.id}">${esc(item.title)}</a><span>${esc(whenLabel(item))}</span></li>`).join("")}</ul>`
    : `<p class="quiet">Nothing coming up. Mark something Anticipating to track its release.</p>`;
  const noteCards = notes.length
    ? `<section><h2>Recent notes</h2><div class="note-cards">${notes.map(item => noteCardHtml(item)).join("")}</div></section>`
    : "";
  commitView(`
    ${hero}
    <section><h2>Next up</h2>${next.length ? `<ul class="next-list">${nextRows}</ul>` : `<p class="quiet">Nothing waiting.</p>`}</section>
    <section><h2>In progress</h2>${inProgress}</section>
    <section><h2>Coming up</h2>${coming}</section>
    ${noteCards}
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
  const agendaDays = (data.days || []).filter(day => (day.events || []).length);
  const agenda = agendaDays.length
    ? `<ul class="calendar-agenda">${agendaDays.map(day => `<li><time datetime="${esc(day.date)}">${esc(dayLabel(day.date))}</time><div class="cal-events">${(day.events || []).map(event => eventChip(event, false)).join("")}</div></li>`).join("")}</ul>`
    : "";
  const rows = [];
  for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7));
  const body = rows.map(week => `<div role="row">${week.map(day => {
    if (!day) return `<div role="gridcell" class="cal-day is-outside"></div>`;
    const events = byDay.get(day) || [];
    const todayClass = day === today ? " is-today" : "";
    const current = day === today ? ` aria-current="date"` : "";
    const shown = events.slice(0, 3).map(event => eventChip(event, true)).join("");
    const extra = events.length > 3 ? `<button type="button" class="cal-more" data-action="cal-more">+${events.length - 3} more</button><div class="cal-popover" hidden>${events.map(event => eventChip(event, false)).join("")}</div>` : "";
    const tab = day === today ? ` tabindex="0"` : ` tabindex="-1"`;
    return `<div role="gridcell" class="cal-day${todayClass}" data-date="${esc(day)}"${current}${tab}><time class="cal-num" datetime="${esc(day)}">${Number(day.slice(8))}</time>${shown}${extra}</div>`;
  }).join("")}</div>`).join("");
  const empty = monthEventCount(data) ? "" : emptyMonthHtml(label, `#/calendar?month=${shiftMonth(data.month, 1)}`);
  const partial = data.partial
    ? `<p class="quiet cal-partial">Some episode dates and follow-ups could not be loaded yet. What you already saved is still here. <button type="button" class="btn btn-sm" data-action="reload-calendar">Load the rest</button></p>`
    : "";
  commitView(`
    <section class="hero">
      <div>
        <h1>${esc(label)}</h1>
      </div>
      <div class="hero-actions cal-toolbar">
        <a class="btn" href="#/calendar?month=${esc(shiftMonth(data.month, -1))}" aria-label="Previous month">‹</a>
        <a class="btn" href="#/calendar">Today</a>
        <a class="btn" href="#/calendar?month=${esc(shiftMonth(data.month, 1))}" aria-label="Next month">›</a>
      </div>
    </section>
    ${legendHtml(data)}
    ${partial}
    ${empty}
    <div class="calendar-grid" role="grid" aria-label="${esc(label)}"><div role="row">${heads.replaceAll("<div ", `<div role="columnheader" `)}</div>${body}</div>
    ${agenda}
    ${band(`Sometime in ${label}`, data.month_band)}
    ${band(`Sometime in ${year || "this year"}`, data.year_band)}
    ${band("Date not set", data.unknown)}
  `);
  if (requested && data.month && requested !== data.month) {
    toast("That month couldn't be read. Showing this month.");
    history.replaceState(null, "", `${location.pathname}${location.search}#/calendar?month=${data.month}`);
  }
  applyChrome(route(), { monthLabel: label });
}

function eventChip(event, compact) {
  const type = ["episode", "anticipated", "sequel", "spinoff"].includes(event.type) ? event.type : "anticipated";
  const className = `cal-event cal-${type}${event.watched ? " is-watched" : ""}`;
  const text = chipText(event, compact);
  const prefix = `<span class="visually-hidden">${esc(eventWord(type))}: </span>`;
  const mark = event.watched ? " ✓" : "";
  const id = Number(event.entry_id);
  const body = `${prefix}${esc(text)}${mark}`;
  if (Number.isInteger(id) && id > 0) return `<a class="${className}" href="#/item/${id}">${body}</a>`;
  return `<span class="${className}">${body}</span>`;
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

function libraryFilterSummary(kind, status, q, sort, fav) {
  const parts = [];
  if (kind) parts.push(kindPlural(kind));
  if (status) {
    const generic = genericStatusOptions().find(row => row.value === status)?.label;
    parts.push(kind ? statusLabel(kind, status) : (generic || status));
  }
  if (fav) parts.push("Favorites");
  if (q) parts.push(`“${q}”`);
  if (sort === "added") parts.push("Recently added");
  else if (sort === "title") parts.push("Title A–Z");
  else if (sort === "rating") parts.push("Your score");
  else if (sort === "release") parts.push("Release year");
  return parts.length ? parts.join(" · ") : "Everything";
}

function libraryQuery(kind, status, q, sort, fav) {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (sort && sort !== "activity") params.set("sort", sort);
  if (fav) params.set("fav", "1");
  const text = params.toString();
  return text ? `#/library?${text}` : "#/library";
}

function libraryPage(kind, status, q, sort, body, resume, fav) {
  const kinds = ["", "movie", "tv", "book", "game", "album", "track", "artist"].map(value => ({
    value,
    label: value ? kindPlural(value) : "All",
  }));
  const statuses = [{ value: "", label: "All" }, ...(kind ? statusOptions(kind) : genericStatusOptions())];
  const sorts = [
    { value: "activity", label: "Recently active" },
    { value: "added", label: "Recently added" },
    { value: "title", label: "Title A–Z" },
    { value: "rating", label: "Your score" },
    { value: "release", label: "Release year" },
  ];
  const summary = libraryFilterSummary(kind, status, q, sort, fav);
  const filtered = Boolean(kind || status || q || fav || (sort && sort !== "activity"));
  const reset = filtered ? `<a class="btn btn-secondary btn-sm" href="#/library">Reset</a>` : "";
  return `
    <div class="library-filters" id="library-toolbar">
      <div class="library-filters__bar">
        <p class="library-active">Showing <strong>${esc(summary)}</strong></p>
        ${reset}
      </div>
      <div class="library-toolbar">
        <label class="grow">Search your library <input id="library-q" type="search" value="${esc(q)}" placeholder="Filter by title or creator" autocomplete="off"></label>
        <label class="sort-field">Sort <select id="library-sort" data-library-sort aria-label="Sort">${options(sorts, sort)}</select></label>
        <div class="chip-row" role="group" aria-label="Favorites">
          <button type="button" class="flag${fav ? " is-on" : ""}" data-library-fav aria-pressed="${fav ? "true" : "false"}">${fav ? "★ Favorites" : "☆ Favorites"}</button>
        </div>
      </div>
    </div>
    <div class="chip-row" role="group" aria-label="Type">${kinds.map(item => `<a class="status-mark${item.value === kind ? " is-on" : ""}" ${item.value === kind ? `aria-current="true"` : ""} href="${libraryQuery(item.value, status, q, sort, fav)}">${esc(item.label)}</a>`).join("")}</div>
    <div class="chip-row status-wide" role="group" aria-label="Status">${statuses.map(item => `<a class="flag${item.value === status ? " is-on" : ""}" ${item.value === status ? `aria-current="true"` : ""} href="${libraryQuery(kind, item.value, q, sort, fav)}">${esc(item.label)}</a>`).join("")}</div>
    <label class="status-narrow">Status <select id="library-status" data-library-status>${options(statuses.map(item => ({ value: item.value, label: item.label === "All" ? "All" : item.label })), status)}</select></label>
    ${continuePoint(resume)}
    <div data-library-body>${body}</div>
  `;
}

let libraryItems = [];
let libraryResume = null;
let libraryShown = LIBRARY_PAGE_SIZE;

function filteredLibrary(items, q, fav) {
  const needle = String(q || "").trim().toLowerCase();
  return (items || []).filter(item => {
    if (fav && !item.favorite) return false;
    if (!needle) return true;
    return `${item.title || ""} ${item.creator || ""}`.toLowerCase().includes(needle);
  });
}

function libraryCards(items) {
  const shown = items.slice(0, libraryShown);
  const more = items.length - shown.length;
  const button = more > 0 ? `<button type="button" class="btn" data-action="show-more">Show more</button>` : "";
  return `<div class="grid">${shown.map(card).join("")}</div>${button}`;
}

function paintLibrary(params, resume) {
  const kind = params.get("kind") || "";
  const status = params.get("status") || "";
  const q = params.get("q") || "";
  const sort = params.get("sort") || "activity";
  const fav = params.get("fav") === "1";
  const visible = filteredLibrary(libraryItems, q, fav);
  const body = visible.length ? libraryCards(visible) : libraryEmptyHtml({ kind, status, q });
  commitView(libraryPage(kind, status, q, sort, body, resume, fav));
}

async function viewLibrary(params, ticket) {
  const kind = params.get("kind") || "";
  const status = params.get("status") || "";
  const q = params.get("q") || "";
  const sort = params.get("sort") || "activity";
  const fav = params.get("fav") === "1";
  const query = new URLSearchParams();
  if (kind) query.set("kind", kind);
  if (status) query.set("status", status);
  query.set("sort", sort);
  const fromLibrary = String(app.dataset.view || "").startsWith("#/library");
  const previousCards = fromLibrary ? (app.querySelector("[data-library-body]")?.innerHTML || "") : "";
  commitView(libraryPage(kind, status, q, sort, previousCards, null, fav), true);
  const cardsTimer = window.setTimeout(() => {
    if (!ticket.isCurrent()) return;
    const slot = app.querySelector("[data-library-body]");
    if (!slot) return;
    slot.innerHTML = `<div class="grid" aria-hidden="true">${skeletonBlocks(12, "skeleton-card")}</div>`;
  }, SKELETON_DELAY_MS);
  try {
    const payload = await api(`/api/library?${query}`, { signal: ticket.signal });
    window.clearTimeout(cardsTimer);
    if (!ticket.isCurrent()) return;
    libraryItems = payload.items || [];
    libraryShown = LIBRARY_PAGE_SIZE;
    libraryResume = (!kind || kind === "tv") ? continueItem(payload.continue) : null;
    paintLibrary(params, libraryResume);
  } catch (error) {
    window.clearTimeout(cardsTimer);
    throw error;
  }
}

function viewSearch(params) {
  const q = params.get("q") || "";
  const kind = params.get("kind") || "";
  commitView(`
    <form class="filters" data-action="search-now" id="search-form">
      <label class="grow">Search <input id="search-q" name="q" value="${esc(q)}" type="search" autocomplete="off" placeholder="Title, artist, author or game"></label>
      <button class="btn search-clear" type="button" data-action="clear-search" aria-label="Clear">Clear</button>
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
    <div id="search-results">${searchIdleHtml(q)}</div>
  `);
  if (q.trim().length >= 2) runSearch();
  if (focusSearchOnPaint) {
    focusSearchOnPaint = false;
    document.querySelector("#search-q")?.focus();
  }
}

function resultRow(item, index) {
  const openHref = item.saved_id ? `#/item/${item.saved_id}` : "#/library";
  const action = item.already_saved
    ? `<span class="in-library">In library</span> <a href="${openHref}">Open</a>`
    : `<button class="btn btn-secondary btn-sm" type="button" tabindex="-1" data-action="${item.kind === "artist" ? "follow" : "open-quick"}" data-index="${index}">${item.kind === "artist" ? "Follow" : "Add"}</button>`;
  return `<article class="result" tabindex="-1" data-result="${index}">
    <span class="poster poster-sm">${poster(item)}</span>
    <div>
      <h2>${esc(item.title)} <span class="type-badge">${esc(kindLabel(item.kind).toUpperCase())}</span></h2>
      <p class="meta">${esc([item.year, item.creator].filter(Boolean).join(" · "))}</p>
      ${item.overview ? `<p class="clamp">${esc(item.overview)}</p>` : ""}
    </div>
    <div class="result-action">${action}</div>
  </article>`;
}

function renderResults(payload) {
  const sentence = affectedSentence(payload.providers);
  const line = sentence
    ? `<p class="quiet">${esc(sentence)} <a href="#/new?title=${encodeURIComponent(payload.query || "")}">Add one by title</a></p>`
    : "";
  if (!payload.results.length) {
    return `${line}<p class="quiet">Your notes are never sent to these services.</p><div class="empty suite-empty"><h2>No public match for “${esc(payload.query)}”</h2><p>Check the spelling, or add it yourself.</p><a class="btn btn-primary" href="#/new?title=${encodeURIComponent(payload.query || "")}">Add “${esc(payload.query)}” by title</a></div>`;
  }
  const selected = document.querySelector("#search-kind")?.value || "";
  const count = `<p class="quiet" role="status">${payload.results.length} results for “${esc(payload.query)}”</p>`;
  if (selected) {
    return `${line}<div class="results">${payload.results.map((item, index) => resultRow(item, index)).join("")}</div>${count}`;
  }
  const groups = orderGroups(payload.results, payload.query).map(group => {
    const visible = group.expanded ? group.rows : group.rows.slice(0, 3);
    const hidden = group.rows.length - visible.length;
    const more = hidden > 0
      ? `<button type="button" data-action="show-group" data-kind="${group.kind}">Show all ${group.rows.length} ${esc(kindPlural(group.kind).toLowerCase())}</button>`
      : "";
    const rows = visible.map(item => resultRow(item, payload.results.indexOf(item))).join("");
    return `<section data-group="${group.kind}"><h2>${esc(kindPlural(group.kind))} · ${group.rows.length}</h2><div class="results">${rows}</div>${more}</section>`;
  }).join("");
  return `${line}${groups}${count}`;
}

async function runSearch({ focusError = false, focusResult = false } = {}) {
  const input = document.querySelector("#search-q");
  const kind = document.querySelector("#search-kind")?.value || "";
  const box = document.querySelector("#search-results");
  if (!input || !box) return;
  const q = input.value.trim();
  if (q.length < 2) {
    searchLoads.start("");
    box.innerHTML = searchIdleHtml(q);
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
    const rows = box.querySelectorAll(".result");
    if (rows[0]) rows[0].tabIndex = 0;
    box.setAttribute("aria-busy", "false");
    if (focusResult) focusSearchResult(box);
  } catch (error) {
    window.clearTimeout(resultsTimer);
    if (error?.name === "AbortError" || !ticket.matches()) return;
    box.setAttribute("aria-busy", "false");
    const copy = routeErrorCopy("search", error);
    const alert = focusError ? "" : ` role="alert"`;
    box.innerHTML = `<div class="error-panel"${alert}><h2 tabindex="-1" data-error-title>${esc(copy.title)}</h2><p>${esc(copy.body)}</p><div class="hero-actions"><button type="button" class="btn btn-primary" data-action="retry-search">Try again</button><a class="btn" href="#/new?title=${encodeURIComponent(q)}">Add “${esc(q)}” by title</a></div></div>`;
    if (focusError) focusErrorTitle();
  }
}

function viewNew(params) {
  const kind = params.get("kind") || "movie";
  commitView(`
    <form class="stack add-form" data-action="create-manual" novalidate>
      ${addFormInner({ title: params.get("title") || "", kind })}
    </form>`);
  document.querySelector("[name=title]")?.focus();
}

function scoreMarks(value, label, child = false) {
  return scoreControl({ value, label, child });
}

let ratingTimer = 0;
function scheduleRating(id, rating) {
  window.clearTimeout(ratingTimer);
  ratingTimer = window.setTimeout(() => {
    void saveRating(id, rating);
  }, 400);
}

function paintScore(group, value) {
  const child = group.classList.contains("score-child");
  const label = group.getAttribute("aria-label") || "Your score";
  const holder = document.createElement("div");
  holder.innerHTML = scoreControl({ value, label, child });
  const next = holder.firstElementChild;
  if (!next) return group;
  group.replaceWith(next);
  next.querySelector('[aria-checked="true"]')?.focus();
  return next;
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
  const scoreText = entry.rating == null ? "Unrated" : ratingText(entry.rating).replace("/10", " / 10");
  commitView(`
    <article class="detail">
      <div class="detail-head">
        <div class="poster poster-lg">${poster(entry)}</div>
        <div class="detail-titles">
          <p class="eyebrow">${esc(kindLabel(entry.kind))}${entry.catalog.source === "manual" ? " · Added manually" : ""}</p>
          <h1>${esc(entry.title)}</h1>
          <p class="lede">${esc([entry.creator, entry.year].filter(Boolean).join(" · "))}</p>
        </div>
      </div>
      <div class="detail-main">
        ${overviewHtml(entry.catalog.overview)}
        ${externalRatings(entry.catalog.external_ratings)}
        ${releaseLine(entry.releases)}
        <div class="opinion" data-id="${entry.id}" data-favorite="${entry.favorite ? "true" : "false"}" data-anticipated="${entry.anticipated ? "true" : "false"}">
          <section class="detail-section">
            <div class="field-label">Status <span id="status-save" class="progress-status" role="status"></span></div>
            <div class="status-row" role="radiogroup" aria-label="Status">${statusOptions(entry.kind).map(opt => {
              const on = opt.value === entry.status;
              return `<button type="button" role="radio" class="status-mark${on ? " is-on" : ""}" aria-checked="${on ? "true" : "false"}" tabindex="${on ? "0" : "-1"}" data-set-status="${opt.value}" data-focus-key="status:${esc(opt.value)}">${esc(opt.label)}</button>`;
            }).join("")}</div>
          </section>
          <section class="detail-section score-group">
            <h2 class="score-heading">${entry.kind === "tv" ? "Show score" : "Your score"}</h2>
            <div class="field-label"><span id="score-value" class="value">${esc(scoreText)}</span> <span id="score-status" class="progress-status" role="status"></span></div>
            <div class="score-row">
              ${scoreMarks(entry.rating, entry.kind === "tv" ? "Show score" : "Your score")}
              <button type="button" class="flag${entry.favorite ? " is-on" : ""}" data-flag="favorite" data-focus-key="flag-favorite" aria-pressed="${entry.favorite ? "true" : "false"}" aria-label="Favorite">${entry.favorite ? "★ Favorite" : "☆ Favorite"}</button>
            </div>
          </section>
          ${progress ? `<section class="detail-section">${progressField(entry)}</section>` : ""}
          <section class="detail-section note-block">
            <label for="note">Your note</label>
            <textarea id="note" name="review" data-draft="${esc(draftKey(entry.id))}" data-review="${entry.id}" data-spoiler-saved="${entry.review_spoiler ? "true" : "false"}" rows="4" aria-label="Note">${esc(review.text)}</textarea>
            <label class="spoiler"><input type="checkbox" data-spoiler ${entry.review_spoiler ? "checked" : ""}> Contains spoilers</label>
            <p class="meta" data-note-count>${esc(noteCountText(review.text))}</p>
            <p id="note-status" class="progress-status" role="status"></p>
            ${review.restore ? `<p id="note-draft" class="save-draft">${esc(NOTE_RESTORE_LABEL)} <button type="button" data-restore-note="${entry.id}">Restore</button> <button type="button" data-discard-note="${entry.id}">Discard</button></p>` : ""}
          </section>
        </div>
        ${entry.kind === "tv" ? showEpisodes(entry, seasonNumber) : ""}
        ${entry.kind === "artist" ? musicBlock(entry) : ""}
        <div class="web" data-web="${entry.id}" hidden></div>
        ${detailsBlock(entry)}
        <form class="danger-zone" data-action="delete-entry" data-id="${entry.id}"><button class="btn btn-danger" type="submit">Remove from library</button></form>
      </div>
    </article>
  `);
  const note = app.querySelector("textarea[data-review]");
  if (note instanceof HTMLTextAreaElement) {
    note.dataset.saved = entry.review ?? "";
    note.dataset.reviewBase = entry.review_updated_at ?? "";
    const failedNote = failedNoteAfterReload(
      String(noteOutcome?.id) === String(id) ? noteOutcome : null,
      entry.review,
    );
    if (failedNote != null) {
      if (note.value !== failedNote) {
        note.value = failedNote;
        writeDraft(id, failedNote, entry.review_updated_at ?? "");
      }
      showNoteFailure(document.querySelector("#note-status"));
    } else if (String(noteOutcome?.id) === String(id)) {
      noteOutcome = null;
    }
  }
  dismissToast(`note-conflict:${id}`);
  applyChrome(route(), { title: entry.title });
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
      <p id="progress-status" class="progress-status" role="status"></p>
    </div>
    <p id="progress-help" class="meta">${esc(preview)}</p>
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
  const rows = (releases || []).filter(releaseInformative);
  if (!rows.length) return "";
  return `<ul class="plain">${rows.map(row => `<li><span>${esc([row.platform, row.region].filter(Boolean).join(" · ") || "Release")}</span><span>${esc(releaseLabel(row))}</span></li>`).join("")}</ul>`;
}

function detailsBlock(entry) {
  const genres = Array.isArray(entry.catalog?.genres) ? entry.catalog.genres.filter(Boolean) : [];
  const tags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [];
  const genreLine = genres.length ? `<p>Genres: ${esc(genres.join(", "))}</p>` : "";
  const tagLine = tags.length ? `<p>Tags: ${esc(tags.join(", "))}</p>` : "";
  return `<details class="item-details"><summary>Details</summary>${genreLine}${tagLine}${releaseForm(entry)}</details>`;
}

function showEpisodes(entry, seasonNumber) {
  const show = entry.show || { episodes: [], seasons: [] };
  const seasons = show.seasons || [];
  const episodes = (show.episodes || [])
    .filter(episode => seasonNumber == null || episode.season_number === seasonNumber)
    .sort((a, b) => a.episode_number - b.episode_number || a.id - b.id);
  const tabs = seasons.map(item => {
    const selected = item.season_number === seasonNumber;
    return `<button type="button" role="tab" class="season-chip${selected ? " is-current" : ""}" id="season-tab-${item.season_number}" data-season-jump data-id="${entry.id}" data-season="${item.season_number}" data-focus-key="season:${item.season_number}" aria-selected="${selected ? "true" : "false"}" tabindex="${selected ? "0" : "-1"}" aria-controls="season-panel">${esc(seasonLabel(item.season_number))}</button>`;
  }).join("");
  const rating = seasons.find(item => item.season_number === seasonNumber);
  const watched = rating?.watched ? "true" : "false";
  const score = rating
    ? `<div data-season-marks data-id="${entry.id}" data-season="${rating.season_number}" data-watched="${watched}">${scoreMarks(rating.rating, "Season score")}</div>`
    : "";
  const seasonWatched = rating
    ? `<button type="button" class="btn ${rating.watched ? "btn-primary" : "btn-secondary"}" data-action="season-watched" data-id="${entry.id}" data-season="${rating.season_number}" aria-pressed="${rating.watched ? "true" : "false"}">${rating.watched ? "Season watched" : "Mark season watched"}</button>`
    : "";
  const seasonBox = rating
    ? `<section class="score-group season-score-group" aria-label="Season score"><h2 class="score-heading">Season score</h2>${score}${seasonWatched}</section>`
    : "";
  const tiles = episodes.map(episode => {
    const label = episodePlace(episode);
    const code = episodeCode(episode.season_number, episode.episode_number);
    const unaired = episode.released === false && !episode.watched;
    const watch = unaired
      ? `<button type="button" class="btn btn-secondary btn-sm" disabled aria-disabled="true" aria-label="${esc(code)} has not aired yet">Has not aired yet</button>`
      : `<button type="button" class="btn ${episode.watched ? "btn-primary" : "btn-secondary"} btn-sm" data-episode-tile data-id="${entry.id}" data-episode="${episode.id}" aria-pressed="${episode.watched ? "true" : "false"}">${episode.watched ? "Watched" : "Mark watched"}</button>`;
    return `<li class="episode-tile${episode.watched ? " is-watched" : ""}"><a href="#/item/${entry.id}/episode/${episode.id}">${esc(episode.episode_number)} ${esc(episode.title || label)}</a>${watch}</li>`;
  }).join("");
  const nextLabel = markNextLabel(show);
  const upcoming = show.next_episode;
  const next = nextLabel && upcoming
    ? `<button type="button" class="btn btn-primary" data-action="mark-next" data-id="${entry.id}" data-episode="${upcoming.id}" data-label="${esc(episodeCode(upcoming.season_number, upcoming.episode_number))}">${esc(nextLabel)}</button>`
    : "";
  return `<section class="episodes-section detail-section">
    <p class="meta">${esc(caughtUpText(show))}</p>
    ${next}
    <div class="season-strip" role="tablist" aria-label="Seasons">${tabs}</div>
    <div role="tabpanel" id="season-panel" aria-labelledby="season-tab-${seasonNumber}">${seasonBox}<ol class="episode-tiles">${tiles}</ol></div>
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
      <h1>${esc(episode.title || label)}</h1>
      <p class="lede">${esc(label)}${episode.air_date ? ` · ${esc(releaseLabel({ precision: "day", released_on: episode.air_date, status: "released" }))}` : ""}</p>
      ${episode.released === false && !episode.watched
        ? `<button type="button" class="btn btn-secondary" disabled aria-disabled="true">Has not aired yet</button>`
        : `<button type="button" class="btn ${episode.watched ? "btn-primary" : "btn-secondary"}" data-episode-page data-id="${entry.id}" data-episode="${episode.id}" aria-pressed="${episode.watched ? "true" : "false"}">${episode.watched ? "Watched" : "Mark watched"}</button>`}
      ${episode.overview ? `<p class="overview">${esc(episode.overview)}</p>` : ""}
    </article>`);
  applyChrome(route(), {
    show: entry.title,
    season: episode.season_number,
    episode: episode.episode_number,
    episodeTitle: episode.title || "",
  });
}

function musicBlock(entry) {
  const music = entry.music || { albums: [], partial: false };
  const albums = music.albums.map(album => `
    <li class="cover" data-album-row data-id="${entry.id}" data-album="${album.id}">
      <button type="button" class="cover-face" data-album-open aria-expanded="false" aria-label="${esc(album.title)}">
        ${coverImage(album.artwork_url)}
        <span>${esc(album.title)}</span>
      </button>
      ${scoreMarks(album.rating, album.title, true)}
      <ol class="cover-tracks" hidden>
        ${(album.tracks || []).map(track => `<li data-track-row data-id="${entry.id}" data-track="${track.id}"><span class="song-name">${esc(track.title)}</span>${scoreMarks(track.rating, track.title, true)}</li>`).join("")}
      </ol>
    </li>`).join("");
  const partial = music.partial ? `<p class="quiet">Some albums are still loading. Check back in a minute.</p>` : "";
    return `
    <section class="discog">
      ${partial}
      <ul class="covers">${albums}</ul>
      <form class="cover cover-add" data-action="add-album" data-id="${entry.id}">
        <input name="title" aria-label="Album" placeholder="Album" required>
        <input name="year" aria-label="Year" inputmode="numeric" placeholder="Year">
        <button type="submit" aria-label="Add album">+</button>
      </form>
    </section>`;
}

let webNodes = [];
let webCenter = "";

function paintWeb(center, nodes = webNodes) {
  webNodes = nodes || [];
  webCenter = graphCenter(center);
  const box = document.querySelector("[data-web]");
  if (!box) return;
  const html = relatedHtml(webNodes);
  if (!html) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = html;
}

async function loadWeb(entry, ticket) {
  if (entry.kind !== "artist" && entry.kind !== "movie" && entry.kind !== "tv") return;
  const box = document.querySelector("[data-web]");
  try {
    const web = await api(`/api/entries/${entry.id}/web`, { signal: ticket?.signal });
    if (ticket && !ticket.isCurrent()) return;
    const current = route();
    if (current.name !== "item" || current.id !== entry.id) return;
    paintWeb(entry.title, web.nodes || []);
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (!box) return;
    box.hidden = false;
    box.innerHTML = connectionsFailureHtml();
  }
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

let addInvoker = null;

function openAdd(options, invoker) {
  const dialog = document.querySelector("#quick-add");
  const form = dialog?.querySelector("form");
  if (!(dialog instanceof HTMLDialogElement) || !(form instanceof HTMLFormElement)) {
    location.hash = "#/new";
    return;
  }
  form.dataset.action = options.prefilled ? "quick-add" : "create-manual";
  form.innerHTML = addFormInner(options);
  addInvoker = invoker instanceof HTMLElement ? invoker : null;
  if (!dialog.open) dialog.showModal();
  const focus = options.prefilled
    ? form.querySelector("[name=status]")
    : form.querySelector("[name=title]");
  if (focus instanceof HTMLElement) focus.focus();
}

function showAddErrors(form, errors) {
  let first = null;
  for (const name of ["title", "year"]) {
    const field = form.querySelector(`[name="${name}"]`);
    const message = form.querySelector(`#${name}-error`);
    const invalid = Boolean(errors[name]);
    if (field instanceof HTMLElement) {
      field.setAttribute("aria-invalid", invalid ? "true" : "false");
      if (invalid && !first) first = field;
    }
    if (message) {
      message.hidden = !invalid;
      message.textContent = errors[name] || "";
    }
  }
  const banner = form.querySelector("[data-form-error]");
  if (banner) banner.hidden = true;
  if (first instanceof HTMLElement) first.focus();
  return Object.keys(errors).length === 0;
}

function addScore(form) {
  const raw = form.querySelector(".score")?.getAttribute("data-score-value");
  if (raw == null || raw === "") return null;
  return raw;
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
  const nextItem = itemIdFromHash(location.hash);
  const staying = itemIdFromHash(app.dataset.view) !== ""
    && itemIdFromHash(app.dataset.view) === nextItem;
  // A toast keyed to an item belongs to that item. Library and other routes
  // keep it; opening a different item drops it.
  if (nextItem && !staying) retireOtherItemToasts(nextItem);
  if (progress instanceof HTMLInputElement && progress.dataset.dirty === "true") saveProgress();
  searchLoads.start("");
  const ticket = routeLoads.start();
  // Wait for an in-flight note save so this refetch cannot paint the pre-save
  // text. The note PATCH aborts after 10s, so the wait cannot wedge the view.
  if (staying) await Promise.all([progressChain, noteChain]);
  if (!ticket.isCurrent()) return;
  const libraryNotice = settleLibraryHash();
  const chromeRoute = route();
  applyChrome(chromeRoute, { query: chromeRoute.params.get("q") || "" });
  syncTheme();
  syncWeek();
  if (libraryNotice.droppedSort) toast(SORT_TOAST);
  const current = route();
  const scrolling = document.scrollingElement;
  const scrollY = scrolling ? scrolling.scrollTop : 0;
  const same = app.dataset.view === location.hash;
  const waits = current.name !== "search" && current.name !== "new" && current.name !== "missing";
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
    else if (current.name === "item" || current.name === "season") await viewItem(current.id, ticket, current.name === "season" ? current.seasonNumber : null);
    else {
      commitView(notFoundHtml(location.hash || "#/"));
      applyChrome(current);
    }
    if (!ticket.isCurrent()) return;
    app.dataset.view = location.hash;
    if (current.name === "missing") {
      app.querySelector("h1")?.focus();
    }
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
  if (!target.closest(".account")) closeAccountMenus();
  const week = target.closest("[data-week-start]");
  if (week) {
    keepButtonClick(event, target);
    writeWeekStart(week.dataset.weekStart);
    syncWeek();
    if (route().name === "calendar") await render();
    return;
  }
  const theme = target.closest("[data-theme-value]");
  if (theme) {
    keepButtonClick(event, target);
    setTheme(theme.dataset.themeValue);
    return;
  }
  const libraryFav = target.closest("[data-library-fav]");
  if (libraryFav) {
    keepButtonClick(event, target);
    const params = route().params;
    const pressed = libraryFav.getAttribute("aria-pressed") === "true";
    location.hash = libraryQuery(
      params.get("kind") || "",
      params.get("status") || "",
      params.get("q") || "",
      params.get("sort") || "activity",
      !pressed,
    );
    return;
  }
  const mark = target.closest(".score [data-score]");
  if (mark) {
    keepButtonClick(event, target);
    const group = mark.closest(".score");
    const current = scoreValue(group?.dataset.scoreValue);
    let next = null;
    if (mark.dataset.score === "") next = null;
    else if (mark.dataset.score === "0") next = 0;
    else {
      const rect = mark.getBoundingClientRect();
      const fraction = rect.width ? (event.clientX - rect.left) / rect.width : 1;
      next = pointerScore(mark.dataset.score, fraction);
    }
    if (next === current && group.dataset.pendingSave !== "true") return;
    const painted = paintScore(group, next);
    const season = painted.closest("[data-season-marks]");
    const track = painted.closest("[data-track-row]");
    const album = painted.closest("[data-album-row]");
    const opinion = painted.closest(".opinion");
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
        scheduleRating(opinion.dataset.id, next);
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
    await saveStatus(opinion.dataset.id, statusButton.dataset.setStatus);
    return;
  }
  const flag = target.closest("[data-flag]");
  if (flag) {
    keepButtonClick(event, target);
    const opinion = flag.closest(".opinion");
    const on = flag.getAttribute("aria-pressed") !== "true";
    await saveFlag(opinion.dataset.id, flag.dataset.flag, on);
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
    location.hash = `#/item/${season.dataset.id}?season=${season.dataset.season}`;
    return;
  }
  const song = target.closest("[data-song-center]");
  if (song) {
    keepButtonClick(event, target);
    paintWeb(graphCenter(webCenter));
    return;
  }
  const cover = target.closest("[data-album-open]");
  if (cover) {
    keepButtonClick(event, target);
    const tracks = cover.parentElement?.querySelector(".cover-tracks");
    const open = tracks ? tracks.hidden : false;
    if (tracks) tracks.hidden = !open;
    cover.setAttribute("aria-expanded", open ? "true" : "false");
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
    if (action === "account-menu") {
      const menu = button.parentElement?.querySelector(".account-menu");
      const opening = Boolean(menu?.hidden);
      closeAccountMenus();
      if (opening && menu) {
        menu.hidden = false;
        button.setAttribute("aria-expanded", "true");
      }
      return;
    }
    if (action === "open-add") {
      closeAccountMenus();
      openAdd({}, button);
      return;
    }
    if (action === "clear-search") {
      const input = document.querySelector("#search-q");
      if (input instanceof HTMLInputElement) {
        input.value = "";
        input.focus();
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    if (action === "show-more") {
      libraryShown += LIBRARY_PAGE_SIZE;
      const slot = app.querySelector("[data-library-body]");
      const current = route();
      if (slot && current.name === "library") {
        const visible = filteredLibrary(libraryItems, current.params.get("q") || "", current.params.get("fav") === "1");
        slot.innerHTML = visible.length ? libraryCards(visible) : libraryEmptyHtml({
          kind: current.params.get("kind") || "",
          status: current.params.get("status") || "",
          q: current.params.get("q") || "",
        });
      }
      return;
    }
    if (action === "toggle-overview") {
      const overview = document.querySelector("#overview");
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", open ? "false" : "true");
      button.textContent = open ? "More" : "Less";
      overview?.classList.toggle("is-clamped", open);
      return;
    }
    if (action === "cal-more") {
      const pop = button.parentElement?.querySelector(".cal-popover");
      if (pop instanceof HTMLElement) pop.hidden = !pop.hidden;
      return;
    }
    if (action === "reload-calendar") {
      await render();
      return;
    }
    if (action === "retry-web") {
      const id = document.querySelector("[data-web]")?.getAttribute("data-web");
      if (id) {
        try {
          const web = await api(`/api/entries/${id}/web`);
          paintWeb(webCenter || document.querySelector("h1")?.textContent || "", web.nodes || []);
        } catch (error) {
          if (error?.name !== "AbortError") {
            const box = document.querySelector("[data-web]");
            if (box) box.innerHTML = connectionsFailureHtml();
          }
        }
      }
      return;
    }
    if (action === "mark-next") {
      const label = button.dataset.label || "the episode";
      const episode = button.dataset.episode;
      const id = button.dataset.id;
      await api(`/api/entries/${id}/episodes/next`, { method: "POST", body: "{}" });
      toast(`Marked ${label} watched.`, "status", {
        label: "Undo",
        key: `watched:${episode}`,
        onClick: async () => {
          await api(`/api/entries/${id}/episodes/${episode}/watched`, {
            method: "POST",
            body: JSON.stringify({ watched: false }),
          });
          dismissToast(`watched:${episode}`);
          await render();
        },
      });
      await render();
      return;
    }
    if (action === "mark-watched") {
      const label = button.dataset.label || "the episode";
      await api(`/api/entries/${button.dataset.id}/episodes/${button.dataset.episode}/watched`, {
        method: "POST",
        body: JSON.stringify({ watched: true }),
      });
      toast(`Marked ${label} watched.`, "status", {
        label: "Undo",
        key: `watched:${button.dataset.episode}`,
        onClick: async () => {
          await api(`/api/entries/${button.dataset.id}/episodes/${button.dataset.episode}/watched`, {
            method: "POST",
            body: JSON.stringify({ watched: false }),
          });
          dismissToast(`watched:${button.dataset.episode}`);
          await render();
        },
      });
      await render();
      return;
    }
    if (action === "season-watched") {
      const next = button.getAttribute("aria-pressed") !== "true";
      const marks = document.querySelector(`[data-season-marks][data-season="${button.dataset.season}"] .score`);
      const raw = marks?.dataset.scoreValue;
      const rating = raw === "" || raw == null ? null : Number(raw);
      await api(`/api/entries/${button.dataset.id}/seasons`, {
        method: "POST",
        body: JSON.stringify({
          season_number: Number(button.dataset.season),
          watched: next,
          rating,
        }),
      });
      button.setAttribute("aria-pressed", String(next));
      button.textContent = next ? "Season watched" : "Mark season watched";
      button.classList.toggle("btn-primary", next);
      button.classList.toggle("btn-secondary", !next);
      const holder = document.querySelector(`[data-season-marks][data-season="${button.dataset.season}"]`);
      if (holder) holder.dataset.watched = next ? "true" : "false";
      return;
    }
    if (action === "sign-out") {
      closeAccountMenus();
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: { accept: "application/json" },
        });
      } catch { /* leave the journal either way */ }
      location.assign("/auth/login");
      return;
    }
    if (action === "retry-route") {
      await render();
      if (!app.querySelector("[data-error-title]")) focusPageHeading();
      return;
    }
    if (action === "show-group") {
      const section = button.closest("[data-group]");
      const kind = button.dataset.kind;
      const rows = (searchResults || []).filter(item => item.kind === kind);
      if (section) {
        section.querySelector(".results").innerHTML = rows.map(item => resultRow(item, searchResults.indexOf(item))).join("");
        button.remove();
      }
      return;
    }
    if (action === "retry-search") {
      await runSearch({ focusError: true, focusResult: true });
      return;
    }
    if (action === "open-quick") {
      const item = searchResults[Number(button.dataset.index)];
      if (!item) return;
      quickIndex = Number(button.dataset.index);
      openAdd({
        title: item.title,
        kind: item.kind,
        creator: item.creator || "",
        year: item.year || "",
        status: "want",
        prefilled: true,
      }, button);
      return;
    }
    if (action === "follow") {
      const item = searchResults[Number(button.dataset.index)];
      if (!item) return;
      const created = await api("/api/library/from-provider", {
        method: "POST",
        body: JSON.stringify({ ...item, status: "want" }),
      });
      item.already_saved = true;
      item.saved_id = created.id;
      toast(created.already_saved ? `${item.title} is already in your library.` : `Following ${item.title}.`, "status", {
        label: "Open",
        href: `#/item/${created.id}`,
      });
      const box = document.querySelector("#search-results");
      if (box) box.innerHTML = renderResults({ results: searchResults, providers: {}, query: document.querySelector("#search-q")?.value || "" });
      return;
    }
    if (action === "close-quick") document.querySelector("#quick-add")?.close();
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
      const errors = validateAdd({ title: data.title, year: data.year });
      if (!showAddErrors(form, errors)) return;
      const body = {
        kind: data.kind || "movie",
        title: String(data.title || "").trim(),
        creator: data.creator || null,
        year: data.year || null,
        status: data.status || "want",
        rating: addScore(form),
        review: data.review || null,
        anticipated: data.status === "anticipating",
      };
      const created = await api("/api/library", { method: "POST", body: JSON.stringify(body) });
      const dialog = form.closest("dialog");
      if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
      toast(`Added ${body.title}.`, "status", { label: "Open", href: `#/item/${created.id}` });
      if (!(dialog instanceof HTMLDialogElement)) location.hash = `#/item/${created.id}`;
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
      const title = document.querySelector("h1")?.textContent || "this";
      const dialog = document.querySelector("#confirm");
      if (!(dialog instanceof HTMLDialogElement)) return;
      const heading = dialog.querySelector("#confirm-title");
      const body = dialog.querySelector("#confirm-body");
      if (heading) heading.textContent = `Remove ${title}?`;
      if (body) body.textContent = "This deletes your status, score, note, and any season, album and song scores for it. This can't be undone.";
      dialog.showModal();
      dialog.querySelector("button[value='cancel']")?.focus();
      const choice = await new Promise(resolve => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
      });
      if (choice !== "confirm") return;
      await api(`/api/entries/${id}`, { method: "DELETE" });
      toast(`Removed ${title}.`);
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
          status: data.status || "want",
          rating: addScore(form),
          review: data.review || null,
        }),
      });
      document.querySelector("#quick-add")?.close();
      item.already_saved = true;
      item.saved_id = created.id;
      const title = item.title;
      toast(created.already_saved ? `${title} is already in your library.` : `Added ${title} to your library.`, "status", {
        label: "Open",
        href: `#/item/${created.id}`,
      });
      const box = document.querySelector("#search-results");
      if (box) {
        box.innerHTML = renderResults({
          results: searchResults,
          providers: {},
          query: document.querySelector("#search-q")?.value || "",
        });
      }
    }
  } catch (error) {
    const banner = form.querySelector("[data-form-error]");
    if (banner && (form.dataset.action === "create-manual" || form.dataset.action === "quick-add")) {
      banner.hidden = false;
      banner.textContent = error?.message || "Couldn't add this.";
    }
    fail(error);
  }
});

let searchTimer = 0;
let focusSearchOnPaint = false;
document.addEventListener("focusout", async event => {
  const box = event.target;
  if (box instanceof HTMLInputElement && box.dataset.progress) {
    if (box.dataset.dirty === "true") await saveProgress();
    return;
  }
  if (!(box instanceof HTMLTextAreaElement) || !box.dataset.review) return;
  await saveNote(box);
});

function noteBox(id) {
  const box = document.querySelector(`textarea[data-review="${id}"]`);
  return box instanceof HTMLTextAreaElement ? box : null;
}

function showNoteConflict() {
  const status = document.querySelector("#note-status");
  if (!status) return;
  status.classList.add("is-error");
  status.setAttribute("aria-live", "off");
  status.replaceChildren(document.createTextNode(`${NOTE_CONFLICT_STATUS} `));
  const reload = document.createElement("button");
  reload.type = "button";
  reload.textContent = "Reload";
  reload.addEventListener("click", () => { void render(); });
  status.append(reload);
}

function showNoteFailure(status) {
  if (!status?.isConnected) return;
  status.classList.add("is-error");
  status.setAttribute("aria-live", "off");
  status.textContent = NOT_SAVED_LABEL;
}

function enqueueNote(id) {
  const task = noteChain.then(() => commitNote(id));
  noteChain = task.catch(() => {});
  return task;
}

async function saveNote(box) {
  if (!(box instanceof HTMLTextAreaElement) || !box.dataset.review) return noteChain;
  return enqueueNote(box.dataset.review);
}

async function commitNote(id) {
  const box = noteBox(id);
  if (!box) return;
  if (box.dataset.conflict === "true") {
    showNoteConflict();
    return;
  }
  const sent = box.value;
  const spoilerBox = document.querySelector("[data-spoiler]");
  const spoiler = spoilerBox instanceof HTMLInputElement ? spoilerBox.checked : false;
  if (sent === (box.dataset.saved ?? "") && String(spoiler) === (box.dataset.spoilerSaved || "false")) return;
  const base = box.dataset.reviewBase ?? "";
  const title = visibleItemTitle(id) || "this item";
  const body = {
    review: sent,
    review_base: base,
    ...(String(spoiler) === (box.dataset.spoilerSaved || "false") ? {} : { review_spoiler: spoiler }),
  };
  const status = document.querySelector("#note-status");
  const stopSaving = armSaving(status);
  const retry = () => {
    const again = noteBox(id);
    if (again && itemIdFromHash(location.hash) === String(id)) return saveNote(again);
    return resendNote(id, body, title);
  };
  try {
    const updated = await patchOpinion(id, body);
    stopSaving();
    if (readDraftRecord(id)?.text === sent) clearDraft(id);
    dismissItemSave("note", id);
    dismissToast(`note-conflict:${id}`);
    if (String(noteOutcome?.id) === String(id)) noteOutcome = null;
    const live = noteBox(id);
    if (!live) return;
    delete live.dataset.conflict;
    live.dataset.saved = sent;
    live.dataset.spoilerSaved = String(spoiler);
    live.dataset.reviewBase = updated?.review_updated_at || "";
    if (live.value === sent) showSaved(document.querySelector("#note-status"));
  } catch (error) {
    stopSaving();
    const live = noteBox(id);
    if (error?.status === 409) {
      noteOutcome = null;
      if (live) live.dataset.conflict = "true";
      showNoteConflict();
      toast(NOTE_CONFLICT_TOAST, "alert", {
        label: "Reload",
        persist: true,
        key: `note-conflict:${id}`,
        onClick: () => { void render(); },
      });
      return;
    }
    // Keep the unsent note and the retry toast here. reportItemSaveFailure
    // does that for this failure; it hands only 401 and 403 to fail().
    noteOutcome = { id: String(id), kind: "failure", text: sent };
    showNoteFailure(document.querySelector("#note-status"));
    reportItemSaveFailure({
      id,
      field: "note",
      title,
      error,
      message: writeTimedOut(error) ? NETWORK_MESSAGE : (error?.message || "Something went wrong."),
      retry,
    });
  }
}

async function resendNote(id, body, title) {
  try {
    await patchOpinion(id, body);
    dismissItemSave("note", id);
    if (String(noteOutcome?.id) === String(id)) noteOutcome = null;
    const live = noteBox(id);
    if (live && live.value === body.review) {
      delete live.dataset.conflict;
      live.dataset.saved = body.review;
      live.dataset.reviewBase = "";
    }
  } catch (error) {
    reportItemSaveFailure({
      id,
      field: "note",
      title,
      error,
      message: writeTimedOut(error) ? NETWORK_MESSAGE : (error?.message || "Something went wrong."),
      retry: () => resendNote(id, body, title),
    });
  }
}

document.addEventListener("input", event => {
  const target = event.target;
  if (target instanceof HTMLTextAreaElement && target.dataset.review) {
    writeDraft(target.dataset.review, target.value, target.dataset.reviewBase ?? "");
    const count = document.querySelector("[data-note-count]");
    if (count) count.textContent = noteCountText(target.value);
  }
  if (target instanceof HTMLInputElement && target.id === "progress") {
    target.dataset.dirty = "true";
    const help = document.querySelector("#progress-help");
    const unit = document.querySelector("#progress-unit");
    if (help) help.textContent = progressPreview(target.value, unit instanceof HTMLSelectElement ? unit.value : "");
  }
  if (target instanceof HTMLInputElement && target.id === "library-q") {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      const params = new URLSearchParams(route().params);
      const q = target.value.trim();
      if (q) params.set("q", q);
      else params.delete("q");
      const text = params.toString();
      const hash = text ? `#/library?${text}` : "#/library";
      if (location.hash !== hash) history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
      const current = route();
      if (current.name !== "library") return;
      const start = target.selectionStart;
      paintLibrary(current.params, libraryResume);
      const again = document.querySelector("#library-q");
      if (again instanceof HTMLInputElement) {
        again.focus();
        if (start != null) again.setSelectionRange(start, start);
      }
    }, 220);
  }
  if (target instanceof HTMLInputElement && target.id === "search-q") {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      const q = target.value.trim();
      const kind = document.querySelector("#search-kind")?.value || "";
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (kind) params.set("kind", kind);
      const hash = params.toString() ? `#/search?${params}` : "#/search";
      if (location.hash !== hash) history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
      runSearch();
    }, 220);
  }
});

document.addEventListener("change", async event => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.name === "kind" && target.closest(".add-form, #quick-add")) {
    const form = target.form;
    const status = form?.querySelector("[data-add-status]");
    const creator = form?.querySelector("[data-creator-label]");
    if (status) {
      const selected = form.querySelector("[name=status]:checked")?.value || "want";
      status.innerHTML = statusOptions(target.value).map(opt => `<label class="status-mark"><input type="radio" name="status" value="${esc(opt.value)}"${opt.value === selected ? " checked" : ""}>${esc(opt.label)}</label>`).join("");
    }
    if (creator) {
      const input = creator.querySelector("input");
      creator.firstChild.textContent = `${creatorLabel(target.value)} `;
      if (input) creator.append(input);
    }
    return;
  }
  if (target instanceof HTMLInputElement && target.dataset.spoiler != null) {
    const box = document.querySelector("textarea[data-review]");
    if (box instanceof HTMLTextAreaElement) await saveNote(box);
    return;
  }
  if (target instanceof HTMLSelectElement && target.dataset.libraryStatus != null) {
    const params = new URLSearchParams(route().params);
    if (!target.value) params.delete("status");
    else params.set("status", target.value);
    const query = params.toString();
    location.hash = query ? `#/library?${query}` : "#/library";
    return;
  }
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
  if (failed && !announce) status.setAttribute("aria-live", "off");
  else status.removeAttribute("aria-live");
  if (input) input.setAttribute("aria-invalid", failed ? "true" : "false");
}

function progressProblem(value, unit) {
  if (value === "") return "";
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return "Progress must be a number.";
  if (Number(value) < 0) return "Progress must be zero or more.";
  if (unit === "percent" && Number(value) > 100) return "Percent progress is between 0 and 100.";
  return "";
}

function trackProgress(pending, task) {
  const tracked = task.finally(() => {
    if (progressQueuedKey === pending) progressQueuedKey = "";
  });
  progressChain = tracked.catch(() => {});
  return task;
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
  const pending = `${next.id}|${next.key}`;
  progressQueuedKey = pending;
  return trackProgress(pending, progressChain.then(() => commitProgress(next)));
}

function failProgress(payload, message, keepDraft = true) {
  if (keepDraft) {
    writeProgressDraft(payload.id, payload.value, payload.unit, payload.input?.dataset.saved || "");
  }
  if (payload.input?.isConnected) setProgressStatus(keepDraft ? NOT_SAVED_LABEL : message, true, !keepDraft);
  if (keepDraft) {
    reportItemSaveFailure({
      id: payload.id,
      field: "progress",
      title: payload.title || visibleItemTitle(payload.id),
      error: { message },
      message: PROGRESS_TOAST,
      retry: () => retryProgress(payload),
    });
  }
}

function saveProgress() {
  const snap = progressSnapshot();
  if (!snap) return progressChain;
  const key = `${snap.value}|${snap.unit}`;
  const pending = `${snap.id}|${key}`;
  if (progressQueuedKey === pending) return progressChain;
  if (!progressQueuedKey && snap.input.dataset.saved === key) return progressChain;
  progressQueuedKey = pending;
  const payload = { id: snap.id, value: snap.value, unit: snap.unit, key, input: snap.input, title: visibleItemTitle(snap.id) };
  return trackProgress(pending, progressChain.then(() => commitProgress(payload)));
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
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      body: JSON.stringify({
        progress_value: payload.value === "" ? null : payload.value,
        progress_unit: payload.unit,
      }),
    });
    stopSaving();
    clearProgressDraft(payload.id);
    dismissItemSave("progress", payload.id);
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
  const typing = event.target instanceof HTMLInputElement
    || event.target instanceof HTMLTextAreaElement
    || event.target instanceof HTMLSelectElement
    || (event.target instanceof HTMLElement && event.target.isContentEditable);
  if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && event.key === "/") {
    event.preventDefault();
    focusSearchOnPaint = true;
    if (route().name === "search") document.querySelector("#search-q")?.focus();
    else location.hash = "#/search";
    return;
  }
  if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "n" || event.key === "N")) {
    event.preventDefault();
    location.hash = "#/new";
    return;
  }
  const navLink = event.target instanceof Element ? event.target.closest(".nav [data-nav]") : null;
  if (navLink && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
    const links = [...document.querySelectorAll(".nav [data-nav]")];
    const index = links.indexOf(navLink);
    const next = links[event.key === "ArrowRight" ? index + 1 : index - 1];
    if (next instanceof HTMLElement) {
      event.preventDefault();
      links.forEach(link => { link.tabIndex = link === next ? 0 : -1; });
      next.focus();
    }
    return;
  }
  const tab = event.target instanceof Element ? event.target.closest("[role='tab']") : null;
  const tabList = tab?.closest("[role='tablist']");
  if (tab && tabList && ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
    const tabs = [...tabList.querySelectorAll("[role='tab']")];
    const index = tabs.indexOf(tab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (nextTab instanceof HTMLElement) {
      nextTab.focus();
      nextTab.click();
    }
    return;
  }
  const radio = event.target instanceof Element ? event.target.closest("[role='radio']") : null;
  const radioGroup = radio?.closest("[role='radiogroup']");
  if (radio && radioGroup && (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End")) {
    if (radioGroup.classList.contains("score")) {
      const next = keyboardScore(radioGroup.dataset.scoreValue, event.key, event.shiftKey);
      if (next !== undefined && next !== scoreValue(radioGroup.dataset.scoreValue)) {
        event.preventDefault();
        const painted = paintScore(radioGroup, next);
        const opinion = painted.closest(".opinion");
        if (opinion) scheduleRating(opinion.dataset.id, next);
      } else if (next !== undefined) {
        event.preventDefault();
      }
      return;
    }
    const radios = [...radioGroup.querySelectorAll("[role='radio']")];
    const index = radios.indexOf(radio);
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = Math.min(radios.length - 1, index + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = Math.max(0, index - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = radios.length - 1;
    const nextRadio = radios[nextIndex];
    if (nextRadio instanceof HTMLElement && nextRadio !== radio) {
      event.preventDefault();
      nextRadio.focus();
      nextRadio.click();
    } else {
      event.preventDefault();
    }
    return;
  }
  if (radio && radioGroup?.classList.contains("score") && (event.key === "Delete" || event.key === "Backspace")) {
    const next = keyboardScore(radioGroup.dataset.scoreValue, event.key, false);
    if (next !== undefined) {
      event.preventDefault();
      const painted = paintScore(radioGroup, next);
      const opinion = painted.closest(".opinion");
      if (opinion) scheduleRating(opinion.dataset.id, next);
    }
    return;
  }
  if (event.key === "Escape" && event.target instanceof HTMLTextAreaElement && event.target.dataset.review) {
    event.target.value = event.target.dataset.saved ?? "";
    event.target.blur();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    const form = event.target instanceof HTMLElement ? event.target.closest("form.add-form, #quick-add form") : null;
    if (form instanceof HTMLFormElement) {
      event.preventDefault();
      form.requestSubmit();
      return;
    }
  }
  if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.dataset.progress) {
    event.preventDefault();
    saveProgress();
    return;
  }
  const result = event.target instanceof Element ? event.target.closest(".result") : null;
  if (result && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "ArrowRight" || event.key === "Enter" || event.key === "Escape")) {
    const rows = [...document.querySelectorAll("#search-results .result")];
    const index = rows.indexOf(result);
    if (event.key === "Escape") {
      event.preventDefault();
      document.querySelector("#search-q")?.focus();
      return;
    }
    if (event.key === "ArrowRight") {
      const action = result.querySelector("button, a");
      if (action instanceof HTMLElement) {
        event.preventDefault();
        action.tabIndex = 0;
        action.focus();
      }
      return;
    }
    if (event.key === "Enter" && event.target === result) {
      event.preventDefault();
      result.querySelector("[data-action='open-quick'], [data-action='follow']")?.click();
      return;
    }
    const next = rows[event.key === "ArrowDown" ? index + 1 : index - 1];
    if (next instanceof HTMLElement) {
      event.preventDefault();
      rows.forEach(row => { row.tabIndex = row === next ? 0 : -1; });
      next.focus();
    }
    return;
  }
  const cell = event.target instanceof Element ? event.target.closest("[role='gridcell'][data-date]") : null;
  if (cell && route().name === "calendar") {
    const cells = [...document.querySelectorAll("[role='gridcell'][data-date]")];
    const index = cells.indexOf(cell);
    const move = (next) => {
      if (!(next instanceof HTMLElement)) return;
      event.preventDefault();
      cells.forEach(item => { item.tabIndex = item === next ? 0 : -1; });
      next.focus();
    };
    if (event.key === "ArrowRight") move(cells[index + 1]);
    else if (event.key === "ArrowLeft") move(cells[index - 1]);
    else if (event.key === "ArrowDown") move(cells[index + 7]);
    else if (event.key === "ArrowUp") move(cells[index - 7]);
    else if (event.key === "Home") move(cells[index - (index % 7)]);
    else if (event.key === "End") move(cells[Math.min(cells.length - 1, index + (6 - (index % 7)))]);
    else if (event.key === "PageDown" || event.key === "PageUp") {
      event.preventDefault();
      const month = route().params.get("month") || "";
      const delta = event.key === "PageDown" ? 1 : -1;
      const next = shiftMonth(month || new Date().toISOString().slice(0, 7), delta);
      location.hash = `#/calendar?month=${next}`;
    } else if (event.key === "Enter") {
      const link = cell.querySelector("a");
      if (link instanceof HTMLElement) {
        event.preventDefault();
        link.click();
      }
    }
    if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp", "Enter"].includes(event.key)) return;
  }
  if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && event.key === "t" && route().name === "calendar") {
    event.preventDefault();
    location.hash = "#/calendar";
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

function armMidnight() {
  window.setTimeout(() => {
    paintToday();
    armMidnight();
  }, msUntilLocalMidnight(new Date()));
}

let lastScrollY = 0;
let tabHidden = false;
document.addEventListener("scroll", () => {
  const nextY = document.scrollingElement ? document.scrollingElement.scrollTop : 0;
  const short = window.matchMedia("(max-height: 500px)").matches;
  tabHidden = tabBarHidden(lastScrollY, nextY, short, tabHidden);
  lastScrollY = nextY;
  document.querySelector(".tabbar")?.classList.toggle("is-hidden", tabHidden);
}, { passive: true });

async function loadAccount() {
  try {
    const me = await api("/api/me");
    const name = me?.username || me?.display_name || "Account";
    document.querySelectorAll("[data-account-name]").forEach(node => { node.textContent = name; });
    const initial = String(name).trim().charAt(0).toUpperCase() || "A";
    document.querySelectorAll("[data-account-initial]").forEach(node => { node.textContent = initial; });
  } catch { /* the button still says Account */ }
}

paintIcons();
armMidnight();
loadAccount();
document.querySelector("#quick-add")?.addEventListener("close", () => {
  addInvoker?.focus();
});

window.addEventListener("hashchange", () => {
  void render();
});
render();
