import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { UiDialogComponent } from '@vivek/ui';

@Component({
  standalone: true,
  imports: [UiDialogComponent],
  template: `
    <button type="button" id="trigger" (click)="open = true">Open</button>
    <ui-dialog [open]="open" labelledBy="dlg-title" (closed)="open = false">
      <h3 id="dlg-title">Title</h3>
      <button type="button" id="first">First</button>
      <button type="button" id="second">Second</button>
    </ui-dialog>
  `,
})
class HostComponent {
  open = false;
}

describe('UiDialogComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('focuses the first control when opened and restores focus when closed', async () => {
    const trigger = fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement;
    trigger.focus();
    host.open = true;
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    expect(document.activeElement?.id).toBe('first');

    host.open = false;
    fixture.detectChanges();
    await Promise.resolve();
    expect(document.activeElement).toBe(trigger);
  });

  it('emits closed on Escape', () => {
    host.open = true;
    fixture.detectChanges();
    const dialog = fixture.debugElement.query(By.directive(UiDialogComponent)).componentInstance as UiDialogComponent;
    dialog.onEscape();
    fixture.detectChanges();
    expect(host.open).toBe(false);
  });
});
