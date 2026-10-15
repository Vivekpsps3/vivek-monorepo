import { api, loginHref } from "./api.mjs";
import {
  draftKey,
  escapeHtml as esc,
  experienceLabel,
  experienceOptions,
  kindLabel,
  ratingText,
  releaseLabel,
  safeUrl,
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
  const item = path.match(/^\/item\/(\d+)$/);
  if (item) return { name: "item", id: Number(item[1]), params };
  if (path === "/library") return { name: "library", params };
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
        <h1>What you’re keeping.</h1>
        <p class="lede">${summary.counts.library} saved · ${summary.counts.in_progress} in progress · ${summary.counts.anticipated} anticipated</p>
      </div>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/search">Search</a>
        <a class="btn" href="#/new">Add manually</a>
      </div>
    </section>
    ${section("In progress", summary.currently, "Nothing is in progress. Search when you start something.")}
    ${episodeSection(summary.next_episodes)}
    ${releaseSection(summary.upcoming)}
    ${reviewSection(summary.recent_reviews)}
    <p class="footnote"><a href="#/library">Open the full library</a></p>
  `;
}

function section(title, items, empty) {
  const body = items.length
    ? `<div class="grid">${items.map(card).join("")}</div>`
    : `<p class="quiet">${esc(empty)}</p>`;
  return `<section><h2>${esc(title)}</h2>${body}</section>`;
}

function episodeSection(items) {
  if (!items.length) return "";
  const rows = items.map(item => `<li><a href="#/item/${item.entry_id}">${esc(item.show_title)}</a><span>S${esc(item.season)} E${esc(item.episode)}${item.title ? ` · ${esc(item.title)}` : ""} · ${item.state === "upcoming" ? "Upcoming" : "Next"}</span></li>`).join("");
  return `<section><h2>Next episode</h2><ul class="plain">${rows}</ul></section>`;
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
  const payload = await api(`/api/library?${query}`);
  const kinds = ["", "movie", "tv", "book", "album", "track", "game"].map(value => ({
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
  const names = { tmdb: "TMDB", musicbrainz: "MusicBrainz", openlibrary: "Open Library", rawg: "RAWG" };
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
        ${item.already_saved ? `<p class="meta">Already in your library</p>` : `<button class="btn btn-primary" type="button" data-action="open-quick" data-index="${index}">Add</button>`}
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
  app.innerHTML = `
    <section class="hero"><div><p class="eyebrow">Manual</p><h1>Add without a catalog.</h1><p class="lede">Public search can be empty or wrong. A title and a type are enough.</p></div></section>
    <form class="stack" data-action="create-manual">
      <label>Title <input name="title" required value="${esc(params.get("title") || "")}"></label>
      <label>Type <select name="kind">${options([
        { value: "movie", label: "Movie" },
        { value: "tv", label: "Series" },
        { value: "book", label: "Book" },
        { value: "album", label: "Album" },
        { value: "track", label: "Song" },
        { value: "game", label: "Game" },
      ], "movie")}</select></label>
      <label>Creator <input name="creator" placeholder="Director, author, artist"></label>
      <label>Year <input name="year" inputmode="numeric"></label>
      <label>Artwork link <input name="artwork_url" type="url" placeholder="https://"></label>
      <label>Status <select name="status">${options(statusOptions("movie"), "want")}</select></label>
      <label>Your rating <input name="rating" type="number" min="0" max="10" step="0.5" placeholder="Unrated"></label>
      <label>Overall thought <textarea name="review" rows="5"></textarea></label>
      <label class="check"><input name="anticipated" type="checkbox"> Anticipating the release</label>
      <label>Release date <input name="release_on" type="date"></label>
      <label>Date precision <select name="release_precision">${options([
        { value: "day", label: "Exact day" },
        { value: "month", label: "Month" },
        { value: "year", label: "Year" },
        { value: "unknown", label: "Unknown" },
      ], "day")}</select></label>
      <button class="btn btn-primary" type="submit">Save</button>
    </form>
  `;
  const kind = document.querySelector("select[name=kind]");
  const status = document.querySelector("select[name=status]");
  kind?.addEventListener("change", () => {
    status.innerHTML = options(statusOptions(kind.value), status.value);
  });
}

async function viewItem(id) {
  const entry = await api(`/api/entries/${id}`);
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
        <form class="stack" data-action="save-entry" data-id="${entry.id}">
          <p class="eyebrow">Overall opinion</p>
          <label>Status <select name="status">${options(statusOptions(entry.kind), entry.status)}</select></label>
          <label>Your rating <input name="rating" type="number" min="0" max="10" step="0.5" value="${entry.rating ?? ""}" placeholder="Unrated"></label>
          <p class="meta">Your score is out of 10, in half steps. Leave it blank to stay unrated. Public scores above stay on their own scale.</p>
          <label>Summary <input name="summary" maxlength="400" value="${esc(entry.summary || "")}"></label>
          <label>Review <textarea name="review" data-draft="${esc(draftKey(entry.id))}" rows="8">${esc(review)}</textarea></label>
          ${draft != null && draft !== (entry.review || "") ? `<p class="meta">Unsaved draft restored in this browser.</p>` : ""}
          <label class="check"><input name="review_spoiler" type="checkbox"${entry.review_spoiler ? " checked" : ""}> This review contains spoilers</label>
          <label class="check"><input name="favorite" type="checkbox"${entry.favorite ? " checked" : ""}> Favorite</label>
          <label class="check"><input name="anticipated" type="checkbox"${entry.anticipated ? " checked" : ""}> Anticipating</label>
          ${progress ? `<label>Progress <input name="progress_value" inputmode="decimal" value="${entry.progress_value ?? ""}"></label>
            <label>Unit <select name="progress_unit">${options(progressUnits(entry.kind), entry.progress_unit || "")}</select></label>` : ""}
          <button class="btn btn-primary" type="submit">Save opinion</button>
        </form>
        ${experienceBlock(entry)}
        ${entry.kind === "tv" ? episodeBlock(entry) : ""}
        ${releaseForm(entry)}
        <form data-action="delete-entry" data-id="${entry.id}"><button class="btn btn-danger" type="submit">Remove from library</button></form>
      </div>
    </article>
  `;
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
  const rows = (entry.experiences || []).map(row => `
    <li>
      <form data-action="save-experience" data-id="${entry.id}" data-experience="${row.id}">
        <p class="meta">${esc(experienceLabel(row.kind))} · ${esc(row.finished_on || row.started_on || "No date")} · ${esc(ratingText(row.rating))}</p>
        <label>Notes <textarea name="notes" rows="3">${esc(row.notes || "")}</textarea></label>
        <label>Experience rating <input name="rating" type="number" min="0" max="10" step="0.5" value="${row.rating ?? ""}" placeholder="Optional"></label>
        <label class="check"><input name="spoiler" type="checkbox"${row.spoiler ? " checked" : ""}> Spoiler</label>
        <button class="btn" type="submit">Save experience</button>
        <button class="btn" type="button" data-action="delete-experience" data-id="${entry.id}" data-experience="${row.id}">Delete</button>
      </form>
    </li>`).join("");
  return `
    <section>
      <h2>Experiences</h2>
      <p class="meta">Optional. A viewing, reread, or replay stays separate from the overall review.</p>
      ${rows ? `<ol class="timeline">${rows}</ol>` : `<p class="quiet">No separate experiences yet.</p>`}
      <form class="stack" data-action="add-experience" data-id="${entry.id}">
        <label>Type <select name="kind">${options(experienceOptions(entry.kind), experienceOptions(entry.kind)[0].value)}</select></label>
        <label>Started <input name="started_on" type="date"></label>
        <label>Finished <input name="finished_on" type="date"></label>
        <label>Notes <textarea name="notes" rows="3" placeholder="What this time was like"></textarea></label>
        <label>Experience rating <input name="rating" type="number" min="0" max="10" step="0.5" placeholder="Optional"></label>
        <label class="check"><input name="spoiler" type="checkbox"> Spoiler</label>
        <button class="btn" type="submit">Add experience</button>
      </form>
    </section>`;
}

