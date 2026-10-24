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

function describedIds(field) {
  return (field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
}

function writeDescribedBy(field, ids) {
  const unique = [...new Set(ids)];
  if (unique.length) field.setAttribute("aria-describedby", unique.join(" "));
  else field.removeAttribute("aria-describedby");
}

function dropDescribedToken(field, token) {
  if (!(field instanceof HTMLElement) || !token) return;
  writeDescribedBy(field, describedIds(field).filter((id) => id !== token));
}

export function clearFormErrors(form) {
  if (!form?.querySelectorAll) return;
  form.querySelectorAll("[data-error-for]").forEach((node) => {
    const field = fieldElement(form, node.dataset.errorFor);
    if (field instanceof HTMLElement) {
      field.removeAttribute("aria-invalid");
      dropDescribedToken(field, node.id);
    }
    node.remove();
  });
}

export function clearFieldError(form, name) {
  const field = fieldElement(form, name);
  const node = form?.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
  if (field instanceof HTMLElement) {
    field.removeAttribute("aria-invalid");
    dropDescribedToken(field, node?.id);
  }
  node?.remove();
}

export function applyFieldError(form, name, message, options = {}) {
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
  writeDescribedBy(field, [...describedIds(field), error.id]);
  field.insertAdjacentElement("afterend", error);
  if (options.focus !== false && typeof field.focus === "function") field.focus({ preventScroll: true });
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

function confirmError(error, message) {
  error.replaceChildren();
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "⚠ ";
  error.append(icon, document.createTextNode(message));
  error.hidden = false;
}

export function openConfirm({ title, body, confirmLabel, onConfirm, after }) {
  const dialog = document.querySelector("#confirm");
  if (!(dialog instanceof HTMLDialogElement)) return;
  dialog.querySelector("[data-confirm-title]").textContent = title;
  dialog.querySelector("[data-confirm-body]").textContent = body;
  const error = dialog.querySelector("[data-confirm-error]");
  if (error) {
    error.replaceChildren();
    error.hidden = true;
  }
  const ok = dialog.querySelector("[data-confirm-ok]");
  ok.textContent = confirmLabel;
  ok.onclick = async () => {
    ok.disabled = true;
    try {
      await onConfirm();
      dialog.close();
      if (typeof after === "function") await after();
      const heading = document.querySelector("#app h1");
      if (heading instanceof HTMLElement) {
        heading.tabIndex = -1;
        heading.focus();
      }
    } catch (reason) {
      const message = reason?.message || "Something went wrong.";
      if (dialog.open && error) confirmError(error, message);
      else fail(reason instanceof Error ? reason : { message });
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
