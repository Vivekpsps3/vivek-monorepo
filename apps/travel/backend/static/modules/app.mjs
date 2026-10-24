import { safeStorageGet } from "../../shared-browser/dom.mjs";
import { readSuiteTheme } from "../../shared-browser/theme.mjs";
import { render, paint } from "./router.mjs";
import { state } from "./state.mjs";
import { bindEvents, applyTheme } from "./actions/ui.mjs";

export function boot() {
  applyTheme(readSuiteTheme("travel-theme") || safeStorageGet("travel-theme") || "system");

  const ui = { render, paint };
  bindEvents(ui);
  window.addEventListener("hashchange", () => {
    state.edit = null;
    state.compose = "";
    state.error = "";
    state.flights = [];
    render();
  });
  render();
}
