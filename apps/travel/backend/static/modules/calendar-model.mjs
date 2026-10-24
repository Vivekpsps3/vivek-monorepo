/** Calendar names and the suite week grid. Month links stay links. D9 is Sunday, the default inside weekStartsOn(). */
import { weekStartsOn } from "../../shared-browser/week.mjs";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toIso(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function monthMatrix(year, month, startOn = weekStartsOn()) {
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() - startOn + 7) % 7));
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

export function weekdayHeads() {
  const start = weekStartsOn();
  return Array.from({ length: 7 }, (_, index) => {
    const day = (start + index) % 7;
    return { title: WEEKDAYS[day], label: SHORT[day] };
  });
}

export function dayLinkName({ iso, todayIso, day, planCount = 0, tripTitles = [] }) {
  const date = day || new Date(`${iso}T00:00:00`);
  const bits = [`${SHORT[date.getDay()]}, ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`];
  if (iso === todayIso) bits.push("today");
  if (planCount === 1) bits.push("1 plan");
  else if (planCount > 1) bits.push(`${planCount} plans`);
  if (tripTitles.length) bits.push(`in ${tripTitles.join(", ")}`);
  return bits.join(", ");
}

export function barName(trip) {
  const start = new Date(`${trip.start_date}T00:00:00`);
  const end = new Date(`${trip.end_date}T00:00:00`);
  const left = `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()}`;
  const right = `${MONTHS_SHORT[end.getMonth()]} ${end.getDate()}`;
  const range = trip.start_date === trip.end_date ? left : `${left} – ${right}`;
  return `${trip.title}, ${range}`;
}

export function monthName(year, month) {
  return `${MONTHS[month - 1]} ${year}`;
}

export function dayKicker(iso, trip) {
  if (iso === trip.start_date && iso === trip.end_date) return "Leave day";
  if (iso === trip.start_date) return "Leave day";
  if (iso === trip.end_date) return "Return day";
  return "";
}
