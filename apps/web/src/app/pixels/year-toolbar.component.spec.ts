import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PixelsPreferences } from './pixels-preferences';
import { YearToolbarComponent } from './year-toolbar.component';

describe('Year toolbar', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [YearToolbarComponent],
      providers: [provideRouter([])],
    });
  });

  function render(financeStatus: string | null = null) {
    const fixture = TestBed.createComponent(YearToolbarComponent);
    fixture.componentRef.setInput('year', 2026);
    fixture.componentRef.setInput('financeStatus', financeStatus);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('names the year controls and switches the view', () => {
    const { fixture, el } = render();
    expect(el.querySelector('[aria-label="Previous year"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Next year"]')).not.toBeNull();
    expect(el.querySelector('h2')?.textContent?.trim()).toBe('2026');
    const view = [...el.querySelectorAll('button')].find(button => button.textContent?.includes('View as table'));
    expect(view).toBeDefined();
    view!.click();
    fixture.detectChanges();
    expect(TestBed.inject(PixelsPreferences).view()).toBe('table');
    expect(el.textContent).toContain('View as grid');
  });

  it('links to the vault only while Finance is locked', () => {
    const { fixture, el } = render('locked');
    const link = el.querySelector('a');
    expect(link?.textContent?.trim()).toBe('Finance locked · Unlock');
    expect(link?.getAttribute('href')).toBe('/finance/vault/unlock?next=%2Fpixels');
    fixture.componentRef.setInput('financeStatus', 'ready');
    fixture.detectChanges();
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).not.toContain('Finance locked');
  });
});
