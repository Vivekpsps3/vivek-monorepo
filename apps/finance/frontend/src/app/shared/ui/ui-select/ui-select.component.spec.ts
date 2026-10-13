import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiSelectComponent, UiSelectOption } from './ui-select.component';

@Component({
  standalone: true,
  imports: [UiSelectComponent],
  template: '<ui-select [value]="value" [options]="options" (valueChange)="onValueChange($event)" />',
})
class TestHostComponent {
  value = 'card-a';
  options: UiSelectOption[] = [];
  emittedValue = '';

  onValueChange(value: string): void {
    this.emittedValue = value;
    this.value = value;
  }
}

describe('UiSelectComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(TestHostComponent);
  });

  it('selects a value that was set before its matching option arrived and preserves valueChange', () => {
    fixture.detectChanges();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(select.value).toBe('');

    fixture.componentInstance.options = [
      { value: 'card-a', label: 'Card A' },
      { value: 'card-b', label: 'Card B' },
    ];
    fixture.detectChanges();

    expect(select.value).toBe('card-a');
    expect(fixture.componentInstance.value).toBe('card-a');

    select.value = 'card-b';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.value).toBe('card-b');
    expect(fixture.componentInstance.emittedValue).toBe('card-b');
  });
});
