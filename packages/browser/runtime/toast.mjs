/**
 * Keyed toast layer shared by Media and Travel.
 *
 * Two persistent live regions, outside the app root:
 *   #toasts        role=status   polite successes
 *   #toast-alerts  role=alert    errors
 * The roles stay on the regions. A toast never carries its own live role.
 *
 * Travel adopts this module as-is. App-specific rules (date-picker yield,
 * Leaflet stacking) live in the app, not here.
 */

export const TOAST_LIMIT = 3;
export const TOAST_MS = 5000;
export const TOAST_ACTION_MS = 8000;

/** Item-scoped media toasts. The id is the capture group. Travel keys do not match. */
export const ITEM_TOAST_KEY = /^(?:progress|note|note-conflict|status|favorite|anticipated|rating):(.+)$/;

export function itemIdFromHash(hash) {
  const value = hash !== undefined ? hash : (typeof location !== "undefined" ? location.hash : "");
  const match = /^#\/item\/(\d+)/.exec(String(value || ""));
  return match ? match[1] : "";
}

function lateFailureKey(key) {
  const match = ITEM_TOAST_KEY.exec(key || "");
  if (!match) return { key, away: false };
  const here = itemIdFromHash();
  if (here && here === match[1]) return { key, away: false };
  return { key: `save-failed:${key}`, away: true };
}

export function createToastLayer({
  document: doc = globalThis.document,
  idleMs = TOAST_MS,
  actionMs = TOAST_ACTION_MS,
  statusId = "toasts",
  alertId = "toast-alerts",
} = {}) {
  let serial = 0;

  function region(kind) {
    if (!doc) return null;
    return doc.getElementById(kind === "alert" ? alertId : statusId);
  }

  function toastNodes() {
    const status = region("status");
    const alerts = region("alert");
    return [
      ...(status?.querySelectorAll(".toast") || []),
      ...(alerts?.querySelectorAll(".toast") || []),
    ];
  }

  function dismissToast(key) {
    if (!key) return;
    for (const node of toastNodes()) {
      if (node.dataset.toastKey === key) node.remove();
    }
  }

  function trimToasts() {
    const live = toastNodes().sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));
    while (live.length > TOAST_LIMIT) {
      let index = live.findIndex((node) => node.dataset.persist !== "true");
      // The cap still holds when every toast is persistent: drop the oldest.
      if (index < 0) index = 0;
      live[index].remove();
      live.splice(index, 1);
    }
  }

  function retireOtherItemToasts(itemId) {
    for (const node of toastNodes()) {
      const match = ITEM_TOAST_KEY.exec(node.dataset.toastKey || "");
      if (match && match[1] !== String(itemId)) node.remove();
    }
  }

  function pushToast({ message, kind = "status", action = null, key = "", persist = false }) {
    const host = region(kind);
    if (!host || !message) return null;
    const scoped = lateFailureKey(key);
    key = scoped.key;
    if (scoped.away && !String(message).startsWith("Save failed")) {
      message = "Save failed for this item.";
    }
    if (key) dismissToast(key);
    const order = ++serial;
    const toast = doc.createElement("div");
    toast.className = kind === "alert" ? "toast is-alert" : "toast";
    toast.dataset.order = String(order);
    toast.style.order = String(order);
    if (key) toast.dataset.toastKey = key;
    if (persist) toast.dataset.persist = "true";
    if (kind === "alert") {
      const icon = doc.createElement("span");
      icon.className = "toast-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "⚠";
      toast.append(icon);
    }
    const text = doc.createElement("p");
    text.textContent = message;
    toast.append(text);
    const dismiss = () => {
      clearTimeout(timer);
      toast.remove();
    };
    if (action) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "toast-action";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        const result = typeof action.onClick === "function"
          ? action.onClick()
          : (action.href ? location.assign(action.href) : undefined);
        Promise.resolve(result).catch((error) => console.error(error));
        dismiss();
      });
      toast.append(button);
    }
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "toast-dismiss";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "✕";
    close.addEventListener("click", dismiss);
    toast.append(close);
    host.append(toast);
    trimToasts();
    let timer = 0;
    if (persist) return toast;
    let remaining = action ? actionMs : idleMs;
    let started = Date.now();
    timer = setTimeout(dismiss, remaining);
    const pause = () => {
      clearTimeout(timer);
      remaining -= Date.now() - started;
    };
    const resume = () => {
      started = Date.now();
      timer = setTimeout(dismiss, Math.max(0, remaining));
    };
    toast.addEventListener("mouseenter", pause);
    toast.addEventListener("mouseleave", resume);
    toast.addEventListener("focusin", pause);
    toast.addEventListener("focusout", (event) => {
      if (!toast.contains(event.relatedTarget)) resume();
    });
    return toast;
  }

  function toast(message, kind = "status", action = null) {
    return pushToast({
      message,
      kind,
      action,
      key: action?.key || "",
      persist: action?.persist === true,
    });
  }

  return { pushToast, toast, dismissToast, toastNodes, retireOtherItemToasts };
}
