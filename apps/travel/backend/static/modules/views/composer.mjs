import { api } from '../api.mjs';
import { fail, saved } from '../feedback.mjs';

const COLORS = ['var(--accent)', '#c4a574', '#7d9a78', '#8d7ea8', '#c47c6a'];

function iso(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(value, count) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + count);
  return iso(date);
}

function monthLabel(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function escapeAttr(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

export function mountComposer() {
  const root = document.querySelector('#trip-composer');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';
  const today = new Date();
  const state = {
    anchor: new Date(today.getFullYear(), today.getMonth(), 1),
    origin: '',
    start: '',
    end: '',
    splits: [],
    cities: {},
    pto: true,
    dragging: false,
  };

  root.addEventListener('pointerdown', (event) => {
    const day = event.target.closest('[data-day]');
    if (!day || event.button !== 0 || event.target.closest('input, button[data-shift], button[data-pto], button[data-save]')) return;
    const value = day.dataset.day;
    if (state.start && value > state.start && value < state.end) return;
    state.dragging = true;
    state.origin = value;
    state.start = value;
    state.end = value;
    state.splits = [];
    apply();
  });
  root.addEventListener('pointerover', (event) => {
    if (!state.dragging) return;
    const day = event.target.closest('[data-day]');
    if (!day) return;
    const value = day.dataset.day;
    state.start = state.origin < value ? state.origin : value;
    state.end = state.origin < value ? value : state.origin;
    apply();
  });
  window.addEventListener('pointerup', () => { state.dragging = false; });
  root.addEventListener('dblclick', (event) => {
    const day = event.target.closest('[data-day]');
    if (!day || !state.start) return;
    const value = day.dataset.day;
    if (value <= state.start || value > state.end) return;
    state.splits = state.splits.includes(value)
      ? state.splits.filter((split) => split !== value)
      : [...state.splits, value].sort();
    apply();
  });
  root.addEventListener('input', (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.dataset.cityStart) state.cities[input.dataset.cityStart] = input.value;
  });
  root.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.shift) {
      state.anchor = new Date(state.anchor.getFullYear(), state.anchor.getMonth() + Number(button.dataset.shift), 1);
      draw();
      return;
    }
    if (button.dataset.pto != null) {
      state.pto = !state.pto;
      root.querySelector('[data-pto]')?.classList.toggle('is-on', state.pto);
      root.querySelector('[data-pto]')?.setAttribute('aria-pressed', String(state.pto));
      return;
    }
    if (button.dataset.save != null) await save();
  });

  function segments() {
    if (!state.start || !state.end) return [];
    const cuts = [state.start, ...state.splits.filter((split) => split > state.start && split <= state.end), addDays(state.end, 1)];
    const rows = [];
    for (let index = 0; index < cuts.length - 1; index += 1) rows.push({ arrive: cuts[index], leave: addDays(cuts[index + 1], -1), key: cuts[index] });
    return rows;
  }

  function draw() {
    const months = [0, 1].map((offset) => new Date(state.anchor.getFullYear(), state.anchor.getMonth() + offset, 1));
    root.innerHTML = `
      <div class="composer-bar">
        <button type="button" data-shift="-1" aria-label="Earlier">‹</button>
        <h1></h1>
        <button type="button" data-shift="1" aria-label="Later">›</button>
        <button type="button" class="pto-pip${state.pto ? ' is-on' : ''}" data-pto aria-pressed="${state.pto}" aria-label="Counts as PTO"></button>
        <button type="button" class="btn btn-primary" data-save hidden>Save</button>
      </div>
      <div class="composer-months">${months.map(drawMonth).join('')}</div>
      <div class="composer-cities"></div>
      <p class="composer-error"></p>`;
    apply();
  }

  function drawMonth(monthDate) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const days = [];
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const outside = date.getMonth() !== month ? ' is-out' : '';
      days.push(`<button type="button" class="composer-day${outside}" data-day="${iso(date)}">${date.getDate()}</button>`);
    }
    const heads = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => `<span>${day}</span>`).join('');
    return `<section><h2>${escapeAttr(monthLabel(monthDate))}</h2><div class="composer-dow">${heads}</div><div class="composer-grid">${days.join('')}</div></section>`;
  }

  function apply() {
    const parts = segments();
    root.querySelectorAll('[data-day]').forEach((day) => {
      const value = day.dataset.day;
      const index = parts.findIndex((part) => value >= part.arrive && value <= part.leave);
      day.classList.toggle('is-in', index >= 0);
      day.classList.toggle('is-split', state.splits.includes(value));
      day.style.setProperty('--city', index >= 0 ? COLORS[index % COLORS.length] : '');
    });
    const title = root.querySelector('h1');
    if (title) title.textContent = state.start ? '' : monthLabel(state.anchor);
    const saveButton = root.querySelector('[data-save]');
    if (saveButton) saveButton.hidden = !state.start;
    const box = root.querySelector('.composer-cities');
    if (!box) return;
    const existing = new Map([...box.querySelectorAll('input')].map((input) => [input.dataset.cityStart, input.value]));
    box.innerHTML = parts.map((part, index) => `
      <label class="composer-city" style="--city:${COLORS[index % COLORS.length]}">
        <input data-city-start="${part.key}" value="${escapeAttr(state.cities[part.key] ?? existing.get(part.key) ?? '')}" aria-label="City" placeholder="City" autocomplete="off">
      </label>`).join('');
  }

  async function save() {
    const parts = segments();
    const named = parts.filter((part) => (state.cities[part.key] || '').trim());
    const title = (state.cities[parts[0]?.key] || '').trim() || 'Trip';
    const error = root.querySelector('.composer-error');
    try {
      const trip = await api('/api/trips', {
        method: 'POST',
        body: JSON.stringify({
          title,
          start_date: state.start,
          end_date: state.end,
          status: 'planning',
          counts_as_pto: state.pto,
          stays: named.map((part) => ({ city: state.cities[part.key].trim(), arrive_on: part.arrive, leave_on: part.leave })),
          transports: [],
        }),
      });
      saved("Trip created.");
      location.hash = `#/trips/${trip.id}`;
    } catch (reason) {
      fail(reason, { retry: { key: "composer-save", run: () => save() } });
    }
  }

  draw();
}
