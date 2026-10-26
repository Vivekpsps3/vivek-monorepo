import { escapeHtml } from "./format.mjs";

const KNOWN = new Set(["home", "library", "search", "calendar", "new", "item", "episode", "season", "discography"]);

/**
 * Hash routes. Anything that is not a screen is `missing`, so the not-found
 * view can render instead of falling through to Now.
 */
export function parseRoute(hash) {
  const raw = String(hash || "").replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  const episode = path.match(/^\/item\/(\d+)\/episode\/(\d+)$/);
  if (episode) return { name: "episode", id: Number(episode[1]), episodeId: Number(episode[2]), params, path };
  const season = path.match(/^\/item\/(\d+)\/season\/(\d+)$/);
  if (season) return { name: "season", id: Number(season[1]), seasonNumber: Number(season[2]), params, path };
  const discography = path.match(/^\/item\/(\d+)\/discography$/);
  if (discography) return { name: "discography", id: Number(discography[1]), params, path };
  const item = path.match(/^\/item\/(\d+)$/);
  if (item) return { name: "item", id: Number(item[1]), params, path };
  if (path === "/" || path === "") return { name: "home", params, path: "/" };
  if (path === "/library") return { name: "library", params, path };
  if (path === "/calendar") return { name: "calendar", params, path };
  if (path === "/search") return { name: "search", params, path };
  if (path === "/new") return { name: "new", params, path };
  return { name: "missing", params, path };
}

/** Which primary nav item is current. Item pages mark Library. Add is mobile-only. */
export function navKey(name) {
  if (name === "item" || name === "episode" || name === "season" || name === "discography") return "library";
  if (name === "home" || name === "library" || name === "search" || name === "calendar" || name === "new") return name;
  return "";
}

export function documentTitle(route, extra = {}) {
  const name = route?.name || "missing";
  if (name === "home") return "Now · Media";
  if (name === "library") return "Library · Media";
  if (name === "search") {
    const query = String(extra.query || "").trim();
    return query ? `“${query}” · Search · Media` : "Search · Media";
  }
  if (name === "new") return "Add · Media";
  if (name === "discography") return extra.title ? `${extra.title} · Discography · Media` : "Discography · Media";
  if (name === "item" || name === "season") return extra.title ? `${extra.title} · Media` : "Media";
  if (name === "episode") {
    if (!extra.show) return "Media";
    const place = `S${extra.season ?? ""} E${extra.episode ?? ""}`.trim();
    const episodeTitle = extra.episodeTitle ? ` ${extra.episodeTitle}` : "";
    return `${place}${episodeTitle} · ${extra.show} · Media`;
  }
  if (name === "calendar") return extra.monthLabel ? `${extra.monthLabel} · Calendar · Media` : "Calendar · Media";
  return "Not found · Media";
}

export function screenTitle(route, extra = {}) {
  const name = route?.name || "missing";
  if (name === "home") return "Now";
  if (name === "library") return "Library";
  if (name === "search") return "Search";
  if (name === "calendar") return extra.monthLabel || "Calendar";
  if (name === "new") return "Add";
  if (name === "discography") return "Discography";
  if (name === "item" || name === "season") return extra.title || "Library";
  if (name === "episode") return extra.episodeTitle || extra.show || "Library";
  return "Not found";
}

export function notFoundHtml(hash) {
  const shown = hash && hash !== "#" ? hash : "#/";
  const sentence = `There's nothing at ${shown} in Media.`;
  return `<div class="empty suite-empty">
    <h1 tabindex="-1">Page not found</h1>
    <p>${escapeHtml(sentence)}</p>
    <a class="btn btn-primary" href="#/">Go to Now</a>
    <a href="#/library">Open library</a>
  </div>`;
}

/** Hide the tab bar while scrolling down on a short viewport, show it on the way up. */
export function tabBarHidden(previousY, nextY, shortViewport, hidden) {
  if (!shortViewport) return false;
  if (nextY > previousY + 8) return true;
  if (nextY < previousY - 8) return false;
  return hidden;
}

export function msUntilLocalMidnight(now) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function isKnownRoute(name) {
  return KNOWN.has(name);
}
