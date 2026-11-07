const KINDS = ["movie", "tv", "book", "game", "artist", "album", "track"];

export const FIELD_ORDER = ["title", "kind", "year"];

export function validateAdd({ title, kind, year }) {
  const errors = {};
  const trimmed = String(title ?? "").trim();
  if (!trimmed) errors.title = "Enter a title.";
  else if ([...trimmed].length > 300)
    errors.title = "Keep the title under 300 characters.";
  if (!KINDS.includes(kind)) errors.kind = "Choose a type.";
  if (year !== null && year !== undefined && year !== "") {
    if (!Number.isInteger(year) || year < 1000 || year > 3000)
      errors.year = "Enter a year between 1000 and 3000.";
  }
  return errors;
}
