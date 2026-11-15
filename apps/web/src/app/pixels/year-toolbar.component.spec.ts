import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
