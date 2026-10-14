/* Travel UI. Upcoming cards list every planned day inside each trip. */

const ROLES = [
  ["outbound", "Outbound"],
  ["connection", "Between cities"],
  ["local", "Local"],
  ["inbound", "Inbound"],
];
const MODES = [
  ["flight", "Flight"],
  ["drive", "Drive"],
  ["train", "Train"],
  ["bus", "Bus"],
  ["ferry", "Ferry"],
  ["other", "Other"],
];
const KINDS = [
  ["restaurant", "Restaurant"],
  ["activity", "Activity"],
  ["lodging", "Lodging"],
  ["transit", "Getting around"],
  ["other", "Other"],
];
const ARRANGEMENTS = [
  ["self_park", "I'm parking"],
  ["valet", "Valet"],
  ["offsite", "Off-site lot"],
  ["dropoff", "Someone is dropping me off"],
  ["pickup", "Someone is picking me up"],
  ["rideshare", "Rideshare"],
  ["none", "Not needed"],
];
const NECESSARY = [
  ["yes", "Yes, I need parking"],
  ["no", "No"],
  ["unknown", "Not sure yet"],
];
const STATUSES = [
  ["planning", "Planning"],
  ["booked", "Booked"],
  ["done", "Done"],
];
const CADENCE = [
  ["yearly", "Each year"],
  ["monthly", "Each month"],
  ["semimonthly", "Twice a month"],
  ["biweekly", "Every two weeks"],
  ["weekly", "Each week"],
];

const state = {
  seq: 0,
  error: "",
  trip: null,
  edit: null,
  compose: "",
  composeDate: "",
  composeRole: "outbound",
  flights: [],
};

let fieldSeq = 0;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function messageFrom(payload, status) {
  if (!payload) return `Request failed (${status}).`;
  if (typeof payload.detail === "string") return payload.detail;
  if (payload.detail && payload.detail.message) return payload.detail.message;
  return `Request failed (${status}).`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { detail: text };
    }
  }
  if (!response.ok) {
    const error = new Error(messageFrom(payload, response.status));
    error.status = response.status;
    throw error;
  }
  return payload;
}

