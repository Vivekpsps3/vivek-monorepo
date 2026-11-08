import { TestBed } from '@angular/core/testing';
import { PixelsLegendComponent } from './pixels-legend.component';

describe('Pixels legend', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PixelsLegendComponent] });
  });

  function render(colorBy: 'activity' | 'app') {
    const fixture = TestBed.createComponent(PixelsLegendComponent);
    fixture.componentRef.setInput('colorBy', colorBy);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the activity ramp, trip, plan, and future in words', () => {
    const el = render('activity');
    expect(el.textContent).toContain('Less');
    expect(el.textContent).toContain('More');
    expect(el.textContent).toContain('Trip day');
    expect(el.textContent).toContain('Planned trip');
    expect(el.textContent).toContain('Future');
    expect(el.querySelector('.pixel.trip')).not.toBeNull();
    expect(el.querySelector('.pixel.plan')).not.toBeNull();
    expect(el.querySelector('.pixel.future')).not.toBeNull();
    expect(el.querySelectorAll('.pixel.l1, .pixel.l2, .pixel.l3, .pixel.l4').length).toBe(4);
  });

  it('names each app and says what the square means', () => {
    const el = render('app');
    expect(el.textContent).toContain('Town');
    expect(el.textContent).toContain('Media');
    expect(el.textContent).toContain('Travel');
    expect(el.textContent).toContain('Finance');
    expect(el.textContent).toContain('Square shows the app with the most points that day.');
    expect(el.querySelector('.app-town')).not.toBeNull();
    expect(el.querySelector('.app-media')).not.toBeNull();
    expect(el.querySelector('.app-travel')).not.toBeNull();
    expect(el.querySelector('.app-finance')).not.toBeNull();
  });
});
