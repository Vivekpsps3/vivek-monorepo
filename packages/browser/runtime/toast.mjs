/** Suite toast contract (spec §12 S2). Finance and Media both read these values. */

export const TOAST_LIMIT = 3;
export const TOAST_DURATION_MS = 5000;
export const TOAST_ACTION_DURATION_MS = 8000;
export const TOAST_INSET_PX = 24;
export const TOAST_MAX_WIDTH_PX = 400;
export const TOAST_MOBILE_BREAKPOINT_PX = 768;
export const HTTP_ERROR_FALLBACK = "Something went wrong. Try again.";

export function toastRole(kind) {
  return kind === "error" ? "alert" : "status";
}

export function toastLive(kind) {
  return kind === "error" ? "assertive" : "polite";
}

export function toastDuration(hasAction) {
  return hasAction ? TOAST_ACTION_DURATION_MS : TOAST_DURATION_MS;
}

export function successCopy(thing, verb = "saved") {
  return `${thing} ${verb}`;
}

export function failureCopy(verb, thing, reason) {
  const sentence = `Couldn't ${verb} ${thing}.`;
  return reason ? `${sentence} ${reason}` : sentence;
}

export function isUserFacingDetail(detail) {
  if (typeof detail !== "string") return false;
  const text = detail.trim();
  if (!text || text.length > 180) return false;
  if (/[<>]/.test(text)) return false;
  if (/^request failed\.?$/i.test(text)) return false;
  if (/traceback|exception|stack trace|\bsql\b|errno|econn|http failure/i.test(text)) return false;
  return true;
}

export function httpErrorMessage(detail) {
  return isUserFacingDetail(detail) ? detail.trim() : HTTP_ERROR_FALLBACK;
}