function dateParts(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function prettyDate(iso) {
  if (!iso) return "";
  return dateParts(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function prettyRange(start, end) {
  if (!start || !end) return "";
  if (start === end) return prettyDate(start);
  const left = dateParts(start).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const right = dateParts(end).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${left} – ${right}`;
}

function prettyTime(iso) {
  if (!iso || !iso.includes("T")) return "";
  const [hourText, minute] = iso.split("T")[1].split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function prettyWhen(iso) {
  if (!iso) return "";
  const day = prettyDate(iso.slice(0, 10));
  const time = prettyTime(iso);
  return time ? `${day}, ${time}` : day;
}

function localInput(iso) {
  return iso ? iso.slice(0, 16) : "";
}

function money(amount, currency = "USD") {
  if (amount == null || amount === "") return "";
  const value = Number(amount);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${amount} ${currency}`;
  }
}

function daysText(value) {
  if (value == null || value === "") return "";
  const rounded = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(rounded)) return "";
  const clean = rounded.toFixed(2).replace(/\.?0+$/, "");
  const unit = clean === "1" || clean === "-1" ? "day" : "days";
  return `${clean} ${unit}`;
}

function budgetText(budget) {
  if (!budget || !budget.currencies.length) return "No costs yet";
  return budget.currencies.map((item) => money(item.total, item.currency)).join(" + ");
}

function delayText(seconds) {
  if (seconds == null) return "";
  const minutes = Math.round(Number(seconds) / 60);
  if (Math.abs(minutes) < 2) return "No reported delay";
  return minutes > 0 ? `${minutes} min late` : `${Math.abs(minutes)} min early`;
}

function labelOf(options, value) {
  const found = options.find(([key]) => key === value);
  return found ? found[1] : value || "";
}

function val(form, name) {
  const element = form.elements[name];
  if (!element || element.type === "checkbox") return null;
  const text = element.value.trim();
  return text ? text : null;
}

function checked(form, name) {
  return Boolean(form.elements[name] && form.elements[name].checked);
}

function field(label, name, value, type = "text", wide = false) {
  const id = `f-${name}-${fieldSeq++}`;
  return `<div class="${wide ? "wide" : ""}"><label for="${id}">${esc(label)}</label><input id="${id}" name="${esc(name)}" type="${type}" value="${esc(value ?? "")}"></div>`;
}

function area(label, name, value) {
  const id = `f-${name}-${fieldSeq++}`;
  return `<div class="wide"><label for="${id}">${esc(label)}</label><textarea id="${id}" name="${esc(name)}">${esc(value ?? "")}</textarea></div>`;
}

function select(label, name, value, options, wide = false) {
  const id = `f-${name}-${fieldSeq++}`;
  const choices = options
    .map(([key, text]) => `<option value="${esc(key)}"${key === value ? " selected" : ""}>${esc(text)}</option>`)
    .join("");
  return `<div class="${wide ? "wide" : ""}"><label for="${id}">${esc(label)}</label><select id="${id}" name="${esc(name)}">${choices}</select></div>`;
}

function check(label, name, on) {
  const id = `f-${name}-${fieldSeq++}`;
  return `<div class="wide"><label class="check" for="${id}"><input id="${id}" name="${esc(name)}" type="checkbox"${on ? " checked" : ""}> ${esc(label)}</label></div>`;
}

function actions(submitLabel) {
  return `<div class="row-actions"><button class="btn btn-primary" type="submit">${esc(submitLabel)}</button><button class="btn btn-ghost" type="button" data-action="cancel">Cancel</button></div>`;
}

function banner() {
  return state.error ? `<p class="banner" role="alert">${esc(state.error)}</p>` : "";
}

function parseHash() {
  const parts = (location.hash || "#/").replace(/^#/, "").split("/").filter(Boolean);
  if (!parts.length) return { name: "home" };
  if (parts[0] === "calendar") {
    const now = new Date();
    return {
      name: "calendar",
      year: Number(parts[1]) || now.getFullYear(),
      month: Number(parts[2]) || now.getMonth() + 1,
      day: parts[3] || "",
    };
  }
  if (parts[0] === "trips" && parts[1] === "new") return { name: "new" };
  if (parts[0] === "trips" && parts[1]) {
    return { name: "trip", id: Number(parts[1]), focusDay: parts[2] === "day" ? parts[3] : "" };
  }
  if (parts[0] === "pto") return { name: "pto" };
  if (parts[0] === "settings") return { name: "settings" };
  return { name: "home" };
}

function destroyMap() {
  if (window._travelMap) {
    window._travelMap.remove();
    window._travelMap = null;
  }
}

function paint(html, nav) {
  destroyMap();
  const root = document.querySelector("#app");
  root.innerHTML = html;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === nav) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const focus = root.querySelector("[data-focus]");
  if (focus) focus.scrollIntoView({ block: "start" });
  mountMap();
}

function setTitle(text) {
  document.title = text ? `${text} · Travel` : "Travel";
}

async function render() {
  const seq = ++state.seq;
  const path = parseHash();
  try {
    const page = await build(path);
    if (seq !== state.seq) return;
    setTitle(page.title);
    paint(page.html, page.nav);
  } catch (error) {
    if (seq !== state.seq) return;
    if (error.status === 401) {
      setTitle("Locked");
      paint(renderLogin(), path.name);
      return;
    }
    paint(`<p class="banner" role="alert">${esc(error.message)}</p>`, path.name);
  }
}

async function build(path) {
  if (path.name === "home") return { title: "", nav: "home", html: renderHome(await api("/api/home")) };
  if (path.name === "calendar") return buildCalendar(path);
  if (path.name === "new") return { title: "New trip", nav: "home", html: renderNewTrip() };
  if (path.name === "trip") {
    const trip = await api(`/api/trips/${path.id}`);
    state.trip = trip;
    return { title: trip.title, nav: "home", html: renderTrip(trip, path.focusDay) };
  }
  if (path.name === "pto") {
    const [pto, home] = await Promise.all([api("/api/pto"), api("/api/home")]);
    return { title: "PTO", nav: "pto", html: renderPto(pto, home) };
  }
  if (path.name === "settings") return { title: "Settings", nav: "settings", html: renderSettings(await api("/api/settings")) };
  return { title: "", nav: "home", html: renderHome(await api("/api/home")) };
}

function head(title, lede, extra = "") {
  return `<header class="page-head"><div class="page-head-row"><div><h1>${esc(title)}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</div>${extra}</div></header>`;
}

function leavePhrase(next) {
  if (!next) return "Nothing upcoming";
  if (next.phase === "in_progress") return "In progress";
  if (next.days_until === 0) return "Leaves today";
  if (next.days_until === 1) return "Leaves tomorrow";
  return `In ${next.days_until} days`;
}

function transportSummary(item) {
  return [item.label, item.route, prettyWhen(item.depart_at), item.cost ? money(item.cost, item.currency) : ""]
    .filter(Boolean)
    .join(" · ");
}

function flightMeta(item) {
  const bits = [];
  if (item.fa_status) bits.push(item.fa_status);
  if (item.fa_aircraft) bits.push(item.fa_aircraft);
  const depart = [item.fa_terminal_origin ? `T${item.fa_terminal_origin}` : "", item.fa_gate_origin ? `Gate ${item.fa_gate_origin}` : ""]
    .filter(Boolean)
    .join(" ");
  const arrive = [item.fa_terminal_destination ? `T${item.fa_terminal_destination}` : "", item.fa_gate_destination ? `Gate ${item.fa_gate_destination}` : ""]
    .filter(Boolean)
    .join(" ");
  if (depart) bits.push(`Departs ${depart}`);
  if (arrive) bits.push(`Arrives ${arrive}`);
  if (item.fa_baggage_claim) bits.push(`Bag ${item.fa_baggage_claim}`);
  const delay = delayText(item.fa_delay_departure_seconds);
  if (delay) bits.push(delay);
  if (item.depart_tz) bits.push(item.depart_tz);
  return bits.join(" · ");
}

function parkingChip(item) {
  if (item.necessary === "no" || item.arrangement === "none") return `<span class="chip">Parking not needed</span>`;
  if (item.booked) return `<span class="chip chip--ok">Parking booked${item.place_name ? ` · ${esc(item.place_name)}` : ""}</span>`;
  if (item.necessary === "yes") return `<span class="chip chip--warn">Parking needed, not booked</span>`;
  return `<span class="chip">${esc(labelOf(ARRANGEMENTS, item.arrangement))}</span>`;
}

function renderHome(home) {
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

function renderTripCard(trip) {
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

function monthMatrix(year, month) {
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
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

function shiftMonth(year, month, delta) {
  const date = new Date(year, month - 1 + delta, 1);
  return `#/calendar/${date.getFullYear()}/${date.getMonth() + 1}`;
}

async function buildCalendar(path) {
  const weeks = monthMatrix(path.year, path.month);
  const start = isoDate(weeks[0][0]);
  const end = isoDate(weeks[5][6]);
  const data = await api(`/api/calendar?start=${start}&end=${end}`);
  const inGrid = (iso) => iso >= start && iso <= end;
  const selected = inGrid(path.day) ? path.day : (inGrid(data.today) ? data.today : isoDate(new Date(path.year, path.month - 1, 1)));
  return { title: "Calendar", nav: "calendar", html: renderCalendar(data, path, weeks, selected) };
}

function renderCalendar(data, path, weeks, selected) {
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
          const today = iso === data.today ? " cal-day--today" : "";
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

function cityFields() {
  return `<div class="form-grid city-row" data-city>
    ${field("City", "city", "")}
    ${field("Region", "region", "")}
    ${field("Country", "country", "")}
    ${field("Arrive", "arrive_on", "", "date")}
    ${field("Leave", "leave_on", "", "date")}
    ${field("Lodging", "lodging_name", "", "text", true)}
    <div class="wide"><button class="btn btn-ghost btn-sm" type="button" data-action="remove-row">Remove city</button></div>
  </div>`;
}

function legFields(role) {
  return `<fieldset class="card" data-leg="${role}"><legend>${esc(labelOf(ROLES, role))}</legend><div class="form-grid">
    ${select("How you're getting there", "mode", role === "connection" ? "train" : "flight", MODES)}
    ${field("Carrier", "carrier", "")}
    ${field("Flight or route number", "number", "")}
    ${field("From", "depart_place", "")}
    ${field("To", "arrive_place", "")}
    ${field("Departs", "depart_at", "", "datetime-local")}
    ${field("Arrives", "arrive_at", "", "datetime-local")}
    ${field("Cost", "cost", "", "text")}
    ${field("Currency", "currency", "USD")}
  </div></fieldset>`;
}

function renderNewTrip() {
  return `${banner()}${head("New trip", "One trip is the stretch from the day you leave until the day you get back. Add a city for each place you stay, including more than one city.")}
    <form class="stack" data-form="create-trip">
      <div class="form-grid">
        ${field("Trip name", "title", "", "text", true)}
        ${field("Day you leave", "start_date", "", "date")}
        ${field("Day you come back", "end_date", "", "date")}
        ${field("Leaving from", "origin_label", "")}
        ${select("Status", "status", "planning", STATUSES)}
        ${check("Count weekdays in this trip as PTO", "counts_as_pto", true)}
        ${field("PTO days, if you want to override the weekday count", "pto_days", "", "text", true)}
        ${area("Notes", "notes", "")}
      </div>
      <section class="card"><div class="card-head"><h2>Cities</h2><button class="btn btn-secondary btn-sm" type="button" data-action="add-city">Add city</button></div><div id="cities" class="stack">${cityFields()}</div><p class="meta">Leave city dates blank to use the whole trip. A second city makes this a multi-city trip.</p></section>
      ${legFields("outbound")}
      <section class="card"><div class="card-head"><h2>Between cities</h2><button class="btn btn-secondary btn-sm" type="button" data-action="add-connection">Add a train, drive, or flight</button></div><div id="connections" class="stack"></div></section>
      ${legFields("inbound")}
      <button class="btn btn-primary" type="submit">Save trip</button>
    </form>`;
}

function connectionFields() {
  return `<div class="form-grid connection-row" data-connection>
    ${select("Mode", "mode", "train", MODES)}
    ${field("From", "depart_place", "")}
    ${field("To", "arrive_place", "")}
    ${field("Departs", "depart_at", "", "datetime-local")}
    ${field("Cost", "cost", "")}
    ${field("Currency", "currency", "USD")}
    <div class="wide"><button class="btn btn-ghost btn-sm" type="button" data-action="remove-row">Remove</button></div>
  </div>`;
}

function hiddenFlight(item) {
  const names = ["fa_ident", "fa_status", "fa_aircraft", "fa_gate_origin", "fa_gate_destination", "fa_terminal_origin", "fa_terminal_destination", "fa_baggage_claim", "fa_delay_departure_seconds", "fa_delay_arrival_seconds", "fa_scheduled_out", "fa_estimated_out", "fa_actual_out", "fa_scheduled_in", "fa_estimated_in", "fa_actual_in", "depart_tz", "arrive_tz"];
  return names.map((name) => `<input type="hidden" name="${name}" value="${esc(item && item[name] != null ? item[name] : "")}">`).join("");
}

function transportForm(item, role) {
  const current = item || { role, mode: "flight", currency: "USD", status: "planned", paid: false };
  return `<form class="stack" data-form="transport" data-id="${item ? item.id : ""}"><div class="form-grid">
      ${select("Part of the trip", "role", current.role, ROLES)}
      ${select("Mode", "mode", current.mode, MODES)}
      ${select("Status", "status", current.status || "planned", [["planned", "Planned"], ["booked", "Booked"], ["completed", "Completed"], ["cancelled", "Cancelled"]])}
      ${field("Carrier", "carrier", current.carrier || "")}
      ${field("Number", "number", current.number || "")}
      ${field("From", "depart_place", current.depart_place || "")}
      ${field("To", "arrive_place", current.arrive_place || "")}
      ${field("Departs", "depart_at", localInput(current.depart_at), "datetime-local")}
      ${field("Arrives", "arrive_at", localInput(current.arrive_at), "datetime-local")}
      ${field("Confirmation", "confirmation", current.confirmation || "")}
      ${field("Seat", "seat", current.seat || "")}
      ${field("Cost", "cost", current.cost || "")}
      ${field("Currency", "currency", current.currency || "USD")}
      ${check("Paid", "paid", Boolean(current.paid))}
      ${area("Notes", "notes", current.notes || "")}
    </div>
    <div data-flight-only ${current.mode === "flight" ? "" : "hidden"}>
      <p class="meta">Lookup sends the flight number and this date to FlightAware. You can type the flight instead.</p>
      <div class="form-grid">${field("Lookup date", "lookup_on", (current.depart_at || "").slice(0, 10), "date")}</div>
      <button class="btn btn-secondary btn-sm" type="button" data-action="lookup-flight">Look up flight</button>
      <div id="flight-results"></div>
    </div>
    ${hiddenFlight(current)}
    ${actions(item ? "Save ride" : "Add ride")}
  </form>`;
}

function stayForm(item) {
  const current = item || {};
  return `<form class="stack" data-form="stay" data-id="${item ? item.id : ""}"><div class="form-grid">
    ${field("City", "city", current.city || "")}
    ${field("Region", "region", current.region || "")}
    ${field("Country", "country", current.country || "")}
    ${field("Arrive", "arrive_on", current.arrive_on || "", "date")}
    ${field("Leave", "leave_on", current.leave_on || "", "date")}
    ${field("Lodging", "lodging_name", current.lodging_name || "", "text", true)}
    ${field("Address", "lodging_address", current.lodging_address || "", "text", true)}
    ${field("Latitude", "lat", current.lat ?? "")}
    ${field("Longitude", "lng", current.lng ?? "")}
    ${area("Notes", "notes", current.notes || "")}
  </div><p class="meta">Find on map sends the address to OpenStreetMap.</p><button class="btn btn-secondary btn-sm" type="button" data-action="find-place">Find on map</button><div data-place-hits></div>${actions(item ? "Save city" : "Add city")}</form>`;
}

function planForm(item, dateValue) {
  const current = item || { on_date: dateValue, kind: "restaurant", currency: "USD" };
  return `<form class="stack" data-form="plan" data-id="${item ? item.id : ""}"><div class="form-grid">
    ${field("Date", "on_date", current.on_date || "", "date")}
    ${field("Start", "start_time", current.start_time || "", "time")}
    ${field("End", "end_time", current.end_time || "", "time")}
    ${select("Kind", "kind", current.kind || "activity", KINDS)}
    ${field("Name", "title", current.title || "", "text", true)}
    ${field("Place", "place_name", current.place_name || "")}
    ${field("Address", "address", current.address || "")}
    ${field("Latitude", "lat", current.lat ?? "")}
    ${field("Longitude", "lng", current.lng ?? "")}
    ${field("Link", "url", current.url || "", "url")}
    ${field("Cost", "cost", current.cost || "")}
    ${field("Currency", "currency", current.currency || "USD")}
    ${check("Paid", "paid", Boolean(current.paid))}
    ${area("Notes", "notes", current.notes || "")}
  </div><p class="meta">Find on map sends the address to OpenStreetMap.</p><button class="btn btn-secondary btn-sm" type="button" data-action="find-place">Find on map</button><div data-place-hits></div>${actions(item ? "Save plan" : "Add plan")}</form>`;
}

function parkingForm(item, transports) {
  const current = item || { necessary: "yes", arrangement: "self_park", currency: "USD", booked: false };
  const transportOptions = [["", "Not tied to one ride"], ...transports.map((ride) => [String(ride.id), transportSummary(ride)])];
  return `<form class="stack" data-form="parking" data-id="${item ? item.id : ""}"><div class="form-grid">
    ${select("Is parking necessary?", "necessary", current.necessary, NECESSARY)}
    ${select("How you'll handle it", "arrangement", current.arrangement, ARRANGEMENTS)}
    ${select("Tied to", "transport_id", current.transport_id ? String(current.transport_id) : "", transportOptions, true)}
    ${field("Place", "place_name", current.place_name || "", "text", true)}
    ${field("Address", "address", current.address || "", "text", true)}
    ${field("Latitude", "lat", current.lat ?? "")}
    ${field("Longitude", "lng", current.lng ?? "")}
    ${field("Confirmation", "confirmation", current.confirmation || "")}
    ${field("From", "start_at", localInput(current.start_at), "datetime-local")}
    ${field("Until", "end_at", localInput(current.end_at), "datetime-local")}
    ${field("Cost", "cost", current.cost || "")}
    ${field("Currency", "currency", current.currency || "USD")}
    ${check("Booked", "booked", Boolean(current.booked))}
    ${check("Paid", "paid", Boolean(current.paid))}
    ${area("Notes", "notes", current.notes || "")}
  </div><button class="btn btn-secondary btn-sm" type="button" data-action="find-place">Find on map</button><div data-place-hits></div>${actions(item ? "Save parking" : "Add parking")}</form>`;
}

function editing(kind, id) {
  return state.edit && state.edit.kind === kind && state.edit.id === id;
}

function renderTrip(trip, focusDay) {
  const editingTrip = editing("trip", trip.id);
  const tripForm = `<form class="stack" data-form="trip" data-id="${trip.id}"><div class="form-grid">
      ${field("Trip name", "title", trip.title, "text", true)}
      ${field("Day you leave", "start_date", trip.start_date, "date")}
      ${field("Day you come back", "end_date", trip.end_date, "date")}
      ${field("Leaving from", "origin_label", trip.origin_label || "")}
      ${select("Status", "status", trip.status, STATUSES)}
      ${check("Count as PTO", "counts_as_pto", trip.counts_as_pto)}
      ${field("PTO days override", "pto_days", trip.pto_days || "", "text", true)}
      ${area("Overview", "notes", trip.notes || "")}
    </div>${actions("Save trip")}</form>`;
  const header = editingTrip
    ? tripForm
    : `<header class="page-head"><div class="page-head-row"><div><p class="kicker">${esc(labelOf(STATUSES, trip.status))} · ${esc(trip.phase === "in_progress" ? "In progress" : trip.phase)} · ${esc(prettyRange(trip.start_date, trip.end_date))}</p><h1>${esc(trip.title)}</h1><p class="lede">${trip.origin_label ? `From ${esc(trip.origin_label)}. ` : ""}${esc(trip.notes || "The days below are the trip.")}</p></div><div class="row-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="edit" data-kind="trip" data-id="${trip.id}">Edit</button><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="trip" data-id="${trip.id}">Delete</button></div></div></header>`;
  const ptoLine = trip.counts_as_pto
    ? `<article class="metric"><b>${esc(daysText(trip.pto.days))}</b><span>${esc(trip.pto.leftover_after ? `${daysText(trip.pto.balance_when_you_leave)} when you leave · ${daysText(trip.pto.leftover_after)} left after` : trip.pto.note || "PTO")}</span></article>`
    : `<article class="metric"><b>Not PTO</b><span>This trip does not use PTO.</span></article>`;
  const metrics = `<section class="metrics">
      <article class="metric"><b>${trip.span_days}</b><span>${trip.nights} nights away</span></article>
      <article class="metric"><b>${esc(budgetText(trip.budget))}</b><span>Trip budget</span></article>
      ${ptoLine}
      <article class="metric"><b>${trip.cities.length || "—"}</b><span>${esc(trip.cities.join(" · ") || "No cities yet")}</span></article>
    </section>`;
  const stays = trip.stays
    .map((stay) => editing("stay", stay.id)
      ? stayForm(stay)
      : `<div class="ride"><div><strong>${esc(stay.city)}</strong><p class="meta">${esc(prettyRange(stay.arrive_on, stay.leave_on))}${stay.lodging_name ? ` · ${esc(stay.lodging_name)}` : ""}${stay.outside ? " · outside the trip dates" : ""}</p></div><button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-kind="stay" data-id="${stay.id}">Edit</button></div>`)
    .join("");
  const cityBlock = `<section class="card"><div class="card-head"><h2>Cities</h2><button class="btn btn-secondary btn-sm" type="button" data-action="compose" data-compose="stay">Add city</button></div>${state.compose === "stay" ? stayForm(null) : ""}${stays || "<p class='meta'>Add each city you stay in. More than one city is a multi-city trip.</p>"}</section>`;
  const groups = ROLES.map(([role, label]) => {
    const rows = trip.transports.filter((item) => item.role === role);
    if (!rows.length && (role === "connection" || role === "local") && state.compose !== `transport:${role}`) return "";
    const body = rows
      .map((item) => {
        if (editing("transport", item.id)) return transportForm(item, item.role);
        const meta = flightMeta(item);
        return `<div class="ride"><div><p class="kicker">${esc(labelOf(MODES, item.mode))}</p><p>${esc(transportSummary(item))}</p>${meta ? `<p class="meta">${esc(meta)}</p>` : ""}</div><div class="row-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-kind="transport" data-id="${item.id}">Edit</button><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="transport" data-id="${item.id}">Delete</button></div></div>`;
      })
      .join("");
    const composer = state.compose === `transport:${role}` ? transportForm(null, role) : "";
    return `<section class="section"><div class="card-head"><h3>${esc(label)}</h3><button class="btn btn-secondary btn-sm" type="button" data-action="compose" data-compose="transport:${role}" data-role="${role}">Add</button></div>${composer}${body || "<p class='meta'>Nothing here yet.</p>"}</section>`;
  }).join("");
  const days = trip.days
    .map((day) => {
      const focused = focusDay === day.on_date ? " data-focus" : "";
      const moves = day.transports.map((item) => `<p>${esc(item.movement === "arrives" ? "Arrives" : item.movement === "both" ? "Departs and arrives" : "Departs")} · ${esc(transportSummary(item))}</p>`).join("");
      const items = day.items
        .map((item) => editing("plan", item.id)
          ? planForm(item)
          : `<div class="plan"><div><p>${item.start_time ? `<strong>${esc(item.start_time)}</strong> · ` : ""}<span class="chip">${esc(labelOf(KINDS, item.kind))}</span> ${esc(item.title)}</p><p class="meta">${[item.place_name, item.address, item.cost ? money(item.cost, item.currency) : "", item.notes].filter(Boolean).map(esc).join(" · ")}</p></div><div class="row-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-kind="plan" data-id="${item.id}">Edit</button><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="plan" data-id="${item.id}">Delete</button></div></div>`)
        .join("");
      const adder = state.compose === "plan" && state.composeDate === day.on_date ? planForm(null, day.on_date) : "";
      return `<div class="day" id="day-${day.on_date}"${focused}><div class="day-date">${esc(prettyDate(day.on_date))}${day.city ? `<br>${esc(day.city)}` : ""}<br><button class="btn btn-ghost btn-sm" type="button" data-action="compose" data-compose="plan" data-date="${day.on_date}">Add</button></div><div>${adder}${moves}${items || "<p class='meta'>Nothing planned.</p>"}</div></div>`;
    })
    .join("");
  const outside = trip.outside_plans.length
    ? `<div class="section"><h3>Outside the trip dates</h3>${trip.outside_plans.map((item) => `<p>${esc(item.on_date)} · ${esc(item.title)}</p>`).join("")}</div>`
    : "";
  const parkingRows = trip.parking
    .map((item) => editing("parking", item.id)
      ? parkingForm(item, trip.transports)
      : `<div class="ride"><div>${parkingChip(item)}<p>${esc(item.place_name || "Parking")}</p><p class="meta">${esc(labelOf(ARRANGEMENTS, item.arrangement))}${item.confirmation ? ` · ${esc(item.confirmation)}` : ""}${item.cost ? ` · ${esc(money(item.cost, item.currency))}` : ""}</p>${item.notes ? `<p>${esc(item.notes)}</p>` : ""}</div><div class="row-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-kind="parking" data-id="${item.id}">Edit</button>${item.necessary === "yes" && !item.booked ? `<button class="btn btn-ghost btn-sm" type="button" data-action="remind-parking" data-id="${item.id}">Remind me</button>` : ""}<button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="parking" data-id="${item.id}">Delete</button></div></div>`)
    .join("");
  const budgetLines = trip.budget.lines
    .map((line) => `<div class="ride"><div><p>${esc(line.category_label)} · ${esc(line.label)}</p><p class="meta">${line.paid ? "Paid" : "Not marked paid"}</p></div><strong>${esc(money(line.amount, line.currency))}</strong></div>`)
    .join("");
  const manual = trip.budget.manual
    .map((line) => `<div class="ride"><div><p>${esc(line.label)}</p><p class="meta">Extra line · ${esc(line.category_label)}</p></div><div class="row-actions"><strong>${esc(money(line.amount, line.currency))}</strong><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="budget" data-id="${line.id}">Delete</button></div></div>`)
    .join("");
  const budgetForm = state.compose === "budget"
    ? `<form class="stack" data-form="budget"><div class="form-grid">${select("Category", "category", "other", [["outbound_flight", "Outbound flight"], ["inbound_flight", "Inbound flight"], ["lodging", "Lodging"], ["food", "Food"], ["activity", "Activities"], ["parking", "Parking"], ["other", "Other"]], true)}${field("Name", "label", "", "text", true)}${field("Amount", "amount", "")}${field("Currency", "currency", "USD")}${check("Paid", "paid", false)}${area("Notes", "notes", "")}</div>${actions("Add cost")}</form>`
    : "";
  const notes = trip.note_entries
    .map((note) => `<div class="ride"><div><p>${esc(note.body)}</p><p class="meta">${note.on_date ? esc(prettyDate(note.on_date)) : "Trip note"}</p></div><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="note" data-id="${note.id}">Delete</button></div>`)
    .join("");
  const noteForm = state.compose === "note"
    ? `<form class="stack" data-form="note"><div class="form-grid">${field("Date, optional", "on_date", "", "date", true)}${area("Note", "body", "")}</div>${actions("Add note")}</form>`
    : "";
  const reminders = trip.reminders
    .map((item) => `<div class="ride"><label class="check"><input type="checkbox" data-action="toggle-reminder" data-id="${item.id}"${item.done ? " checked" : ""}> ${esc(item.title)}</label><div><p class="meta">${item.due_at ? esc(prettyWhen(item.due_at)) : esc(item.kind)}${item.notes ? ` · ${esc(item.notes)}` : ""}</p><button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-kind="reminder" data-id="${item.id}">Delete</button></div></div>`)
    .join("");
  const reminderForm = state.compose === "reminder"
    ? `<form class="stack" data-form="reminder"><div class="form-grid">${field("Reminder", "title", "", "text", true)}${select("Kind", "kind", "general", [["general", "General"], ["parking", "Parking"], ["flight", "Flight"], ["packing", "Packing"]])}${field("When", "due_at", "", "datetime-local")}${area("Notes", "notes", "")}</div>${actions("Add reminder")}</form>`
    : "";
  const points = collectPoints(trip);
  const links = points
    .map((point) => `<a href="https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=16/${point.lat}/${point.lng}">${esc(point.kind)} · ${esc(point.label)}</a>`)
    .join("");
  const mapCard = `<aside class="card map-card"><h2>Map</h2><div id="map" class="map"${points.length ? "" : " hidden"}></div><p class="meta">${points.length ? "Pins are the cities, plans, and parking spots that have a location." : "Use Find on map when you add an address to drop a pin."}</p><div class="map-links">${links}</div></aside>`;
  return `${banner()}${header}${metrics}<div class="split"><div>
      ${cityBlock}
      <section class="card"><h2>Getting there</h2>${groups}</section>
      <section class="card"><div class="card-head"><h2>Days</h2></div>${days}${outside}</section>
      <section class="card"><div class="card-head"><h2>Parking and pickup</h2><button class="btn btn-secondary btn-sm" type="button" data-action="compose" data-compose="parking">Add</button></div><p class="meta">Say whether a spot is necessary, whether it is booked, and whether you are parking, being dropped off, or picked up.</p>${state.compose === "parking" ? parkingForm(null, trip.transports) : ""}${parkingRows || "<p class='meta'>No parking notes yet.</p>"}</section>
      <section class="card"><div class="card-head"><h2>Budget</h2><button class="btn btn-secondary btn-sm" type="button" data-action="compose" data-compose="budget">Add extra cost</button></div><p class="meta">Flight, drive, plan, and parking costs are included when you type them. Add a line only for something that is not already on the trip. Different currencies stay separate.</p>${budgetForm}${budgetLines}${manual}</section>
      <section class="card"><div class="card-head"><h2>Notes</h2><button class="btn btn-secondary btn-sm" type="button" data-action="compose" data-compose="note">Add note</button></div>${noteForm}${notes || "<p class='meta'>Notes stay on this trip.</p>"}</section>
      <section class="card"><div class="card-head"><h2>Reminders</h2><button class="btn btn-secondary btn-sm" type="button" data-action="compose" data-compose="reminder">Add reminder</button></div>${reminderForm}${reminders || "<p class='meta'>Reminders for parking, check-in, or packing.</p>"}</section>
    </div>${mapCard}</div>`;
}

function collectPoints(trip) {
  const points = [];
  trip.stays.forEach((stay) => {
    if (stay.lat != null && stay.lng != null) points.push({ lat: stay.lat, lng: stay.lng, label: stay.city, kind: "City" });
  });
  trip.days.forEach((day) => day.items.forEach((item) => {
    if (item.lat != null && item.lng != null) points.push({ lat: item.lat, lng: item.lng, label: item.title, kind: labelOf(KINDS, item.kind) });
  }));
  trip.parking.forEach((item) => {
    if (item.lat != null && item.lng != null) points.push({ lat: item.lat, lng: item.lng, label: item.place_name || "Parking", kind: "Parking" });
  });
  return points;
}

function mountMap() {
  const element = document.querySelector("#map");
  if (!element || element.hidden) return;
  const points = state.trip ? collectPoints(state.trip) : [];
  if (!points.length || !window.L) {
    element.hidden = false;
    element.textContent = window.L ? "" : "The map library did not load. Use the OpenStreetMap links.";
    return;
  }
  const map = window.L.map(element);
  window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  const markers = points.map((point) => window.L.marker([point.lat, point.lng]).bindPopup(`<strong>${esc(point.label)}</strong><br>${esc(point.kind)}`));
  const group = window.L.featureGroup(markers).addTo(map);
  map.fitBounds(group.getBounds().pad(0.3));
  window._travelMap = map;
  setTimeout(() => map.invalidateSize(), 0);
}

function plain(value) {
  if (value == null || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value);
}

function renderPto(pto, home) {
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

function renderSettings(settings) {
  const flight = settings.flightaware;
  return `${banner()}${head("Settings", "FlightAware is optional. Without a key, type the flight yourself. A key saved here lives in this app’s database. If FLIGHTAWARE_API_KEY is set in the environment, that key is used instead.")}
    <section class="card"><h2>FlightAware AeroAPI</h2>
      <p>${flight.configured ? `Key is set from ${esc(flight.source)}. Ending ${esc(flight.last4)}.` : "No key yet."}</p>
      <form class="stack" data-form="flight-key"><div class="form-grid">${field("API key", "api_key", "", "password", true)}</div><div class="row-actions"><button class="btn btn-primary" type="submit">Save key</button><button class="btn btn-ghost" type="button" data-action="clear-key">Remove saved key</button></div></form>
    </section>
    <section class="card"><h2>Network lock</h2>
      <p class="lede">${settings.access_locked ? "This app asks for TRAVEL_ACCESS_TOKEN." : "This app is open on the network it is bound to. Set TRAVEL_ACCESS_TOKEN before starting it if you want a passphrase."}</p>
      ${settings.access_locked ? `<button class="btn btn-secondary" type="button" data-action="logout">Lock</button>` : ""}
    </section>`;
}

function renderLogin() {
  return `${head("Locked", "Enter the travel passphrase for this network.")}<form class="card stack" data-form="login"><div class="form-grid">${field("Passphrase", "token", "", "password", true)}</div><button class="btn btn-primary" type="submit">Unlock</button></form>`;
}

function readLeg(root, role) {
  return {
    role,
    mode: root.querySelector("[name=mode]").value,
    carrier: emptyInput(root, "carrier"),
    number: emptyInput(root, "number"),
    depart_place: emptyInput(root, "depart_place"),
    arrive_place: emptyInput(root, "arrive_place"),
    depart_at: emptyInput(root, "depart_at"),
    arrive_at: emptyInput(root, "arrive_at"),
    cost: emptyInput(root, "cost"),
    currency: (emptyInput(root, "currency") || "USD").toUpperCase(),
  };
}

function emptyInput(root, name) {
  const element = root.querySelector(`[name="${name}"]`);
  if (!element) return null;
  const text = element.value.trim();
  return text ? text : null;
}

function showError(error) {
  state.error = error.message || "Something went wrong.";
  let banner = document.querySelector(".banner");
  if (!banner) {
    banner = document.createElement("p");
    banner.className = "banner";
    banner.setAttribute("role", "alert");
    document.querySelector("#app").prepend(banner);
  }
  banner.textContent = state.error;
}

async function refetchTrip() {
  state.trip = await api(`/api/trips/${state.trip.id}`);
  state.edit = null;
  state.compose = "";
  state.error = "";
  const focus = parseHash().focusDay;
  paint(renderTrip(state.trip, focus), "home");
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readTransport(form) {
  return {
    role: form.elements.role.value,
    mode: form.elements.mode.value,
    status: form.elements.status.value,
    carrier: val(form, "carrier"),
    number: val(form, "number"),
    depart_place: val(form, "depart_place"),
    arrive_place: val(form, "arrive_place"),
    depart_at: val(form, "depart_at"),
    arrive_at: val(form, "arrive_at"),
    depart_tz: val(form, "depart_tz"),
    arrive_tz: val(form, "arrive_tz"),
    confirmation: val(form, "confirmation"),
    seat: val(form, "seat"),
    cost: val(form, "cost"),
    currency: (val(form, "currency") || "USD").toUpperCase(),
    paid: checked(form, "paid"),
    notes: val(form, "notes"),
    fa_ident: val(form, "fa_ident"),
    fa_status: val(form, "fa_status"),
    fa_aircraft: val(form, "fa_aircraft"),
    fa_gate_origin: val(form, "fa_gate_origin"),
    fa_gate_destination: val(form, "fa_gate_destination"),
    fa_terminal_origin: val(form, "fa_terminal_origin"),
    fa_terminal_destination: val(form, "fa_terminal_destination"),
    fa_baggage_claim: val(form, "fa_baggage_claim"),
    fa_delay_departure_seconds: numberOrNull(val(form, "fa_delay_departure_seconds")),
    fa_delay_arrival_seconds: numberOrNull(val(form, "fa_delay_arrival_seconds")),
    fa_scheduled_out: val(form, "fa_scheduled_out"),
    fa_estimated_out: val(form, "fa_estimated_out"),
    fa_actual_out: val(form, "fa_actual_out"),
    fa_scheduled_in: val(form, "fa_scheduled_in"),
    fa_estimated_in: val(form, "fa_estimated_in"),
    fa_actual_in: val(form, "fa_actual_in"),
  };
}

async function submit(kind, form) {
  state.error = "";
  if (kind === "login") {
    await api("/api/session", { method: "POST", body: JSON.stringify({ token: val(form, "token") || "" }) });
    await render();
    return;
  }
  if (kind === "create-trip") {
    const start = val(form, "start_date");
    const end = val(form, "end_date");
    const stays = [];
    form.querySelectorAll("[data-city]").forEach((row) => {
      const city = emptyInput(row, "city");
      if (!city) return;
      stays.push({
        city,
        region: emptyInput(row, "region"),
        country: emptyInput(row, "country"),
        arrive_on: emptyInput(row, "arrive_on") || start,
        leave_on: emptyInput(row, "leave_on") || end,
        lodging_name: emptyInput(row, "lodging_name"),
      });
    });
    const transports = [readLeg(form.querySelector("[data-leg=outbound]"), "outbound")];
    form.querySelectorAll("[data-connection]").forEach((row) => transports.push(readLeg(row, "connection")));
    transports.push(readLeg(form.querySelector("[data-leg=inbound]"), "inbound"));
    const trip = await api("/api/trips", {
      method: "POST",
      body: JSON.stringify({
        title: val(form, "title"),
        start_date: start,
        end_date: end,
        origin_label: val(form, "origin_label"),
        status: form.elements.status.value,
        counts_as_pto: checked(form, "counts_as_pto"),
        pto_days: val(form, "pto_days"),
        notes: val(form, "notes"),
        stays,
        transports,
      }),
    });
    location.hash = `#/trips/${trip.id}`;
    return;
  }
  if (kind === "trip") {
    state.trip = await api(`/api/trips/${form.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: val(form, "title"),
        start_date: val(form, "start_date"),
        end_date: val(form, "end_date"),
        origin_label: val(form, "origin_label"),
        status: form.elements.status.value,
        counts_as_pto: checked(form, "counts_as_pto"),
        pto_days: val(form, "pto_days"),
        notes: val(form, "notes"),
      }),
    });
    state.edit = null;
    paint(renderTrip(state.trip, parseHash().focusDay), "home");
    return;
  }
  if (kind === "stay") {
    const body = {
      city: val(form, "city"),
      region: val(form, "region"),
      country: val(form, "country"),
      arrive_on: val(form, "arrive_on"),
      leave_on: val(form, "leave_on"),
      lodging_name: val(form, "lodging_name"),
      lodging_address: val(form, "lodging_address"),
      lat: numberOrNull(val(form, "lat")),
      lng: numberOrNull(val(form, "lng")),
      notes: val(form, "notes"),
    };
    const path = form.dataset.id ? `/api/stays/${form.dataset.id}` : `/api/trips/${state.trip.id}/stays`;
    state.trip = await api(path, { method: form.dataset.id ? "PATCH" : "POST", body: JSON.stringify(body) });
    state.compose = "";
    state.edit = null;
    paint(renderTrip(state.trip), "home");
    return;
  }
  if (kind === "transport") {
    const body = readTransport(form);
    const path = form.dataset.id ? `/api/transports/${form.dataset.id}` : `/api/trips/${state.trip.id}/transports`;
    state.trip = await api(path, { method: form.dataset.id ? "PATCH" : "POST", body: JSON.stringify(body) });
    state.compose = "";
    state.edit = null;
    state.flights = [];
    paint(renderTrip(state.trip), "home");
    return;
  }
  if (kind === "plan") {
    const body = {
      on_date: val(form, "on_date"),
      start_time: val(form, "start_time"),
      end_time: val(form, "end_time"),
      kind: form.elements.kind.value,
      title: val(form, "title"),
      place_name: val(form, "place_name"),
      address: val(form, "address"),
      lat: numberOrNull(val(form, "lat")),
      lng: numberOrNull(val(form, "lng")),
      url: val(form, "url"),
      cost: val(form, "cost"),
      currency: (val(form, "currency") || "USD").toUpperCase(),
      paid: checked(form, "paid"),
      notes: val(form, "notes"),
    };
    const path = form.dataset.id ? `/api/plans/${form.dataset.id}` : `/api/trips/${state.trip.id}/plans`;
    state.trip = await api(path, { method: form.dataset.id ? "PATCH" : "POST", body: JSON.stringify(body) });
    state.compose = "";
    state.edit = null;
    paint(renderTrip(state.trip, body.on_date), "home");
    return;
  }
  if (kind === "parking") {
    const transportId = val(form, "transport_id");
    const body = {
      transport_id: transportId ? Number(transportId) : null,
      necessary: form.elements.necessary.value,
      arrangement: form.elements.arrangement.value,
      booked: checked(form, "booked"),
      place_name: val(form, "place_name"),
      address: val(form, "address"),
      lat: numberOrNull(val(form, "lat")),
      lng: numberOrNull(val(form, "lng")),
      confirmation: val(form, "confirmation"),
      start_at: val(form, "start_at"),
      end_at: val(form, "end_at"),
      cost: val(form, "cost"),
      currency: (val(form, "currency") || "USD").toUpperCase(),
      paid: checked(form, "paid"),
      notes: val(form, "notes"),
    };
    const path = form.dataset.id ? `/api/parking/${form.dataset.id}` : `/api/trips/${state.trip.id}/parking`;
    state.trip = await api(path, { method: form.dataset.id ? "PATCH" : "POST", body: JSON.stringify(body) });
    state.compose = "";
    state.edit = null;
    paint(renderTrip(state.trip), "home");
    return;
  }
  if (kind === "note") {
    state.trip = await api(`/api/trips/${state.trip.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: val(form, "body"), on_date: val(form, "on_date") }),
    });
    state.compose = "";
    paint(renderTrip(state.trip), "home");
    return;
  }
  if (kind === "reminder") {
    state.trip = await api(`/api/trips/${state.trip.id}/reminders`, {
      method: "POST",
      body: JSON.stringify({
        title: val(form, "title"),
        kind: form.elements.kind.value,
        due_at: val(form, "due_at"),
        notes: val(form, "notes"),
        done: false,
      }),
    });
    state.compose = "";
    paint(renderTrip(state.trip), "home");
    return;
  }
  if (kind === "budget") {
    state.trip = await api(`/api/trips/${state.trip.id}/budget-lines`, {
      method: "POST",
      body: JSON.stringify({
        category: form.elements.category.value,
        label: val(form, "label"),
        amount: val(form, "amount"),
        currency: (val(form, "currency") || "USD").toUpperCase(),
        paid: checked(form, "paid"),
        notes: val(form, "notes"),
      }),
    });
    state.compose = "";
    paint(renderTrip(state.trip), "home");
    return;
  }
  if (kind === "pto-policy") {
    await api("/api/pto/policy", {
      method: "PUT",
      body: JSON.stringify({
        balance_days: val(form, "balance_days") || "0",
        balance_as_of: val(form, "balance_as_of"),
        accrual_amount: val(form, "accrual_amount") || "0",
        accrual_unit: form.elements.accrual_unit.value,
        accrual_cadence: form.elements.accrual_cadence.value,
        hours_per_day: val(form, "hours_per_day") || "8",
        annual_cap_days: val(form, "annual_cap_days"),
      }),
    });
    await render();
    return;
  }
  if (kind === "pto-entry") {
    await api("/api/pto/entries", {
      method: "POST",
      body: JSON.stringify({
        label: val(form, "label"),
        start_date: val(form, "start_date"),
        end_date: val(form, "end_date"),
        days: val(form, "days"),
        notes: val(form, "notes"),
      }),
    });
    await render();
    return;
  }
  if (kind === "pto-preview") {
    const params = new URLSearchParams({ start: val(form, "start"), end: val(form, "end") });
    if (val(form, "days")) params.set("days", val(form, "days"));
    const result = await api(`/api/pto/preview?${params.toString()}`);
    const box = document.querySelector("#pto-preview");
    const numbers = result.balance_when_you_leave
      ? `<p><strong>${esc(daysText(result.balance_when_you_leave))}</strong> when you leave.</p><p><strong>${esc(daysText(result.leftover_after))}</strong> left after ${esc(daysText(result.days))}.</p>`
      : "";
    box.innerHTML = `<div class="section">${numbers}<p class="meta">${esc(result.note || "")}</p></div>`;
    return;
  }
  if (kind === "flight-key") {
    await api("/api/settings/flightaware", { method: "PUT", body: JSON.stringify({ api_key: val(form, "api_key") || "" }) });
    await render();
  }
}

function toDatetimeLocal(iso, timeZone) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function bestTime(flight, which) {
  if (which === "out") return flight.actual_out || flight.estimated_out || flight.scheduled_out;
  return flight.actual_in || flight.estimated_in || flight.scheduled_in;
}

function applyFlight(form, flight) {
  const set = (name, value) => {
    if (form.elements[name]) form.elements[name].value = value ?? "";
  };
  set("number", flight.ident_iata || flight.ident || "");
  set("depart_place", flight.origin_iata || "");
  set("arrive_place", flight.destination_iata || "");
  set("depart_at", toDatetimeLocal(bestTime(flight, "out"), flight.origin_timezone));
  set("arrive_at", toDatetimeLocal(bestTime(flight, "in"), flight.destination_timezone));
  set("depart_tz", flight.origin_timezone || "");
  set("arrive_tz", flight.destination_timezone || "");
  set("fa_ident", flight.ident || "");
  set("fa_status", flight.status || "");
  set("fa_aircraft", flight.aircraft_type || "");
  set("fa_gate_origin", flight.gate_origin || "");
  set("fa_gate_destination", flight.gate_destination || "");
  set("fa_terminal_origin", flight.terminal_origin || "");
  set("fa_terminal_destination", flight.terminal_destination || "");
  set("fa_baggage_claim", flight.baggage_claim || "");
  set("fa_delay_departure_seconds", flight.departure_delay_seconds ?? "");
  set("fa_delay_arrival_seconds", flight.arrival_delay_seconds ?? "");
  set("fa_scheduled_out", flight.scheduled_out || "");
  set("fa_estimated_out", flight.estimated_out || "");
  set("fa_actual_out", flight.actual_out || "");
  set("fa_scheduled_in", flight.scheduled_in || "");
  set("fa_estimated_in", flight.estimated_in || "");
  set("fa_actual_in", flight.actual_in || "");
}

function renderFlightChoices(form, flights) {
  const box = form.querySelector("#flight-results");
  if (!box) return;
  if (!flights.length) {
    box.innerHTML = `<p class="meta">No matching flight in that window. You can still type the details.</p>`;
    return;
  }
  box.innerHTML = flights
    .map((flight, index) => `<button class="choice" type="button" data-action="use-flight" data-index="${index}"><strong>${esc(flight.ident_iata || flight.ident)}</strong><span>${esc(flight.origin_iata || "")} → ${esc(flight.destination_iata || "")} · ${esc(flight.status || "Scheduled")}</span></button>`)
    .join("");
}

async function onAction(button) {
  const action = button.dataset.action;
  if (action === "theme") {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    return;
  }
  if (action === "cancel") {
    state.edit = null;
    state.compose = "";
    state.error = "";
    if (state.trip && parseHash().name === "trip") paint(renderTrip(state.trip, parseHash().focusDay), "home");
    return;
  }
  if (action === "add-city") {
    document.querySelector("#cities").insertAdjacentHTML("beforeend", cityFields());
    return;
  }
  if (action === "add-connection") {
    document.querySelector("#connections").insertAdjacentHTML("beforeend", connectionFields());
    return;
  }
  if (action === "remove-row") {
    const row = button.closest("[data-city], [data-connection]");
    if (row) row.remove();
    return;
  }
  if (action === "compose") {
    state.compose = button.dataset.compose;
    state.composeDate = button.dataset.date || "";
    state.composeRole = button.dataset.role || "outbound";
    state.edit = null;
    paint(renderTrip(state.trip, state.composeDate), "home");
    return;
  }
  if (action === "edit") {
    state.edit = { kind: button.dataset.kind, id: Number(button.dataset.id) };
    state.compose = "";
    paint(renderTrip(state.trip, parseHash().focusDay), "home");
    return;
  }
  if (action === "delete") {
    const kind = button.dataset.kind;
    const id = button.dataset.id;
    const prompts = {
      trip: "Delete this trip and its plans?",
      transport: "Delete this ride?",
      plan: "Delete this plan?",
      parking: "Delete this parking note?",
      note: "Delete this note?",
      reminder: "Delete this reminder?",
      budget: "Delete this extra cost?",
      pto: "Delete this PTO entry?",
      stay: "Delete this city?",
    };
    if (!window.confirm(prompts[kind] || "Delete this?")) return;
    const paths = {
      trip: `/api/trips/${id}`,
      transport: `/api/transports/${id}`,
      plan: `/api/plans/${id}`,
      parking: `/api/parking/${id}`,
      note: `/api/notes/${id}`,
      reminder: `/api/reminders/${id}`,
      budget: `/api/budget-lines/${id}`,
      pto: `/api/pto/entries/${id}`,
      stay: `/api/stays/${id}`,
    };
    await api(paths[kind], { method: "DELETE" });
    if (kind === "trip") {
      state.trip = null;
      location.hash = "#/";
      if ((location.hash || "#/") === "#/") await render();
      return;
    }
    if (kind === "pto") {
      await render();
      return;
    }
    await refetchTrip();
    return;
  }
  if (action === "lookup-flight") {
    const form = button.closest("form");
    const ident = val(form, "number");
    const departOn = val(form, "lookup_on") || (val(form, "depart_at") || "").slice(0, 10);
    const result = await api("/api/flights/lookup", { method: "POST", body: JSON.stringify({ ident, depart_on: departOn }) });
    state.flights = result.flights;
    renderFlightChoices(form, result.flights);
    return;
  }
  if (action === "use-flight") {
    const form = button.closest("form");
    applyFlight(form, state.flights[Number(button.dataset.index)]);
    const box = form.querySelector("#flight-results");
    if (box) box.innerHTML = `<p class="meta">Filled from FlightAware in airport local time. Review it, then save.</p>`;
    return;
  }
  if (action === "find-place") {
    const form = button.closest("form");
    const query = val(form, "address") || val(form, "lodging_address") || val(form, "place_name") || val(form, "city");
    const result = await api(`/api/places/search?q=${encodeURIComponent(query || "")}`);
    const box = form.querySelector("[data-place-hits]");
    if (!result.results.length) {
      box.innerHTML = `<p class="meta">No match. You can type latitude and longitude instead.</p>`;
      return;
    }
    box.innerHTML = result.results
      .map((hit, index) => `<button class="choice" type="button" data-action="use-place" data-index="${index}" data-lat="${hit.lat}" data-lng="${hit.lng}">${esc(hit.label)}</button>`)
      .join("");
    return;
  }
  if (action === "use-place") {
    const form = button.closest("form");
    if (form.elements.lat) form.elements.lat.value = button.dataset.lat;
    if (form.elements.lng) form.elements.lng.value = button.dataset.lng;
    const address = form.elements.address || form.elements.lodging_address;
    if (address && !address.value) address.value = button.textContent;
    return;
  }
  if (action === "remind-parking") {
    const parking = state.trip.parking.find((item) => item.id === Number(button.dataset.id));
    state.trip = await api(`/api/trips/${state.trip.id}/reminders`, {
      method: "POST",
      body: JSON.stringify({ title: `Book parking${parking && parking.place_name ? ` at ${parking.place_name}` : ""}`, kind: "parking", done: false }),
    });
    paint(renderTrip(state.trip), "home");
    return;
  }
  if (action === "toggle-reminder") {
    const reminder = state.trip.reminders.find((item) => item.id === Number(button.dataset.id));
    state.trip = await api(`/api/reminders/${reminder.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: reminder.title,
        due_at: reminder.due_at,
        done: button.checked,
        kind: reminder.kind,
        notes: reminder.notes,
      }),
    });
    return;
  }
  if (action === "clear-key") {
    await api("/api/settings/flightaware", { method: "DELETE" });
    await render();
    return;
  }
  if (action === "logout") {
    await api("/api/session/logout", { method: "POST" });
    await render();
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("travel-theme", theme);
  const button = document.querySelector("[data-action=theme]");
  if (button) button.textContent = theme === "dark" ? "Light" : "Dark";
}

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
  event.preventDefault();
  const submitButton = form.querySelector("[type=submit]");
  if (submitButton) submitButton.disabled = true;
  onActionSafe(async () => {
    try {
      await submit(form.dataset.form, form);
    } finally {
      if (submitButton && submitButton.isConnected) submitButton.disabled = false;
    }
  });
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.tagName === "A") return;
  if (button.dataset.action === "toggle-reminder") {
    onActionSafe(() => onAction(button));
    return;
  }
  onActionSafe(() => onAction(button));
});

document.addEventListener("change", (event) => {
  if (event.target.name !== "mode") return;
  const form = event.target.closest("form");
  const flight = form && form.querySelector("[data-flight-only]");
  if (flight) flight.hidden = event.target.value !== "flight";
});

async function onActionSafe(work) {
  try {
    await work();
  } catch (error) {
    if (error.status === 401) {
      paint(renderLogin(), parseHash().name);
      return;
    }
    showError(error);
  }
}

const savedTheme = localStorage.getItem("travel-theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
applyTheme(savedTheme || (prefersDark ? "dark" : "light"));
window.addEventListener("hashchange", () => {
  state.edit = null;
  state.compose = "";
  state.error = "";
  state.flights = [];
  render();
});
render();
