import { TestBed } from '@angular/core/testing';
import { YearTableComponent } from './year-table.component';
import type { PixelDayView } from './pixels.types';

describe('Year table', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [YearTableComponent] });
  });

  function render(days: PixelDayView[]) {
    const fixture = TestBed.createComponent(YearTableComponent);
    fixture.componentRef.setInput('days', days);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('emits the date from a click or Enter and leaves null finance blank', () => {
    const { fixture, el } = render([
      view({ date: '2026-08-15', channels: { town: 2, media: 1, trip: 1, fin: null }, dominant: 'town' }),
      view({ date: '2026-08-16', channels: { town: 0, media: 0, trip: 0, fin: 0 }, dominant: null, level: 0 }),
    ]);
    expect(el.querySelector('caption')?.textContent?.trim()).toBe('Year in a table');
    const selected = jasmine.createSpy('selected');
    fixture.componentInstance.selected.subscribe(selected);
    const row = el.querySelector('tbody tr') as HTMLTableRowElement;
    expect(row.tabIndex).toBe(0);
    const cells = [...row.children].map(cell => cell.textContent?.trim());
    expect(cells[6]).toBe('');
    expect(cells).toContain('Town');
    row.click();
    expect(selected).toHaveBeenCalledOnceWith('2026-08-15');
    selected.calls.reset();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(selected).toHaveBeenCalledOnceWith('2026-08-15');
    const second = el.querySelectorAll('tbody tr')[1];
    expect(second?.querySelector('td:nth-child(7)')?.textContent?.trim()).toBe('over budget pace');
  });

  it('keeps real future days in the year and drops invalid and future-only padding', () => {
    const { el } = render([
      view({ date: '2026-08-15' }),
      view({ date: '2026-02-31' }),
      view({ date: '2026-12-31', future: true }),
      view({ date: '2027-01-01', future: true }),
      view({ date: 'not-a-day' }),
    ]);
    expect(dates(el)).toEqual(['2026-08-15', '2026-12-31']);

    const futureYear = render([
      view({ date: '2031-01-01', future: true }),
      view({ date: '2031-01-02', future: true }),
    ]);
    expect(dates(futureYear.el)).toEqual(['2031-01-01', '2031-01-02']);
  });
});

function dates(el: HTMLElement): string[] {
  return [...el.querySelectorAll('time')].map(node => node.getAttribute('datetime') ?? '');
}

function view(partial: Partial<PixelDayView> & Pick<PixelDayView, 'date'>): PixelDayView {
  return {
    score: 0,
    level: 2,
    dominant: null,
    trip: null,
    future: false,
    planned: false,
    today: false,
    ...partial,
    channels: { town: 0, media: 0, trip: 0, fin: null, ...partial.channels },
  };
}
