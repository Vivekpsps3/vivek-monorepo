// Hash route parser, kept pure so native Node tests can cover route shapes.
export function parseHash(hash = location.hash) {
  const raw = (hash || "#/").replace(/^#/, "");
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return { name: "home" };
  if (parts[0] === "calendar") {
    const now = new Date();
    return {
      name: "calendar",
      year: Number(parts[1]) || now.getFullYear(),
      month: Number(parts[2]) || now.getMonth() + 1,
      day: parts[3] || "",
    };
  }
  if (parts[0] === "trips" && parts[1] === "new") return { name: "new", start: params.get("start") || "" };
  if (parts[0] === "trips" && parts[1]) {
    const id = Number(parts[1]);
    if (!Number.isInteger(id) || id <= 0) return { name: "not-found" };
    const trip = { name: "trip", id, focusDay: parts[2] === "day" ? parts[3] : "" };
    if (params.get("at")) trip.at = params.get("at");
    return trip;
  }
  if (parts[0] === "pto") return { name: "pto" };
  if (parts[0] === "settings") return { name: "settings" };
  return { name: "not-found" };
}
