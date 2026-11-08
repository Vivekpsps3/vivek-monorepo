import { TestBed } from '@angular/core/testing';
import { LifeTableComponent } from './life-table.component';
import type { LifeYearRow } from './life-model';

describe('Life table', () => {
  const years: LifeYearRow[] = [
    { row: 0, label: 'May 1990 – May 1991', activeWeeks: 0, town: 0, media: 0, travel: 0 },
    { row: 36, label: 'May 2026 – May 2027', activeWeeks: 2, town: 4, media: 1, travel: 3 },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LifeTableComponent] });
  });

  it('lists life years without the birthday, and adds age only when asked', () => {
    const fixture = TestBed.createComponent(LifeTableComponent);
    fixture.componentRef.setInput('years', years);
    fixture.componentRef.setInput('showAge', false);
    fixture.componentRef.setInput('showTown', true);
    fixture.componentRef.setInput('selectedRow', 36);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('table')).not.toBeNull();
    expect(el.textContent).toContain('May 1990 – May 1991');
    expect(el.textContent).toContain('Active weeks');
    expect(el.textContent).not.toContain('1990-05-04');
    expect(el.textContent).not.toContain('Age');
    expect(el.querySelector('tr[aria-selected="true"]')?.textContent).toContain('May 2026 – May 2027');

    fixture.componentRef.setInput('showAge', true);
    fixture.detectChanges();
    expect(el.querySelectorAll('th')[0]?.textContent).toBe('Age');
    expect(el.textContent).toContain('36');

    const picked: number[] = [];
    fixture.componentInstance.pick.subscribe(row => picked.push(row));
    el.querySelectorAll('button')[0]!.click();
    expect(picked).toEqual([0]);
  });
});
