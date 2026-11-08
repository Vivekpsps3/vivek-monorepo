import { TestBed } from '@angular/core/testing';
import { readColorBy } from './pixels-preferences';
import { ColorByToggleComponent } from './color-by-toggle.component';

describe('Colour toggle', () => {
  beforeEach(() => {
    localStorage.removeItem('pixels.colorBy');
    TestBed.configureTestingModule({ imports: [ColorByToggleComponent] });
  });

  afterEach(() => {
    localStorage.removeItem('pixels.colorBy');
  });

  it('defaults to activity and writes pixels.colorBy for a new read', () => {
    const fixture = TestBed.createComponent(ColorByToggleComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Colour');
    expect(checked(root)).toBe('Activity');

    button(root, 'By app').click();
    fixture.detectChanges();
    expect(localStorage.getItem('pixels.colorBy')).toBe('app');
    expect(readColorBy()).toBe('app');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ColorByToggleComponent] });
    const again = TestBed.createComponent(ColorByToggleComponent);
    again.detectChanges();
    expect(checked(again.nativeElement as HTMLElement)).toBe('By app');
    expect(readColorBy()).toBe('app');
  });
});

function checked(root: HTMLElement): string {
  return root.querySelector('[aria-checked="true"]')?.textContent?.trim() ?? '';
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(item => item.textContent?.trim() === label);
  if (!found) throw new Error(`missing ${label}`);
  return found;
}
