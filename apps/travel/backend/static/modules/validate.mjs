/** Client checks. The sentences are the server's, so the two sides never disagree. */

export function balanceError(value) {
  const text = String(value ?? "").trim();
  if (!text) return "Balance has to be between -366 and 366 days.";
  const number = Number(text);
  if (!Number.isFinite(number) || number < -366 || number > 366) {
    return "Balance has to be between -366 and 366 days.";
  }
  return "";
}

export function accrualError(value) {
  const text = String(value ?? "").trim();
  if (!text) return "Accrual has to be between 0 and 1000.";
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0 || number > 1000) {
    return "Accrual has to be between 0 and 1000.";
  }
  return "";
}

export function requiredText(value, sentence) {
  return String(value ?? "").trim() ? "" : sentence;
}

export function dateOrderError(start, end, sentence) {
  if (!start || !end) return "";
  return end < start ? sentence : "";
}

export function ptoDaysError(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0 || number > 366) {
    return "PTO days have to be between 0 and 366.";
  }
  return "";
}

/**
 * Inline errors for one form, keyed by data-form.
 * Returns { name, message } for the first problem, or null.
 */
export function formError(kind, data) {
  const value = (name) => String(data[name] ?? "").trim();
  if (kind === "trip") {
    if (!value("title")) return { name: "title", message: "Give the trip a name." };
    const order = dateOrderError(value("start_date"), value("end_date"), "The return date has to be on or after the day you leave.");
    if (order) return { name: "end_date", message: order };
    const days = ptoDaysError(data.pto_days);
    if (days) return { name: "pto_days", message: days };
    return null;
  }
  if (kind === "stay") {
    if (!value("city")) return { name: "city", message: "Name the city." };
    return null;
  }
  if (kind === "transport") {
    if (!value("depart_place")) return { name: "depart_place", message: "Name where this ride leaves from." };
    return null;
  }
  if (kind === "plan") {
    if (!value("title")) return { name: "title", message: "Name this plan." };
    return null;
  }
  if (kind === "parking") {
    if (!value("place_name")) return { name: "place_name", message: "Name this parking." };
    return null;
  }
  if (kind === "note") {
    if (!value("body")) return { name: "body", message: "Write the note." };
    return null;
  }
  if (kind === "reminder") {
    if (!value("title")) return { name: "title", message: "Name the reminder." };
    return null;
  }
  if (kind === "budget") {
    if (!value("label")) return { name: "label", message: "Name this cost." };
    if (!value("amount")) return { name: "amount", message: "Enter an amount." };
    return null;
  }
  if (kind === "flight-key") {
    if (!value("api_key")) return { name: "api_key", message: "Paste your AeroAPI key." };
    return null;
  }
  if (kind === "pto-policy") {
    const balance = balanceError(data.balance_days);
    if (balance) return { name: "balance_days", message: balance };
    if (!value("balance_as_of")) return { name: "balance_as_of", message: "Pick the date this balance is from." };
    const accrual = accrualError(data.accrual_amount);
    if (accrual) return { name: "accrual_amount", message: accrual };
    return null;
  }
  if (kind === "pto-entry") {
    if (!value("label")) return { name: "label", message: "Name this PTO." };
    if (!value("start_date") || !value("end_date")) return { name: "start_date", message: "Pick the first day and the last day." };
    const order = dateOrderError(value("start_date"), value("end_date"), "The end date has to be on or after the start date.");
    if (order) return { name: "end_date", message: order };
    return null;
  }
  return null;
}
