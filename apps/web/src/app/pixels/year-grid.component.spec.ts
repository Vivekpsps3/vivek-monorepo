import { TestBed } from '@angular/core/testing';
import { YearGridComponent } from './year-grid.component';
import type { PixelDayView } from './pixels.types';

function day(date: string, extra: Partial<PixelDayView> = {}): PixelDayView {
  return {
    date,
    channels: { town: 1, media: 0, trip: 0, fin: null },
    score: 1,
    level: 1,
    dominant: 'town',
    trip: null,
    future: false,
    planned: false,
    today: false,
    ...extra,
  };
}

describe('Year grid', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [YearGridComponent] });
  });

  function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(YearGridComponent);
    fixture.componentRef.setInput('year', 2026);
    fixture.componentRef.setInput('today', '2026-08-15');
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function press(el: HTMLElement, date: string, key: string): void {
    const cell = el.querySelector<HTMLElement>(`[data-date="${date}"]`);
    expect(cell).not.toBeNull();
    cell!.focus();
    cell!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  it('keeps one tab stop and moves it with the arrow keys', () => {
    const { fixture, el } = render();
    const cells = el.querySelectorAll('[role="gridcell"]');
    expect(cells.length).toBe(365);
    expect(el.querySelectorAll('[role="gridcell"][tabindex="0"]').length).toBe(1);
    expect(el.querySelector('[role="gridcell"][tabindex="0"]')?.getAttribute('data-date')).toBe('2026-08-15');
    cells.forEach(cell => {
      const tab = cell.getAttribute('tabindex');
      expect(tab === '0' || tab === '-1').toBeTrue();
    });
    expect(el.querySelectorAll('.pixel.none[tabindex]').length).toBe(0);
    expect(el.querySelector('.year-grid')!.querySelectorAll('*').length).toBeLessThanOrEqual(400);

    press(el, '2026-08-15', 'ArrowRight');
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('[data-date="2026-08-16"]'));
    expect(el.querySelectorAll('[role="gridcell"][tabindex="0"]').length).toBe(1);

    press(el, '2026-08-16', 'ArrowDown');
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('[data-date="2026-09-16"]'));

    press(el, '2026-01-01', 'ArrowLeft');
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('[data-date="2026-01-01"]'));

    press(el, '2026-08-15', 'Home');
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('[data-date="2026-08-01"]'));

    press(el, '2026-08-01', 'End');
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('[data-date="2026-08-31"]'));

    press(el, '2026-08-15', 'PageDown');
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('[data-date="2026-09-15"]'));

    press(el, '2026-08-15', 'PageUp');
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('[data-date="2026-07-15"]'));
  });

  it('includes leap day 2024-02-29 and omits 2100-02-29', () => {
    const leap = render({ year: 2024, today: '2024-01-31' });
    expect(leap.el.querySelectorAll('[role="gridcell"]').length).toBe(366);
    expect(leap.el.querySelector('[data-date="2024-02-29"]')?.tagName).toBe('BUTTON');
    press(leap.el, '2024-01-31', 'ArrowDown');
    leap.fixture.detectChanges();
    expect(document.activeElement).toBe(leap.el.querySelector('[data-date="2024-02-29"]'));

    const common = render({ year: 2100, today: '2100-01-31' });
    expect(common.el.querySelector('[data-date="2100-02-29"]')).toBeNull();
    const missing = common.el.querySelector('[data-month="2"][data-day="29"]');
    expect(missing?.tagName).toBe('DIV');
    expect(missing?.classList.contains('none')).toBeTrue();
    expect(common.el.querySelectorAll('button.none').length).toBe(0);
    press(common.el, '2100-01-31', 'ArrowDown');
    common.fixture.detectChanges();
    expect(document.activeElement).toBe(common.el.querySelector('[data-date="2100-02-28"]'));
  });

  it('moves by month when the phone grid is days-by-month', () => {
    const { fixture, el } = render({ phone: true });
    const feb = el.querySelector<HTMLElement>('[data-date="2026-02-01"]');
    expect(feb?.style.gridColumn).toBe('2');
    expect(feb?.style.gridRow).toBe('1');
    press(el, '2026-08-15', 'ArrowRight');
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('[data-date="2026-09-15"]'));
    press(el, '2026-08-15', 'ArrowDown');
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('[data-date="2026-08-16"]'));
  });

  it('colours activity by level and app by the dominant class, and keeps the trip dot', () => {
    const trip = { id: 1, title: 'Portland', start: '2026-08-14', end: '2026-08-17' };
    const days = [
      day('2026-01-10', { level: 2, dominant: 'media' }),
      day('2026-08-15', { level: 3, dominant: 'travel', trip, channels: { town: 0, media: 0, trip: 1, fin: null } }),
    ];
    const activity = render({ days, colorBy: 'activity' });
    const level = activity.el.querySelector('[data-date="2026-01-10"]');
    expect(level?.classList.contains('l2')).toBeTrue();
    expect(level?.className).not.toContain('app-');
    const traveled = activity.el.querySelector('[data-date="2026-08-15"]');
    expect(traveled?.classList.contains('trip')).toBeTrue();
    expect(traveled?.classList.contains('l3')).toBeTrue();

    const apps = render({ days, colorBy: 'app', selected: '2026-01-10' });
    const media = apps.el.querySelector('[data-date="2026-01-10"]');
    expect(media?.classList.contains('app-media')).toBeTrue();
    expect(media?.classList.contains('l2')).toBeFalse();
    expect(media?.id).toBe('pixel-day-2026-01-10');
    expect(media?.classList.contains('selected')).toBeTrue();
    expect(apps.el.querySelector('[data-date="2026-08-15"]')?.classList.contains('app-travel')).toBeTrue();
    expect(apps.el.querySelector('[data-date="2026-08-15"]')?.classList.contains('trip')).toBeTrue();
  });
});
