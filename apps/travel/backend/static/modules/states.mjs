/** Loading and error presentation. No DOM, so node tests can render the markup. */

export const SKELETON_DELAY_MS = 150;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function errorPanel({ title, body, retry = true, back = true, links = [] }) {
  const actions = [];
  if (retry) actions.push(`<button type="button" class="btn btn-primary" data-action="retry-route">Try again</button>`);
  if (back) actions.push(`<a class="btn" href="#/">Back to Upcoming</a>`);
  for (const link of links) {
    actions.push(`<a class="btn" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`);
  }
  return `<section class="error-panel"><h1 tabindex="-1" data-error-title>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p><p class="row-actions">${actions.join("")}</p></section>`;
}

export function routeProblem(path, error) {
  const status = Number(error?.status) || 0;
  if (path?.name === "not-found") {
    return {
      title: "Page not found",
      body: "That link doesn't go anywhere in Travel.",
      retry: false,
      back: false,
      links: [
        { href: "#/", label: "Upcoming" },
        { href: "#/calendar", label: "Calendar" },
      ],
    };
  }
  if (path?.name === "trip" && status === 404) {
    return {
      title: "Trip not found",
      body: "It may have been deleted.",
      retry: false,
      back: true,
      links: [],
    };
  }
  const titles = {
    home: "Couldn't load your trips",
    calendar: "Couldn't load the calendar",
    new: "Couldn't open New trip",
    trip: "Couldn't load this trip",
    pto: "Couldn't load PTO",
    settings: "Couldn't load settings",
  };
  return {
    title: titles[path?.name] || "Couldn't load this page",
    body: error?.message || "Something went wrong.",
    retry: true,
    back: true,
    links: [],
  };
}

function blocks(count, className) {
  return Array.from({ length: count }, () => `<span class="skeleton ${className}"></span>`).join("");
}

export function skeletonFor(name) {
  if (name === "home") {
    return `<div class="skeleton-page" aria-hidden="true">${blocks(1, "skeleton-h1")}<div class="skeleton-metrics">${blocks(4, "skeleton-metric")}</div>${blocks(2, "skeleton-card")}</div>`;
  }
  if (name === "calendar") {
    return `<div class="skeleton-page" aria-hidden="true">${blocks(1, "skeleton-h1")}<div class="skeleton-cal">${blocks(35, "skeleton-day")}</div></div>`;
  }
  if (name === "trip") {
    return `<div class="skeleton-page" aria-hidden="true">${blocks(1, "skeleton-line skeleton-w30")}${blocks(1, "skeleton-h1")}<div class="skeleton-metrics">${blocks(4, "skeleton-metric")}</div>${blocks(3, "skeleton-card")}<span class="skeleton skeleton-map"></span></div>`;
  }
  if (name === "pto") {
    return `<div class="skeleton-page" aria-hidden="true">${blocks(1, "skeleton-h1")}${blocks(1, "skeleton-card")}${blocks(1, "skeleton-chart")}</div>`;
  }
  return `<div class="skeleton-page" aria-hidden="true">${blocks(1, "skeleton-h1")}${blocks(2, "skeleton-card")}</div>`;
}
