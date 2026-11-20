import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { LifeWeekCell } from './life-model';
import { LifeWeekComponent } from './life-week.component';

describe('Life week panel', () => {
  function week(partial: Partial<LifeWeekCell> = {}): LifeWeekCell {
    return {
      row: 36,
      week: 26,
      start: '2026-10-25',
      end: '2026-10-31',
      score: 9,
      level: 2,
      kind: 'l2',
      trip: true,
      planned: false,
      now: true,
      tripTitle: 'Portland',
      town: 2,
      media: 3,
      travel: 4,
      financeKept: 1,
      financeKnown: true,
      activities: 9,
      ...partial,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LifeWeekComponent], providers: [provideRouter([])] });
  });

  it('shows channel totals and the locked finance row until finance is ready', () => {
    const fixture = TestBed.createComponent(LifeWeekComponent);
    fixture.componentRef.setInput('week', week());
    fixture.componentRef.setInput('rowCount', 90);
    fixture.componentRef.setInput('showAge', false);
    fixture.componentRef.setInput('financeStatus', 'locked');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Town · 2 check-ins');
    expect(el.textContent).toContain('Media · 3 episodes');
    expect(el.textContent).toContain('Travel · Portland');
    expect(el.textContent).toContain('Finance is locked. Unlock to include budget kept.');
    expect(el.textContent).not.toContain('1 day kept');
    expect(el.textContent).not.toContain('Age 36');
    expect(el.querySelector('a')?.getAttribute('href')).toContain('/finance/vault/unlock');

    fixture.componentRef.setInput('financeStatus', 'ready');
    fixture.detectChanges();
    expect(el.textContent).toContain('Finance · 1 day kept');
    expect(el.textContent).not.toContain('Finance is locked');

    fixture.componentRef.setInput('financeStatus', 'no_plan');
    fixture.detectChanges();
    expect(el.textContent).toContain('Finance has no budget plan.');
    expect(el.textContent).not.toContain('no data');
    expect(el.textContent).not.toContain('Finance is locked');
    expect(el.querySelector('a[href*="vault/unlock"]')).toBeNull();

    fixture.componentRef.setInput('financeStatus', 'unavailable');
    fixture.detectChanges();
    expect(el.textContent).toContain('Finance is unavailable.');
    expect(el.textContent).not.toContain('no data');
    const dayLink = [...el.querySelectorAll('a')].find(link => link.textContent?.includes('Open '));
    expect(dayLink?.getAttribute('href')).toContain('/pixels/day');
    expect(dayLink?.getAttribute('href')).toContain('date=2026-10-25');
    expect(dayLink?.getAttribute('href')).toContain('span=2026-10-25');
  });

});
