import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { dayActivities } from '@vivek/ui';
import { DayDetailComponent } from './day-detail.component';
import type { PixelDayView, TripSpan } from './pixels.types';

const PORTLAND: TripSpan = { id: 9, title: 'Portland', start: '2026-08-14', end: '2026-08-17' };

describe('Day detail', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DayDetailComponent], providers: [provideRouter([])] });
  });

  afterEach(() => {
    document.body.querySelector('app-day-detail')?.remove();
  });

  function render(day: PixelDayView | null, extra: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(DayDetailComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('day', day);
    for (const [key, value] of Object.entries(extra)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('labels the Portland trip day 2 of 4 on the 15th, and the other days in the span', () => {
    const expected: Record<string, string> = {
      '2026-08-14': 'Travel · Portland, day 1 of 4',
      '2026-08-15': 'Travel · Portland, day 2 of 4',
      '2026-08-16': 'Travel · Portland, day 3 of 4',
      '2026-08-17': 'Travel · Portland, day 4 of 4',
    };
    for (const [date, label] of Object.entries(expected)) {
      const day = view({ date, trip: PORTLAND, channels: { town: 2, media: 1, trip: 1, fin: null } });
      const { fixture, el } = render(day, { financeStatus: 'ready', today: '2026-10-29' });
      expect(el.textContent).toContain(label);
      expect(el.querySelector('h2')?.textContent?.trim()).toBe(headingFor(date));
      expect(el.textContent).toContain(`Level ${day.level} of 4`);
      expect(el.textContent).toContain(`${dayActivities(day.channels)} activities`);
      expect(el.textContent).toContain('Town · 2 check-ins');
      expect(el.textContent).toContain('Media · 1 episode watched');
      expect(el.querySelector('a[href="/travel/trips/9"]')).not.toBeNull();
      expect(el.querySelector('[role="dialog"]')).toBeNull();
      fixture.destroy();
    }
  });

  it('says a trip is absent and links Town and Media', () => {
    const { el } = render(view({ date: '2026-01-10', channels: { town: 0, media: 0, trip: 0, fin: null } }));
    expect(el.textContent).toContain('Town · none');
    expect(el.textContent).toContain('Media · none');
    expect(el.textContent).toContain('Travel · no trip');
    expect(el.textContent).not.toContain('Open trip');
    const town = [...el.querySelectorAll('a')].find(anchor => anchor.textContent?.trim() === 'Open Town');
    const media = [...el.querySelectorAll('a')].find(anchor => anchor.textContent?.trim() === 'Open Media');
    expect(town?.getAttribute('href')).toBe('/town');
    expect(media?.getAttribute('href')).toBe('/media');
  });

  it('uses the locked copy and the unlock link when Finance is not ready', () => {
    const { el } = render(view({ channels: { town: 1, media: 0, trip: 0, fin: 0 } }), { financeStatus: 'locked' });
    expect(el.textContent).toContain('Finance is locked. Unlock to include budget kept.');
    expect(el.textContent).not.toContain('over budget');
    const href = el.querySelector('a')?.getAttribute('href') ?? '';
    const unlock = [...el.querySelectorAll('a')].find(link => link.getAttribute('href')?.includes('vault/unlock'));
    expect(decodeURIComponent(unlock?.getAttribute('href') ?? '')).toContain('/finance/vault/unlock?next=/pixels');
    expect(href).not.toContain('over');
  });

  it('does not call a ready day before the first transaction over budget', () => {
    const { el } = render(view({ channels: { town: 1, media: 0, trip: 0, fin: null } }), { financeStatus: 'ready' });
    expect(el.textContent).toContain('Finance · the budget is not in this day');
    expect(el.textContent).not.toContain('over budget');
    expect(el.textContent).not.toContain('Finance is locked');
  });

  it('names budget kept and over pace only for a ready boolean', () => {
    const kept = render(view({ channels: { town: 0, media: 0, trip: 0, fin: 1 } }), { financeStatus: 'ready' });
    expect(kept.el.textContent).toContain('Finance · budget kept');
    kept.fixture.destroy();
    const over = render(view({ channels: { town: 0, media: 0, trip: 0, fin: 0 } }), { financeStatus: 'ready' });
    expect(over.el.textContent).toContain('Finance · over budget pace');
    over.fixture.destroy();
    const guessed = render(view({ channels: { town: 0, media: 0, trip: 0, fin: 0 } }), { financeStatus: 'no_data' });
    expect(guessed.el.textContent).not.toContain('over budget');
    expect(guessed.el.textContent).toContain('Finance · no data');
    expect(guessed.el.textContent).not.toContain('Finance is locked');
    expect(guessed.el.querySelector('a[href*="vault/unlock"]')).toBeNull();
  });

  it('emits closed on Escape and does not guess a close when no day is open', () => {
    const { fixture, el } = render(view());
    const closed = jasmine.createSpy('closed');
    fixture.componentInstance.closed.subscribe(closed);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toHaveBeenCalledTimes(1);
    el.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(closed).toHaveBeenCalledTimes(2);
    fixture.destroy();

    const empty = render(null);
    const ignored = jasmine.createSpy('ignored');
    empty.fixture.componentInstance.closed.subscribe(ignored);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ignored).not.toHaveBeenCalled();
  });

  it('opens a dialog sheet on a phone and focuses Close', () => {
    const { el } = render(view({ date: '2026-08-15', trip: PORTLAND }), { phone: true });
    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.textContent).toContain('Travel · Portland, day 2 of 4');
    expect(document.activeElement).toBe(el.querySelector('[data-day-close]'));
  });
});

function headingFor(iso: string): string {
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const weekday = weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${months[month - 1]} ${day}, ${year}`;
}

function view(partial: Partial<PixelDayView> = {}): PixelDayView {
  return {
    date: '2026-08-15',
    score: 1,
    level: 1,
    dominant: 'town',
    trip: null,
    future: false,
    planned: false,
    today: false,
    ...partial,
    channels: { town: 1, media: 0, trip: 0, fin: null, ...partial.channels },
  };
}
