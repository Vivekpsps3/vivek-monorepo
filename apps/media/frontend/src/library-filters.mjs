export const DEFAULT_SORT = "activity";

const MAX_TAGS = 10;

export function readFilters(paramMap) {
  const seen = new Set();
  const tags = [];
  for (const raw of paramMap.getAll("tag") ?? []) {
    const tag = String(raw).trim();
    if (!tag) continue;
    const key = tag.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return {
    q: paramMap.get("q") || "",
    kind: paramMap.get("kind") || "",
    status: paramMap.get("status") || "",
    sort: paramMap.get("sort") || DEFAULT_SORT,
    favorite: paramMap.get("fav") === "1",
    tags,
  };
}

export function filterCount(f) {
  return (
    (f.kind ? 1 : 0) +
    (f.status ? 1 : 0) +
    (f.favorite ? 1 : 0) +
    f.tags.length
  );
}

export function filterLabel(n) {
  return n === 0 ? "Filters" : `Filters (${n})`;
}

export function toQueryParams(f) {
  return {
    q: f.q || null,
    kind: f.kind || null,
    status: f.status || null,
    sort: f.sort,
    fav: f.favorite ? 1 : null,
    tag: f.tags.length ? [...f.tags] : null,
    offset: null,
    expanded: null,
  };
}

export function tagOptions(available, selected) {
  const availableList = available ?? [];
  const availableKeys = new Set(
    availableList.map((tag) => tag.toLocaleLowerCase("en")),
  );
  const missing = (selected ?? []).filter(
    (tag) => !availableKeys.has(tag.toLocaleLowerCase("en")),
  );
  const sorted = [...availableList].sort((a, b) =>
    a.toLocaleLowerCase("en").localeCompare(b.toLocaleLowerCase("en")),
  );
  return [...missing, ...sorted];
}

export function isFiltered(f) {
  return !!(f.q || f.kind || f.status || f.favorite || f.tags.length);
}
