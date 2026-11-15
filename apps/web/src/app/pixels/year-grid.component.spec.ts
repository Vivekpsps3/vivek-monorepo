import { TestBed } from '@angular/core/testing';
import { YearGridComponent } from './year-grid.component';

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

});
