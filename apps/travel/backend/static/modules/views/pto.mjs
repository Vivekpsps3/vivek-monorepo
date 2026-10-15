import { CADENCE } from '../state.mjs';
import { esc, banner, head, field, area, select, daysText, prettyRange, plain } from '../helpers.mjs';

export function renderPto(pto, home) {
  const policy = pto.policy;
  const trips = [...home.in_progress, ...home.upcoming].filter((trip) => trip.counts_as_pto);
  const tripRows = trips
    .map((trip) => `<div class="ride"><div><a href="#/trips/${trip.id}">${esc(trip.title)}</a><p class="meta">${esc(prettyRange(trip.start_date, trip.end_date))} · ${esc(daysText(trip.pto.days))}</p><p>${esc(trip.pto.balance_when_you_leave ? `${daysText(trip.pto.balance_when_you_leave)} when you leave · ${daysText(trip.pto.leftover_after)} left after` : trip.pto.note || "")}</p></div></div>`)
    .join("");
  const manual = pto.entries
    .filter((entry) => entry.kind === "manual")
    .map((entry) => `<div class="ride"><div><strong>${esc(entry.label)}</strong><p class="meta">${esc(prettyRange(entry.start_date, entry.end_date))} · ${esc(daysText(entry.days))}</p></div><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="pto" data-id="${entry.id}">Delete</button></div>`)
    .join("");
  const summary = policy.configured
    ? `<section class="metrics"><article class="metric"><b>${esc(daysText(policy.balance_today))}</b><span>Balance at the end of today</span></article><article class="metric"><b>${esc(daysText(policy.accrued_since))}</b><span>Accrued since ${esc(policy.balance_as_of)}</span></article><article class="metric"><b>${esc(daysText(policy.used_since))}</b><span>PTO starting after that date</span></article></section>`
    : `<p class="lede">Save the balance you have and how fast it accrues. The app then estimates what you will have on the morning you leave, and what is left after the trip.</p>`;
  return `${banner()}${head("PTO", "Secondary to the trips. Accrual is spread evenly from the day after your balance date. PTO that starts after that date is subtracted on its start date. A cap pauses accrual while you are already at the cap.")}
    ${summary}
    <section class="card"><h2>Balance and accrual</h2>
      <form class="stack" data-form="pto-policy"><div class="form-grid">
        ${field("Balance in days", "balance_days", plain(policy.balance_saved), "text")}
        ${field("Balance date", "balance_as_of", policy.balance_as_of || "", "date")}
        ${field("Accrual amount", "accrual_amount", plain(policy.accrual_amount), "text")}
        ${select("Unit", "accrual_unit", policy.accrual_unit || "day", [["day", "Days"], ["hour", "Hours"]])}
        ${select("How often", "accrual_cadence", policy.accrual_cadence || "yearly", CADENCE)}
        ${field("Hours in a PTO day", "hours_per_day", plain(policy.hours_per_day) || "8")}
        ${field("Optional cap in days", "annual_cap_days", plain(policy.annual_cap_days))}
      </div><p class="meta">The balance is what you have at the end of the balance date. A yearly rate of 15 adds 15 days across the next 365 days.</p><button class="btn btn-primary" type="submit">Save PTO</button></form>
    </section>
    <section class="card"><h2>Trips</h2>${tripRows || "<p class='meta'>Trips that count as PTO show up here.</p>"}</section>
    <section class="card"><h2>What if</h2>
      <form class="stack" data-form="pto-preview"><div class="form-grid">
        ${field("Leave", "start", "", "date")}
        ${field("Return", "end", "", "date")}
        ${field("Days, optional", "days", "")}
      </div><button class="btn btn-secondary" type="submit">Project</button></form>
      <div id="pto-preview"></div>
      <p class="meta">This adds the days on top of PTO already recorded. Leave days blank to use weekdays.</p>
    </section>
    <section class="card"><h2>Other PTO</h2>
      <form class="stack" data-form="pto-entry"><div class="form-grid">
        ${field("Name", "label", "", "text", true)}
        ${field("Start", "start_date", "", "date")}
        ${field("End", "end_date", "", "date")}
        ${field("Days, optional", "days", "")}
        ${area("Notes", "notes", "")}
      </div><button class="btn btn-primary" type="submit">Add PTO</button></form>
      ${manual || "<p class='meta'>Appointments and other days that are not a trip.</p>"}
    </section>`;
}
