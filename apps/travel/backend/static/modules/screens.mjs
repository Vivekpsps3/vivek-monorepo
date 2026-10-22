/** Which nav item is current. New trip, settings, sign-in, and not-found highlight none. */
export function screenNav(name) {
  if (name === "calendar") return "calendar";
  if (name === "pto") return "pto";
  if (name === "home" || name === "trip") return "home";
  return "";
}

export function homeState(home) {
  const live = (home.in_progress?.length || 0) + (home.upcoming?.length || 0);
  const any = live + (home.past?.length || 0);
  if (!any) {
    return {
      metrics: false,
      heading: "No trips planned",
      body: "Pick your dates on a calendar and add cities as you go.",
      showPast: false,
    };
  }
  if (!live) {
    return {
      metrics: true,
      heading: "Nothing coming up",
      body: "Nothing coming up. Your past trips are below.",
      showPast: true,
    };
  }
  return { metrics: true, heading: "", body: "", showPast: true };
}

export function visiblePlans(days, limit = 3) {
  const planned = (days || []).filter((day) => (day.items && day.items.length) || (day.transports && day.transports.length));
  return { shown: planned.slice(0, limit), more: Math.max(0, planned.length - limit) };
}
