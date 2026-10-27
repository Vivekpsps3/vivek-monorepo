import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { UiDialogComponent } from './ui-dialog.component';
import { UPDATE_NOTICE } from '../update-notice';

@Component({
  standalone: true, imports: [UiDialogComponent],
  template: `<button id="background">Background</button>
    <ui-dialog [open]="first"><input id="first-field"><button>Done</button></ui-dialog>
    <ui-dialog [open]="second"><input id="second-field"><button>Done</button></ui-dialog>`,
})
class DialogHost { first = false; second = false; }

describe('Dialog background isolation', () => {
  it('sends Escape only to the top dialog', async () => {
    await TestBed.configureTestingModule({ imports: [DialogHost] }).compileComponents();
    const fixture = TestBed.createComponent(DialogHost);
    fixture.componentInstance.first = true;
    fixture.detectChanges();
    fixture.componentInstance.second = true;
    fixture.detectChanges();
    const [first, second] = fixture.debugElement.queryAll(By.directive(UiDialogComponent));
    const firstClosed = jasmine.createSpy('first closed');
    const secondClosed = jasmine.createSpy('second closed');
    first.componentInstance.closed.subscribe(firstClosed);
    second.componentInstance.closed.subscribe(secondClosed);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(firstClosed).not.toHaveBeenCalled();
    expect(secondClosed).toHaveBeenCalledTimes(1);
  });
  it('dismisses an update from the active dialog without closing it or losing its draft', async () => {
    const visible = signal(true);
    await TestBed.configureTestingModule({
      imports: [DialogHost],
      providers: [{ provide: UPDATE_NOTICE, useValue: {
        noticeVisible: visible, updateAvailable: signal(true), dismissNotice: () => visible.set(false),
      } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(DialogHost);
    fixture.componentInstance.first = true;
    fixture.detectChanges();
    const field = fixture.nativeElement.querySelector('#first-field') as HTMLInputElement;
    field.value = 'Unsubmitted draft';
    fixture.nativeElement.querySelector('.ui-dialog-update button').click();
    fixture.detectChanges();
    expect(visible()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.ui-dialog-update')).toBeNull();
    expect(fixture.nativeElement.querySelector('#first-field')).toBe(field);
    expect(field.value).toBe('Unsubmitted draft');
    expect(fixture.nativeElement.querySelector('#background').inert).toBeTrue();
  });
  it('makes the shared header branch inert and restores its previous state on close', async () => {
    await TestBed.configureTestingModule({ imports: [DialogHost] }).compileComponents();
    const fixture = TestBed.createComponent(DialogHost);
    fixture.detectChanges();
    const background: HTMLElement = fixture.nativeElement.querySelector('#background');
    fixture.componentInstance.first = true;
    fixture.detectChanges();
    expect(background.inert).toBeTrue();
    fixture.componentInstance.first = false;
    fixture.detectChanges();
    expect(background.inert).toBeFalse();
  });
  it('keeps only the top dialog interactive and returns to the first dialog after closing it', async () => {
    await TestBed.configureTestingModule({ imports: [DialogHost] }).compileComponents();
    const fixture = TestBed.createComponent(DialogHost);
    const dialogs = (): HTMLElement[] => [...fixture.nativeElement.querySelectorAll('ui-dialog')];
    fixture.componentInstance.first = true;
    fixture.detectChanges();
    fixture.componentInstance.second = true;
    fixture.detectChanges();
    expect(dialogs()[0].inert).toBeTrue();
    expect(dialogs()[1].inert).toBeFalse();
    fixture.componentInstance.second = false;
    fixture.detectChanges();
    expect(dialogs()[0].inert).toBeFalse();
    expect(dialogs()[1].inert).toBeTrue();
    fixture.componentInstance.first = false;
    fixture.detectChanges();
    expect(dialogs().every(dialog => !dialog.inert)).toBeTrue();
  });
  it('restores existing inert elements and releases the background when an open dialog is destroyed', async () => {
    await TestBed.configureTestingModule({ imports: [DialogHost] }).compileComponents();
    const outside = document.createElement('aside');
    outside.inert = true;
    document.body.append(outside);
    const fixture = TestBed.createComponent(DialogHost);
    fixture.componentInstance.first = true;
    fixture.detectChanges();
    fixture.destroy();
    expect(outside.inert).toBeTrue();
    outside.remove();
    expect(document.body.inert).toBeFalse();
  });
});