function episodeBlock(entry) {
  const show = entry.show || { episodes: [], watched_count: 0, episode_count: 0 };
  const rows = show.episodes.map(episode => `
    <li>
      <span>S${esc(episode.season_number)} E${esc(episode.episode_number)} ${esc(episode.title || "")}</span>
      <span>${episode.air_date ? esc(episode.air_date) : "Air date unknown"}${episode.released ? "" : " · not yet aired"}</span>
      <button class="btn" type="button" data-action="toggle-episode" data-id="${entry.id}" data-episode="${episode.id}" data-watched="${episode.watched ? "false" : "true"}">${episode.watched ? "Watched" : "Mark watched"}</button>
      ${episode.overview ? `<details><summary>Synopsis</summary><p>${esc(episode.overview)}</p></details>` : ""}
    </li>`).join("");
  const next = show.next_episode;
  return `
    <section>
      <h2>Episodes</h2>
      <p class="meta">${show.watched_count} of ${show.episode_count} watched${show.caught_up ? " · caught up on aired episodes" : ""}${next ? ` · next S${next.season_number} E${next.episode_number}` : ""}</p>
      <button class="btn btn-primary" type="button" data-action="next-episode" data-id="${entry.id}">Mark next watched</button>
      <ul class="plain">${rows || `<li><span>No episodes yet.</span></li>`}</ul>
      <form class="stack" data-action="add-episode" data-id="${entry.id}">
        <label>Season <input name="season_number" inputmode="numeric" value="1" required></label>
        <label>Episode <input name="episode_number" inputmode="numeric" required></label>
        <label>Title <input name="title"></label>
        <label>Air date <input name="air_date" type="date"></label>
        <button class="btn" type="submit">Add episode</button>
      </form>
    </section>`;
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

async function render() {
  document.querySelectorAll("[data-nav]").forEach(link => {
    link.setAttribute("aria-current", link.dataset.nav === route().name ? "page" : "false");
  });
  syncTheme();
  const current = route();
  app.innerHTML = `<p class="quiet" role="status">Loading…</p>`;
  try {
    if (current.name === "home") await viewHome();
    else if (current.name === "library") await viewLibrary(current.params);
    else if (current.name === "search") viewSearch(current.params);
    else if (current.name === "new") viewNew(current.params);
    else await viewItem(current.id);
  } catch (error) {
    app.innerHTML = `<p class="quiet" role="alert">${esc(error.message || "Could not load this page.")}</p>`;
    fail(error);
  }
}

document.addEventListener("click", async event => {
  const theme = event.target.closest("[data-theme-value]");
  if (theme) {
    setTheme(theme.dataset.themeValue);
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === "open-quick") openQuick(Number(button.dataset.index));
    if (action === "close-quick") document.querySelector("#quick-add")?.close();
    if (action === "toggle-episode") {
      await api(`/api/entries/${button.dataset.id}/episodes/${button.dataset.episode}/watched`, {
        method: "POST",
        body: JSON.stringify({ watched: button.dataset.watched === "true" }),
      });
      setNotice("Episode progress saved.");
      await render();
    }
    if (action === "next-episode") {
      await api(`/api/entries/${button.dataset.id}/episodes/next`, { method: "POST" });
      setNotice("Marked the next aired episode watched.");
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
        kind: data.kind,
        title: data.title,
        creator: data.creator || null,
        year: data.year || null,
        artwork_url: data.artwork_url || null,
        status: data.status,
        rating: data.rating === "" ? null : data.rating,
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
    if (form.dataset.action === "add-episode") {
      await api(`/api/entries/${id}/episodes`, { method: "POST", body: JSON.stringify({
        season_number: Number(data.season_number),
        episode_number: Number(data.episode_number),
        title: data.title || null,
        air_date: data.air_date || null,
      }) });
      setNotice("Episode added.");
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
      if (!confirm("Remove this from your library? The overall review and experiences go with it.")) return;
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

document.addEventListener("change", event => {
  if (event.target instanceof HTMLSelectElement && event.target.id === "search-kind") runSearch();
});

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
