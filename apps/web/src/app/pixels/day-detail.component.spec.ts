import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DayDetailComponent } from './day-detail.component';
import { dayScoreVector } from './pixels-model';
import type { PixelDayFacts, PixelDayView } from './pixels.types';

describe('Day detail', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DayDetailComponent], providers: [provideRouter([])] });
  });

  afterEach(() => {
    document.body.querySelector('app-day-detail')?.remove();
  });

  function render(day: PixelDayView | null, extra: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(DayDetailComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('day', day);
    for (const [key, value] of Object.entries(extra)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('uses the locked copy and the unlock link when Finance is not ready', () => {
    const { el } = render(view({ channels: { town: 1, media: 0, trip: 0, fin: 0 } }), { financeStatus: 'locked' });
    expect(el.textContent).toContain('Finance is locked. Unlock to include budget kept.');
    expect(el.textContent).not.toContain('over budget');
    const href = el.querySelector('a')?.getAttribute('href') ?? '';
    const unlock = [...el.querySelectorAll('a')].find(link => link.getAttribute('href')?.includes('vault/unlock'));
    expect(decodeURIComponent(unlock?.getAttribute('href') ?? '')).toContain('/finance/vault/unlock?next=/pixels');
    expect(href).not.toContain('over');
  });

  it('keeps the score vector when fact counts differ and keeps a failed redate', async () => {
    const day = view();
    const loaded = factsFor(day.date);
    const { fixture, el } = render(day, { facts: loaded, factsStatus: 'ready' });
    await fixture.whenStable();
    fixture.detectChanges();
    const vector = dayScoreVector(day);
    expect(el.querySelector('.day-detail')?.getAttribute('data-score-vector')).toBe(vector);
    const input = el.querySelector('input');
    expect(input).not.toBeNull();
    input!.value = '2026-02-31';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const redated: { conceptId: number; understoodOn: string }[] = [];
    fixture.componentInstance.redate.subscribe(value => { redated.push(value); });
    el.querySelector('form.redate')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(redated).toEqual([{ conceptId: 7, understoodOn: '2026-02-31' }]);
    fixture.componentRef.setInput('annotationError', 'Enter a real date.');
    fixture.componentRef.setInput('facts', { ...loaded, counts: { town: 99 } });
    fixture.detectChanges();
    expect(input!.value).toBe('2026-02-31');
    expect(el.textContent).toContain('Enter a real date.');
    expect(el.querySelector('.day-detail')?.getAttribute('data-score-vector')).toBe(vector);
    fixture.componentRef.setInput('draftEpoch', 1);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('');
    fixture.componentRef.setInput('day', view({ date: '2026-08-16' }));
    const again = el.querySelector('input') as HTMLInputElement;
    again.value = '2026-08-16';
    again.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(again.value).toBe('2026-08-16');
    fixture.componentRef.setInput('day', view({ date: '2026-08-17' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('');
  });

  it('returns focus to the learning heading when the annotation retracts', async () => {
    const loaded = factsFor('2026-08-15');
    const { fixture, el } = render(view(), { facts: loaded, factsStatus: 'ready' });
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentRef.setInput('facts', { ...loaded, annotations: [] });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(el.querySelector('#day-learning-heading'));
  });

  it('disables the annotation actions while a change is in flight and leaves the date editable', () => {
    const { el } = render(view(), { facts: factsFor('2026-08-15'), factsStatus: 'ready', mutating: true });
    const archive = [...el.querySelectorAll('button')].find(button => button.textContent?.includes('Archive'));
    expect(archive?.hasAttribute('disabled')).toBeTrue();
    expect(el.querySelector('input')?.hasAttribute('disabled')).toBeFalse();
  });

});

function factsFor(date: string): PixelDayFacts {
  const row = { status: 'ok' as const, included: 1, total: 1, truncated: false };
  return {
    date,
    facts: [{
      id: 'habit_checkin:1',
      namespace: 'habit_checkin',
      occurrenceId: 1,
      kind: 'checkin',
      date,
      spanStart: null,
      spanEnd: null,
      coverage: 'complete',
      provenance: 'Pixels counts this habit check-in on its civil day.',
      title: 'Read synthetic',
      route: '/town/',
    }],
    annotations: [{
      id: 'world_concept:7',
      conceptId: 7,
      name: 'Synthetic concept',
      understoodOn: date,
      provenance: 'It does not change the Pixels score.',
    }],
    coverage: { town: row, media: row, travel: row, concepts: row },
    differences: [{ id: 'concept-not-score', text: 'It does not change the Pixels score.' }],
    counts: { town: 1 },
  };
}

function view(partial: Partial<PixelDayView> = {}): PixelDayView {
  return {
    date: '2026-08-15',
    score: 1,
    level: 1,
    dominant: 'town',
    trip: null,
    future: false,
    planned: false,
    today: false,
    ...partial,
    channels: { town: 1, media: 0, trip: 0, fin: null, ...partial.channels },
  };
}
