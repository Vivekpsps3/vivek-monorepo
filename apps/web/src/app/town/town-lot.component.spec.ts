import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TownLotComponent } from './town-lot.component';
import type { Habit } from './town.types';

describe('Town tiles', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [TownLotComponent], providers: [provideRouter([])] }));
  function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(TownLotComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  it('links passive buildings and labels unavailable sources without a false level', () => {
    for (const [kind, source, link] of [['library', 'Media', '/media'], ['inn', 'Travel', '/travel']]) {
      const { fixture, el } = render({ kind, building: { level: 4, stage: 3, source: 'ok' } });
      expect(el.textContent).toContain(`Lv 4 · ${source}`);
      expect(el.querySelector('a')?.getAttribute('href')).toBe(link);
      expect(el.querySelector('img')?.getAttribute('src')).toBe(`/town/${kind}-3.svg`);
      fixture.componentRef.setInput('building', { level: 1, stage: 1, source: 'unavailable' }); fixture.detectChanges();
      expect(el.textContent).toContain(`Lv — · ${source} unavailable`);
    }
  });
  it('shows no digits in locked Treasury and only a computing skeleton when unlocked', () => {
    const { fixture, el } = render({ kind: 'treasury' });
    expect(el.textContent).toContain('Locked · Unlock');
    expect(el.textContent).not.toMatch(/\d/);
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/finance/vault/unlock?next=%2Ftown');
    fixture.componentRef.setInput('vaultPresent', true); fixture.detectChanges();
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/finance');
    expect(el.querySelector('ui-skeleton')).not.toBeNull();
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/town/treasury-locked.svg');
  });
  it('keeps locked lots non-focusable', () => {
    const { el } = render({ lot: { state: 'locked', unlock_level: 5 } });
    expect(el.querySelector('.tile')?.tagName).toBe('DIV');
    expect(el.querySelector('a, button, [tabindex]')).toBeNull();
    expect(el.textContent).toContain('Unlocks at Lv 5');
  });
  it('emits creation from an empty lot', () => {
    const { fixture, el } = render({ lot: { state: 'empty' } });
    const open = jasmine.createSpy(); fixture.componentInstance.openHabit.subscribe(open);
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Build here');
  });
  it('renders full habit names safely with daily/weekly streaks and keeps occupied lots interactive', () => {
    const name = '<img src=x onerror=alert(1)> read pages';
    const habit = { name, level: 2, stage: 2, building_style: 'forge', streak: { current: 3, unit: 'days' } } as Habit;
    const { fixture, el } = render({ lot: { state: 'occupied', unlock_level: 9 }, habit });
    expect(el.querySelector('button')).not.toBeNull();
    expect(el.querySelector('.name')?.getAttribute('title')).toBe(name);
    expect(el.querySelectorAll('img').length).toBe(1);
    expect(el.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(el.textContent).toContain('Lv 2 · 3-day streak');
    expect(getComputedStyle(el.querySelector('.name')!).textOverflow).toBe('ellipsis');
    fixture.componentRef.setInput('habit', { ...habit, streak: { current: 2, unit: 'weeks' } }); fixture.detectChanges();
    expect(el.textContent).toContain('Lv 2 · 2-week streak');
    const open = jasmine.createSpy(); fixture.componentInstance.openHabit.subscribe(open);
    el.querySelector<HTMLButtonElement>('button')!.click(); expect(open).toHaveBeenCalledTimes(1);
  });
  it('stacks the old sprite for 240ms and skips it under reduced motion', fakeAsync(() => {
    const habit = { name: 'Read', level: 2, stage: 2, building_style: 'forge', streak: { current: 1, unit: 'days' } } as Habit;
    const { fixture, el } = render({ lot: { state: 'occupied' }, habit, swapFrom: 1 });
    expect(el.querySelector('.swap')).not.toBeNull();
    expect(el.querySelectorAll('img').length).toBe(2);
    expect(el.querySelector('img.old')?.getAttribute('src')).toBe('/town/forge-1.svg');
    expect(el.querySelector('img.new')?.getAttribute('src')).toBe('/town/forge-2.svg');
    tick(240); fixture.detectChanges();
    expect(el.querySelectorAll('img').length).toBe(1);
    expect(el.querySelector('.swap')).toBeNull();
    fixture.destroy();
  }));
  it('renders only the new sprite when motion is reduced', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    const habit = { name: 'Read', level: 2, stage: 2, building_style: 'forge', streak: { current: 1, unit: 'days' } } as Habit;
    const { el } = render({ lot: { state: 'occupied' }, habit, swapFrom: 1 });
    expect(el.querySelectorAll('img').length).toBe(1);
    expect(el.querySelector('.swap')).toBeNull();
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/town/forge-2.svg');
  });
});
