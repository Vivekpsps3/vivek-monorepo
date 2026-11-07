import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmService } from '../confirm.service';
import { UiConfirmDialogComponent } from './ui-confirm-dialog.component';

@Component({
  standalone: true,
  imports: [UiConfirmDialogComponent],
  template: `<ui-confirm-dialog />`,
})
class ConfirmDialogHostComponent {}

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
  function confirmButton(): HTMLButtonElement {
    return buttons().find(b => b !== cancelButton())!;
  }
  function phraseField(): HTMLInputElement {
    return host.querySelector<HTMLInputElement>('#confirm-phrase-field')!;
  }
  function typePhrase(text: string): void {
    const field = phraseField();
    field.value = text;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('Cancel has initial focus', async () => {
    void confirm.confirmAction({ title: 'Erase', message: 'Sure?', run: () => Promise.resolve() });
    await open();
    expect(document.activeElement).toBe(cancelButton());
  });

  it('typed: confirm is aria-disabled with the helper until the exact phrase is typed', async () => {
    void confirm.confirmAction({
      title: 'Erase',
      message: 'Sure?',
      phrase: 'RESET member',
      run: () => Promise.resolve(),
    });
    await open();
    expect(host.querySelector('#confirm-phrase-helper')?.textContent).toContain('matches exactly');
    expect(confirmButton().getAttribute('aria-disabled')).toBe('true');
    typePhrase('RESET membe');
    expect(confirmButton().getAttribute('aria-disabled')).toBe('true');
    typePhrase('RESET member');
    expect(confirmButton().getAttribute('aria-disabled')).toBeNull();
  });

  it('typed: case-sensitive and no trimming', async () => {
    void confirm.confirmAction({
      title: 'Erase',
      message: 'Sure?',
      phrase: 'RESET member',
      run: () => Promise.resolve(),
    });
    await open();
    typePhrase('reset member');
    expect(confirmButton().getAttribute('aria-disabled')).toBe('true');
    typePhrase(' RESET member');
    expect(confirmButton().getAttribute('aria-disabled')).toBe('true');
    typePhrase('RESET member ');
    expect(confirmButton().getAttribute('aria-disabled')).toBe('true');
  });

  it('typed: Enter runs only when matched', async () => {
    const run = jasmine.createSpy('run').and.resolveTo();
    void confirm.confirmAction({ title: 'Erase', message: 'Sure?', phrase: 'RESET member', run });
    await open();
    typePhrase('RESET membe');
    phraseField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(run).not.toHaveBeenCalled();
    typePhrase('RESET member');
    phraseField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('busy shows busyLabel and disables both buttons', async () => {
    const gate = deferred();
    const result = confirm.confirmAction({
      title: 'Erase',
      message: 'Sure?',
      confirmLabel: 'Erase data',
      busyLabel: 'Erasing…',
      run: () => gate.promise,
    });
    await open();
    confirmButton().click();
    fixture.detectChanges();
    expect(confirmButton().textContent?.trim()).toBe('Erasing…');
    expect(confirmButton().disabled).toBe(true);
    expect(cancelButton().disabled).toBe(true);
    gate.resolve();
    await expectAsync(result).toBeResolvedTo(true);
  });

  it('failure shows role=alert inline above the buttons and focuses the field', async () => {
    const result = confirm.confirmAction({
      title: 'Erase',
      message: 'Sure?',
      phrase: 'RESET member',
      errorMessage: 'Could not erase. Try again.',
      run: () => Promise.reject(new Error('boom')),
    });
    void result.catch(() => undefined);
    await open();
    typePhrase('RESET member');
    confirmButton().click();
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Could not erase. Try again.');
    const actions = host.querySelector('.confirm-actions');
    expect(alert!.compareDocumentPosition(actions!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.activeElement).toBe(phraseField());
    confirm.close(false);
    await expectAsync(result).toBeResolvedTo(false);
  });

  it('non-typed action: failure focuses the destructive button', async () => {
    const result = confirm.confirmAction({
      title: 'Erase',
      message: 'Sure?',
      confirmLabel: 'Erase data',
      errorMessage: 'Could not erase. Try again.',
      run: () => Promise.reject(new Error('boom')),
    });
    void result.catch(() => undefined);
    await open();
    confirmButton().click();
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not erase. Try again.');
    expect(document.activeElement).toBe(confirmButton());
    confirm.close(false);
    await expectAsync(result).toBeResolvedTo(false);
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
