import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiDataTableComponent } from '@vivek/ui';

@Component({
  standalone: true,
  imports: [UiDataTableComponent],
  template: `<ui-data-table><thead><tr><th>Old heading</th></tr></thead><tbody><tr><td>Value</td></tr></tbody></ui-data-table>`,
})
class DataTableHostComponent {}

describe('UiDataTableComponent responsive labels', () => {
  let fixture: ComponentFixture<DataTableHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataTableHostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(DataTableHostComponent);
    fixture.detectChanges();
  });

  it('updates cell labels when a header text node changes', async () => {
    const host: HTMLElement = fixture.nativeElement;
    const heading = host.querySelector('thead th')!;
    const value = host.querySelector('tbody td')!;
    expect(value.getAttribute('data-label')).toBe('Old heading');

    heading.firstChild!.textContent = 'Renamed heading';
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(value.getAttribute('data-label')).toBe('Renamed heading');
  });
});
