import { createToastLayer } from "../../shared-browser/toast.mjs";
import { financeLoginHref } from "./api.mjs";
import { fieldForMessage } from "./messages.mjs";

export { SKELETON_DELAY_MS, errorPanel, routeProblem, skeletonFor } from "./states.mjs";
const NEAR_BOTTOM_PX = 120;

const layer = createToastLayer();

export function dismissToast(key) {
  layer.dismissToast(key);
}

export function revealFocusedField() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return;
  const rect = active.getBoundingClientRect();
  if (rect.bottom > window.innerHeight - NEAR_BOTTOM_PX) {
    active.scrollIntoView({ block: "center" });
  }
}

export function toast(message, kind = "status", action = null) {
  const node = layer.toast(message, kind, action);
  revealFocusedField();
  return node;
}

export function saved(message, action = null) {
  return toast(message, "status", action);
}

function fieldElement(form, name) {
  if (!form || !name) return null;
  const named = form.elements ? form.elements[name] : null;
  if (named instanceof HTMLElement) return named;
  if (named && named.length) {
    const first = [...named].find((item) => item instanceof HTMLElement);
    if (first) return first;
  }
  return form.querySelector(`[name="${CSS.escape(name)}"]`);
}

export function clearFieldError(form, name) {
  const field = fieldElement(form, name);
  if (field instanceof HTMLElement) {
    field.removeAttribute("aria-invalid");
    field.removeAttribute("aria-describedby");
  }
  form?.querySelector(`[data-error-for="${CSS.escape(name)}"]`)?.remove();
}

export function applyFieldError(form, name, message) {
  const field = fieldElement(form, name);
  if (!(field instanceof HTMLElement)) {
    toast(message, "alert");
    return;
  }
  clearFieldError(form, name);
  field.setAttribute("aria-invalid", "true");
  const error = document.createElement("p");
  error.className = "field-error";
  error.dataset.errorFor = name;
  const hostId = field.id || `${name}-field`;
  error.id = `${hostId}-error`;
  error.textContent = `⚠ ${message}`;
  field.setAttribute("aria-describedby", error.id);
  field.insertAdjacentElement("afterend", error);
  if (typeof field.focus === "function") field.focus({ preventScroll: true });
  revealFocusedField();
}

export function fail(error, options = {}) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") return;
  if (error?.status === 401) {
    location.assign(financeLoginHref());
    return;
  }
  const message = error?.message || "Something went wrong.";
  const field = options.field || (error?.status === 422 ? fieldForMessage(message) : "");
  if (field && options.form && error?.status === 422) {
    applyFieldError(options.form, field, message);
    return;
  }
  if (field && options.form && !error?.status) {
    applyFieldError(options.form, field, message);
    return;
  }
  const retry = options.retry && error?.status !== 422 ? options.retry : null;
  toast(message, "alert", retry
    ? { label: "Retry", persist: true, key: retry.key || "retry", onClick: () => { void retry.run(); } }
    : (options.action || null));
}

export function openConfirm({ title, body, confirmLabel, onConfirm }) {
  const dialog = document.querySelector("#confirm");
  if (!(dialog instanceof HTMLDialogElement)) return;
  dialog.querySelector("[data-confirm-title]").textContent = title;
  dialog.querySelector("[data-confirm-body]").textContent = body;
  const error = dialog.querySelector("[data-confirm-error]");
  if (error) error.textContent = "";
  const ok = dialog.querySelector("[data-confirm-ok]");
  ok.textContent = confirmLabel;
  ok.onclick = async () => {
    ok.disabled = true;
    try {
      await onConfirm();
      dialog.close();
    } catch (reason) {
      if (error) error.textContent = reason?.message || "Something went wrong.";
    } finally {
      ok.disabled = false;
    }
  };
  const cancel = dialog.querySelector("[data-confirm-cancel]");
  cancel.onclick = () => dialog.close();
  dialog.showModal();
  cancel.focus();
}

export function bindDateYield(doc = document) {
  const yieldTo = (on) => {
    const region = doc.getElementById("toasts");
    if (!region) return;
    if (on) region.setAttribute("data-yield", "true");
    else region.removeAttribute("data-yield");
  };
  doc.addEventListener("focusin", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === "date") yieldTo(true);
  });
  doc.addEventListener("focusout", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === "date") yieldTo(false);
  });
}

export function bindOffline(doc = document) {
  const win = doc.defaultView || window;
  const show = () => {
    toast("You're offline. Changes won't save until you reconnect.", "alert", {
      persist: true,
      key: "offline",
    });
  };
  win.addEventListener("offline", show);
  win.addEventListener("online", () => dismissToast("offline"));
  if (win.navigator && win.navigator.onLine === false) show();
}
