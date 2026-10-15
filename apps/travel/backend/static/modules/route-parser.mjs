// Hash route parser, kept pure so native Node tests can cover route shapes.
export function parseHash(hash = location.hash) {
  const parts = (hash || "#/").replace(/^#/, "").split("/").filter(Boolean);
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
  if (parts[0] === "trips" && parts[1] === "new") return { name: "new" };
  if (parts[0] === "trips" && parts[1]) {
    return { name: "trip", id: Number(parts[1]), focusDay: parts[2] === "day" ? parts[3] : "" };
  }
  if (parts[0] === "pto") return { name: "pto" };
  if (parts[0] === "settings") return { name: "settings" };
  return { name: "home" };
}
