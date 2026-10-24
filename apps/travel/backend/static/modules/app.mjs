import { safeStorageGet } from "../../shared-browser/dom.mjs";
import { render, paint } from "./router.mjs";
import { state } from "./state.mjs";
import { bindEvents, applyTheme } from "./actions/ui.mjs";
import { bindDateYield, bindOffline } from "./feedback.mjs";
import { DECISIONS } from "./decisions.mjs";

export function boot() {
  if (!DECISIONS.bottomTabs) document.body.dataset.tabs = "top";
  if (!DECISIONS.settingsInMenu) {
    document.querySelector(".settings-bar")?.removeAttribute("hidden");
  }
  applyTheme(safeStorageGet("travel-theme") || "system");
  bindDateYield();
  bindOffline();

  const ui = { render, paint };
  bindEvents(ui);
  window.addEventListener("hashchange", () => {
    if (state.holdHash) return;
    state.edit = null;
    state.compose = "";
    state.details = null;
    state.error = "";
    state.flights = [];
    render();
  });
  render();
}
