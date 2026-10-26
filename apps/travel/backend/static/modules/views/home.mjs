import { ROLES, KINDS, STATUSES } from '../state.mjs';
import { esc, banner, head, leavePhrase, daysText, budgetText, prettyRange, prettyDate, labelOf, transportSummary, parkingChip, nightsText, balancePhrase } from '../helpers.mjs';
import { homeState, visiblePlans } from '../screens.mjs';

function metricLink(href, strong, span, warn = false) {
  const value = href ? `<a href="${esc(href)}">${esc(strong)}</a>` : esc(strong);
  return `<article class="metric${warn ? " metric--warn" : ""}"><b>${value}</b><span>${esc(span)}</span></article>`;
}

export function renderHome(home) {
  const view = homeState(home);
  const next = home.metrics.next_trip;
  const parking = (home.attention || []).find((item) => item.kind === "parking");
  const reminder = (home.attention || []).find((item) => item.kind === "reminder");
  const balance = home.pto.configured ? balancePhrase(home.pto.balance_today) : "Not set";
  const balanceWarn = home.pto.configured && Number(home.pto.balance_today) < 0;
  const metrics = view.metrics
    ? `<section class="metrics">
      ${metricLink(next ? `#/trips/${next.id}` : "", next ? next.title : "No trip", next ? leavePhrase(next) : "Nothing upcoming")}
      ${metricLink("#/pto", balance, home.next_pto ? `${balancePhrase(home.next_pto.leftover_after)} after ${home.next_pto.title}` : "PTO balance", balanceWarn || Number(home.next_pto?.leftover_after) < 0)}
      ${metricLink(parking ? `#/trips/${parking.trip_id}` : (next ? `#/trips/${next.id}` : "#/"), String(home.metrics.unbooked_parking), "Parking to book")}
      ${metricLink(reminder ? `#/trips/${reminder.trip_id}` : (next ? `#/trips/${next.id}` : "#/"), String(home.metrics.open_reminders), "Open reminders")}
    </section>`
    : "";
  const extra = balanceWarn ? `<p><a href="#/pto">PTO balance is ${esc(balance)}</a></p>` : "";
  const attention = home.attention.length || extra
    ? `<section class="card"><h2>Needs a look</h2><div class="stack">${extra}${home.attention
        .map((item) => `<p><a href="#/trips/${item.trip_id}">${esc(item.trip_title)}</a> · ${esc(item.text)}</p>`)
        .join("")}</div></section>`
    : "";
  const ptoLink = home.pto.configured ? "" : `<p><a href="#/pto">Set up PTO</a></p>`;
  const empty = view.heading
    ? `<section class="card empty"><p class="empty-mark" aria-hidden="true">✈</p><h2>${esc(view.heading)}</h2><p>${esc(view.body)}</p><p class="row-actions"><a class="btn btn-primary" href="#/trips/new">Plan a trip</a></p>${ptoLink}</section>`
    : "";
  const blocks = [
    ["In progress", home.in_progress, true],
    ["Upcoming", home.upcoming, false],
  ]
    .filter(([, trips]) => trips.length)
    .map(([title, trips, current]) => `<section class="trip-group"><h2>${esc(title)}</h2>${trips.map((trip) => renderTripCard(trip, current)).join("")}</section>`)
    .join("");
  const past = view.showPast && home.past.length
    ? `<section class="card"><h2>Earlier</h2>${home.past
        .map((trip) => `<a class="past-row" href="#/trips/${trip.id}"><strong>${esc(trip.title)}</strong><span>${esc(prettyRange(trip.start_date, trip.end_date))}</span></a>`)
        .join("")}</section>`
    : "";
  return `${banner()}${head("Upcoming")}${metrics}${attention}${empty}${blocks}${past}`;
}

export function renderTripCard(trip, inProgress = false) {
  const { shown, more } = visiblePlans(trip.days);
  const days = shown
    .map((day) => {
      const lines = [
        ...day.transports.map((item) => `<p>${esc(item.movement === "arrives" ? "Arrives" : "Departs")} · ${esc(transportSummary(item))}</p>`),
        ...day.items.map((item) => `<p>${item.start_time ? `${esc(item.start_time)} · ` : ""}${esc(labelOf(KINDS, item.kind))} · ${esc(item.title)}</p>`),
      ];
      return `<div class="day"><div class="day-date">${esc(prettyDate(day.on_date))}${day.city ? `<br>${esc(day.city)}` : ""}</div><div>${lines.join("")}</div></div>`;
    })
    .join("");
  const moreLink = more ? `<p><a href="#/trips/${trip.id}">+${more} more days</a></p>` : "";
  const cities = trip.cities.map((city) => `<span class="chip">${esc(city)}</span>`).join("");
  const parking = trip.parking.map(parkingChip).join("");
  const ptoDays = trip.counts_as_pto ? daysText(trip.pto.days) : "";
  const leftover = trip.counts_as_pto && trip.pto.leftover_after != null ? balancePhrase(trip.pto.leftover_after) : "";
  const overlap = trip.pto?.conflicts?.length ? "PTO overlaps" : "";
  const pto = [ptoDays ? `PTO ${ptoDays}` : "", leftover ? `${leftover} left after` : "", overlap].filter(Boolean).join(" · ");
  const open = inProgress ? `<p><a href="#/trips/${trip.id}">Open trip</a></p>` : "";
  const rides = inProgress ? "" : trip.transports.slice(0, 2).map((item) => `<p><span class="kicker">${esc(labelOf(ROLES, item.role))}</span> ${esc(transportSummary(item))}</p>`).join("");
  return `<article class="trip-card trip-card--${esc(trip.phase)}">
    <a class="card-link" href="#/trips/${trip.id}"><p class="kicker">${esc(labelOf(STATUSES, trip.status))} · ${esc(prettyRange(trip.start_date, trip.end_date))} · ${esc(nightsText(trip.nights))}</p><h2>${esc(trip.title)}</h2></a>
    <div class="chips">${cities}${parking}</div>
    ${rides ? `<div class="stack">${rides}</div>` : ""}
    ${days}
    ${moreLink}
    ${open}
    <p class="meta section">${esc(budgetText(trip.budget))}${pto ? ` · ${esc(pto)}` : ""}</p>
  </article>`;
}
