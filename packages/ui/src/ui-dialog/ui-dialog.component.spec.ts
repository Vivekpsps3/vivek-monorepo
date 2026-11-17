import { Component,signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UPDATE_NOTICE } from '../update-notice';
import { UiDialogComponent } from './ui-dialog.component';

@Component({
  standalone: true, imports: [UiDialogComponent],
  template: `<button id="background">Background</button>
    <ui-dialog [open]="first"><input id="first-field"><button>Done</button></ui-dialog>
    <ui-dialog [open]="second"><input id="second-field"><button>Done</button></ui-dialog>`,
})
class DialogHost { first = false; second = false; }

describe('Dialog background isolation', () => {

  it('returns to the original opener when an editor and its confirmation close together', async () => {
    await TestBed.configureTestingModule({ imports: [DialogHost] }).compileComponents();
    const fixture = TestBed.createComponent(DialogHost);
    fixture.detectChanges();
    const originalOverflow = document.body.style.overflow;
    const opener = fixture.nativeElement.querySelector('#background') as HTMLButtonElement;
    opener.focus();
    fixture.componentInstance.first = true;
    fixture.detectChanges();
    await Promise.resolve();
    expect(document.activeElement?.id).toBe('first-field');
    fixture.componentInstance.second = true;
    fixture.detectChanges();
    await Promise.resolve();
    expect(document.activeElement?.id).toBe('second-field');
    fixture.componentInstance.first = false;
    fixture.componentInstance.second = false;
    fixture.detectChanges();
    await Promise.resolve();
    expect(document.activeElement).toBe(opener);
    expect(opener.inert).toBeFalse();
    expect(document.body.style.overflow).toBe(originalOverflow);
  });

  it('does not return focus outside a newly opened dialog', async () => {
    await TestBed.configureTestingModule({ imports: [DialogHost] }).compileComponents();
    const fixture = TestBed.createComponent(DialogHost);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('#background').focus();
    fixture.componentInstance.first = true;
    fixture.detectChanges();
    await Promise.resolve();
    fixture.componentInstance.first = false;
    fixture.componentInstance.second = true;
    fixture.detectChanges();
    await Promise.resolve();
    expect(document.activeElement?.id).toBe('second-field');
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
