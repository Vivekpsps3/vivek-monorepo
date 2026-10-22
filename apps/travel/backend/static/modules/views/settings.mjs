import { financeLoginHref } from '../api.mjs';
import { esc, banner, head, field } from '../helpers.mjs';
import { accountLine, flightAdminNote, flightStatus } from '../copy.mjs';

export function renderSettings(settings) {
  const flight = settings.flightaware;
  const admin = flightAdminNote(flight);
  const remove = flight.configured && flight.source !== "environment"
    ? `<button class="btn btn-ghost btn-danger" type="button" data-action="clear-key">Remove key</button>`
    : "";
  return `${banner()}${head("Settings")}
    <section class="card"><h2>FlightAware</h2>
      <p class="meta">${esc(flightStatus(flight))}</p>
      ${admin ? `<p class="lede">${esc(admin)}</p>` : ""}
      <form class="stack" data-form="flight-key"><div class="form-grid">${field("AeroAPI key", "api_key", "", { type: "password", wide: true, required: true, autocomplete: "off", scope: "flight" })}</div><div class="row-actions"><button class="btn btn-primary" type="submit">Save key</button>${remove}</div></form>
    </section>
    <section class="card"><h2>Account</h2>
      <p class="lede">${esc(accountLine(settings.account ? settings.account.name : ""))}</p>
      <p class="row-actions"><a class="btn btn-secondary" href="/hub">Back to Hub</a></p>
    </section>`;
}
export function renderLogin() {
  return `${head("Sign in", "Travel uses the shared account sign-in. The same session opens the Hub.")}<p class="row-actions"><a class="btn btn-primary" href="${financeLoginHref()}">Sign in</a></p>`;
}
