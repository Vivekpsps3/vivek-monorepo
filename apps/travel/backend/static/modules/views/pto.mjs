import { api } from '../api.mjs';
import { esc, banner, daysText } from '../helpers.mjs';

const PERIOD = { weekly: 7, biweekly: 14, semimonthly: 365 / 24, monthly: 365 / 12, yearly: 365 };
const CADENCE = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'yearly'];

function iso(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parse(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

export function renderPto(pto, home) {
  const policy = pto.policy;
  const trips = [...home.in_progress, ...home.upcoming].filter((trip) => trip.counts_as_pto);
  return `${banner()}<section id="pto-board" data-policy="${esc(JSON.stringify(policy))}" data-entries="${esc(JSON.stringify(pto.entries || []))}" data-trips="${esc(JSON.stringify(trips.map((trip) => ({ id: trip.id, title: trip.title, start: trip.start_date, end: trip.end_date, days: trip.pto?.days }))))}"></section>`;
}

export function mountPto() {
  const root = document.querySelector('#pto-board');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';
  const policy = JSON.parse(root.dataset.policy || '{}');
  const entries = JSON.parse(root.dataset.entries || '[]');
  const trips = JSON.parse(root.dataset.trips || '[]');
  const draft = {
    balance: policy.balance_saved || '0',
    asOf: policy.balance_as_of || iso(new Date()),
    amount: policy.accrual_amount || '15',
    cadence: policy.accrual_cadence || 'yearly',
    configured: Boolean(policy.configured),
  };
  let drag = null;

  root.addEventListener('pointerdown', (event) => {
    const cell = event.target.closest('[data-pto-day]');
    if (!cell) return;
    drag = { start: cell.dataset.ptoDay, end: cell.dataset.ptoDay };
    paint(drag, false);
  });
  root.addEventListener('pointerover', (event) => {
    if (!drag) return;
    const cell = event.target.closest('[data-pto-day]');
    if (!cell) return;
    drag.end = cell.dataset.ptoDay;
    paint(drag, false);
  });
  window.addEventListener('pointerup', () => {
    if (drag?.start) root.querySelector('.pto-name')?.focus();
  });
  root.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-cadence]');
    if (!chip) return;
    draft.cadence = chip.dataset.cadence;
    draft.configured = true;
    savePolicy();
  });
  root.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.dataset.field === 'balance') draft.balance = input.value || '0';
    if (input.dataset.field === 'amount') draft.amount = input.value || '0';
    if (input.dataset.field === 'asof') draft.asOf = input.value;
    if (input.dataset.field === 'label') return;
    draft.configured = true;
    savePolicy();
  });
  root.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.dataset.field !== 'label') return;
    const name = input.value.trim();
    if (!name || !drag) return;
    const [start, end] = ordered(drag.start, drag.end);
    await api('/api/pto/entries', {
      method: 'POST',
      body: JSON.stringify({ label: name, start_date: start, end_date: end }),
    });
    location.hash = '#/pto';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  function ordered(a, b) {
    return a <= b ? [a, b] : [b, a];
  }

  function series() {
    const start = parse(draft.asOf);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const begin = start < addDays(today, -14) ? start : addDays(today, -14);
    const days = [];
    let balance = Number(draft.balance) || 0;
    const daily = (Number(draft.amount) || 0) / (PERIOD[draft.cadence] || 365);
    const usage = new Map();
    for (const entry of entries) {
      if (!entry.start_date) continue;
      usage.set(entry.start_date, (usage.get(entry.start_date) || 0) + Number(entry.days || 0));
    }
    for (let cursor = new Date(begin); cursor <= addDays(today, 120); cursor = addDays(cursor, 1)) {
      const key = iso(cursor);
      if (cursor > start) balance += daily;
      if (usage.has(key)) balance -= usage.get(key);
      days.push({ key, balance: Math.max(balance, 0), used: usage.has(key) });
    }
    return days;
  }

  function paint(selection, rebuild = true) {
    const days = series();
    const max = Math.max(...days.map((day) => day.balance), 1);
    const [from, to] = selection?.start ? ordered(selection.start, selection.end) : ['', ''];
    if (rebuild || !root.querySelector('.pto-strip')) {
      const width = 640;
      const height = 160;
      const step = days.length > 1 ? width / (days.length - 1) : width;
      const line = days.map((day, index) => `${index * step},${height - (day.balance / max) * (height - 16)}`).join(' ');
      const cells = days.map((day) => `<button type="button" class="pto-day${day.used ? ' is-used' : ''}" data-pto-day="${day.key}" style="--fill:${Math.round((day.balance / max) * 100)}%" aria-label="${day.key}"></button>`).join('');
      const chips = CADENCE.map((cadence) => `<button type="button" class="cadence${cadence === draft.cadence ? ' is-on' : ''}" data-cadence="${cadence}" aria-pressed="${cadence === draft.cadence}"></button>`).join('');
      const tripMarks = trips.map((trip) => `<a href="#/trips/${trip.id}">${esc(trip.title)} · ${esc(daysText(trip.days))}</a>`).join('');
      root.innerHTML = `
        <div class="pto-figures">
          <input class="pto-balance" data-field="balance" inputmode="decimal" value="${esc(draft.balance)}" aria-label="Balance">
          <input class="pto-asof" data-field="asof" type="date" value="${esc(draft.asOf)}" aria-label="Balance date">
          <input class="pto-amount" data-field="amount" inputmode="decimal" value="${esc(draft.amount)}" aria-label="Accrual">
          <div class="cadence-row" aria-label="Cadence">${chips}</div>
        </div>
        <svg class="pto-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">${line ? `<polyline points="${line}" />` : ''}</svg>
        <div class="pto-strip">${cells}</div>
        <input class="pto-name" data-field="label" aria-label="Name" autocomplete="off" hidden>
        <div class="pto-trips">${tripMarks}</div>`;
    }
    root.querySelectorAll('[data-pto-day]').forEach((cell) => {
      const on = from && cell.dataset.ptoDay >= from && cell.dataset.ptoDay <= to;
      cell.classList.toggle('is-picked', Boolean(on));
    });
    const name = root.querySelector('.pto-name');
    if (name) name.hidden = !from;
  }

  async function savePolicy() {
    if (!draft.asOf) return;
    await api('/api/pto/policy', {
      method: 'PUT',
      body: JSON.stringify({
        balance_days: draft.balance || '0',
        balance_as_of: draft.asOf,
        accrual_amount: draft.amount || '0',
        accrual_unit: 'day',
        accrual_cadence: draft.cadence,
        hours_per_day: '8',
        annual_cap_days: null,
      }),
    });
    policy.configured = true;
    paint(drag);
  }

  paint(null);
}
