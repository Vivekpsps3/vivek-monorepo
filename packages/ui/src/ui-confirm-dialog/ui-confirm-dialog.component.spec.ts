import { Component } from '@angular/core';
import { ComponentFixture,TestBed } from '@angular/core/testing';
import { ConfirmService } from '../confirm.service';
import { UiConfirmDialogComponent } from './ui-confirm-dialog.component';

@Component({
  standalone: true,
  imports: [UiConfirmDialogComponent],
  template: `<ui-confirm-dialog />`,
})
class ConfirmDialogHostComponent {}

describe('UiConfirmDialogComponent (K2)', () => {
  let fixture: ComponentFixture<ConfirmDialogHostComponent>;
  let confirm: ConfirmService;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ConfirmDialogHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(ConfirmDialogHostComponent);
    confirm = TestBed.inject(ConfirmService);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  async function open(): Promise<void> {
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>('.confirm-actions button'));
  }
  function cancelButton(): HTMLButtonElement {
    return buttons().find(b => b.textContent?.trim() === 'Cancel')!;
  }

  it('Cancel has initial focus', async () => {
    void confirm.confirmAction({ title: 'Erase', message: 'Sure?', run: () => Promise.resolve() });
    await open();
    expect(document.activeElement).toBe(cancelButton());
  });

  it('backdrop click does nothing; Esc cancels when idle', async () => {
    const result = confirm.confirmAction({ title: 'Erase', message: 'Sure?', run: () => Promise.resolve() });
    await open();
    host.querySelector<HTMLElement>('.ui-dialog-backdrop')!.click();
    fixture.detectChanges();
    expect(host.querySelector('.ui-dialog-panel')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await expectAsync(result).toBeResolvedTo(false);
    fixture.detectChanges();
    expect(host.querySelector('.ui-dialog-panel')).toBeNull();
  });
});
