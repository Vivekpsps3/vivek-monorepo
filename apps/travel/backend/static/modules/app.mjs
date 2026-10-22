import { safeStorageGet } from "../../shared-browser/dom.mjs";
import { render, paint } from "./router.mjs";
import { state } from "./state.mjs";
import { bindEvents, applyTheme } from "./actions/ui.mjs";
import { bindDateYield, bindOffline } from "./feedback.mjs";

export function boot() {
  applyTheme(safeStorageGet("travel-theme") || "system");
  bindDateYield();
  bindOffline();

  const ui = { render, paint };
  bindEvents(ui);
  window.addEventListener("hashchange", () => {
    state.edit = null;
    state.compose = "";
    state.details = null;
    state.error = "";
    state.flights = [];
    render();
  });
  render();
}
