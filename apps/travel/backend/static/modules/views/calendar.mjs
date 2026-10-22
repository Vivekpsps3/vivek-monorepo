import { api } from '../api.mjs';
import { KINDS } from '../state.mjs';
import { esc, banner, head, isoDate, prettyDate, labelOf } from '../helpers.mjs';
import { browserTimeZone, localTodayIso } from '../../../shared-browser/today.mjs';
import { barName, dayKicker, dayLinkName, monthMatrix, monthName, weekdayHeads } from '../calendar-model.mjs';

export { monthMatrix };
export function shiftMonth(year, month, delta) {
  const date = new Date(year, month - 1 + delta, 1);
  return `#/calendar/${date.getFullYear()}/${date.getMonth() + 1}`;
}
export async function buildCalendar(path) {
  const weeks = monthMatrix(path.year, path.month);
  const start = isoDate(weeks[0][0]);
  const end = isoDate(weeks[5][6]);
  const data = await api(`/api/calendar?start=${start}&end=${end}&tz=${encodeURIComponent(browserTimeZone())}`);
  const inGrid = (iso) => iso >= start && iso <= end;
  const todayIso = localTodayIso();
  const selected = inGrid(path.day) ? path.day : (inGrid(todayIso) ? todayIso : isoDate(new Date(path.year, path.month - 1, 1)));
  return { title: "Calendar", nav: "calendar", html: renderCalendar(data, path, weeks, selected) };
}
export function renderCalendar(data, path, weeks, selected) {
  const todayIso = localTodayIso();
  const plans = {};
  data.plans.forEach((plan) => {
    plans[plan.on_date] = plans[plan.on_date] || [];
    plans[plan.on_date].push(plan);
  });
  const dow = weekdayHeads().map((day) => `<div><abbr title="${esc(day.title)}">${esc(day.label)}</abbr></div>`).join("");
  const todayParts = todayIso.split("-").map(Number);
  const todayHref = `#/calendar/${todayParts[0]}/${todayParts[1]}/${todayIso}`;
  const weekHtml = weeks
    .map((week) => {
      const isos = week.map(isoDate);
      const bars = [];
      data.trips.forEach((trip) => {
        if (trip.end_date < isos[0] || trip.start_date > isos[6]) return;
        const clipStart = trip.start_date > isos[0] ? trip.start_date : isos[0];
        const clipEnd = trip.end_date < isos[6] ? trip.end_date : isos[6];
        bars.push({
          trip,
          start: isos.indexOf(clipStart),
          end: isos.indexOf(clipEnd),
        });
      });
      bars.sort((a, b) => a.start - b.start || b.end - a.end);
      const lanes = [];
      bars.forEach((bar) => {
        let lane = lanes.findIndex((last) => last < bar.start);
        if (lane < 0) {
          lane = lanes.length;
          lanes.push(bar.end);
        } else lanes[lane] = bar.end;
        bar.lane = lane;
      });
      const days = week
        .map((date) => {
          const iso = isoDate(date);
          const muted = date.getMonth() !== path.month - 1 ? " cal-day--muted" : "";
          const today = iso === todayIso ? " cal-day--today" : "";
          const chosen = iso === selected ? " cal-day--selected" : "";
          const dayPlans = plans[iso] || [];
          const titles = data.trips.filter((trip) => trip.start_date <= iso && trip.end_date >= iso).map((trip) => trip.title);
          const name = dayLinkName({ iso, todayIso, day: date, planCount: dayPlans.length, tripTitles: titles });
          const dots = dayPlans.slice(0, 4).map(() => `<i class="dot" aria-hidden="true"></i>`).join("");
          const current = iso === todayIso ? ` aria-current="date"` : "";
          const described = iso === selected ? ` aria-describedby="cal-selected"` : "";
          return `<div class="cal-day${muted}${today}${chosen}"><a class="cal-num" href="#/calendar/${path.year}/${path.month}/${iso}" aria-label="${esc(name)}"${current}${described}>${date.getDate()}</a><div aria-hidden="true">${dots}</div></div>`;
        })
        .join("");
      const barHtml = bars
        .map((bar) => `<a class="cal-bar cal-bar--${esc(bar.trip.phase)}" style="grid-column:${bar.start + 1} / ${bar.end + 2};grid-row:${bar.lane + 2}" href="#/trips/${bar.trip.id}" aria-label="${esc(barName(bar.trip))}">${esc(bar.trip.title)}</a>`)
        .join("");
      return `<div class="cal-week">${days}${barHtml}</div>`;
    })
    .join("");
  const active = data.trips.filter((trip) => trip.start_date <= selected && trip.end_date >= selected);
  const dayPlans = plans[selected] || [];
  const agenda = active.length
    ? active
        .map((trip) => {
          const items = dayPlans.filter((plan) => plan.trip_id === trip.id);
          const lines = items.length
            ? items.map((plan) => `<p>${plan.start_time ? `${esc(plan.start_time)} · ` : ""}${esc(labelOf(KINDS, plan.kind))} · ${esc(plan.title)}${plan.place_name ? ` · ${esc(plan.place_name)}` : ""}</p>`).join("")
            : `<p class="meta">No plans this day.</p><p><a href="#/trips/${trip.id}/day/${selected}">Add a plan</a></p>`;
          const kicker = dayKicker(selected, trip);
          return `<div class="agenda-block">${kicker ? `<p class="kicker">${esc(kicker)}</p>` : ""}<h3><a href="#/trips/${trip.id}/day/${selected}">${esc(trip.title)}</a></h3>${lines}</div>`;
        })
        .join("")
    : `<p class="meta">No trip on ${esc(prettyDate(selected))}.</p><p><a href="#/trips/new?start=${esc(selected)}">Plan a trip starting this day</a></p>`;
  const monthTrips = data.trips.some((trip) => trip.end_date >= `${path.year}-${String(path.month).padStart(2, "0")}-01` && trip.start_date <= isoDate(new Date(path.year, path.month, 0)));
  const emptyMonth = monthTrips ? "" : `<p class="meta">No trips in ${esc(monthName(path.year, path.month).split(" ")[0])}.</p><p><a href="#/trips/new">Plan a trip</a></p>`;
  const stripWeek = weeks.find((week) => week.some((day) => isoDate(day) === selected)) || weeks[0];
  const strip = stripWeek.map((date) => {
    const iso = isoDate(date);
    const count = (plans[iso] || []).length;
    const name = dayLinkName({ iso, todayIso, day: date, planCount: count, tripTitles: data.trips.filter((trip) => trip.start_date <= iso && trip.end_date >= iso).map((trip) => trip.title) });
    return `<a class="strip-day${iso === selected ? " is-selected" : ""}" href="#/calendar/${path.year}/${path.month}/${iso}" aria-label="${esc(name)}"><span>${date.getDate()}</span><i aria-hidden="true">${count ? "•" : ""}</i></a>`;
  }).join("");
  return `${banner()}${head("Calendar", "A bar is one trip, from the day you leave through the day you come back. Dots are plans on that day.")}
    <div class="cal-toolbar"><h2>${esc(monthName(path.year, path.month))}</h2><div class="row-actions"><a class="btn btn-secondary btn-sm" href="${shiftMonth(path.year, path.month, -1)}">Previous</a><a class="btn btn-secondary btn-sm" href="${todayHref}">Today</a><a class="btn btn-secondary btn-sm" href="${shiftMonth(path.year, path.month, 1)}">Next</a><button class="btn btn-ghost btn-sm cal-layout" type="button" data-action="calendar-layout">Month</button></div></div>
    <div class="cal-board"><span id="cal-selected" class="sr-only">Selected</span><div class="cal-strip">${strip}</div><div class="cal-scroll cal-month"><div class="cal-dow">${dow}</div>${weekHtml}</div>${emptyMonth}</div>
    <section class="card"><h2>${esc(prettyDate(selected))}</h2>${agenda}</section>`;
}
