/** Names, hints, and settings sentences. Views call these so the copy stays in one place. */

export function actionName(verb, noun, label) {
  const name = String(label ?? "").trim();
  return name ? `${verb} ${noun} ${name}` : `${verb} ${noun}`;
}

export function sectionHint(section, { empty = false, roleLabel = "" } = {}) {
  if (section === "role" && empty) return `No ${String(roleLabel).toLowerCase()} ride yet.`;
  if (!empty) return "";
  if (section === "cities") return "Add the first city.";
  if (section === "transport") return "How are you getting there?";
  if (section === "parking") return "Need parking at the airport?";
  if (section === "budget") return "No costs yet.";
  return "";
}

export function flightStatus(flight) {
  if (!flight?.configured) return "No key saved. Flights are typed in by hand.";
  const where = flight.source === "environment" ? "from the server" : "from this app";
  return `Key saved · ending ${flight.last4} · ${where}`;
}

export function flightAdminNote(flight) {
  if (flight?.source !== "environment") return "";
  return "If your administrator set a key for everyone, it's used when you haven't saved one.";
}

export function accountLine(name) {
  const who = String(name || "").trim() || "you";
  return `Signed in as ${who}. Sign out from the Hub.`;
}
