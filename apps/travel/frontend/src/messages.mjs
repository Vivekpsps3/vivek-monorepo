/** User-facing copy for HTTP failures. Never returns "Request failed (500)." */

const NETWORK = "Can't reach Travel. Check your connection.";
const UNAVAILABLE = "Travel is temporarily unavailable.";
const SERVER = "Something went wrong on our side.";

function detailOf(payload) {
  if (!payload) return "";
  if (typeof payload.detail === "string") return payload.detail;
  if (payload.detail && typeof payload.detail.message === "string") return payload.detail.message;
  return "";
}

export function messageFrom(payload, status) {
  const code = Number(status) || 0;
  const detail = detailOf(payload);
  if (!code || /failed to fetch/i.test(detail)) return NETWORK;
  if (code === 503) return UNAVAILABLE;
  if (code === 422) return detail || "Check the form and try again.";
  if (code >= 500) {
    if (detail && detail !== "Internal Server Error" && !/^request failed\b/i.test(detail)) return detail;
    return SERVER;
  }
  if (detail && !/^request failed\b/i.test(detail)) return detail;
  if (code === 404) return "That trip is not here.";
  return "Something went wrong.";
}

/** Map a server sentence onto the field that should show it, when the form has that name. */
export function fieldForMessage(message) {
  const text = String(message || "");
  const pairs = [
    ["Name the city.", "city"],
    ["Keep the city under 200 characters.", "city"],
    ["Give the trip a name.", "title"],
    ["Keep the name under 200 characters.", "title"],
    ["The return date has to be on or after the day you leave.", "end_date"],
    ["Name this plan.", "title"],
    ["Write the note.", "body"],
    ["Name the reminder.", "title"],
    ["Name this cost.", "label"],
    ["Enter an amount.", "amount"],
    ["Enter a valid amount.", "amount"],
    ["PTO days have to be between 0 and 366.", "pto_days"],
    ["Balance has to be between -366 and 366 days.", "balance_days"],
    ["Accrual has to be between 0 and 1000.", "accrual_amount"],
    ["Pick the date this balance is from.", "balance_as_of"],
    ["Name this PTO.", "label"],
    ["The end date has to be on or after the start date.", "end_date"],
    ["Paste your AeroAPI key.", "api_key"],
  ];
  const found = pairs.find(([sentence]) => text.includes(sentence));
  return found ? found[1] : "";
}
