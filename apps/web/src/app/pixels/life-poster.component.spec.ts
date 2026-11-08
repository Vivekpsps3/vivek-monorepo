import { TestBed } from '@angular/core/testing';
import { lifePosterMetrics, lifeSelectionRect, type LifeWeekCell } from './life-model';
import { LifePosterComponent } from './life-poster.component';

describe('Life poster', () => {
  function cell(partial: Partial<LifeWeekCell> & Pick<LifeWeekCell, 'row' | 'week' | 'kind'>): LifeWeekCell {
    return {
      start: '1990-05-04',
      end: '1990-05-10',
      score: 0,
      level: 0,
      trip: false,
      planned: false,
      now: false,
      tripTitle: null,
      town: 0,
      media: 0,
      travel: 0,
      financeKept: 0,
      financeKnown: false,
      activities: 0,
      ...partial,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LifePosterComponent] });
  });

  it('shares level paths and keeps them when the selection rect moves', () => {
    const fixture = TestBed.createComponent(LifePosterComponent);
    fixture.componentRef.setInput('weeks', [
      cell({ row: 0, week: 1, kind: 'lived' }),
      cell({ row: 0, week: 2, kind: 'l2', level: 2, now: true }),
      cell({ row: 1, week: 1, kind: 'future' }),
    ]);
    fixture.componentRef.setInput('metrics', lifePosterMetrics('lg'));
    fixture.componentRef.setInput('birthday', '1990-05-04');
    fixture.componentRef.setInput('showAge', false);
    fixture.componentRef.setInput('rowCount', 90);
    fixture.componentRef.setInput('now', { row: 0, week: 2 });
    fixture.componentRef.setInput('selected', { row: 0, week: 2 });
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
    const shapes = svg.querySelectorAll('path, rect');
    expect(shapes.length).toBeLessThanOrEqual(10);
    expect(svg.querySelectorAll('path').length).toBe(3);
    const before = [...svg.querySelectorAll('path')].map(path => path.getAttribute('d'));
    expect(before[0]?.split('M').length).toBe(2);
    expect(svg.textContent).toContain('1990');
    expect(svg.textContent).not.toContain('1990-05-04');
    expect(svg.textContent).toContain('◂ Now');

    fixture.componentRef.setInput('selected', { row: 0, week: 1 });
    fixture.detectChanges();
    expect([...svg.querySelectorAll('path')].map(path => path.getAttribute('d'))).toEqual(before);
    const cursor = svg.querySelector('.life-selection');
    const rect = lifeSelectionRect(lifePosterMetrics('lg'), 0, 1);
    expect(cursor?.getAttribute('x')).toBe(String(rect.x));
    expect(svg.querySelectorAll('path, rect').length).toBeLessThanOrEqual(10);
  });
});
