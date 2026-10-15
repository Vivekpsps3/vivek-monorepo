import { state, ROLES, KINDS, STATUSES } from '../state.mjs';
import { esc, banner, head, leavePhrase, daysText, budgetText, prettyRange, prettyDate, labelOf, transportSummary, parkingChip } from '../helpers.mjs';

export function renderHome(home) {
  const next = home.metrics.next_trip;
  const metrics = [
    [next ? next.title : "No trip", leavePhrase(next)],
    [home.pto.configured ? daysText(home.pto.balance_today) : "Not set", home.next_pto ? `${daysText(home.next_pto.leftover_after)} after ${home.next_pto.title}` : "PTO balance"],
    [String(home.metrics.unbooked_parking), "Parking still to book"],
    [String(home.metrics.open_reminders), "Open reminders"],
  ];
  const metricHtml = metrics
    .map(([strong, span]) => `<article class="metric"><b>${esc(strong)}</b><span>${esc(span)}</span></article>`)
    .join("");
  const attention = home.attention.length
    ? `<section class="card"><h2>Needs a look</h2><div class="stack">${home.attention
        .map((item) => `<p><a href="#/trips/${item.trip_id}">${esc(item.trip_title)}</a> · ${esc(item.text)}</p>`)
        .join("")}</div></section>`
    : "";
  const blocks = [
    ["In progress", home.in_progress],
    ["Upcoming", home.upcoming],
  ]
    .filter(([, trips]) => trips.length)
    .map(([title, trips]) => `<section><h2 class="kicker">${esc(title)}</h2>${trips.map(renderTripCard).join("")}</section>`)
    .join("");
  const past = home.past.length
    ? `<section class="card"><h2>Earlier</h2>${home.past
        .map((trip) => `<a class="past-row" href="#/trips/${trip.id}"><strong>${esc(trip.title)}</strong><span>${esc(prettyRange(trip.start_date, trip.end_date))}</span></a>`)
        .join("")}</section>`
    : "";
  const empty = !home.in_progress.length && !home.upcoming.length
    ? `<section class="empty"><h2>No upcoming trips</h2><p class="lede">Add dates first. Flights and day plans can come later.</p><p class="row-actions"><a class="btn btn-primary" href="#/trips/new">New trip</a></p></section>`
    : "";
  return `${banner()}${head("Upcoming", "Trips, travel details, and day plans.") }<section class="metrics">${metricHtml}</section>${attention}${empty}${blocks}${past}`;
}
export function renderTripCard(trip) {
  const planned = trip.days.filter((day) => day.items.length || day.transports.length);
  const emptyDays = trip.days.length - planned.length;
  const rides = trip.transports.map((item) => `<p><span class="kicker">${esc(labelOf(ROLES, item.role))}</span><br>${esc(transportSummary(item))}</p>`).join("");
  const days = planned
    .map((day) => {
      const lines = [
        ...day.transports.map((item) => `<p>${esc(item.movement === "arrives" ? "Arrives" : "Departs")} · ${esc(transportSummary(item))}</p>`),
        ...day.items.map((item) => `<p>${item.start_time ? `${esc(item.start_time)} · ` : ""}${esc(labelOf(KINDS, item.kind))} · ${esc(item.title)}${item.place_name ? ` · ${esc(item.place_name)}` : ""}</p>`),
      ];
      return `<div class="day"><div class="day-date">${esc(prettyDate(day.on_date))}${day.city ? `<br>${esc(day.city)}` : ""}</div><div>${lines.join("")}</div></div>`;
    })
    .join("");
  const cities = trip.cities.map((city) => `<span class="chip">${esc(city)}</span>`).join("");
  const parking = trip.parking.map(parkingChip).join("");
  const pto = trip.counts_as_pto
    ? trip.pto.leftover_after
      ? `PTO ${daysText(trip.pto.days)} · ${daysText(trip.pto.leftover_after)} left after`
      : `PTO ${daysText(trip.pto.days)}`
    : "";
  return `<article class="trip-card trip-card--${esc(trip.phase)}">
    <div class="card-head"><div><p class="kicker">${esc(labelOf(STATUSES, trip.status))} · ${esc(prettyRange(trip.start_date, trip.end_date))} · ${trip.nights} nights</p><h2><a href="#/trips/${trip.id}">${esc(trip.title)}</a></h2></div><a class="btn btn-secondary btn-sm" href="#/trips/${trip.id}">Open</a></div>
    <div class="chips">${cities}${parking}</div>
    <div class="stack">${rides || "<p class='meta'>No flights or drives yet.</p>"}</div>
    ${days || "<p class='meta section'>No day plans yet.</p>"}
    ${emptyDays ? `<p class="meta">${emptyDays} ${emptyDays === 1 ? "day" : "days"} with nothing planned.</p>` : ""}
    <p class="meta section">${esc(budgetText(trip.budget))}${pto ? ` · ${esc(pto)}` : ""}</p>
  </article>`;
}
