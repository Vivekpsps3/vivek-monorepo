import { api } from '../api.mjs';
import { KINDS } from '../state.mjs';
import { esc, banner, head, isoDate, prettyDate, labelOf } from '../helpers.mjs';
import { browserTimeZone, localTodayIso } from '../../../shared-browser/today.mjs';
import { weekStartsOn } from '../../../shared-browser/week.mjs';

export function monthMatrix(year, month) {
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  const offset = (first.getDay() - weekStartsOn() + 7) % 7;
  start.setDate(first.getDate() - offset);
  const weeks = [];
  for (let week = 0; week < 6; week += 1) {
    const days = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + week * 7 + offset);
      days.push(day);
    }
    weeks.push(days);
  }
  return weeks;
}
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
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<div>${day}</div>`).join("");
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
          const dots = (plans[iso] || []).slice(0, 4).map(() => `<i class="dot"></i>`).join("");
          return `<div class="cal-day${muted}${today}${chosen}"><a class="cal-num" href="#/calendar/${path.year}/${path.month}/${iso}">${date.getDate()}</a><div>${dots}</div></div>`;
        })
        .join("");
      const barHtml = bars
        .map((bar) => `<a class="cal-bar cal-bar--${esc(bar.trip.phase)}" style="grid-column:${bar.start + 1} / ${bar.end + 2};grid-row:${bar.lane + 2}" href="#/trips/${bar.trip.id}">${esc(bar.trip.title)}</a>`)
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
            : `<p class="meta">No plans this day.</p>`;
          return `<div class="agenda-block"><h3><a href="#/trips/${trip.id}/day/${selected}">${esc(trip.title)}</a></h3>${lines}</div>`;
        })
        .join("")
    : `<p class="meta">No trip on ${esc(prettyDate(selected))}.</p>`;
  return `${banner()}${head("Calendar", "A bar is one trip, from the day you leave through the day you come back. Dots are plans on that day.")}
    <div class="cal-toolbar"><h2>${esc(new Date(path.year, path.month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }))}</h2><div class="row-actions"><a class="btn btn-secondary btn-sm" href="${shiftMonth(path.year, path.month, -1)}">Previous</a><a class="btn btn-secondary btn-sm" href="${shiftMonth(path.year, path.month, 1)}">Next</a></div></div>
    <div class="cal-scroll"><div class="cal-dow">${dow}</div>${weekHtml}</div>
    <section class="card"><h2>${esc(prettyDate(selected))}</h2>${agenda}</section>`;
}
