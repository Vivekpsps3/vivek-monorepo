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
