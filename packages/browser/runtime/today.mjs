/** Shared calendar date for the Media and Travel journals. */

export function browserTimeZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof zone === "string" && zone) return zone;
  } catch {
    /* Intl can throw in locked-down environments. */
  }
  return "UTC";
}

/** YYYY-MM-DD for an instant in an IANA zone. */
export function isoDateInZone(instant = new Date(), timeZone = browserTimeZone()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

export function localTodayIso() {
  return isoDateInZone(new Date(), browserTimeZone());
}
