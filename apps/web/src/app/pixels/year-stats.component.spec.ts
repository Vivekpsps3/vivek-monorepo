import { TestBed } from '@angular/core/testing';
import { YearStatsComponent } from './year-stats.component';

describe('Year stats', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [YearStatsComponent] });
  });

  function render(budgetKept: number | null) {
    const fixture = TestBed.createComponent(YearStatsComponent);
    fixture.componentRef.setInput('stats', { active: 4, longestRun: 2, tripDays: 3, budgetKept });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows a lock instead of a kept count when Finance is not ready', () => {
    const el = render(null);
    expect(el.textContent).toContain('Active days');
    expect(el.textContent).toContain('Longest run');
    expect(el.textContent).toContain('Trip days');
    expect(el.textContent).toContain('Budget kept');
    const kept = el.querySelector('[data-stat="budget-kept"]');
    expect(kept?.textContent ?? '').not.toMatch(/\d/);
    expect(kept?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Finance locked');
    expect(el.querySelector('[data-stat="active"]')?.textContent?.trim()).toBe('4');
  });

  it('shows the kept count when Finance is ready', () => {
    const el = render(0);
    expect(el.querySelector('[data-stat="budget-kept"]')?.textContent?.trim()).toBe('0');
    expect(el.querySelector('[role="img"]')).toBeNull();
  });
});
