import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmService, UiConfirmDialogComponent } from '@vivek/ui';

@Component({
  standalone: true,
  imports: [UiConfirmDialogComponent],
  template: `
    <div id="dialog-scroll" style="overflow: scroll">
      <button id="confirm-trigger" type="button">Open confirmation</button>
      <ui-confirm-dialog [scrollTarget]="'#dialog-scroll'" />
    </div>
  `,
})
class ConfirmDialogHostComponent {}

describe('UiConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmDialogHostComponent>;
  let confirm: ConfirmService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ConfirmDialogHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(ConfirmDialogHostComponent);
    confirm = TestBed.inject(ConfirmService);
    fixture.detectChanges();
  });

  it('cancels through the shared host and restores focus and scroll state', async () => {
    const trigger = fixture.nativeElement.querySelector('#confirm-trigger') as HTMLButtonElement;
    const scrollTarget = fixture.nativeElement.querySelector('#dialog-scroll') as HTMLElement;
    trigger.focus();
    const result = confirm.ask('Remove item', 'This action cannot be undone.');
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    expect(scrollTarget.style.overflow).toBe('hidden');
    expect((document.activeElement as HTMLElement).textContent?.trim()).toBe('Cancel');

    const host = fixture.nativeElement as HTMLElement;
    const cancel = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      button => button.textContent?.trim() === 'Cancel'
    );
    expect(cancel).toBeDefined();
    cancel!.click();
    await expectAsync(result).toBeResolvedTo(false);
    fixture.detectChanges();
    await Promise.resolve();

    expect(document.activeElement).toBe(trigger);
    expect(scrollTarget.style.overflow).toBe('scroll');
  });
});
