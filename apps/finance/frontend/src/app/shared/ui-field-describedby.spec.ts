import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFieldComponent, UiFieldControlDirective } from '@vivek/ui';

@Component({
  standalone: true,
  imports: [UiFieldComponent, UiFieldControlDirective],
  template: `
    <ui-field [hint]="hint" [error]="error">
      <input id="pay" uiFieldControl />
    </ui-field>
  `,
})
class FieldHost {
  hint: string | undefined = 'Shown on statements.';
  error: string | null = 'Enter an amount.';
}

describe('UiFieldComponent describedby', () => {
  let fixture: ComponentFixture<FieldHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FieldHost] }).compileComponents();
    fixture = TestBed.createComponent(FieldHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('points at both the hint and the error, then only the hint', async () => {
    const input = fixture.nativeElement.querySelector('#pay') as HTMLInputElement;
    expect(input.getAttribute('aria-describedby')).toBe('pay-hint pay-error');
    expect(fixture.nativeElement.querySelector('#pay-hint')?.textContent).toContain('Shown on statements.');
    expect(fixture.nativeElement.querySelector('#pay-error')?.textContent).toContain('Enter an amount.');

    fixture.componentInstance.error = null;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(input.getAttribute('aria-describedby')).toBe('pay-hint');
    expect(input.hasAttribute('aria-invalid')).toBeFalse();
  });
});
