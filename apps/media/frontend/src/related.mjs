export const RELATED_KINDS = ["movie", "tv", "book"];

const RELATION_LABELS = {
  sequel: "Sequel",
  spinoff: "Spin-off",
  series: "Same series",
  collaborator: "Collaborator",
};

export function relationLabel(relation) {
  return RELATION_LABELS[relation] ?? "";
}

export function relatedHref(node) {
  return "/media/add?title=" + encodeURIComponent(node.title);
}

export function cleanNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  const seen = new Set();
  const out = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (typeof node.title !== "string" || node.title === "") continue;
    const year = Number.isInteger(node.year) ? node.year : null;
    const key = node.title + "|" + (year ?? "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: node.title,
      relation: typeof node.relation === "string" ? node.relation : "",
      year,
    });
    if (out.length >= 12) break;
  }
  return out;
}
