import { TestBed } from '@angular/core/testing';
import type { PixelDayView } from './pixels.types';
import { YearTableComponent } from './year-table.component';

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

});

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
