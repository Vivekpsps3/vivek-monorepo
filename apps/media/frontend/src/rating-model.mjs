export function ratingOptions() {
  return Array.from({ length: 11 }, (_, value) => ({
    value,
    label: String(value),
    ariaLabel: value + " out of 10",
  }));
}

export function segmentValue(r) {
  return typeof r === "number" && Number.isInteger(r) && r >= 0 && r <= 10
    ? r
    : null;
}

export function halfNote(r) {
  return typeof r === "number" && !Number.isInteger(r) && r >= 0 && r <= 10
    ? "Current rating: " + r + ". Pick a whole number to change it."
    : "";
}
