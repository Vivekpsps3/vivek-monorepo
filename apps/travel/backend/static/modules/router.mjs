import { api } from './api.mjs';
import { state } from './state.mjs';
import { escapeHtml as esc } from '../../shared-browser/dom.mjs';
import { parseHash } from './route-parser.mjs';
import { renderHome } from './views/home.mjs';
import { buildCalendar } from './views/calendar.mjs';
import { renderNewTrip } from './views/new-trip.mjs';
import { mountComposer } from './views/composer.mjs';
import { renderTrip, mountMap } from './views/trip.mjs';
import { renderPto, mountPto } from './views/pto.mjs';
import { renderSettings, renderLogin } from './views/settings.mjs';

export function destroyMap() {
  if (window._travelMap) {
    window._travelMap.remove();
    window._travelMap = null;
  }
}
export function paint(html, nav, options = {}) {
  const root = document.querySelector("#app");
  const scrolling = document.scrollingElement || document.documentElement;
  const scrollTop = scrolling.scrollTop;
  const active = document.activeElement;
  const restore = active instanceof HTMLElement ? focusSelector(active) : "";
  destroyMap();
  root.innerHTML = html;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === nav) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (options.route) {
    const focus = root.querySelector("[data-focus]");
    if (focus) focus.scrollIntoView({ block: "start" });
    else scrolling.scrollTop = 0;
  } else {
    scrolling.scrollTop = scrollTop;
    if (restore) {
      const again = root.querySelector(restore);
      if (again instanceof HTMLElement) again.focus({ preventScroll: true });
    }
  }
  mountMap();
  mountComposer();
  mountPto();
}

function focusSelector(element) {
  if (!element.dataset.action) return "";
  let selector = `[data-action="${CSS.escape(element.dataset.action)}"]`;
  if (element.dataset.kind) selector += `[data-kind="${CSS.escape(element.dataset.kind)}"]`;
  if (element.dataset.id) selector += `[data-id="${CSS.escape(element.dataset.id)}"]`;
  if (element.dataset.compose) selector += `[data-compose="${CSS.escape(element.dataset.compose)}"]`;
  return selector;
}
export function setTitle(text) {
  document.title = text ? `${text} · Travel` : "Travel";
}
export async function render() {
  const seq = ++state.seq;
  const path = parseHash();
  try {
    const page = await build(path);
    if (seq !== state.seq) return;
    setTitle(page.title);
    if (Object.hasOwn(page, "trip")) state.trip = page.trip;
    paint(page.html, page.nav, { route: true });
  } catch (error) {
    if (seq !== state.seq) return;
    if (error.status === 401) {
      setTitle("Locked");
      paint(renderLogin(), path.name, { route: true });
      return;
    }
    paint(`<p class="banner" role="alert">${esc(error.message)}</p>`, path.name, { route: true });
  }
}
export async function build(path) {
  if (path.name === "home") return { title: "", nav: "home", html: renderHome(await api("/api/home")) };
  if (path.name === "calendar") return buildCalendar(path);
  if (path.name === "new") return { title: "New trip", nav: "home", html: renderNewTrip() };
  if (path.name === "trip") {
    const trip = await api(`/api/trips/${path.id}`);
    return { title: trip.title, nav: "home", html: renderTrip(trip, path.focusDay), trip };
  }
  if (path.name === "pto") {
    const [pto, home] = await Promise.all([api("/api/pto"), api("/api/home")]);
    return { title: "PTO", nav: "pto", html: renderPto(pto, home) };
  }
  if (path.name === "settings") return { title: "Settings", nav: "settings", html: renderSettings(await api("/api/settings")) };
  return { title: "", nav: "home", html: renderHome(await api("/api/home")) };
}
