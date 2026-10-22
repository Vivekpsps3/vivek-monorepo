import { api } from './api.mjs';
import { state } from './state.mjs';
import { parseHash } from './route-parser.mjs';
import { renderHome } from './views/home.mjs';
import { buildCalendar } from './views/calendar.mjs';
import { renderNewTrip } from './views/new-trip.mjs';
import { mountComposer } from './views/composer.mjs';
import { renderTrip, mountMap } from './views/trip.mjs';
import { renderPto, mountPto } from './views/pto.mjs';
import { renderSettings, renderLogin } from './views/settings.mjs';
import { SKELETON_DELAY_MS, errorPanel, routeProblem, skeletonFor } from './states.mjs';
import { screenNav } from './screens.mjs';

export function destroyMap() {
  if (window._travelMap) {
    window._travelMap.remove();
    window._travelMap = null;
  }
}

function navKey(path) {
  return screenNav(path.name);
}

export function paint(html, nav, options = {}) {
  const root = document.querySelector("#app");
  const scrolling = document.scrollingElement || document.documentElement;
  const scrollTop = scrolling.scrollTop;
  const active = document.activeElement;
  const restore = active instanceof HTMLElement ? focusSelector(active) : "";
  destroyMap();
  root.innerHTML = html;
  root.querySelectorAll("form[data-form]").forEach((form) => {
    form.noValidate = true;
  });
  root.setAttribute("aria-busy", options.busy ? "true" : "false");
  document.body.classList.toggle("is-signed-out", Boolean(options.focusLogin));
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (nav && link.dataset.nav === nav) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (options.focusError) {
    const heading = root.querySelector("[data-error-title]");
    if (heading instanceof HTMLElement) heading.focus();
  } else if (options.focusLogin) {
    const heading = root.querySelector("h1");
    if (heading instanceof HTMLElement) {
      if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
      heading.focus();
    }
  } else if (options.route) {
    const dayHeading = options.focusDay ? root.querySelector("[data-day-heading]") : null;
    const focus = root.querySelector("[data-focus]");
    if (dayHeading instanceof HTMLElement) {
      dayHeading.focus();
      dayHeading.scrollIntoView({ block: "start" });
    } else if (focus) {
      focus.scrollIntoView({ block: "start" });
    } else scrolling.scrollTop = 0;
  } else if (!options.skeleton) {
    scrolling.scrollTop = scrollTop;
    const key = options.focusKey || state.focusKey;
    if (key) {
      const match = root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
      if (match instanceof HTMLElement) match.focus({ preventScroll: true });
      state.focusKey = "";
    } else if (restore) {
      const again = root.querySelector(restore);
      if (again instanceof HTMLElement) again.focus({ preventScroll: true });
    }
  }
  if (!options.skeleton && !options.focusError) {
    mountMap();
    mountComposer();
    mountPto();
  }
}

function focusSelector(element) {
  if (element.dataset.focusKey) return `[data-focus-key="${CSS.escape(element.dataset.focusKey)}"]`;
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
  const root = document.querySelector("#app");
  if (root) {
    root.setAttribute("aria-busy", "true");
    root.setAttribute("data-seq", String(seq));
  }
  const path = parseHash();
  if (path.name === "not-found") {
    setTitle("Not found");
    paint(errorPanel(routeProblem(path)), "", { route: true, focusError: true });
    return;
  }
  const timer = setTimeout(() => {
    if (seq !== state.seq) return;
    paint(skeletonFor(path.name), navKey(path), { busy: true, skeleton: true });
  }, SKELETON_DELAY_MS);
  try {
    const page = await build(path);
    clearTimeout(timer);
    if (seq !== state.seq) return;
    setTitle(page.title);
    if (Object.hasOwn(page, "trip")) state.trip = page.trip;
    paint(page.html, page.nav, { route: true, focusDay: path.focusDay || "" });
  } catch (error) {
    clearTimeout(timer);
    if (seq !== state.seq) return;
    if (error.status === 401) {
      setTitle("Sign in");
      paint(renderLogin(), "", { route: true, focusLogin: true });
      return;
    }
    const problem = routeProblem(path, error);
    setTitle(problem.title);
    paint(errorPanel(problem), path.name === "trip" ? "home" : navKey(path), { route: true, focusError: true });
  }
}

export async function build(path) {
  if (path.name === "home") return { title: "Upcoming", nav: "home", html: renderHome(await api("/api/home")) };
  if (path.name === "calendar") return buildCalendar(path);
  if (path.name === "new") return { title: "New trip", nav: screenNav("new"), html: renderNewTrip() };
  if (path.name === "trip") {
    const trip = await api(`/api/trips/${path.id}`);
    return { title: trip.title, nav: "home", html: renderTrip(trip, path.focusDay), trip };
  }
  if (path.name === "pto") {
    const [pto, home] = await Promise.all([api("/api/pto"), api("/api/home")]);
    return { title: "PTO", nav: "pto", html: renderPto(pto, home) };
  }
  if (path.name === "settings") return { title: "Settings", nav: "settings", html: renderSettings(await api("/api/settings")) };
  return { title: "Not found", nav: "", html: errorPanel(routeProblem({ name: "not-found" })) };
}
