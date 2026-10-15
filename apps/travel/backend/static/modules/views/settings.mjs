import { financeLoginHref } from '../api.mjs';
import { esc, banner, head, field } from '../helpers.mjs';

export function renderSettings(settings) {
  const flight = settings.flightaware;
  return `${banner()}${head("Settings", "FlightAware is optional. Without a key, type the flight yourself. A key saved here lives in this app’s database. If FLIGHTAWARE_API_KEY is set in the environment, that key is used instead.")}
    <section class="card"><h2>FlightAware AeroAPI</h2>
      <p>${flight.configured ? `Key is set from ${esc(flight.source)}. Ending ${esc(flight.last4)}.` : "No key yet."}</p>
      <form class="stack" data-form="flight-key"><div class="form-grid">${field("API key", "api_key", "", "password", true)}</div><div class="row-actions"><button class="btn btn-primary" type="submit">Save key</button><button class="btn btn-ghost" type="button" data-action="clear-key">Remove saved key</button></div></form>
    </section>
    <section class="card"><h2>Sign-in</h2>
      <p class="lede">Signed in as ${esc(settings.account ? settings.account.name : "you")} with the shared session. Sign out from the Hub.</p>
      <p class="row-actions"><a class="btn btn-secondary" href="/hub">Back to Hub</a></p>
    </section>`;
}
export function renderLogin() {
  return `${head("Sign in", "Travel uses the shared account sign-in. The same session opens the Hub.")}<p class="row-actions"><a class="btn btn-primary" href="${financeLoginHref()}">Sign in</a></p>`;
}
