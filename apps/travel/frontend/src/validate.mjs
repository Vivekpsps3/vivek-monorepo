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

const TRANSPORT_MODES = ["flight", "drive", "train", "bus", "ferry", "other"];

function has(data, name) {
  return Object.prototype.hasOwnProperty.call(data, name);
}

function text(value) {
  return String(value ?? "").trim();
}

/**
 * Every current problem for one mounted form, keyed by the control name.
 * Parking has no required field. Transport requires a known mode and nothing else.
 * @param {string} kind
 * @param {Record<string, unknown>} [data]
 * @returns {Record<string, string>}
 */
export function fieldErrors(kind, data) {
  const source = data || {};
  /** @type {Record<string, string>} */
  const errors = {};
  const set = (name, message) => {
    if (message) errors[name] = message;
  };
  const value = (name) => text(source[name]);
  if (kind === "trip") {
    set("title", requiredText(source.title, "Give the trip a name."));
    if (has(source, "start_date") && !value("start_date")) {
      set("start_date", "Pick the day you leave and the day you come back.");
    }
    if (has(source, "end_date") && !value("end_date")) {
      set("end_date", "Pick the day you leave and the day you come back.");
    }
    if (value("start_date") && value("end_date")) {
      set(
        "end_date",
        dateOrderError(
          value("start_date"),
          value("end_date"),
          "The return date has to be on or after the day you leave.",
        ),
      );
    }
    set("pto_days", ptoDaysError(source.pto_days));
    return errors;
  }
  if (kind === "stay") {
    set("city", requiredText(source.city, "Name the city."));
    if (has(source, "arrive_on") && !value("arrive_on")) {
      set("arrive_on", "Pick the first day and the last day.");
    }
    if (has(source, "leave_on") && !value("leave_on")) {
      set("leave_on", "Pick the first day and the last day.");
    }
    if (value("arrive_on") && value("leave_on")) {
      set(
        "leave_on",
        dateOrderError(
          value("arrive_on"),
          value("leave_on"),
          "The city departure has to be on or after the arrival.",
        ),
      );
    }
    return errors;
  }
  if (kind === "transport") {
    if (!TRANSPORT_MODES.includes(value("mode"))) set("mode", "Choose a way to travel.");
    return errors;
  }
  if (kind === "plan") {
    set("title", requiredText(source.title, "Name this plan."));
    if (has(source, "on_date") && !value("on_date")) set("on_date", "Pick the date.");
    return errors;
  }
  if (kind === "parking" || kind === "location") {
    if (kind === "location") {
      const query = value("query");
      if (query.length < 2 || query.length > 200) {
        set("query", "Enter a place name between 2 and 200 characters.");
      }
    }
    return errors;
  }
  if (kind === "note") {
    set("body", requiredText(source.body, "Write the note."));
    return errors;
  }
  if (kind === "reminder") {
    set("title", requiredText(source.title, "Name the reminder."));
    return errors;
  }
  if (kind === "budget") {
    set("label", requiredText(source.label, "Name this cost."));
    const amount = source.amount;
    if (amount === null || amount === undefined || text(amount) === "") {
      set("amount", "Enter an amount.");
    } else {
      const number = Number(amount);
      if (!Number.isFinite(number) || number < 0) set("amount", "Use a zero or positive amount.");
    }
    if (has(source, "currency") && !/^[A-Za-z]{3}$/.test(value("currency"))) {
      set("currency", "Use a 3-letter currency code, such as USD.");
    }
    return errors;
  }
  if (kind === "flight-key") {
    set("api_key", requiredText(source.api_key, "Paste your AeroAPI key."));
    return errors;
  }
  if (kind === "pto-policy") {
    set("balance_days", balanceError(source.balance_days));
    set("balance_as_of", requiredText(source.balance_as_of, "Pick the date this balance is from."));
    set("accrual_amount", accrualError(source.accrual_amount));
    return errors;
  }
  if (kind === "pto-entry") {
    set("label", requiredText(source.label, "Name this PTO."));
    if (!value("start_date") || !value("end_date")) {
      set("start_date", "Pick the first day and the last day.");
    } else {
      set(
        "end_date",
        dateOrderError(
          value("start_date"),
          value("end_date"),
          "The end date has to be on or after the start date.",
        ),
      );
    }
    return errors;
  }
  return errors;
}

/** First problem from fieldErrors, or null. Kept for callers that only need one sentence. */
export function formError(kind, data) {
  const errors = fieldErrors(kind, data);
  const name = Object.keys(errors)[0];
  return name ? { name, message: errors[name] } : null;
}
