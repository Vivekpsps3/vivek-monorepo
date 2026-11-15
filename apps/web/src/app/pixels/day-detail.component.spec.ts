import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DayDetailComponent } from './day-detail.component';
import type { PixelDayView } from './pixels.types';

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

});

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
