import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { ToastService } from '@vivek/ui';
import { HistoryDialogComponent } from './history-dialog.component';
import { TownApiService, type CheckinResult } from './town.api';
import type { Habit, TownResponse } from './town.types';

function habit(partial: Partial<Habit> & Pick<Habit, 'id' | 'name'>): Habit {
  return {
    slot: 0, building_style: 'forge', cadence: { per_week: 7, kind: 'daily', pending: null },
    created_on: '2026-10-05', archived_on: null, xp: 80, level: 2, stage: 2, level_xp_start: 50, next_level_xp: 150,
    streak: { unit: 'days', current: 3, best: 7, best_days: 7, best_weeks: 0, rest_day_available: true, rest_used_on: null },
    week: null, checked_today: false, checked_yesterday: true, can_check_yesterday: false, last7: [],
    ...partial,
  };
}

function snapshot(): TownResponse {
  const building = { xp: 0, level: 1, stage: 1 as const, level_xp_start: 0, next_level_xp: 50, today_xp: 0, today_cap: 10, source: 'ok' as const };
  const read = habit({ id: 12, name: 'Read 20 pages' });
  const walk = habit({
    id: 15, name: 'Walk 30 minutes', slot: 1, building_style: 'garden',
    cadence: { per_week: 3, kind: 'weekly', pending: null },
    streak: { unit: 'weeks', current: 2, best: 2, best_days: 0, best_weeks: 2, rest_day_available: null, rest_used_on: null },
    week: { done: 2, target: 3 }, checked_yesterday: false, can_check_yesterday: true,
  });
  return {
    town: { name: 'Terraria-on-Sea', founded_on: '2026-10-05', today: '2026-10-29', tz: 'America/Los_Angeles', xp: 340, level: 3, level_xp_start: 250, next_level_xp: 500 },
    buildings: { library: building, inn: building }, lots: [], habits: [read, walk],
    archived: [{ id: 9, name: 'Floss', xp: 120, level: 2, best_days: 9, best_weeks: 0, created_on: '2026-09-01', archived_on: '2026-10-20' }],
    today: { done: 0, total: 2 }, constants_version: 1,
  };
}

describe('History dialog', () => {
  let checks: Subject<{ days: string[] }>;
  let checkin: Subject<CheckinResult>;
  let api: { getCheckins: jasmine.Spy; checkin: jasmine.Spy };

  beforeEach(() => {
    checks = new Subject();
    checkin = new Subject();
    api = {
      getCheckins: jasmine.createSpy().and.callFake(() => checks),
      checkin: jasmine.createSpy().and.callFake(() => checkin),
    };
    TestBed.configureTestingModule({ imports: [HistoryDialogComponent], providers: [{ provide: TownApiService, useValue: api }] });
  });

  it('renders an 8-week table, yesterday only where allowed, and the archived list', () => {
    const toast = spyOn(TestBed.inject(ToastService), 'error');
    const fixture = TestBed.createComponent(HistoryDialogComponent);
    fixture.componentRef.setInput('data', snapshot());
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(api.getCheckins).toHaveBeenCalledWith(12, '2026-10-05', '2026-10-29');
    checks.next({ days: ['2026-10-28'] }); fixture.detectChanges();
    const table = el.querySelector('table')!;
    expect(table.querySelector('caption')?.textContent).toBe('Read 20 pages, last 8 weeks');
    expect([...table.querySelectorAll('thead th')].map(cell => cell.textContent?.trim())).toEqual(['Week', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(table.querySelector('tbody tr')?.querySelectorAll('td').length).toBe(7);
    const hidden = [...table.querySelectorAll('.visually-hidden')].map(node => node.textContent);
    expect(hidden).toContain('done');
    expect(el.textContent).toContain('missed');
    const buttons = [...el.querySelectorAll('button')].map(button => button.textContent?.trim());
    expect(buttons.filter(label => label === 'Mark yesterday').length).toBe(1);
    expect(el.textContent).toContain('Floss');
    expect(el.textContent).toContain('Lv 2 · 120 XP · best 9 days');
    expect(el.textContent).toContain('Archived Tue 20 Oct');
    const many = snapshot();
    many.archived = Array.from({ length: 21 }, (_, index) => ({
      id: index + 1, name: `Old ${index + 1}`, xp: 10, level: 1, best_days: 1, best_weeks: 0,
      created_on: '2026-09-01', archived_on: '2026-10-20',
    }));
    fixture.componentRef.setInput('data', many); fixture.detectChanges();
    expect(el.textContent).toContain('Old 1');
    expect(el.textContent).not.toContain('Old 21');
    [...el.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Next')!.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Old 21');
    expect(el.textContent).not.toContain('Old 1');
    const dirty = jasmine.createSpy();
    fixture.componentInstance.dirty.subscribe(dirty);
    [...el.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Mark yesterday')!.click();
    expect(api.checkin).toHaveBeenCalledWith(15, '2026-10-28');
    checkin.error({ error: { code: 'checkin_locked', message: 'Only today\'s check-in can be undone.' } });
    expect(toast).toHaveBeenCalledWith('Only today\'s check-in can be undone.');
    checkin = new Subject();
    [...el.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Mark yesterday')!.click();
    checkin.next({} as CheckinResult); fixture.detectChanges();
    expect(dirty).toHaveBeenCalled();
  });
});
