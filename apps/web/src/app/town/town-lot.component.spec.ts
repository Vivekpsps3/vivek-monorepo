import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TownLotComponent } from './town-lot.component';

describe('Town tiles', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [TownLotComponent], providers: [provideRouter([])] }));
  function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(TownLotComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('explains a locked Finance vault, then shows the budget-week tier once it is open', () => {
    const { fixture, el } = render({ kind: 'treasury' });
    expect(el.textContent).toContain('Finance vault locked');
    expect(el.textContent).not.toMatch(/\d/);
    expect(el.textContent).not.toMatch(/\$/);
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/finance/vault/unlock?next=%2Ftown');
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/town/treasury-locked.svg');
    expect(el.querySelector('ui-skeleton')).toBeNull();
    // 2 kept budget weeks is treasury tier 3 and sprite stage 2. Town level is not involved.
    fixture.componentRef.setInput('vaultPresent', true);
    fixture.componentRef.setInput('treasury', { status: 'ready', run: 2, saturated: false, tier: 3, stage: 2 });
    fixture.detectChanges();
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/finance');
    expect(el.querySelector('ui-skeleton')).toBeNull();
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/town/treasury-2.svg');
    expect(el.textContent).toContain('Lv 3');
    expect(el.textContent).toContain('2 weeks');
    expect(el.textContent).not.toContain('Finance vault locked');
    expect(el.textContent).not.toMatch(/\$/);
    fixture.componentRef.setInput('treasury', { status: 'ready', run: 4, saturated: false, tier: 4, stage: 3 });
    fixture.detectChanges();
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/town/treasury-3.svg');
    expect(el.textContent).toContain('Lv 4');
    fixture.componentRef.setInput('treasury', { status: 'ready', run: 52, saturated: true, tier: 5, stage: 3 });
    fixture.detectChanges();
    expect(el.textContent).toContain('Lv 5 · 52+ weeks');
    fixture.componentRef.setInput('treasury', { status: 'no_plan' });
    fixture.detectChanges();
    expect(el.textContent).toContain('No spending plan');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/finance/planning');
    expect(el.textContent).not.toMatch(/Lv \d/);
    fixture.componentRef.setInput('treasury', { status: 'no_data' });
    fixture.detectChanges();
    expect(el.textContent).toContain('No budget data');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/finance/spending');
    fixture.componentRef.setInput('treasury', { status: 'unavailable' });
    fixture.detectChanges();
    expect(el.querySelector('ui-skeleton')).toBeNull();
    expect(el.textContent).toContain('Unavailable');
    expect(el.textContent).not.toMatch(/Lv \d/);
    expect(el.querySelector('img')?.getAttribute('src')).not.toBe('/town/treasury-locked.svg');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/finance');
    fixture.componentRef.setInput('vaultPresent', false);
    fixture.componentRef.setInput('treasury', { status: 'ready', run: 8, saturated: false, tier: 5, stage: 3 });
    fixture.detectChanges();
    expect(el.textContent).toContain('Finance vault locked');
    expect(el.textContent).not.toContain('Lv 5');
  });
  it('keeps locked lots non-focusable', () => {
    const { el } = render({ lot: { state: 'locked', unlock_level: 5 } });
    expect(el.querySelector('.tile')?.tagName).toBe('DIV');
    expect(el.querySelector('a, button, [tabindex]')).toBeNull();
    expect(el.textContent).toContain('Unlocks at Lv 5');
  });

});
