export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

export function cleanTag(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function addTag(tags, raw) {
  const cleaned = cleanTag(raw);
  if (!cleaned) return { tags, error: "" };
  if ([...cleaned].length > MAX_TAG_LENGTH)
    return { tags, error: "Tags can be up to 40 characters." };
  const existing = tags.find(
    (tag) =>
      cleanTag(tag).toLocaleLowerCase("en") ===
      cleaned.toLocaleLowerCase("en"),
  );
  if (existing !== undefined)
    return {
      tags,
      error: `“${existing}” is already a tag.`,
      existing,
    };
  if (tags.length >= MAX_TAGS)
    return {
      tags,
      error: "You can have up to 20 tags. Remove one to add another.",
    };
  return { tags: [...tags, cleaned], error: "" };
}

export function removeTag(tags, index) {
  return tags.filter((_, i) => i !== index);
}

export function normaliseTags(tags) {
  const seen = new Set();
  const out = [];
  for (const raw of tags ?? []) {
    const cleaned = cleanTag(raw);
    if (!cleaned) continue;
    const key = cleaned.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
