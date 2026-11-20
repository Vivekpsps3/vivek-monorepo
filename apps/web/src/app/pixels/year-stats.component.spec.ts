import { TestBed } from '@angular/core/testing';
import type { FinanceJoinStatus } from './pixels.types';
import { YearStatsComponent } from './year-stats.component';

describe('Year stats', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [YearStatsComponent] });
  });

  function render(budgetKept: number | null, financeStatus: FinanceJoinStatus) {
    const fixture = TestBed.createComponent(YearStatsComponent);
    fixture.componentRef.setInput('stats', { active: 4, longestRun: 2, tripDays: 3, budgetKept });
    fixture.componentRef.setInput('financeStatus', financeStatus);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows a lock instead of a kept count when Finance is locked', () => {
    const el = render(null, 'locked');
    expect(el.textContent).toContain('Active days');
    expect(el.textContent).toContain('Longest run');
    expect(el.textContent).toContain('Trip days');
    expect(el.textContent).toContain('Budget kept');
    const kept = el.querySelector('[data-stat="budget-kept"]');
    expect(kept?.textContent ?? '').not.toMatch(/\d/);
    expect(kept?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Finance locked');
    expect(el.querySelector('[data-stat="active"]')?.textContent?.trim()).toBe('4');
  });

  it('names an absent plan, an empty range, and a failed join differently', () => {
    const plan = render(null, 'no_plan');
    const planKept = plan.querySelector('[data-stat="budget-kept"]');
    expect(planKept?.textContent).toContain('no plan');
    expect(planKept?.textContent).not.toContain('no data');
    expect(planKept?.querySelector('[role="img"]')).toBeNull();
    expect(plan.textContent).not.toContain('Finance locked');

    const empty = render(null, 'no_data');
    expect(empty.querySelector('[data-stat="budget-kept"]')?.textContent).toContain('none');

    const failed = render(null, 'unavailable');
    const failedKept = failed.querySelector('[data-stat="budget-kept"]');
    expect(failedKept?.textContent).toContain('unavailable');
    expect(failedKept?.textContent).not.toContain('no data');
    expect(failed.querySelector('[data-stat="budget-kept"]')?.textContent).not.toMatch(/\d/);
  });

});
